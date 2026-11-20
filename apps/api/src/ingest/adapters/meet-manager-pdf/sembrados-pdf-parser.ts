import { parseTimeToMs } from './pdf-time-parser';
import { extractStroke, parseGender } from './pdf-line-parser';
import { parseAgeRange } from './pdf-data-line';
import { parseEventHeader } from './pdf-event-header';
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

const SERIE_RE = /^Serie\s+(\d+)\b/;

const TIME_TOKEN = '(?:\\d{1,2}:)?\\d{1,2}[.,]\\d{2}';
const SEED_LINE_RE = new RegExp(`^X?(NT|${TIME_TOKEN})$`);
const NAME_PART = "[A-Za-zÀ-ÿ][^,\\d_]*,[^\\d_]*";

// El orden de extracción de pdf-parse NO sigue el orden visual de columnas del PDF y cambia
// entre archivos. Disposiciones reales de una fila de sembrado:
//  A) "<club>?<sembrado>?<Apellido, Nombre> <edad>________________________<carril><club>?"
//  D) "<club><sembrado><Apellido, Nombre> <edad>  <carril>"
//  C) club en la línea anterior y "<sembrado> <edad><Apellido, Nombre><carril>_____"
//  B) una línea por dato: sembrado / "<Apellido, Nombre> <edad>" / "____" / carril / club
const UNDERSCORE_ROW_RE = /^(.*\S)\s+(\d{1,3})_{3,}(\d{1,2})(.*)$/;
// Pruebas mixtas: letra de sexo pegada a la edad ("…Julio BenjaminM15______…")
const UNDERSCORE_SEX_ROW_RE = /^(.*[^\d\s])[MW](\d{1,3})_{3,}(\d{1,2})(.*)$/;
const SPACED_LANE_ROW_RE = /^(.*\S)\s+(\d{1,3})\s{2,}(\d{1,2})$/;
const CLUB_BEFORE_ROW_RE = new RegExp(`^X?(NT|${TIME_TOKEN})\\s+(\\d{1,3})(${NAME_PART}?)(\\d{1,2})_*$`);
const SEED_AGE_LINE_RE = new RegExp(`^X?(NT|${TIME_TOKEN})\\s+(\\d{1,3})$`);
const NAME_LANE_LINE_RE = new RegExp(`^(${NAME_PART}?)(\\d{1,2})_*$`);
// En pruebas mixtas la línea trae la letra de sexo pegada a la edad: "Jimenez Bekerman, JoaquinM11"
const NAME_AGE_SEX_LINE_RE = /^([A-Za-zÀ-ÿ][^,\d_]*,[^\d_]*?)\s*[MW](\d{1,3})$/;
const NAME_AGE_LINE_RE = /^([A-Za-zÀ-ÿ][^,\d_]*,[^\d_]*?)\s+(\d{1,3})$/;

function buildEventLabel(genderRaw: string, ageGroup: string, distance: number, rest: string): string {
  const gender = GENDER_LABEL[genderRaw.trim().toLowerCase()] ?? genderRaw;
  return `${distance}m ${rest.trim()} — ${gender} ${ageGroup}`.trim();
}

function parseCompetitionType(rest: string): SembradoCompetitionType {
  const upper = rest.toUpperCase();
  if (/\bFEDERADOS?\b/.test(upper)) return 'federados';
  if (/\bPROMO[A-Z]*\b/.test(upper)) return 'promocional';
  if (/\bESCUELA\b/.test(upper)) return 'escuela';
  return 'desconocido';
}

function parseAgeGroup(raw: string): { min: number | null; max: number | null } {
  const range = parseAgeRange(raw);
  if (!range) return { min: null, max: null };
  const open = !Number.isFinite(range.max) || range.max >= NO_LIMIT_AGE_THRESHOLD;
  return { min: range.min === 0 ? null : range.min, max: open ? null : range.max };
}

function isNoiseLine(line: string): boolean {
  if (line.includes("HY-TEK's MEET MANAGER")) return true;
  if (line.startsWith('Programa de Competencias')) return true;
  if (line.includes('Carril') && line.includes('Nombre') && line.includes('Edad')) return true;
  // "CAMPEONATO ... - dd/mm/aaaa a dd/mm/aaaa" o "… - dd/mm/aaaa"
  if (/\s-\s\d{1,2}\/\d{1,2}\/\d{4}(?:\s+(?:a|to)\s+\d{1,2}\/\d{1,2}\/\d{4})?\s*$/.test(line)) return true;
  return false;
}

/**
 * Parte "<club><sembrado><Apellido, Nombre>" (el club y el sembrado pueden faltar). El sembrado es el
 * último tiempo (o "NT") que queda antes del nombre; el nombre no tiene dígitos.
 */
