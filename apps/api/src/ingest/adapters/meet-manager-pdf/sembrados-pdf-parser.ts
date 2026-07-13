import { parseTimeToMs } from './pdf-time-parser';
import { parseStroke, parseGender } from './pdf-line-parser';
import type { NormalizedStroke, NormalizedGender } from '../../types/normalized-meet.types';

export type SembradoCompetitionType = 'federados' | 'promocional' | 'escuela' | 'desconocido';

export interface SembradoRow {
  eventNo: number;
  eventLabel: string;
  heatNo: number;
  lane: number;
  swimmerName: string;
  age: number | null;
  club: string;
  seedTimeMs: number | null;
}

export interface SembradoEventMeta {
  eventNo: number;
  eventLabel: string;
  stroke: NormalizedStroke | null;
  distance: number;
  gender: NormalizedGender;
  competitionType: SembradoCompetitionType;
  ageGroupMin: number | null;
  ageGroupMax: number | null; // null = sin límite superior
}

export interface SembradosParseResult {
  rows: SembradoRow[];
  events: SembradoEventMeta[];
  warning: string | null;
}

const GENDER_LABEL: Record<string, string> = {
  niña: 'Niñas',
  niñas: 'Niñas',
  niño: 'Niños',
  niños: 'Niños',
  mujeres: 'Mujeres',
  hombres: 'Hombres',
  mixto: 'Mixto',
};

// Umbral a partir del cual un tope de rango etario ("...-108") se interpreta como "sin límite".
const NO_LIMIT_AGE_THRESHOLD = 99;

const EVENT_RE =
  /^Evento\s+(\d+)\s+(Ni[ñn]as?|Mujeres|Ni[ñn]os?|Hombres|Mixto)\s+([\d-]+)\s+(\d+)\s+CC\s+Metro\s+(.+)$/i;

const SERIE_RE = /^Serie\s+(\d+)\s+of\s+\d+\s+Finales Contra Tiempo$/;
const SERIE_CONTINUATION_RE =
  /^Serie\s+(\d+)\s+Finales Contra Tiempo\.\.\.\s*\(Evento\s+(\d+)\s+(.+)\)$/;

// El orden de extracción de pdf-parse NO sigue el orden visual de columnas del PDF.
// Orden real por fila: <tiempoSembrado><"Apellido, Nombre"> <edad>____<carril><club>
// (el bloque de guiones bajos es el placeholder impreso para "Finales"/"Lugar").
const ROW_RE =
  /^(NT|\d{1,2}(?::\d{2})?[,.]\d{2})([^,\d]+,\s*[^\d_]+?)\s+(\d{1,3})_+(\d{1,2})(.+)$/;

function buildEventLabel(genderRaw: string, ageGroup: string, distance: string, rest: string): string {
  const gender = GENDER_LABEL[genderRaw.trim().toLowerCase()] ?? genderRaw;
  return `${distance}m ${rest.trim()} — ${gender} ${ageGroup}`;
}

function parseCompetitionType(rest: string): SembradoCompetitionType {
  const upper = rest.toUpperCase();
  if (/\bFEDERADOS?\b/.test(upper)) return 'federados';
  if (/\bPROMOCIONAL(?:ES)?\b/.test(upper)) return 'promocional';
  if (/\bESCUELA\b/.test(upper)) return 'escuela';
  return 'desconocido';
}

function parseAgeGroup(raw: string): { min: number | null; max: number | null } {
  const rangeMatch = raw.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1] ?? '0', 10);
    const maxRaw = parseInt(rangeMatch[2] ?? '0', 10);
    return { min, max: maxRaw >= NO_LIMIT_AGE_THRESHOLD ? null : maxRaw };
  }
  const singleMatch = raw.match(/^(\d+)$/);
  if (singleMatch) {
    const age = parseInt(singleMatch[1] ?? '0', 10);
    return { min: age, max: age };
  }
  return { min: null, max: null };
}

