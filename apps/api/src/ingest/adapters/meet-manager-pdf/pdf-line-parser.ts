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
  infantiles: 'INFANTILES',
  promocionales: 'PROMOCIONALES',
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
  if (t === 'niñas' || t === 'mujeres') return 'F';
  if (t === 'niños' || t === 'hombres') return 'M';
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

function parseCompetitionType(raw: string): CompetitionType {
  return COMPETITION_TYPE_MAP[raw.trim().toLowerCase()] ?? 'DESCONOCIDO';
}

function normalizeClubId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

// ─── Data-line parser ─────────────────────────────────────────────────────────

export interface ParsedRow {
  age: number | null; // null solo si no se pudo separar edad y puesto (sin rango de edades)
  place: number | undefined;
  isDQ: boolean;
  name: string;
  finalTimeRaw: string;
  seedTimeRaw: string;
  /** El tiempo admitía dos lecturas y se eligió por convención de formato: revisar. */
  ambiguous?: boolean;
}

/** Extracts the minimum numeric age from an age_group string ("5-8" → 5, "9" → 9, "12-13" → 12). */
function parseMinAgeFromGroup(ageGroup: string): number {
  const m = ageGroup.match(/^(\d+)/);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

/** Rango de edades de la prueba ("12-13" → 12..13, "19 & Mayores" → 19..∞, "9" → 9..9). */
export interface AgeRange {
  min: number;
  max: number;
}

export function parseAgeRange(ageGroup: string): AgeRange | null {
  const m = ageGroup.trim().match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?(\s*&\s*Mayores)?/i);
  if (!m) return null;
  const min = parseInt(m[1] ?? '0', 10);
  if (m[3]) return { min, max: Number.POSITIVE_INFINITY };
  return { min, max: m[2] ? parseInt(m[2], 10) : min };
}

const TIME_SRC = '(?:\\d{1,2}:\\d{2}|\\d{2})[,.]\\d{2}';
const FINAL_RE = new RegExp(`^(${TIME_SRC}|DQ|NS|NF|NT)`);
const SEED_FULL_RE = new RegExp(`^(${TIME_SRC}|NT|NS|NF)$`);
// Estado en lugar de tiempo final, al final de la fila, con sembrado opcional.
const STATUS_TAIL_RE = new RegExp(
  `(?<=[a-záéíóúüñ\\s])(?:DQ|NS|NF|NT)\\s*(?:${TIME_SRC}|NT|NS|NF)?$`,
);
// Puntos compartidos por empate: "5. 50" (= 5,50)
const TIE_POINTS_RE = /^\d{1,2}\. ?\d{2}/;

/**
 * Separa edad y puesto del prefijo pegado ("121" = 12 años, 1°; "81" = 8 años, 1°;
 * "1010" = 10 años, 10°). La edad puede tener 1 o 2 dígitos: se decide con el rango
 * de edades de la prueba. Sin rango se asume edad de 2 dígitos.
 */
function splitAgeAndPlace(
  digits: string,
  range: AgeRange | null | undefined,
): { age: number | null; place: number | undefined } | null {
  const inRange = (n: number) => !range || (n >= range.min && n <= range.max);
  const two = digits.length >= 3 ? parseInt(digits.slice(0, 2), 10) : NaN;
  const one = digits.length >= 2 ? parseInt(digits.slice(0, 1), 10) : NaN;

  if (range) {
    if (!Number.isNaN(two) && inRange(two)) return { age: two, place: parseInt(digits.slice(2), 10) };
    if (!Number.isNaN(one) && inRange(one)) return { age: one, place: parseInt(digits.slice(1), 10) };
  }
  if (digits.length >= 3) return { age: two, place: parseInt(digits.slice(2), 10) };
  // Dos dígitos sin rango que lo confirme: edad desconocida, el segundo dígito es el puesto.
  if (digits.length === 2) return { age: null, place: parseInt(digits.slice(1), 10) };
  return null;
}

/**
 * Parsea la cola "tiempo final + puntos + tiempo de sembrado", que Meet Manager
 * pega sin separadores. Variantes reales:
 *   "3:02,9593:00,00"   final 3:02,95 · 9 pts · sembrado 3:00,00
 *   "3:15,48 NT"        final · sin puntos (hay espacio) · sembrado NT
 *   "1:23,475. 501:25,44"  empate: 5,50 pts
 *   "DQ 3:10,76"        descalificado
 *   "1:09.06"           formato CL: el sembrado viene en la línea siguiente
 */
