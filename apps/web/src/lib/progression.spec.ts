import { describe, expect, it } from 'vitest';
import type { ProgressionEvent, ProgressionHistoryEntry, SwimmerProgression } from './api';
import { chartSeries, describeDelta, eventLabel, eventsForPool, initialPool, summarizePool } from './progression';

const hist = (date: string, timeMs: number, isPb = false, deltaVsPreviousMs: number | null = null): ProgressionHistoryEntry => ({
  tournamentId: `t-${date}`, tournamentName: `Torneo ${date}`, date, timeMs, deltaVsPreviousMs, deltaVsPbMs: null,
  isPb, categoryName: 'Cadete 1', clubName: 'CAN', place: null, medal: null,
});
const ev = (stroke: string, distance: number, pool: 'P25' | 'P50', totalImprovementMs: number | null = null, history: ProgressionHistoryEntry[] = []): ProgressionEvent => ({
  eventDefinitionId: `${distance}-${stroke}`, label: '', stroke, distance, pool,
  personalBest: null, last: null, totalImprovementMs, history,
});
const tour = (date: string, pool: 'P25' | 'P50', pbs: number, gold = 0) => ({
  tournamentId: `t-${date}`, name: `Torneo ${date}`, date, pool, events: 2, pbs, medals: { gold, silver: 0, bronze: 0 },
});

describe('describeDelta', () => {
  it('negativo = bajó el tiempo: flecha hacia abajo y tono de mejora', () => {
    expect(describeDelta(-580)).toEqual({ tone: 'better', arrow: '▼', text: '-0.58 s', label: 'bajó 0,58 segundos' });
  });

  it('positivo = subió el tiempo: flecha hacia arriba y tono de empeora', () => {
    expect(describeDelta(1250)).toEqual({ tone: 'worse', arrow: '▲', text: '+1.25 s', label: 'subió 1,25 segundos' });
  });

  it('cero = mismo tiempo, sin signo', () => {
    expect(describeDelta(0)).toMatchObject({ tone: 'same', arrow: '=', text: '0.00 s' });
  });

  it('un minuto o más se muestra como m:ss.cc', () => {
    expect(describeDelta(-62300).text).toBe('-1:02.30');
    expect(describeDelta(75010).text).toBe('+1:15.01');
  });

  it('nunca depende solo del color: siempre trae flecha y texto', () => {
    for (const d of [-10, 0, 10]) {
      const v = describeDelta(d);
      expect(v.arrow).not.toBe('');
      expect(v.label).not.toBe('');
    }
  });
});

describe('eventLabel', () => {
  it('arma la etiqueta en castellano', () => {
    expect(eventLabel({ distance: 100, stroke: 'espalda' })).toBe('100 m Espalda');
    expect(eventLabel({ distance: 200, stroke: 'combinado' })).toBe('200 m Combinado');
  });
});

describe('eventsForPool', () => {
  const progression: SwimmerProgression = {
    swimmerId: 's',
    events: [ev('pecho', 100, 'P25'), ev('libre', 100, 'P25'), ev('libre', 50, 'P50'), ev('libre', 50, 'P25')],
    tournaments: [],
  };

  it('25 m y 50 m nunca se mezclan', () => {
    expect(eventsForPool(progression, 'P50').map((e) => e.pool)).toEqual(['P50']);
    expect(eventsForPool(progression, 'P25')).toHaveLength(3);
  });

  it('ordena por estilo y después por distancia', () => {
    expect(eventsForPool(progression, 'P25').map((e) => `${e.distance}${e.stroke}`)).toEqual(['50libre', '100libre', '100pecho']);
  });
});

describe('summarizePool', () => {
  const progression: SwimmerProgression = {
    swimmerId: 's',
    events: [ev('libre', 50, 'P25', 4320), ev('pecho', 100, 'P25', 1000), ev('libre', 50, 'P50', 9999), ev('espalda', 50, 'P25', null)],
    tournaments: [tour('2025-05-01', 'P25', 3, 1), tour('2026-03-01', 'P25', 2, 1), tour('2026-08-01', 'P25', 1), tour('2026-09-01', 'P50', 7, 5)],
  };

  it('cuenta solo lo de esa pileta', () => {
    const s = summarizePool(progression, 'P25');
    expect(s).toMatchObject({ tournaments: 3, events: 3, medals: { gold: 2, silver: 0, bronze: 0 } });
  });

  it('mejoras del año = las del último año con torneos en esa pileta', () => {
    expect(summarizePool(progression, 'P25')).toMatchObject({ latestYear: 2026, pbsThisYear: 3 });
  });

  it('la mejora total suma lo que bajó en cada prueba y no cruza piletas', () => {
    expect(summarizePool(progression, 'P25').totalImprovementMs).toBe(5320);
    expect(summarizePool(progression, 'P50').totalImprovementMs).toBe(9999);
  });

  it('sin datos en esa pileta devuelve ceros', () => {
    const empty = summarizePool({ swimmerId: 's', events: [], tournaments: [] }, 'P50');
    expect(empty).toMatchObject({ tournaments: 0, events: 0, pbsThisYear: 0, latestYear: null, totalImprovementMs: 0 });
  });
});

describe('chartSeries', () => {
  it('ordena por fecha y arma la línea de la mejor marca vigente', () => {
    const series = chartSeries(ev('libre', 50, 'P25', null, [
      hist('2026-08-01', 33000), hist('2026-03-01', 34000, true), hist('2026-05-01', 32000, true, -2000),
    ]));

    expect(series.map((p) => p.date)).toEqual(['2026-03-01', '2026-05-01', '2026-08-01']);
    expect(series.map((p) => p.timeMs)).toEqual([34000, 32000, 33000]);
    // Tras empeorar en agosto, la mejor marca sigue siendo la de mayo
    expect(series.map((p) => p.bestSoFarMs)).toEqual([34000, 32000, 32000]);
  });
});

describe('initialPool', () => {
  const only50: SwimmerProgression = { swimmerId: 's', events: [ev('libre', 50, 'P50')], tournaments: [] };
  const both: SwimmerProgression = { swimmerId: 's', events: [ev('libre', 50, 'P50'), ev('libre', 50, 'P25')], tournaments: [] };

  it('respeta la pileta recordada si tiene datos', () => {
    expect(initialPool(both, 'P50')).toBe('P50');
  });

  it('si la recordada no tiene datos, muestra la que sí', () => {
    expect(initialPool(only50, 'P25')).toBe('P50');
  });

  it('por defecto 25 m, e ignora valores raros guardados', () => {
    expect(initialPool(both, null)).toBe('P25');
    expect(initialPool(both, 'basura')).toBe('P25');
    expect(initialPool({ swimmerId: 's', events: [], tournaments: [] }, null)).toBe('P25');
  });
});
