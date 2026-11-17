import { parseTimeToMs } from './pdf-time-parser';
import {
  detectPlaceLayout,
  isColumnHeader,
  isNotClubLine,
  parseAgeRange,
  parseDataLine,
  parseTeamFirstRow,
  SPLITS_LINE_RE,
  type ParsedRow,
} from './pdf-line-parser';
import { joinSplitRows, parseSeedContinuation } from './pdf-data-line';
import { buildResultEventLabel, parseEventHeader } from './pdf-event-header';

export interface ResultadoRow {
  eventNo: number;
  eventLabel: string;
  place: number | null; // null = DSQ/DNS/DNF
  swimmerName: string;
  age: number | null;
  club: string;
  seedTimeMs: number | null;
  finalTimeMs: number | null;
  status: 'OK' | 'DSQ' | 'DNS' | 'DNF';
}

export interface ResultadosParseResult {
  rows: ResultadoRow[];
  warning: string | null;
}

function isNoiseLine(line: string): boolean {
  if (line.includes("HY-TEK's MEET MANAGER")) return true;
  if (line === 'Resultados') return true;
  if (line.includes('Nombre') && line.includes('Edad') && line.includes('Equipo')) return true;
  if (/^-?\s*Chequeo de Tiempo$/.test(line)) return true;
  // "3era fecha torneo de verano 2019-20 - 29/2/2020"
  if (/\s-\s\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(line)) return true;
  // "Campeonato … - 22/11/2024 a 24/11/2024" y "Torneo … - 18/4/2026"
  if (/\s-\s\d{1,2}\/\d{1,2}\/\d{4}(?:\s+(?:a|to)\s+\d{1,2}\/\d{1,2}\/\d{4})?\s*$/.test(line)) return true;
  return false;
}

// Una fila de resultado "con aspecto de fila": sangría, edad/puesto y un "Apellido, Nombre".
const LOOKS_LIKE_ROW_RE = /^\s+\d{1,4}\*?[^\d\s:.,].*,/;

/**
 * Parsea el reporte "Resultados" de HY-TEK Meet Manager (25 m "CC Metro" y 50 m "CL Metro";
 * decimales con coma o con punto; puesto pegado a la edad o al final de la fila).
 * Reutiliza parseDataLine de pdf-data-line.ts — no confundir con parseSembradosPdf (formato
 * de sembrados). Los relevos se saltean (formato de fila completamente distinto).
 *
 * Nada se descarta en silencio: las líneas que parecen una fila y no se pudieron leer, y las
 * filas con más de una lectura posible del tiempo o del puesto, se cuentan en `warning`.
 */
