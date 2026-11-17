import type {
  NormalizedEvent,
  NormalizedResult,
  NormalizedSwimmer,
  NormalizedClub,
  NormalizedStroke,
  NormalizedGender,
  NormalizedResultStatus,
  CompetitionType,
  NormalizedRound,
  PoolLength,
} from '../../types/normalized-meet.types';
import type { ImportIssue } from '../../types/import-issue.types';
import { parseTimeToMs } from './pdf-time-parser';
import { buildEventKey } from '../../event-key';
import { parseEventHeader } from './pdf-event-header';
import {
  detectPlaceLayout,
  joinSplitRows,
  parseAgeRange,
  parseDataLine,
  parseSeedContinuation,
  parseTeamFirstRow,
  type ParsedRow,
} from './pdf-data-line';

export { parseAgeRange, parseDataLine, detectPlaceLayout, parseTeamFirstRow };
export type { ParsedRow, AgeRange, PlaceLayout } from './pdf-data-line';

export interface ParsedMeetHeader {
  venue: string;
  name: string;
  start_date: string;
  end_date: string;
  course: PoolLength;
}

export interface LineParserResult {
  clubs: NormalizedClub[];
  swimmers: NormalizedSwimmer[];
  events: NormalizedEvent[];
  results: NormalizedResult[];
  issues: ImportIssue[];
  meetHeader: ParsedMeetHeader | null;
  /** Largo de pileta que declaran las pruebas del archivo (25 o 50); null si no hay pruebas o se mezclan. */
  course: PoolLength | null;
}

// ─── Maps ─────────────────────────────────────────────────────────────────────

const STROKE_MAP: Record<string, NormalizedStroke> = {
  'estilo libre': 'libre',
  'estilo de espalda': 'espalda',
  espalda: 'espalda',
  'estilo de pecho': 'pecho',
  pecho: 'pecho',
  'estilo de mariposa': 'mariposa',
  mariposa: 'mariposa',
  ci: 'combinado',
  combinado: 'combinado',
  'combinado individual': 'combinado',
};

const COMPETITION_TYPE_MAP: Record<string, CompetitionType> = {
  federados: 'FEDERADOS',
  federado: 'FEDERADOS',
  infantiles: 'INFANTILES',
  promocionales: 'PROMOCIONALES',
  promocional: 'PROMOCIONALES',
  escuela: 'ESCUELA',
  'toma de tiempos': 'TOMA_DE_TIEMPOS',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase + strip diacritics + collapse whitespace. Used for swimmer key generation. */
function normalizeForKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return raw;
  return `${m[3] ?? ''}-${(m[2] ?? '').padStart(2, '0')}-${(m[1] ?? '').padStart(2, '0')}`;
}

export function parseGender(token: string): NormalizedGender {
  const t = token.toLowerCase();
  if (t === 'niñas' || t === 'niña' || t === 'mujeres') return 'F';
  if (t === 'niños' || t === 'niño' || t === 'hombres') return 'M';
  if (t === 'mixto') return 'X';
  return 'M';
}

function parseCourse(token: string): PoolLength {
  const t = token.toLowerCase();
  // LC/LM/CL = long course (50m), CC/SC = short course (25m)
  return t === 'lc' || t === 'lm' || t === 'cl' ? 50 : 25;
}

export function parseStroke(raw: string): NormalizedStroke | null {
  return STROKE_MAP[raw.trim().toLowerCase()] ?? null;
}

const STROKE_WORDS: Array<[RegExp, NormalizedStroke]> = [
  [/\bmariposa\b/i, 'mariposa'],
  [/\bespalda\b/i, 'espalda'],
  [/\bpecho\b/i, 'pecho'],
  [/\b(?:ci|combinado)\b/i, 'combinado'],
  [/\blibre\b/i, 'libre'],
];