function splitClubSeedName(head: string): { club: string; seed: string | null; name: string } {
  let best: { at: number; len: number; token: string } | null = null;
  const timeRe = new RegExp(TIME_TOKEN, 'g');
  for (const m of head.matchAll(timeRe)) {
    const at = m.index ?? 0;
    const remainder = head.slice(at + m[0].length);
    if (/^[A-Za-zÀ-ÿ][^\d]*,/.test(remainder)) best = { at, len: m[0].length, token: m[0] };
  }
  if (best === null) {
    for (const m of head.matchAll(/NT/g)) {
      const at = m.index ?? 0;
      const remainder = head.slice(at + 2);
      // Al principio de la línea (sin club delante) cualquier nombre vale, también "LA Marca, Emiliano";
      // detrás de un club, "NT" debe ir pegado a una palabra con mayúscula y minúsculas ("…JUNTCorimayo").
      const startsName = at === 0 ? /^[A-Za-zÀ-ÿ][^\d]*,/ : /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'´][^\d]*,/;
      if (startsName.test(remainder)) best = { at, len: 2, token: 'NT' };
    }
  }
  if (best === null) return { club: '', seed: null, name: head.trim() };
  return { club: head.slice(0, best.at).trim(), seed: best.token, name: head.slice(best.at + best.len).trim() };
}

/**
 * Parsea el "Programa de Competencias" (sembrados) de HY-TEK Meet Manager, en pileta de 25 m
 * ("CC Metro") y de 50 m ("CL Metro"), con las disposiciones de fila descritas arriba. Agrupa por
 * Evento → Serie; el carril sale de la propia fila. Los relevos se saltean.
 * El reporte "Equipo Inscripciones" (una línea por nadador con sus pruebas) NO es un sembrado: no
 * trae serie ni carril, así que no se lee.
 *
 * Nada se descarta en silencio: las líneas que parecen una fila y no se pudieron leer se cuentan en `warning`.
 */