function parseTimesTail(tail: string): { finalTimeRaw: string; seedTimeRaw: string } | null {
  const finalMatch = tail.match(FINAL_RE);
  if (!finalMatch) return null;
  const finalTimeRaw = finalMatch[1] ?? 'NT';
  const after = tail.slice(finalTimeRaw.length);

  if (after.trim() === '') return { finalTimeRaw, seedTimeRaw: 'NT' };

  // Con espacio después del final no hay puntos: lo que sigue es el sembrado.
  if (/^\s/.test(after)) {
    const seed = after.trim();
    return SEED_FULL_RE.test(seed) ? { finalTimeRaw, seedTimeRaw: seed } : null;
  }

  // Pegado: puntos (empate "5. 50", o 1-2 dígitos) y después el sembrado.
  // "…,30161:04,00" puede ser 1 pto + 61:04,00 o 16 ptos + 1:04,00: se prefiere el
  // sembrado comparable con el tiempo final (entre la mitad y el doble).
  const tie = after.match(TIE_POINTS_RE);
  const candidates = (tie ? [after.slice(tie[0].length)] : [after.slice(1), after.slice(2), after])
    .map((c) => c.trim())
    .filter((c) => SEED_FULL_RE.test(c));
  if (candidates.length === 0) return null;

  const finalMs = parseTimeToMs(finalTimeRaw);
  const comparable = candidates.find((c) => {
    const seedMs = parseTimeToMs(c);
    return finalMs !== null && seedMs !== null && seedMs >= finalMs / 2 && seedMs <= finalMs * 2;
  });
  return { finalTimeRaw, seedTimeRaw: comparable ?? candidates[0] ?? 'NT' };
}

// Cotas de cordura del lector (no son reglas de negocio): un tiempo fuera de
// 0,4–3 s por metro no es un tiempo de natación, es una fila mal cortada.
const MIN_MS_PER_METRE = 400;
const MAX_MS_PER_METRE = 3000;

function isPlausibleTime(raw: string, distance: number | undefined): boolean | null {
  const ms = parseTimeToMs(raw);
  if (ms === null || !distance) return null;
  return ms >= distance * MIN_MS_PER_METRE && ms <= distance * MAX_MS_PER_METRE;
}

type TimesTail = { finalTimeRaw: string; seedTimeRaw: string };

/**
 * Nota al pie de Meet Manager: un dígito suelto pegado al tiempo ("Uma 52:56,32" =
 * nota 5 + 2:56,32). Si la cola admite las dos lecturas (con y sin ese dígito) se decide:
 *   1. por la distancia de la prueba: 52 minutos no es un 200 combinado;
 *   2. por el sembrado, si es comparable con una sola de las lecturas;
 *   3. por el formato: con coma decimal el tiempo va pegado al nombre, así que un
 *      dígito tras un espacio es la nota; con punto (formato CL) el tiempo va separado.
 * Si solo decide el paso 3, la fila se marca `ambiguous` para que se revise en el preview.
 */
function resolveTimes(
  nameRaw: string,
  tail: string,
  distance: number | undefined,
): (TimesTail & { ambiguous: boolean }) | null {
  const asIs = parseTimesTail(tail);
  const withoutNote = /^\d/.test(tail) ? parseTimesTail(tail.slice(1)) : null;

  if (!withoutNote) return asIs ? { ...asIs, ambiguous: false } : null;
  if (!asIs) return { ...withoutNote, ambiguous: false };

  const plausibleAsIs = isPlausibleTime(asIs.finalTimeRaw, distance);
  const plausibleNote = isPlausibleTime(withoutNote.finalTimeRaw, distance);
  if (plausibleAsIs !== null && plausibleNote !== null && plausibleAsIs !== plausibleNote) {
    return { ...(plausibleAsIs ? asIs : withoutNote), ambiguous: false };
  }

  const nearSeed = (t: TimesTail): boolean => {
    const finalMs = parseTimeToMs(t.finalTimeRaw);
    const seedMs = parseTimeToMs(t.seedTimeRaw);
    return finalMs !== null && seedMs !== null && seedMs >= finalMs / 2 && seedMs <= finalMs * 2;
  };
  if (nearSeed(asIs) !== nearSeed(withoutNote)) {
    return { ...(nearSeed(asIs) ? asIs : withoutNote), ambiguous: false };
  }

  const noteByFormat = /\s$/.test(nameRaw) && withoutNote.finalTimeRaw.includes(',');
  return { ...(noteByFormat ? withoutNote : asIs), ambiguous: true };
}

/**
 * Parsea una fila de resultado: edad + puesto + nombre + tiempos, todo pegado.
 * `ageRange` (de la prueba) permite distinguir edades de 1 y 2 dígitos; `distance`
 * (metros) permite descartar lecturas de tiempo imposibles.
 */