/**
 * Estilo de una prueba a partir del texto que sigue a "Metro" ("Estilo de Espalda FEDERADO",
 * "CI PROMOCIONAL", "Estilo Libre CAD PROMOC"). Si aparecen varias palabras de estilo gana la
 * primera del texto ("Estilo Libre LIBRE" es un estilo libre de nivel "LIBRE").
 */
export function extractStroke(rest: string): NormalizedStroke | null {
  let best: { at: number; stroke: NormalizedStroke } | null = null;
  for (const [re, stroke] of STROKE_WORDS) {
    const at = rest.search(re);
    if (at >= 0 && (best === null || at < best.at)) best = { at, stroke };
  }
  return best?.stroke ?? null;
}

function parseCompetitionType(raw: string): CompetitionType {
  return COMPETITION_TYPE_MAP[raw.trim().toLowerCase()] ?? 'DESCONOCIDO';
}

function normalizeClubId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

// ─── Data-line parser (ver pdf-data-line.ts) ──────────────────────────────────

/** Extracts the minimum numeric age from an age_group string ("5-8" → 5, "9" → 9, "12-13" → 12). */
function parseMinAgeFromGroup(ageGroup: string): number {
  const m = ageGroup.match(/^(\d+)/);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

// ─── Líneas que no son filas ni clubes ────────────────────────────────────────

// Encabezados de columna ("EdadNombreEquipoTiempo de FinalesTiempo para SembradoPuntos",
// "Nombre Edad Equipo …", "Edad   EquipoNombreTiempo de Finales").
export function isColumnHeader(trimmed: string): boolean {
  return trimmed.length < 120 && /^(?:Edad|Nombre)/.test(trimmed) && /Equipo/.test(trimmed) && /Tiempo/.test(trimmed);
}

const SECTION_LINE_RE =
  /^(?:Eliminatorias|Finales?|Final\s*-\s*[A-Z]|Semifinales?|Desempate(?:\s+Requerido)?|Tiempo para Sembrado(?:Puntos)?|Tiempo de Finales|Puntos)\s*$/i;

/** Línea de texto plano que NO es un club: sección, fecha, marca/récord, tiempo de tope. */
export function isNotClubLine(trimmed: string): boolean {
  if (SECTION_LINE_RE.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return true;
  if (/^\*?\d{1,3}$/.test(trimmed)) return true;
  if (/\d{1,2}:\d{2}[.,]\d{2}|\d{2}[.,]\d{2}\s*$/.test(trimmed)) return true; // récords, "TB TIEMPO BASICO3:16.00"
  return false;
}

// Parciales debajo de la fila: "2:06.22 (32.34)1:33.88 (32.80)…"
export const SPLITS_LINE_RE = /^\d{1,2}[.:,]\d{2}(?:[.,]\d{2})?\s*\(\d/;

type SectionRound = 'P' | 'F';

/** Ronda de una prueba: "Eliminatorias" = preliminar (P); "Finales"/"Final - A" o sin sección = final (F). */
function roundFromSectionText(text: string): SectionRound | null {
  if (/^Eliminatorias\b/i.test(text)) return 'P';
  if (/^(?:Finales?\b|Final\s*-)/i.test(text)) return 'F';
  return null;
}

/** Mira las líneas que siguen al encabezado de la prueba para saber si el bloque es Eliminatorias o Finales. */
function lookaheadRound(lines: string[], from: number): SectionRound {
  for (let j = from; j < Math.min(from + 14, lines.length); j++) {
    const t = (lines[j] ?? '').trim();
    if (/^Evento\s+\d+/i.test(t) || /\(Evento\s+\d+/.test(t)) break;
    const fromSection = roundFromSectionText(t);
    if (fromSection) return fromSection;
    if (/^EdadNombreEquipoTiempo de Elim/.test(t)) return 'P';
  }
  return 'F';
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseLines(inputLines: string[], _fileName: string): LineParserResult {
  const lines = joinSplitRows(inputLines);
  const clubIndex = new Map<string, NormalizedClub>();
  const swimmerIndex = new Map<string, NormalizedSwimmer>();
  const events: NormalizedEvent[] = [];
  const results: NormalizedResult[] = [];
  const issues: ImportIssue[] = [];

  let meetHeader: ParsedMeetHeader | null = null;
  let headerParsed = false;
  let currentEvent: NormalizedEvent | null = null;
  let pendingClub: string | null = null; // club comes 1 line before result data
  let lastResult = null as NormalizedResult | null; // for attaching seed times from separate lines
  let lastResultIdx = -10;
  let teamFirst = false; // "Edad   EquipoNombre…": la sigla del club va antes de la edad
  let prevPlace = 0;
  const fileLayout = detectPlaceLayout(lines);

  const emitRow = (row: ParsedRow | null, clubName: string | null, lineNo: number, line: string): void => {
    if (!currentEvent) return;
    if (row?.ambiguous) {
      issues.push({
        severity: 'WARNING',
        stage: 'parse',
        message: `Tiempo ambiguo: la fila admite dos lecturas y se tomó ${row.finalTimeRaw} para "${row.name}"`,
        source_line: lineNo,
        raw_line: line,
        suggested_action: 'Verificar el tiempo contra el PDF antes de confirmar',
      });
    }
    if (!row || !clubName) {
      issues.push({
        severity: 'ERROR',
        stage: 'parse',
        message: `No se pudo parsear la fila de resultado`,
        source_line: lineNo,
        raw_line: line,
        suggested_action: 'Revisar formato de la línea',
      });
      return;
    }

    // Name must have a comma (LastName, FirstName)
    if (!row.name.includes(',')) {
      issues.push({
        severity: 'ERROR',
        stage: 'parse',
        message: `Nombre sin coma en resultado: "${row.name}"`,
        source_line: lineNo,
        raw_line: line,
      });
      return;
    }

    const commaIdx = row.name.indexOf(',');
    const lastName = row.name.slice(0, commaIdx).trim();
    const firstName = row.name.slice(commaIdx + 1).trim();

    // Resolve club
    const clubId = normalizeClubId(clubName);
    if (!clubIndex.has(clubId)) {
      clubIndex.set(clubId, {
        external_team_id: clubId,
        name: clubName,
        short_name: clubName.slice(0, 30),
        source_line: lineNo,
      });
    }

    // Resolve swimmer
    const gender: NormalizedGender = currentEvent.gender === 'X' ? 'M' : currentEvent.gender;
    // Normalize names to handle accent variants (Rodríguez = Rodriguez)
    const swimmerKey = `${normalizeForKey(lastName)}|${normalizeForKey(firstName)}|${clubId}|${gender}`;
    if (!swimmerIndex.has(swimmerKey)) {
      // Pre Inf lines use heat+lane prefix instead of age+place.
      // Fall back to the event's minimum age so category resolves correctly.
      const swimmerAge = row.age !== null ? row.age : parseMinAgeFromGroup(currentEvent.age_group);
      swimmerIndex.set(swimmerKey, {
        external_athlete_id: swimmerKey,
        first_name: firstName,
        last_name: lastName,
        gender,
        age: swimmerAge,
        club_ref: clubId,
        source_line: lineNo,
      });
    }
    const swimmer = swimmerIndex.get(swimmerKey)!;

    // Parse times
    const finalTimeMs = parseTimeToMs(row.finalTimeRaw);
    const seedTimeMs = parseTimeToMs(row.seedTimeRaw);

    let status: NormalizedResultStatus = 'OK';
    if (row.isDQ || row.finalTimeRaw === 'DQ') {
      status = 'DSQ';
    } else if (row.finalTimeRaw === 'NS') {
      status = 'DNS';
    } else if (row.finalTimeRaw === 'NF') {
      status = 'DNF';
    } else if (row.finalTimeRaw === 'NT' || finalTimeMs === null) {
      status = 'DNS';
    }

    results.push({
      event_key: currentEvent.event_key,
      event_ref: currentEvent.event_no,
      swimmer_ref: swimmer.external_athlete_id,
      heat_no: 1,
      lane_no: row.place ?? 0,
      final_time_ms: status === 'OK' ? finalTimeMs : null,
      status,
      place: row.place,
      seed_time_ms: seedTimeMs ?? undefined,
      splits: [],
      source_line: lineNo,
    });
    lastResult = results[results.length - 1] ?? null;
    if (row.place !== undefined) prevPlace = row.place;
  };

  for (let i = 0; i < lines.length; i++) {
    // Fix PDF ligature artifact: "ñ e" → "ñe" (e.g. "Ni ñ eas" → "Niñeas", "Di seño e" → "Diseñoe")
    const line = (lines[i] ?? '').replace(/ñ e/g, 'ñe').replace(/Ñ E/g, 'ÑE');
    const lineNo = i + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      pendingClub = null;
      continue;
    }

    // ── Page header ───────────────────────────────────────────────────────────
    if (trimmed.includes("HY-TEK's MEET MANAGER")) {
      if (!headerParsed) {
        const venue = trimmed.split("HY-TEK's")[0]?.trim() ?? '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const candidate = (lines[j] ?? '').trim();
          // "Nombre del torneo - 22/11/2024 a 24/11/2024" o, de un solo día, "… - 18/4/2026"
          const m = candidate.match(
            /^(.+?)\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(?:a|to)\s+(\d{1,2}\/\d{1,2}\/\d{4}))?\s*$/,
          );
          if (m) {
            meetHeader = {
              venue,
              name: m[1]?.trim() ?? '',
              start_date: parseDate(m[2] ?? ''),
              end_date: parseDate(m[3] ?? m[2] ?? ''),
              course: 25,
            };
            headerParsed = true;
            break;
          }
        }
      }
      continue;
    }

    // ── Skip known non-data lines ─────────────────────────────────────────────
    if (
      trimmed === 'Resultados' ||
      trimmed.startsWith('EquipoRelevo') || // relay result column header
      (meetHeader && trimmed.startsWith(meetHeader.name) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed))
    ) {
      continue;
    }
    if (isColumnHeader(trimmed)) {
      teamFirst = /^Edad\s+EquipoNombre/.test(trimmed);
      continue;
    }
    if (SPLITS_LINE_RE.test(trimmed)) continue;

    // ── Event header: "Evento N  Gender AgeGroup Distance CC|CL Metro Stroke Type [Relevo]" ──
    // AgeGroup can be "13-14", "18 & Mayores", "9 Años de Edad", "Categoría Mayores", or empty.
    // Course codes: CC/LC/LM (pileta de 25 m) o CL (curso largo, 50 m). También la línea de
    // continuación "Eliminatorias ...   (Evento N …)" que repite la prueba al cambiar de página.
    const header = parseEventHeader(trimmed);
    if (header) {
      pendingClub = null;
      teamFirst = false;
      prevPlace = 0;

      const evNoRaw = String(header.eventNo);
      // Normalize "9 Años de Edad" → "9", keep "13-14", "18 & Mayores", "Categoría Mayores" as-is
      const ageGroup = header.ageGroup.replace(/\s+A[ñn]os\s+de\s+Edad/i, '').trim();
      const isRelay = header.isRelay;
      const restClean = header.rest.replace(/\bRelevo\b/gi, '').trim();

      // Competition type: literal text of the level, no mapping to categories
      let compTypeKey = 'desconocido';
      if (/toma de tiempos/i.test(restClean)) {
        compTypeKey = 'toma de tiempos';
      } else {
        for (const key of Object.keys(COMPETITION_TYPE_MAP)) {
          if (restClean.toLowerCase().includes(key)) {
            compTypeKey = key;
            break;
          }
        }
      }

      const stroke = extractStroke(restClean);
      if (!stroke) {
        issues.push({
          severity: 'WARNING',
          stage: 'parse',
          message: `Estilo no reconocido: "${restClean}" en Evento ${evNoRaw}`,
          source_line: lineNo,
          raw_line: line,
        });
      }

      const evNo = header.eventNo;
      const eventGender = parseGender(header.genderRaw);
      const eventDistance = header.distance;
      const eventStroke = stroke ?? 'libre';
      const round: NormalizedRound = header.isContinuation
        ? roundFromSectionText(trimmed) ?? 'F'
        : lookaheadRound(lines, i + 1);
      // La preliminar (Eliminatorias) es otra prueba que la final: mismos nadadores, otros tiempos.
      // Las finales conservan la clave de siempre.
      const eventKey =
        buildEventKey({
          event_no: evNo,
          gender: eventGender,
          age_group: ageGroup,
          distance: eventDistance,
          stroke: eventStroke,
          is_relay: isRelay,
        }) + (round === 'P' ? '|P' : '');

      // Meet Manager repite el encabezado de la prueba en cada página del PDF:
      // si es LA MISMA prueba (misma clave), se retoma. El número solo no alcanza:
      // se reutiliza entre categorías de edad y, a veces, entre géneros.
      const existingEvent = events.find((e) => e.event_key === eventKey);
      if (existingEvent) {
        currentEvent = existingEvent;
        continue;
      }

      const event: NormalizedEvent = {
        event_key: eventKey,
        event_no: evNo,
        stroke: eventStroke,
        distance: eventDistance,
        gender: eventGender,
        round,
        course: parseCourse(header.courseCode),
        age_group: ageGroup,
        competition_type: parseCompetitionType(compTypeKey),
        is_relay: isRelay,
        source_line: lineNo,
      };

      events.push(event);
      currentEvent = event;

      if (isRelay) {
        issues.push({
          severity: 'INFO',
          stage: 'parse',
          message: `Evento ${evNoRaw} es relevo — salteado en M6`,
          source_line: lineNo,
        });
      }
      continue;
    }

    // ── Skip relay content ────────────────────────────────────────────────────
    // Relay indicator: "    A", "    B", etc. (4 spaces + single letter)
    if (/^\s{3,}[A-Z]$/.test(line)) continue;
    // Relay result line: starts with digits|"---" then club + "x" or club + "DQ"
    // (salvo que se lea como un nadador: "Alex2:15,40" tiene "x2" y no es una posta)
    if (
      /^(?:\d+|---)[A-Za-záéíóúñÁÉÍÓÚÑ ]/.test(trimmed) &&
      /x\d|DQ/.test(trimmed) &&
      !/ \d{2}(?:---|\d)/.test(trimmed) &&
      parseDataLine(line, currentEvent ? parseAgeRange(currentEvent.age_group) : null, currentEvent?.distance, {
        layout: fileLayout,
        prevPlace,
      }) === null
    ) {
      continue;
    }
    // Relay athlete enumeration: "1) Name..."
    if (/^\d+\)/.test(trimmed)) continue;
    // Skip if current event is a relay
    if (currentEvent?.is_relay) continue;

    // ── Standalone seed time: indented line with only a time or status code ──
    // Some Meet Manager PDFs (e.g. CL format) put the seed time on the line after
    // the result — e.g. "  1:09.06" following "  1211RODRIGUEZ, MATEO 1:09.06".
    if (
      line.startsWith(' ') &&
      /^(\d{1,2}:\d{2}[,.]\d{2}|\d{1,2}[,.]\d{2}|NT|NS|NF|DQ)$/.test(trimmed)
    ) {
      if (lastResult !== null && lastResult.seed_time_ms === undefined) {
        const ms = parseTimeToMs(trimmed);
        if (ms !== null) lastResult.seed_time_ms = ms;
      }
      continue;
    }

    // ── Puntos + sembrado impresos en la línea siguiente a la fila: "161:26.31" ──
    if (lastResult !== null && lastResultIdx === i - 1) {
      const seed = parseSeedContinuation(trimmed, lastResult.final_time_ms, currentEvent?.distance);
      if (seed !== null) {
        const ms = parseTimeToMs(seed);
        if (lastResult.seed_time_ms === undefined && ms !== null) lastResult.seed_time_ms = ms;
        lastResultIdx = i;
        continue;
      }
    }

    // ── Puesto que el PDF imprimió en la línea siguiente a la fila ("…2:46,16" / "1") ──
    if (/^\*?\d{1,3}$/.test(trimmed) && lastResult !== null && lastResultIdx === i - 1 && lastResult.place === undefined) {
      const place = parseInt(trimmed.replace('*', ''), 10);
      lastResult.place = place;
      lastResult.lane_no = place;
      prevPlace = place;
      continue;
    }

    // ── Fila con la sigla del club antes de la edad ──────────────────────────
    if (teamFirst && !line.startsWith(' ') && currentEvent) {
      const teamRow = parseTeamFirstRow(line, currentEvent.distance, prevPlace);
      if (teamRow) {
        emitRow(teamRow, teamRow.team, lineNo, line);
        lastResultIdx = i;
        continue;
      }
    }

    // ── Result data line ──────────────────────────────────────────────────────
    // edad (1-2 dígitos) + "*"? + puesto o "---" + nombre + tiempos → " 1411NOMBRE…", " 81Lema…"
    // Una línea SIN sangría que empieza con dígito puede ser un club ("1ro de Mayo"):
    // solo se toma como resultado si realmente se puede leer como tal.
    const looksLikeRow = /^\s*\d{1,2}\*?(?:\d+|---|[A-Za-záéíóúñÁÉÍÓÚÑ])/.test(line);
    const rowRange = currentEvent ? parseAgeRange(currentEvent.age_group) : null;
    const readRow = (): ParsedRow | null =>
      parseDataLine(line, rowRange, currentEvent?.distance, { layout: fileLayout, prevPlace });
    if (looksLikeRow && (/^\s/.test(line) || readRow() !== null)) {
      if (!currentEvent) {
        issues.push({
          severity: 'WARNING',
          stage: 'parse',
          message: 'Resultado encontrado antes del primer evento',
          source_line: lineNo,
          raw_line: line,
        });
        pendingClub = null;
        continue;
      }

      const clubName = pendingClub;
      pendingClub = null;
      emitRow(readRow(), clubName, lineNo, line);
      lastResultIdx = i;
      continue;
    }

    // ── Club name line: non-empty, not a header, not a data line ─────────────
    // A club line is a plain text line with no leading whitespace that doesn't
    // match any of the patterns above.
    if (!line.startsWith(' ') && !trimmed.startsWith('Evento')) {
      if (!isNotClubLine(trimmed)) pendingClub = trimmed;
      continue;
    }

    issues.push({
      severity: 'WARNING',
      stage: 'parse',
      message: `Línea no reconocida: "${trimmed.slice(0, 80)}"`,
      source_line: lineNo,
      raw_line: line,
    });
  }

  // La pileta se lee de las pruebas del archivo ("CC Metro" = 25 m, "CL Metro" = 50 m), no de los tiempos.
  const courses = new Set(events.map((e) => e.course));
  let course: PoolLength | null = null;
  if (courses.size === 1) {
    course = (courses.values().next().value as PoolLength | undefined) ?? null;
  } else if (courses.size > 1) {
    issues.push({
      severity: 'WARNING',
      stage: 'parse',
      message: 'El archivo mezcla pruebas de 25 m y de 50 m: el largo de pileta del torneo queda sin definir',
      suggested_action: 'Revisar el largo de pileta antes de confirmar',
    });
  }
  if (meetHeader && course !== null) meetHeader.course = course;

  return {
    clubs: Array.from(clubIndex.values()),
    swimmers: Array.from(swimmerIndex.values()),
    events,
    results,
    issues,
    meetHeader,
    course,
  };
}
