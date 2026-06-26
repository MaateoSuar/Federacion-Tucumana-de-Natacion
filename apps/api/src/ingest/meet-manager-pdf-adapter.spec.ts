import * as fs from 'fs';
import * as path from 'path';
import { MeetManagerPdfAdapter } from './adapters/meet-manager-pdf/meet-manager-pdf-adapter';
import { Normalizer } from './normalizer';
import { parseTimeToMs } from './adapters/meet-manager-pdf/pdf-time-parser';
import type { NormalizedMeet } from './types/normalized-meet.types';

const FIXTURE_PATH = path.join(__dirname, '__tests__', 'fixtures', 'catamarca-2026.pdf');
const FILE_NAME = 'catamarca-2026.pdf';

describe('parseTimeToMs', () => {
  it('parsea tiempo con minutos: "3:02,95" → 182950ms', () => {
    expect(parseTimeToMs('3:02,95')).toBe(182950);
  });

  it('parsea tiempo sin minutos: "34,17" → 34170ms', () => {
    expect(parseTimeToMs('34,17')).toBe(34170);
  });

  it('parsea tiempo largo: "5:20,39" → 320390ms', () => {
    expect(parseTimeToMs('5:20,39')).toBe(320390);
  });

  it('devuelve null para NT', () => {
    expect(parseTimeToMs('NT')).toBeNull();
  });

  it('devuelve null para DQ', () => {
    expect(parseTimeToMs('DQ')).toBeNull();
  });

  it('devuelve null para string vacío', () => {
    expect(parseTimeToMs('')).toBeNull();
  });
});

describe('MeetManagerPdfAdapter — fixture real catamarca-2026.pdf', () => {
  let meet: NormalizedMeet;

  beforeAll(async () => {
    const adapter = new MeetManagerPdfAdapter();
    const normalizer = new Normalizer();
    const buffer = fs.readFileSync(FIXTURE_PATH);
    const raw = await adapter.parse(buffer, FILE_NAME);
    meet = normalizer.normalize(raw);
  });

  // ─── Meet header ──────────────────────────────────────────────────────────

  it('extrae el nombre del torneo', () => {
    expect(meet.meet.name).toMatch(/Catamarca/i);
  });

  it('extrae la fecha de inicio en ISO (YYYY-MM-DD)', () => {
    expect(meet.meet.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meet.meet.start_date).toBe('2026-05-09');
  });

  it('extrae la fecha de fin en ISO (YYYY-MM-DD)', () => {
    expect(meet.meet.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meet.meet.end_date).toBe('2026-05-10');
  });

  it('course es el número 25 (no string)', () => {
    expect(meet.meet.course).toBe(25);
    expect(typeof meet.meet.course).toBe('number');
  });

  it('source es "pdf"', () => {
    expect(meet.meet.source).toBe('pdf');
  });

  // ─── Clubs ────────────────────────────────────────────────────────────────

  it('hay al menos 5 clubes distintos', () => {
    expect(meet.clubs.length).toBeGreaterThanOrEqual(5);
  });

  it('los club ids no tienen duplicados', () => {
    const ids = meet.clubs.map((c) => c.external_team_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ─── Swimmers ─────────────────────────────────────────────────────────────

  it('hay al menos 50 nadadores', () => {
    expect(meet.swimmers.length).toBeGreaterThanOrEqual(50);
  });

  it('los swimmer ids no tienen duplicados', () => {
    const ids = meet.swimmers.map((s) => s.external_athlete_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos los nadadores tienen first_name y last_name', () => {
    for (const s of meet.swimmers) {
      expect(s.first_name.trim()).not.toBe('');
      expect(s.last_name.trim()).not.toBe('');
    }
  });

  it('todos los nadadores tienen gender M o F', () => {
    for (const s of meet.swimmers) {
      expect(['M', 'F']).toContain(s.gender);
    }
  });

  // ─── Events ───────────────────────────────────────────────────────────────

  it('hay al menos 30 eventos', () => {
    expect(meet.events.length).toBeGreaterThanOrEqual(30);
  });

  it('todos los eventos tienen course 25 o 50', () => {
    for (const e of meet.events) {
      expect([25, 50]).toContain(e.course);
    }
  });

  it('todos los eventos tienen un stroke válido', () => {
    const validStrokes = ['libre', 'espalda', 'pecho', 'mariposa', 'combinado'];
    for (const e of meet.events) {
      expect(validStrokes).toContain(e.stroke);
    }
  });

  // ─── Results ──────────────────────────────────────────────────────────────

  it('hay al menos 100 resultados individuales', () => {
    expect(meet.results.length).toBeGreaterThanOrEqual(100);
  });

  it('todos los final_time_ms son enteros o null — nunca strings, nunca floats', () => {
    for (const r of meet.results) {
      if (r.final_time_ms !== null) {
        expect(typeof r.final_time_ms).toBe('number');
        expect(Number.isInteger(r.final_time_ms)).toBe(true);
        expect(r.final_time_ms).toBeGreaterThan(0);
      }
    }
  });

  it('todos los seed_time_ms son enteros cuando están presentes', () => {
    for (const r of meet.results) {
      if (r.seed_time_ms !== undefined) {
        expect(Number.isInteger(r.seed_time_ms)).toBe(true);
        expect(r.seed_time_ms).toBeGreaterThan(0);
      }
    }
  });

  it('resultados DSQ tienen final_time_ms null', () => {
    const disqualified = meet.results.filter((r) => r.status === 'DSQ');
    expect(disqualified.length).toBeGreaterThan(0);
    for (const r of disqualified) {
      expect(r.final_time_ms).toBeNull();
    }
  });

  it('resultados OK tienen final_time_ms positivo', () => {
    const ok = meet.results.filter((r) => r.status === 'OK');
    expect(ok.length).toBeGreaterThan(0);
    for (const r of ok) {
      expect(r.final_time_ms).not.toBeNull();
      expect(r.final_time_ms as number).toBeGreaterThan(0);
    }
  });

  it('todos los swimmer_ref de resultados existen en swimmers[]', () => {
    const swimmerIds = new Set(meet.swimmers.map((s) => s.external_athlete_id));
    for (const r of meet.results) {
      expect(swimmerIds.has(r.swimmer_ref)).toBe(true);
    }
  });

  it('todos los event_ref de resultados existen en events[]', () => {
    const eventNos = new Set(meet.events.map((e) => e.event_no));
    for (const r of meet.results) {
      expect(eventNos.has(r.event_ref)).toBe(true);
    }
  });

  // ─── Issues ───────────────────────────────────────────────────────────────

  it('no hay issues FATAL', () => {
    const fatal = meet.issues.filter((i) => i.severity === 'FATAL');
    expect(fatal).toHaveLength(0);
  });

  it('no hay issues ERROR de resultado no parseado (admite warnings)', () => {
    const errors = meet.issues.filter(
      (i) => i.severity === 'ERROR' && i.message.includes('No se pudo parsear'),
    );
    // Mostramos cuáles fallaron para diagnóstico
    if (errors.length > 0) {
      console.warn('Filas con error de parse:', errors.map((e) => e.raw_line));
    }
    expect(errors.length).toBe(0);
  });
});