export function parseResultadosPdf(rawText: string): ResultadosParseResult {
  const lines = joinSplitRows(rawText.split('\n'));
  const rows: ResultadoRow[] = [];
  const fileLayout = detectPlaceLayout(lines);

  let currentEventNo: number | null = null;
  let currentEventLabel = '';
  let currentRange = parseAgeRange('');
  let currentDistance: number | undefined;
  let skippingRelay = false;
  let teamFirst = false;
  let pendingClub: string | null = null;
  let prevPlace = 0;
  let lastRow: ResultadoRow | null = null;
  let lastRowIdx = -10;
  let unreadable = 0;
  let ambiguous = 0;
  const unreadableSamples: string[] = [];

  const pushRow = (row: ParsedRow, club: string): void => {
    if (currentEventNo === null) return;
    // Nombre debe tener coma (Apellido, Nombre) — si no, no es una fila de resultado real
    if (!row.name.includes(',')) return;
    const commaIdx = row.name.indexOf(',');
    const swimmerName = `${row.name.slice(0, commaIdx).trim()}, ${row.name.slice(commaIdx + 1).trim()}`;

    const finalTimeMs = parseTimeToMs(row.finalTimeRaw);
    const seedTimeMs = parseTimeToMs(row.seedTimeRaw);

    let status: ResultadoRow['status'] = 'OK';
    if (row.isDQ || row.finalTimeRaw === 'DQ') status = 'DSQ';
    else if (row.finalTimeRaw === 'NS') status = 'DNS';
    else if (row.finalTimeRaw === 'NF') status = 'DNF';
    else if (row.finalTimeRaw === 'NT' || finalTimeMs === null) status = 'DNS';

    if (row.ambiguous) ambiguous++;
    const out: ResultadoRow = {
      eventNo: currentEventNo,
      eventLabel: currentEventLabel,
      place: row.isDQ ? null : (row.place ?? null),
      swimmerName,
      age: row.age,
      club,
      seedTimeMs,
      finalTimeMs: status === 'OK' ? finalTimeMs : null,
      status,
    };
    rows.push(out);
    lastRow = out;
    if (out.place !== null) prevPlace = out.place;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (!line) { pendingClub = null; continue; }

    const header = parseEventHeader(line);
    if (header) {
      currentEventNo = header.eventNo;
      currentEventLabel = buildResultEventLabel(header);
      currentRange = parseAgeRange(header.ageGroup);
      currentDistance = header.distance;
      skippingRelay = header.isRelay;
      teamFirst = false;
      pendingClub = null;
      prevPlace = 0;
      continue;
    }

    if (isColumnHeader(line)) {
      teamFirst = /^Edad\s+EquipoNombre/.test(line);
      continue;
    }
    if (isNoiseLine(line) || SPLITS_LINE_RE.test(line)) continue;
    if (skippingRelay) continue;

    // Sembrado (o puntos + sembrado) que el PDF imprimió en la línea siguiente a la fila: " 1:24,43" / "161:26.31".
    if (lastRow !== null && lastRowIdx === i - 1) {
      const seed = parseSeedContinuation(line, (lastRow as ResultadoRow).finalTimeMs, currentDistance);
      if (seed !== null) {
        const ms = parseTimeToMs(seed);
        if ((lastRow as ResultadoRow).seedTimeMs === null && ms !== null) (lastRow as ResultadoRow).seedTimeMs = ms;
        lastRowIdx = i;
        continue;
      }
    }

    // Puesto que el PDF imprimió en la línea siguiente a la fila.
    if (/^\*?\d{1,3}$/.test(line) && lastRow !== null && lastRowIdx === i - 1 && (lastRow as ResultadoRow).place === null
      && (lastRow as ResultadoRow).status === 'OK') {
      const place = parseInt(line.replace('*', ''), 10);
      (lastRow as ResultadoRow).place = place;
      prevPlace = place;
      continue;
    }

    if (teamFirst && !raw.startsWith(' ') && currentEventNo !== null) {
      const teamRow = parseTeamFirstRow(line, currentDistance, prevPlace);
      if (teamRow) {
        pushRow(teamRow, teamRow.team);
        lastRowIdx = i;
        pendingClub = null;
        continue;
      }
    }

    const row =
      currentEventNo !== null
        ? parseDataLine(line, currentRange, currentDistance, { layout: fileLayout, prevPlace })
        : null;
    if (row && currentEventNo !== null) {
      pushRow(row, pendingClub ?? '');
      lastRowIdx = i;
      pendingClub = null;
      continue;
    }

    if (currentEventNo !== null && LOOKS_LIKE_ROW_RE.test(raw)) {
      unreadable++;
      if (unreadableSamples.length < 3) unreadableSamples.push(line.slice(0, 70));
      continue;
    }

    // Línea de club: texto plano sin espacio inicial, no reconocida como evento/fila
    if (!raw.startsWith(' ') && !isNotClubLine(line)) {
      pendingClub = line;
    }
  }

  if (rows.length === 0) {
    return { rows, warning: 'No se reconoció ninguna fila de resultados en el archivo.' };
  }
  const notes: string[] = [];
  if (unreadable > 0) {
    notes.push(`${unreadable} línea(s) con aspecto de fila no se pudieron leer (ej. "${unreadableSamples.join('", "')}")`);
  }
  if (ambiguous > 0) {
    notes.push(`${ambiguous} fila(s) admitían más de una lectura del tiempo o del puesto: revisar contra el PDF`);
  }
  return { rows, warning: notes.length > 0 ? `Se leyeron ${rows.length} filas; ${notes.join('; ')}.` : null };
}
