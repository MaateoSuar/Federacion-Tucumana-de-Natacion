import { DuplicateDetector } from './duplicate-detector';
import type { NormalizedMeet } from '../../ingest/types/normalized-meet.types';

const baseMeet: NormalizedMeet = {
  meet: {
    name: 'Torneo Test',
    venue: 'Pileta Central',
    course: 25,
    start_date: '2026-05-01',
    end_date: '2026-05-01',
    source: 'pdf',
  },
  clubs: [],
  swimmers: [],
  events: [],
  results: [],
  issues: [],
  meta: { source_file_name: 'test.pdf', parsed_at: '2026-05-01', total_lines: 10 },
};

describe('DuplicateDetector — intra-archivo', () => {
  const detector = new DuplicateDetector();

  it('sin duplicados → sin issues', () => {
    const meet: NormalizedMeet = {
      ...baseMeet,
      swimmers: [
        { external_athlete_id: 'a1', first_name: 'Juan', last_name: 'Pérez', gender: 'M', birth_date: '2005-01-01', club_ref: 'c1', source_line: 1 },
        { external_athlete_id: 'a2', first_name: 'Ana', last_name: 'Lopez', gender: 'F', birth_date: '2006-01-01', club_ref: 'c1', source_line: 2 },
      ],
      results: [
        { event_key: 'ev-1', event_ref: 1, swimmer_ref: 'a1', heat_no: 1, lane_no: 3, final_time_ms: 60000, status: 'OK', splits: [], source_line: 10 },
        { event_key: 'ev-1', event_ref: 1, swimmer_ref: 'a2', heat_no: 1, lane_no: 4, final_time_ms: 62000, status: 'OK', splits: [], source_line: 11 },
      ],
    };
    const { issues } = detector.detectInFile(meet);
    expect(issues).toHaveLength(0);
  });

  it('nadador duplicado en el archivo → WARNING', () => {
    const meet: NormalizedMeet = {
      ...baseMeet,
      swimmers: [
        { external_athlete_id: 'a1', first_name: 'Juan', last_name: 'Pérez', gender: 'M', birth_date: '2005-01-01', club_ref: 'c1', source_line: 1 },
        { external_athlete_id: 'a2', first_name: 'Juan', last_name: 'Pérez', gender: 'M', birth_date: '2005-01-01', club_ref: 'c1', source_line: 5 },
      ],
    };
    const { issues } = detector.detectInFile(meet);
    const warnings = issues.filter((i) => i.severity === 'WARNING');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]?.message).toContain('duplicado');
  });

  it('resultado duplicado (misma clave) → WARNING', () => {
    const meet: NormalizedMeet = {
      ...baseMeet,
      results: [
        { event_key: 'ev-1', event_ref: 1, swimmer_ref: 'a1', heat_no: 1, lane_no: 3, final_time_ms: 60000, status: 'OK', splits: [], source_line: 10 },
        { event_key: 'ev-1', event_ref: 1, swimmer_ref: 'a1', heat_no: 1, lane_no: 3, final_time_ms: 60500, status: 'OK', splits: [], source_line: 11 },
      ],
    };
    const { issues } = detector.detectInFile(meet);
    const warnings = issues.filter((i) => i.severity === 'WARNING');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]?.message).toContain('duplicado');
  });

  it('nadadores con nombre parecido pero distinto nacimiento → no warning', () => {
    const meet: NormalizedMeet = {
      ...baseMeet,
      swimmers: [
        { external_athlete_id: 'a1', first_name: 'Juan', last_name: 'Pérez', gender: 'M', birth_date: '2005-01-01', club_ref: 'c1', source_line: 1 },
        { external_athlete_id: 'a2', first_name: 'Juan', last_name: 'Pérez', gender: 'M', birth_date: '2006-01-01', club_ref: 'c1', source_line: 2 },
      ],
    };
    const { issues } = detector.detectInFile(meet);
    expect(issues).toHaveLength(0);
  });
});
