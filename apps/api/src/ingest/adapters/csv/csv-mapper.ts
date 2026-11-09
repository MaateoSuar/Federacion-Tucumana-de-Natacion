import { basename } from 'path';
import { parseTimeToMs } from '../meet-manager-pdf/pdf-time-parser';
import { CSV_PROFILES, CsvSemanticField } from './csv-profile';
import type { CsvProfile } from './csv-profile';
import type {
  NormalizedMeet,
  NormalizedStroke,
  NormalizedGender,
  NormalizedResultStatus,
  PoolLength,
} from '../../types/normalized-meet.types';
import type { ImportIssue } from '../../types/import-issue.types';

// ─── Text utilities ──────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// ─── CSV row parser ──────────────────────────────────────────────────────────

export function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis >= commas ? ';' : ',';
}

// ─── Profile detection ───────────────────────────────────────────────────────

/**
 * Returns a map of `CsvSemanticField → actual column header in the file`,
 * plus the matched profile. Returns null if no profile reaches minimum coverage.
 */
export function detectProfile(
  headers: string[],
): { profile: CsvProfile; columnMap: Partial<Record<CsvSemanticField, string>> } | null {
  const normHeaders = headers.map(normalize);

  let bestProfile: CsvProfile | null = null;
  let bestMap: Partial<Record<CsvSemanticField, string>> = {};
  let bestScore = 0;

  for (const profile of CSV_PROFILES) {
    const map: Partial<Record<CsvSemanticField, string>> = {};
    let score = 0;

    for (const [field, aliases] of Object.entries(profile.aliases) as [CsvSemanticField, string[]][]) {
      for (const alias of aliases) {
        const idx = normHeaders.indexOf(normalize(alias));
        if (idx !== -1) {
          map[field] = headers[idx]!;
          score++;
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
      bestMap = map;
    }
  }

  // Need at least: (name or first+last) + club + time
  const hasName = bestMap['swimmer_name'] ?? bestMap['swimmer_last'];
  const hasClub = bestMap['club'];
  const hasTime = bestMap['time'];
  if (!hasName || !hasClub || !hasTime || !bestProfile) return null;

  return { profile: bestProfile, columnMap: bestMap };
}

// ─── Domain normalizers ──────────────────────────────────────────────────────

function normalizeStroke(raw: string): NormalizedStroke {
  const s = normalize(raw);
  if (s.includes('libre') || s.includes('free')) return 'libre';
  if (s.includes('espalda') || s.includes('back')) return 'espalda';
  if (s.includes('pecho') || s.includes('breast')) return 'pecho';
  if (s.includes('mariposa') || s.includes('fly') || s.includes('butterfly')) return 'mariposa';
  if (s.includes('combinado') || s.includes('medley') || s.includes(' im')) return 'combinado';
  return 'libre';
}

function normalizeGender(raw: string): NormalizedGender {
  const s = normalize(raw);
  if (s === 'm' || s === 'masc' || s === 'masculino' || s === 'male' || s === 'men' || s === 'boys') return 'M';
  if (s === 'f' || s === 'fem' || s === 'femenino' || s === 'female' || s === 'women' || s === 'girls') return 'F';
  return 'X';
}

function normalizeStatus(raw: string, timeMs: number | null): NormalizedResultStatus {
  const s = normalize(raw);
  if (s.includes('dsq') || s.includes('dq') || s === 'desc') return 'DSQ';
  if (s.includes('dns') || s.includes('ns') || s.includes('no inicio')) return 'DNS';
  if (s.includes('dnf') || s.includes('nf') || s.includes('no termino')) return 'DNF';
  if (timeMs === null) return 'DNS';
  return 'OK';
}

/**
 * Parses a combined event name like "100 Espalda F" or "50 Freestyle Men".
 * Returns partial event fields; returns null if unparseable.
 */
function parseEventName(
  raw: string,
): { distance: number; stroke: NormalizedStroke; gender: NormalizedGender } | null {
  const s = raw.trim();
  const distMatch = s.match(/(\d+)/);
  if (!distMatch) return null;
  const distance = parseInt(distMatch[1]!, 10);
  const stroke = normalizeStroke(s);
  const genderMatch = s.match(/\b([mf]|masc|fem|masculino|femenino|male|female|men|women)\b/i);
  const gender = genderMatch ? normalizeGender(genderMatch[1]!) : 'X';
  return { distance, stroke, gender };
}

// ─── Main mapping ────────────────────────────────────────────────────────────

interface ParsedRow {
  eventStroke: NormalizedStroke;
  eventDistance: number;
  eventGender: NormalizedGender;
  eventCategory: string;
  swimmerFirst: string;
  swimmerLast: string;
  swimmerAge: number | undefined;
  clubName: string;
  timeMs: number | null;
  entryTimeMs: number | null;
  place: number | undefined;
  heat: number;
  lane: number;
  status: NormalizedResultStatus;
  rowIndex: number;
}

function rowValue(
  row: string[],
  headers: string[],
  field: string | undefined,
): string {
  if (!field) return '';
  const idx = headers.findIndex((h) => h === field);
  return idx >= 0 ? (row[idx] ?? '').trim() : '';
}

export function mapRowsToMeet(
  rows: string[][],
  headers: string[],
  columnMap: Partial<Record<CsvSemanticField, string>>,
  fileName: string,
  source: 'csv' | 'excel',
): NormalizedMeet {
  const issues: ImportIssue[] = [];
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.every((c) => c === '')) continue; // skip blank rows

    const get = (field: CsvSemanticField) => rowValue(row, headers, columnMap[field]);

    // ── Time ──
    const rawTime = get('time');
    const timeMs = parseTimeToMs(rawTime);

    // ── Status ──
    const rawStatus = get('status') || (timeMs === null ? rawTime : '');
    const status = normalizeStatus(rawStatus, timeMs);

    // ── Event ──
    let stroke: NormalizedStroke = 'libre';
    let distance = 0;
    let gender: NormalizedGender = 'X';

    const rawEventName = get('event_name');
    if (rawEventName) {
      const parsed2 = parseEventName(rawEventName);
      if (parsed2) { stroke = parsed2.stroke; distance = parsed2.distance; gender = parsed2.gender; }
    }
    if (get('event_stroke')) stroke = normalizeStroke(get('event_stroke'));
    if (get('event_distance')) {
      const d = parseInt(get('event_distance'), 10);
      if (!isNaN(d)) distance = d;
    }
    if (get('event_gender')) gender = normalizeGender(get('event_gender'));

    if (distance === 0) {
      issues.push({ severity: 'ERROR', stage: 'parse', message: `Fila ${i + 2}: distancia no reconocida`, suggested_action: 'Revisá la columna de distancia/evento.' });
      continue;
    }

    // ── Swimmer ──
    let first = get('swimmer_first');
    let last = get('swimmer_last');
    if (!last) {
      const combined = get('swimmer_name');
      if (combined.includes(',')) {
        [last = '', first = ''] = combined.split(',').map((s) => s.trim());
      } else {
        const parts = combined.trim().split(/\s+/);
        last = parts.pop() ?? '';
        first = parts.join(' ');
      }
    }
    if (!last) {
      issues.push({ severity: 'ERROR', stage: 'parse', message: `Fila ${i + 2}: nombre del nadador vacío` });
      continue;
    }

    const clubName = get('club');
    if (!clubName) {
      issues.push({ severity: 'WARNING', stage: 'parse', message: `Fila ${i + 2}: club vacío — se asignará "Desconocido"` });
    }

    const rawAge = get('swimmer_age');
    const swimmerAge = rawAge ? parseInt(rawAge, 10) : undefined;

    parsed.push({
      eventStroke: stroke,
      eventDistance: distance,
      eventGender: gender,
      eventCategory: get('event_category') || 'General',
      swimmerFirst: first,
      swimmerLast: last,
      swimmerAge: isNaN(swimmerAge ?? NaN) ? undefined : swimmerAge,
      clubName: clubName || 'Desconocido',
      timeMs,
      entryTimeMs: parseTimeToMs(get('entry_time')),
      place: get('place') ? parseInt(get('place'), 10) : undefined,
      heat: parseInt(get('heat') || '1', 10) || 1,
      lane: parseInt(get('lane') || '0', 10) || 0,
      status,
      rowIndex: i + 2,
    });
  }

  // ── Build unique events ───────────────────────────────────────────────────
  const eventKeyMap = new Map<string, number>();
  let eventCounter = 0;
  for (const r of parsed) {
    const key = `${r.eventDistance}-${r.eventStroke}-${r.eventGender}-${r.eventCategory}`;
    if (!eventKeyMap.has(key)) eventKeyMap.set(key, ++eventCounter);
  }

  // ── Build unique clubs ─────────────────────────────────────────────────────
  const clubsSeen = new Set<string>();
  const clubs = parsed
    .filter((r) => { if (clubsSeen.has(r.clubName)) return false; clubsSeen.add(r.clubName); return true; })
    .map((r, idx) => ({
      external_team_id: `csv-club-${idx + 1}`,
      name: r.clubName,
      short_name: r.clubName.slice(0, 8).toUpperCase(),
      source_line: r.rowIndex,
    }));
  const clubRefMap = new Map(clubs.map((c, i) => [parsed.filter((r) => !Array.from(clubsSeen).includes(r.clubName))[i]?.clubName ?? c.name, c.external_team_id]));
  // rebuild correct map
  const clubNameToRef = new Map<string, string>();
  clubs.forEach((c) => clubNameToRef.set(c.name, c.external_team_id));

  // ── Build unique swimmers ──────────────────────────────────────────────────
  const swimmerKeyMap = new Map<string, string>();
  const swimmers = [] as NormalizedMeet['swimmers'];
  let swimmerCounter = 0;

  for (const r of parsed) {
    const key = `${normalize(r.swimmerLast)}_${normalize(r.swimmerFirst)}_${normalize(r.clubName)}`;
    if (!swimmerKeyMap.has(key)) {
      const extId = `csv-sw-${++swimmerCounter}`;
      swimmerKeyMap.set(key, extId);
      swimmers.push({
        external_athlete_id: extId,
        first_name: r.swimmerFirst,
        last_name: r.swimmerLast,
        gender: r.eventGender,
        age: r.swimmerAge,
        club_ref: clubNameToRef.get(r.clubName) ?? `csv-club-${swimmerCounter}`,
        source_line: r.rowIndex,
      });
    }
  }

  const swimmerKey = (r: ParsedRow) =>
    `${normalize(r.swimmerLast)}_${normalize(r.swimmerFirst)}_${normalize(r.clubName)}`;

  // ── Build results ──────────────────────────────────────────────────────────
  const results: NormalizedMeet['results'] = parsed.map((r) => ({
    event_ref: eventKeyMap.get(`${r.eventDistance}-${r.eventStroke}-${r.eventGender}-${r.eventCategory}`)!,
    swimmer_ref: swimmerKeyMap.get(swimmerKey(r))!,
    heat_no: r.heat,
    lane_no: r.lane,
    final_time_ms: r.timeMs,
    status: r.status,
    place: r.place,
    seed_time_ms: r.entryTimeMs ?? undefined,
    splits: [],
    source_line: r.rowIndex,
  }));

  // ── Build events ───────────────────────────────────────────────────────────
  const seenEventKeys = new Set<string>();
  const events: NormalizedMeet['events'] = [];
  for (const r of parsed) {
    const key = `${r.eventDistance}-${r.eventStroke}-${r.eventGender}-${r.eventCategory}`;
    if (seenEventKeys.has(key)) continue;
    seenEventKeys.add(key);
    events.push({
      event_no: eventKeyMap.get(key)!,
      stroke: r.eventStroke,
      distance: r.eventDistance,
      gender: r.eventGender,
      round: 'T' as const,
      course: 50 as PoolLength,
      age_group: r.eventCategory,
      competition_type: 'FEDERADOS' as const,
      is_relay: false,
      source_line: r.rowIndex,
    });
  }

  void clubRefMap; // avoid unused variable warning

  return {
    meet: {
      name: basename(fileName).replace(/\.[^.]+$/, ''),
      venue: '',
      course: 50,
      start_date: '',
      end_date: '',
      source,
    },
    clubs,
    swimmers,
    events,
    results,
    issues,
    meta: {
      source_file_name: fileName,
      parsed_at: new Date().toISOString(),
      total_lines: rows.length + 1,
    },
  };
}