function isNoiseLine(line: string): boolean {
  if (line.includes("HY-TEK's MEET MANAGER")) return true;
  if (line === 'Programa de Competencias') return true;
  if (line.includes('Carril') && line.includes('Nombre') && line.includes('Edad')) return true;
  // "CAMPEONATO ... - dd/mm/aaaa a dd/mm/aaaa"
  if (/\s-\s\d{1,2}\/\d{1,2}\/\d{4}\s+a\s+\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) return true;
  return false;
}

/**
 * Parsea el "Programa de Competencias" (sembrados) de HY-TEK Meet Manager.
 * Formato de líneas separadas por espacios, agrupado en bloques Evento → Serie.
 * No confundir con el parser de resultados en meet-manager-pdf-adapter.ts (formato
 * de prefijo edad+puesto pegado, ej. "1411NOMBRE...").
 */
export function parseSembradosPdf(rawText: string): SembradosParseResult {
  const lines = rawText.split('\n');
  const rows: SembradoRow[] = [];
  const eventIndex = new Map<number, SembradoEventMeta>();

  let currentEventNo: number | null = null;
  let currentEventLabel = '';
  let currentHeatNo: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isNoiseLine(line)) continue;

    const eventMatch = line.match(EVENT_RE);
    if (eventMatch) {
      const eventNo = parseInt(eventMatch[1] ?? '0', 10);
      const genderRaw = eventMatch[2] ?? '';
      const ageGroupRaw = eventMatch[3] ?? '';
      const distanceRaw = eventMatch[4] ?? '0';
      const rest = eventMatch[5] ?? '';

      currentEventNo = eventNo;
      currentEventLabel = buildEventLabel(genderRaw, ageGroupRaw, distanceRaw, rest);
      currentHeatNo = null;

      if (!eventIndex.has(eventNo)) {
        const competitionType = parseCompetitionType(rest);
        const strokeRaw = rest.replace(/\b(FEDERADOS?|PROMOCIONAL(?:ES)?|ESCUELA)\b/gi, '').trim();
        const { min, max } = parseAgeGroup(ageGroupRaw);
        eventIndex.set(eventNo, {
          eventNo,
          eventLabel: currentEventLabel,
          stroke: parseStroke(strokeRaw),
          distance: parseInt(distanceRaw, 10),
          gender: parseGender(genderRaw),
          competitionType,
          ageGroupMin: min,
          ageGroupMax: max,
        });
      }
      continue;
    }

    const serieMatch = line.match(SERIE_RE);
    if (serieMatch) {
      currentHeatNo = parseInt(serieMatch[1] ?? '0', 10);
      continue;
    }

    const continuationMatch = line.match(SERIE_CONTINUATION_RE);
    if (continuationMatch) {
      currentHeatNo = parseInt(continuationMatch[1] ?? '0', 10);
      currentEventNo = parseInt(continuationMatch[2] ?? '0', 10);
      // El label completo ya se vio en la página anterior — se mantiene el que ya tenemos
      // si coincide el evento; si no, usamos el texto crudo como fallback.
      if (currentEventLabel === '') currentEventLabel = continuationMatch[3] ?? '';
      continue;
    }

    const rowMatch = line.match(ROW_RE);
    if (rowMatch && currentEventNo !== null && currentHeatNo !== null) {
      const timeRaw = rowMatch[1] ?? 'NT';
      const swimmerName = (rowMatch[2] ?? '').trim();
      const ageRaw = rowMatch[3] ?? '';
      const lane = parseInt(rowMatch[4] ?? '0', 10);
      const club = (rowMatch[5] ?? '').trim();

      rows.push({
        eventNo: currentEventNo,
        eventLabel: currentEventLabel,
        heatNo: currentHeatNo,
        lane,
        swimmerName,
        age: ageRaw ? parseInt(ageRaw, 10) : null,
        club,
        seedTimeMs: parseTimeToMs(timeRaw),
      });
    }
  }

  if (rows.length === 0) {
    return { rows, events: [], warning: 'No se reconoció ninguna fila de sembrados en el archivo.' };
  }
  return { rows, events: Array.from(eventIndex.values()), warning: null };
}