export function parseSembradosPdf(rawText: string): SembradosParseResult {
  const lines = rawText.split('\n');
  const rows: SembradoRow[] = [];
  const eventIndex = new Map<number, SembradoEventMeta>();

  let currentEventNo: number | null = null;
  let currentEventLabel = '';
  let currentHeatNo: number | null = null;
  let skippingRelay = false;
  let currentMixed = false;
  let pendingClub = '';
  let unreadable = 0;
  const unreadableSamples: string[] = [];
  // Disposición B (una línea por dato)
  let multi: { seed: string | null; name: string | null; age: number | null } = { seed: null, name: null, age: null };
  let awaitingClubRow: SembradoRow | null = null;
  let splitSeedAge: { seed: string | null; age: number } | null = null;

  const noteUnreadable = (line: string): void => {
    unreadable++;
    if (unreadableSamples.length < 3) unreadableSamples.push(line.slice(0, 70));
  };

  const push = (name: string, age: string | number | null, lane: number, club: string, seed: string | null): SembradoRow | null => {
    if (currentEventNo === null || currentHeatNo === null || !name.includes(',')) return null;
    const row: SembradoRow = {
      eventNo: currentEventNo,
      eventLabel: currentEventLabel,
      heatNo: currentHeatNo,
      lane,
      swimmerName: name.trim(),
      age: age === null || age === '' ? null : typeof age === 'number' ? age : parseInt(age, 10),
      club: club.trim(),
      seedTimeMs: seed === null ? null : parseTimeToMs(seed),
    };
    rows.push(row);
    return row;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isNoiseLine(line)) continue;

    const header = parseEventHeader(line);
    if (header) {
      const eventLabel = buildEventLabel(header.genderRaw, header.ageGroup, header.distance, header.rest);
      currentEventNo = header.eventNo;
      currentEventLabel = eventLabel;
      skippingRelay = header.isRelay;
      currentMixed = /^mixto$/i.test(header.genderRaw);
      pendingClub = '';
      awaitingClubRow = null;
      multi = { seed: null, name: null, age: null };

      if (header.isContinuation) {
        const heat = line.match(SERIE_RE);
        if (heat) currentHeatNo = parseInt(heat[1] ?? '0', 10);
      } else {
        currentHeatNo = null;
      }

      if (!eventIndex.has(header.eventNo)) {
        const { min, max } = parseAgeGroup(header.ageGroup);
        eventIndex.set(header.eventNo, {
          eventNo: header.eventNo,
          eventLabel,
          // Una posta no es una prueba individual: sin estilo, la plataforma no la crea.
          stroke: header.isRelay ? null : extractStroke(header.rest),
          distance: header.distance,
          gender: parseGender(header.genderRaw),
          competitionType: parseCompetitionType(header.rest),
          ageGroupMin: min,
          ageGroupMax: max,
        });
      }
      continue;
    }

    const serie = line.match(SERIE_RE);
    if (serie) {
      currentHeatNo = parseInt(serie[1] ?? '0', 10);
      pendingClub = '';
      awaitingClubRow = null;
      multi = { seed: null, name: null, age: null };
      continue;
    }

    if (skippingRelay || currentEventNo === null || currentHeatNo === null) continue;

    // A) con guiones bajos
    const under = (currentMixed ? line.match(UNDERSCORE_SEX_ROW_RE) : null) ?? line.match(UNDERSCORE_ROW_RE);
    if (under) {
      const { club, seed, name } = splitClubSeedName(under[1] ?? '');
      let laneStr = under[3] ?? '0';
      let tail = under[4] ?? '';
      // "…________11ro de Mayo": un carril de dos dígitos mayor a 12 es un dígito + club que empieza con número
      if (laneStr.length === 2 && parseInt(laneStr, 10) > 12) {
        tail = laneStr.slice(1) + tail;
        laneStr = laneStr.slice(0, 1);
      }
      const clubName = club !== '' ? club : tail.trim();
      if (!push(name, under[2] ?? null, parseInt(laneStr, 10), clubName, seed)) noteUnreadable(line);
      continue;
    }

    // D) carril separado por espacios
    const spaced = line.match(SPACED_LANE_ROW_RE);
    if (spaced && /,/.test(spaced[1] ?? '')) {
      const { club, seed, name } = splitClubSeedName(spaced[1] ?? '');
      if (!push(name, spaced[2] ?? null, parseInt(spaced[3] ?? '0', 10), club, seed)) noteUnreadable(line);
      continue;
    }

    // C) club en la línea anterior
    const clubBefore = line.match(CLUB_BEFORE_ROW_RE);
    if (clubBefore) {
      const seed = clubBefore[1] ?? null;
      if (!push(clubBefore[3] ?? '', clubBefore[2] ?? null, parseInt(clubBefore[4] ?? '0', 10), pendingClub, seed)) {
        noteUnreadable(line);
      }
      pendingClub = '';
      continue;
    }

    // C') la fila de C partida en dos líneas: "2:35,04 12" y debajo "Guanca Rocha, Elias Lautaro3_____"
    const seedAge = line.match(SEED_AGE_LINE_RE);
    if (seedAge) {
      splitSeedAge = { seed: seedAge[1] ?? null, age: parseInt(seedAge[2] ?? '0', 10) };
      continue;
    }
    const nameLane = splitSeedAge !== null ? line.match(NAME_LANE_LINE_RE) : null;
    if (nameLane && splitSeedAge !== null) {
      if (!push(nameLane[1] ?? '', splitSeedAge.age, parseInt(nameLane[2] ?? '0', 10), pendingClub, splitSeedAge.seed)) {
        noteUnreadable(line);
      }
      splitSeedAge = null;
      pendingClub = '';
      continue;
    }

    // B) una línea por dato
    if (SEED_LINE_RE.test(line)) {
      multi = { seed: line, name: null, age: null };
      awaitingClubRow = null;
      continue;
    }
    const nameAge = (currentMixed ? line.match(NAME_AGE_SEX_LINE_RE) : null) ?? line.match(NAME_AGE_LINE_RE);
    if (nameAge) {
      multi.name = nameAge[1] ?? null;
      multi.age = parseInt(nameAge[2] ?? '0', 10);
      continue;
    }
    if (/^_{3,}$/.test(line)) continue;
    if (/^\d{1,2}$/.test(line) && multi.name !== null) {
      awaitingClubRow = push(multi.name, multi.age, parseInt(line, 10), '', multi.seed);
      multi = { seed: null, name: null, age: null };
      continue;
    }

    // Línea de texto plano: club de la fila que acaba de salir (B) o de la que viene (C)
    if (!/\d/.test(line) || /^\D+\d?\D*$/.test(line)) {
      if (awaitingClubRow !== null) {
        awaitingClubRow.club = line;
        awaitingClubRow = null;
      } else {
        pendingClub = line;
      }
      continue;
    }

    if (/,/.test(line) && /\d/.test(line)) noteUnreadable(line);
  }

  if (rows.length === 0) {
    return { rows, events: [], warning: 'No se reconoció ninguna fila de sembrados en el archivo.' };
  }
  const warning =
    unreadable > 0
      ? `Se leyeron ${rows.length} filas; ${unreadable} línea(s) con aspecto de fila no se pudieron leer (ej. "${unreadableSamples.join('", "')}").`
      : null;
  return { rows, events: Array.from(eventIndex.values()), warning };
}
