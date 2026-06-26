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

function parseDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return raw;
  return `${m[3] ?? ''}-${(m[2] ?? '').padStart(2, '0')}-${(m[1] ?? '').padStart(2, '0')}`;
}

function parseGender(token: string): NormalizedGender {
  const t = token.toLowerCase();
  if (t === 'niñas' || t === 'mujeres') return 'F';
  if (t === 'niños' || t === 'hombres') return 'M';
  if (t === 'mixto') return 'X';
  return 'M';
}

function parseCourse(token: string): PoolLength {
  return token.toLowerCase().startsWith('l') ? 50 : 25;
}

function parseStroke(raw: string): NormalizedStroke | null {
  return STROKE_MAP[raw.trim().toLowerCase()] ?? null;
}

function parseCompetitionType(raw: string): CompetitionType {
  return COMPETITION_TYPE_MAP[raw.trim().toLowerCase()] ?? 'DESCONOCIDO';
}

function normalizeClubId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

// ─── Data-line parser ─────────────────────────────────────────────────────────

// Matches the time/status suffix at the end of a result data line.
// Groups: (1) finalTime  (2) points digit or ''  (3) seedTime
// Handles both concatenated (no space) and spaced (space between) variants.
// Examples:
//   "3:02,9593:00,00"  → "3:02,95", "9", "3:00,00"
//   "3:13,27 3:03,90"  → "3:13,27", "",  "3:03,90"
//   "DQ NT"            → "DQ",      "",  "NT"
//   "DQ 3:10,76"       → "DQ",      "",  "3:10,76"
//   "3:10,281NT"        → "3:10,28", "1", "NT"
const SUFFIX_RE =
  /(\d{1,2}(?::\d{2})?,\d{2}|DQ|NT|NS|NF)(\d?) ?(\d{1,2}(?::\d{2})?,\d{2}|NT|NS|NF)$/;

interface ParsedRow {
  age: number;
  place: number | undefined;
  isDQ: boolean;
  name: string;
  finalTimeRaw: string;
  seedTimeRaw: string;
}

function parseDataLine(line: string): ParsedRow | null {
  const trimmed = line.trimStart();

  // Age is always exactly 2 leading digits (competitive swimmers are 10-99+)
  // Then place as digits or "---" for DQ
  const headerMatch = trimmed.match(/^(\d{2})(---|\d+)(.+)$/s);
  if (!headerMatch) return null;

  const age = parseInt(headerMatch[1] ?? '0', 10);
  const placeRaw = headerMatch[2] ?? '';
  const rest = headerMatch[3] ?? '';

  const isDQ = placeRaw === '---';
  const place = isDQ ? undefined : parseInt(placeRaw, 10);

  const suffixMatch = rest.match(SUFFIX_RE);
  if (!suffixMatch) return null;

  const finalTimeRaw = suffixMatch[1] ?? 'NT';
  const seedTimeRaw = suffixMatch[3] ?? 'NT';

  // Name is everything before the suffix, stripped of trailing footnote digit
  const nameRaw = rest.slice(0, rest.length - suffixMatch[0].length).trim();
  // Remove Meet Manager footnote markers (trailing single digit after space)
  const name = nameRaw.replace(/\s+\d$/, '').trim();

  return { age, place, isDQ, name, finalTimeRaw, seedTimeRaw };
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
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
      (meetHeader && trimmed.startsWith(meetHeader.name) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed))
    ) {
      continue;
    }

    // ── Event header: "Evento N  Gender AgeGroup Distance CC|LC Metro Stroke Type [Relevo]" ──
    const eventMatch = trimmed.match(
      /^Evento\s+(\d+)\s+(Ni[ñn]as?|Mujeres|Ni[ñn]os?|Hombres|Mixto)\s+([\d\-]+(?:\s*&\s*Mayores)?)\s+(\d+)\s+(CC|LC|LM)\s+Metro\s+(.+)/i,
    );
    if (eventMatch) {
      pendingClub = null;

      const evNoRaw = eventMatch[1] ?? '0';
      const genderRaw = eventMatch[2] ?? '';
      const ageGroup = eventMatch[3] ?? '';
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

      const event: NormalizedEvent = {
        event_no: parseInt(evNoRaw, 10),
        stroke: stroke ?? 'libre',
        distance: parseInt(distRaw, 10),
        gender: parseGender(genderRaw),
        round: 'F' as NormalizedRound,
        course: parseCourse(courseCode),
        age_group: ageGroup.trim(),
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

    // ── Result data line: starts with spaces then age(2 digits) + place/--- ──
    if (/^ +\d{2}(?:\d+|---)/.test(line)) {
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

      const row = parseDataLine(line);
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
      const swimmerKey = `${lastName.toLowerCase()}|${firstName.toLowerCase()}|${clubId}|${gender}`;
      if (!swimmerIndex.has(swimmerKey)) {
        swimmerIndex.set(swimmerKey, {
          external_athlete_id: swimmerKey,
          first_name: firstName,
          last_name: lastName,
          gender,
          age: row.age,
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
