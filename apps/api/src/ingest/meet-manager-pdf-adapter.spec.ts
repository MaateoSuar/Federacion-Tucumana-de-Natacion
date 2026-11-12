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

  // ─── M2b / C-1: cada nado pertenece a UNA prueba ──────────────────────────
  // Meet Manager reutiliza el número de prueba entre categorías de edad y, en
  // este torneo, entre géneros (59-67). La referencia es event_key, no el número.

  it('el número de prueba se repite, pero event_key es único por prueba', () => {
    const numbers = new Set(meet.events.map((e) => e.event_no));
    const keys = new Set(meet.events.map((e) => e.event_key));
    expect(meet.events).toHaveLength(165);
    expect(numbers.size).toBe(70);
    expect(keys.size).toBe(meet.events.length);
  });

  it('hay exactamente 1.283 nados y cada uno apunta a una prueba existente', () => {
    const keys = new Set(meet.events.map((e) => e.event_key));
    expect(meet.results).toHaveLength(1283);
    for (const r of meet.results) {
      expect(keys.has(r.event_key)).toBe(true);
    }
  });

  it('ningún nado está repetido (prueba + nadador + serie + carril)', () => {
    const seen = new Set(
      meet.results.map((r) => `${r.event_key}|${r.swimmer_ref}|${r.heat_no}|${r.lane_no}`),
    );
    expect(seen.size).toBe(meet.results.length);
  });

  it('0 cruces de género: el nadador de cada nado es del género de su prueba', () => {
    const eventByKey = new Map(meet.events.map((e) => [e.event_key, e]));
    const swimmerById = new Map(meet.swimmers.map((s) => [s.external_athlete_id, s]));
    const crossings = meet.results.filter((r) => {
      const event = eventByKey.get(r.event_key);
      const swimmer = swimmerById.get(r.swimmer_ref);
      return !event || !swimmer || event.gender === 'X' || swimmer.gender !== event.gender;
    });
    expect(crossings).toHaveLength(0);
  });

  it('las pruebas que comparten número entre géneros quedan separadas (p. ej. la 59)', () => {
    const ev59 = meet.events.filter((e) => e.event_no === 59);
    expect(new Set(ev59.map((e) => e.gender))).toEqual(new Set(['F', 'M']));
    for (const e of ev59) {
      const swimmers = meet.results
        .filter((r) => r.event_key === e.event_key)
        .map((r) => meet.swimmers.find((s) => s.external_athlete_id === r.swimmer_ref)?.gender);
      expect(swimmers.length).toBeGreaterThan(0);
      expect(swimmers.every((g) => g === e.gender)).toBe(true);
    }
  });

  it('ninguna fila del torneo quedó con lectura ambigua del tiempo', () => {
    expect(meet.issues.filter((i) => i.message.startsWith('Tiempo ambiguo'))).toEqual([]);
  });

  it('ningún nombre de nadador arrastra dígitos del tiempo', () => {
    const withDigits = meet.swimmers.filter((s) => /\d/.test(s.first_name + s.last_name));
    expect(withDigits.map((s) => s.external_athlete_id)).toEqual([]);
  });

  it('no hay tiempos absurdos (la nota al pie no se pega al tiempo)', () => {
    // Antes "Uma 52:56,32" se leía como 52 minutos: había 47 nados de más de 20 minutos.
    const eventByKey = new Map(meet.events.map((e) => [e.event_key, e]));
    const absurd = meet.results.filter((r) => {
      const distance = eventByKey.get(r.event_key)?.distance ?? 0;
      return r.final_time_ms !== null && r.final_time_ms > distance * 3000; // 3 s por metro
    });
    expect(absurd).toHaveLength(0);

    const vega = meet.results.find(
      (r) => r.swimmer_ref.startsWith('vega|juana uma|') && r.event_key === '1|F|14-15|200|combinado|I',
    );
    expect(vega).toMatchObject({ final_time_ms: 176320, seed_time_ms: 176830, place: 2, status: 'OK' });
  });

  it('lee las pruebas de 8 y 9 años con la edad real del nadador', () => {
    const lema = meet.swimmers.find((s) => s.external_athlete_id.startsWith('lema|arnoldo|'));
    expect(lema?.age).toBe(8);
    const ages = new Set(meet.swimmers.map((s) => s.age));
    expect(ages.has(9)).toBe(true);
    expect([...ages].every((a) => a !== undefined && a >= 3 && a <= 90)).toBe(true);
  });

  it('42 descalificados, sin tiempo ni puesto', () => {
    const dsq = meet.results.filter((r) => r.status === 'DSQ');
    expect(dsq).toHaveLength(42);
    expect(dsq.every((r) => r.final_time_ms === null && r.place === undefined)).toBe(true);
  });

  it('una misma persona no queda como dos nadadores de distinto género', () => {
    const genders = new Map<string, Set<string>>();
    for (const s of meet.swimmers) {
      const person = s.external_athlete_id.split('|').slice(0, 3).join('|');
      const set = genders.get(person) ?? new Set<string>();
      set.add(s.gender);
      genders.set(person, set);
    }
    const both = [...genders.entries()].filter(([, g]) => g.size > 1).map(([p]) => p);
    expect(both).toEqual([]);
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