export function parseDataLine(
  line: string,
  ageRange?: AgeRange | null,
  distance?: number,
): ParsedRow | null {
  const trimmed = line.trim();

  // Prefijo: dígitos de edad(+puesto), "*" de empate opcional, y puesto o "---" (descalificado).
  const head = trimmed.match(/^(\d{1,4})(?:(\*)(\d+)|(---))?(.+)$/s);
  if (!head) return null;

  const digits = head[1] ?? '';
  const starPlace = head[3];
  const isDQ = head[4] === '---';
  const rest = head[5] ?? '';

  let age: number | null;
  let place: number | undefined;
  if (starPlace !== undefined || isDQ) {
    // Con "*" o "---" los dígitos iniciales son solo la edad.
    if (digits.length > 2) return null;
    age = parseInt(digits, 10);
    place = isDQ ? undefined : parseInt(starPlace ?? '', 10);
  } else {
    const split = splitAgeAndPlace(digits, ageRange);
    if (!split) return null;
    age = split.age;
    place = split.place;
  }

  // ¿Dónde termina el nombre?
  //  a) En un estado sin tiempo (DQ/NS/NF/NT), pegado a una minúscula ("TeoDQ 3:10,76")
  //     o separado por espacio ("MATEO NS"). Nunca dentro de un apellido en mayúsculas.
  //  b) Si no, en el primer dígito: los nombres no tienen dígitos.
  const statusMatch = rest.match(STATUS_TAIL_RE);
  const firstDigit = rest.search(/\d/);
  // Lo que aparezca primero: "Agostina3:15,48 NT" corta en el tiempo, no en el NT del sembrado.
  const statusAt = statusMatch?.index ?? -1;
  const nameEnd =
    statusAt >= 0 && firstDigit >= 0 ? Math.min(statusAt, firstDigit) : Math.max(statusAt, firstDigit);
  if (nameEnd < 0) return null;
  const nameRaw = rest.slice(0, nameEnd);
  const tail = rest.slice(nameEnd);

  const times = resolveTimes(nameRaw, tail, distance);
  if (!times) return null;

  const name = nameRaw.trim();
  if (!name) return null;

  return {
    age,
    place,
    isDQ,
    name,
    finalTimeRaw: times.finalTimeRaw,
    seedTimeRaw: times.seedTimeRaw,
    ...(times.ambiguous ? { ambiguous: true } : {}),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseLines(lines: string[], _fileName: string): LineParserResult {
  const clubIndex = new Map<string, NormalizedClub>();
  const swimmerIndex = new Map<string, NormalizedSwimmer>();
  const events: NormalizedEvent[] = [];
  const results: NormalizedResult[] = [];
  const issues: ImportIssue[] = [];

  let meetHeader: ParsedMeetHeader | null = null;
  let headerParsed = false;
  let currentEvent: NormalizedEvent | null = null;
  let pendingClub: string | null = null; // club comes 1 line before result data
  let lastResult: NormalizedResult | null = null; // for attaching seed times from separate lines

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
          const m = candidate.match(
            /^(.+?)\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+a\s+(\d{1,2}\/\d{1,2}\/\d{4})/,
          );
          if (m) {
            meetHeader = {
              venue,
              name: m[1]?.trim() ?? '',
              start_date: parseDate(m[2] ?? ''),
              end_date: parseDate(m[3] ?? ''),
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
      trimmed.startsWith('EdadNombre') ||
      trimmed === 'Resultados' ||
      trimmed.startsWith('EquipoRelevo') || // relay result column header
      (meetHeader && trimmed.startsWith(meetHeader.name) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed))
    ) {
      continue;
    }

    // ── Event header: "Evento N  Gender AgeGroup Distance CC|LC Metro Stroke Type [Relevo]" ──
    // AgeGroup can be "13-14", "18 & Mayores", "8 Años de Edad", "9 Años de Edad", "5-8", etc.
    // Course codes: CC/LC/LM (Catamarca format) or CL (this format — Curso Largo)
    const eventMatch = trimmed.match(
      /^Evento\s+(\d+)\s+(Ni[ñn]as?|Mujeres|Ni[ñn]os?|Hombres|Mixto)\s+([\d-]+(?:\s+A[ñn]os\s+de\s+Edad)?(?:\s*&\s*Mayores)?)\s+(\d+)\s+(CC|LC|LM|CL)\s+Metro\s+(.+)/i,
    );
    if (eventMatch) {
      pendingClub = null;

      const evNoRaw = eventMatch[1] ?? '0';
      const genderRaw = eventMatch[2] ?? '';
      // Normalize "9 Años de Edad" → "9", keep "13-14" and "18 & Mayores" as-is
      const ageGroup = (eventMatch[3] ?? '').replace(/\s+A[ñn]os\s+de\s+Edad/i, '').trim();
      const distRaw = eventMatch[4] ?? '0';
      const courseCode = eventMatch[5] ?? 'CC';
      const rest = eventMatch[6] ?? '';

      const isRelay = /\bRelevo\b/i.test(rest);
      const restClean = rest.replace(/\bRelevo\b/gi, '').trim();

      // Separate stroke from competition type
      let strokeRaw = restClean;
      let compTypeKey = 'desconocido';

      if (/toma de tiempos/i.test(restClean)) {
        compTypeKey = 'toma de tiempos';
        strokeRaw = restClean.replace(/toma de tiempos/i, '').trim();
      } else {
        for (const key of Object.keys(COMPETITION_TYPE_MAP)) {
          if (restClean.toLowerCase().includes(key)) {
            compTypeKey = key;
            strokeRaw = restClean
              .slice(0, restClean.toLowerCase().indexOf(key))
              .trim();
            break;
          }
        }
      }

      // Strip category suffixes: "PRE A", "PRE B", "Pre Inf A", "Pre Inf B"
      strokeRaw = strokeRaw.replace(/\s*\bPRE(?:\s+INF)?\s+[A-Z]\b\s*/gi, '').trim();

      const stroke = parseStroke(strokeRaw);
      if (!stroke) {
        issues.push({
          severity: 'WARNING',
          stage: 'parse',
          message: `Estilo no reconocido: "${strokeRaw}" en Evento ${evNoRaw}`,
          source_line: lineNo,
          raw_line: line,
        });
      }

      const evNo = parseInt(evNoRaw, 10);

      const eventGender = parseGender(genderRaw);
      const eventDistance = parseInt(distRaw, 10);
      const eventStroke = stroke ?? 'libre';
      const eventKey = buildEventKey({
        event_no: evNo,
        gender: eventGender,
        age_group: ageGroup,
        distance: eventDistance,
        stroke: eventStroke,
        is_relay: isRelay,
      });

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
        round: 'F' as NormalizedRound,
        course: parseCourse(courseCode),
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
    if (/^(?:\d+|---)[A-Za-záéíóúñÁÉÍÓÚÑ ]/.test(trimmed) && /x\d|DQ/.test(trimmed) && !/ \d{2}(?:---|\d)/.test(trimmed)) {
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

    // ── Result data line ──────────────────────────────────────────────────────
    // edad (1-2 dígitos) + "*"? + puesto o "---" + nombre + tiempos → " 1411NOMBRE…", " 81Lema…"
    // Una línea SIN sangría que empieza con dígito puede ser un club ("1ro de Mayo"):
    // solo se toma como resultado si realmente se puede leer como tal.
    const looksLikeRow = /^\s*\d{1,2}\*?(?:\d+|---|[A-Za-záéíóúñÁÉÍÓÚÑ])/.test(line);
    const rowRange = currentEvent ? parseAgeRange(currentEvent.age_group) : null;
    if (
      looksLikeRow &&
      (/^\s/.test(line) || parseDataLine(line, rowRange, currentEvent?.distance) !== null)
    ) {
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

      const row = parseDataLine(line, rowRange, currentEvent.distance);
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
      if (!row || !pendingClub) {
        issues.push({
          severity: 'ERROR',
          stage: 'parse',
          message: `No se pudo parsear la fila de resultado`,
          source_line: lineNo,
          raw_line: line,
          suggested_action: 'Revisar formato de la línea',
        });
        pendingClub = null;
        continue;
      }

      const clubName = pendingClub;
      pendingClub = null;

      // Name must have a comma (LastName, FirstName)
      if (!row.name.includes(',')) {
        issues.push({
          severity: 'ERROR',
          stage: 'parse',
          message: `Nombre sin coma en resultado: "${row.name}"`,
          source_line: lineNo,
          raw_line: line,
        });
        continue;
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
      const club = clubIndex.get(clubId)!;

      // Resolve swimmer
      const gender: NormalizedGender =
        currentEvent.gender === 'X' ? 'M' : currentEvent.gender;
      // Normalize names to handle accent variants (Rodríguez = Rodriguez)
      const swimmerKey = `${normalizeForKey(lastName)}|${normalizeForKey(firstName)}|${clubId}|${gender}`;
      if (!swimmerIndex.has(swimmerKey)) {
        // Pre Inf lines use heat+lane prefix instead of age+place.
        // Fall back to the event's minimum age so category resolves correctly.
        const swimmerAge = row.age !== null
          ? row.age
          : parseMinAgeFromGroup(currentEvent.age_group);
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

      // Silence INFO spam — swimmers are implicit from results
      void club; // referenced, satisfies lint
      continue;
    }

    // ── Club name line: non-empty, not a header, not a data line ─────────────
    // A club line is a plain text line with no leading whitespace that doesn't
    // match any of the patterns above.
    if (!line.startsWith(' ') && !trimmed.startsWith('Evento')) {
      pendingClub = trimmed;
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

  return {
    clubs: Array.from(clubIndex.values()),
    swimmers: Array.from(swimmerIndex.values()),
    events,
    results,
    issues,
    meetHeader,
  };
}
