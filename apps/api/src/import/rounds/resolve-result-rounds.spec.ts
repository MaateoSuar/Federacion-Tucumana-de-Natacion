import type {
  CompetitionType,
  NormalizedEvent,
  NormalizedResult,
  NormalizedRound,
  NormalizedStroke,
} from '../../ingest/types/normalized-meet.types';
import { findPhantomFinals, resolveResultRounds } from './resolve-result-rounds';

function ev(
  key: string,
  eventNo: number,
  over: Partial<NormalizedEvent> & { round?: NormalizedRound } = {},
): NormalizedEvent {
  return {
    event_key: key,
    event_no: eventNo,
    stroke: 'libre' as NormalizedStroke,
    distance: 100,
    gender: 'F',
    round: 'F',
    course: 25,
    age_group: '10 & Mayores',
    competition_type: 'FEDERADOS' as CompetitionType,
    is_relay: false,
    source_line: eventNo,
    ...over,
  };
}

let line = 0;
function res(eventKey: string, swimmer: string, over: Partial<NormalizedResult> = {}): NormalizedResult {
  line += 1;
  return {
    event_key: eventKey,
    event_ref: 0,
    swimmer_ref: swimmer,
    heat_no: 1,
    lane_no: 1,
    final_time_ms: 60_000,
    status: 'OK',
    splits: [],
    source_line: line,
    ...over,
  };
}

describe('resolveResultRounds', () => {
  it('San Luis: el nado repetido en otra jornada (evento 2xx) es la final; el de la mañana, clasificatorio', () => {
    const events = [ev('m', 3, { age_group: '14-15' }), ev('f', 203, { age_group: '10 & Mayores' })];
    const morning = res('m', 'ana');
    const final = res('f', 'ana');
    const only = res('m', 'bea'); // solo nadó de mañana
    const map = resolveResultRounds({ events, results: [morning, final, only] });

    expect(map.get(morning)).toBe('clasificatorio');
    expect(map.get(final)).toBe('final');
    // Quien nada una sola vez conserva la ronda del archivo: no aparece en el mapa
    expect(map.has(only)).toBe(false);
  });

  it('Nacionales: Eliminatorias y Finales comparten número de prueba; la eliminatoria va antes', () => {
    const events = [ev('p', 10, { round: 'P' }), ev('f', 10, { round: 'F' })];
    const prelim = res('p', 'ana', { final_time_ms: 61_000 });
    const final = res('f', 'ana', { final_time_ms: 60_000 });
    const eliminated = res('p', 'bea', { final_time_ms: 62_000 });
    const map = resolveResultRounds({ events, results: [final, prelim, eliminated] });

    expect(map.get(prelim)).toBe('clasificatorio');
    expect(map.get(final)).toBe('final');
    expect(map.has(eliminated)).toBe(false);
  });

  it('tres nados de la misma prueba: solo el último es la final', () => {
    const events = [ev('a', 1), ev('b', 101), ev('c', 201)];
    const r1 = res('a', 'ana');
    const r2 = res('b', 'ana');
    const r3 = res('c', 'ana');
    const map = resolveResultRounds({ events, results: [r3, r1, r2] });

    expect(map.get(r1)).toBe('clasificatorio');
    expect(map.get(r2)).toBe('clasificatorio');
    expect(map.get(r3)).toBe('final');
  });

  it('pruebas distintas (otra distancia o estilo) no se mezclan', () => {
    const events = [ev('a', 1, { distance: 100 }), ev('b', 201, { distance: 200 }), ev('c', 202, { stroke: 'espalda' as NormalizedStroke })];
    const results = [res('a', 'ana'), res('b', 'ana'), res('c', 'ana')];
    expect(resolveResultRounds({ events, results }).size).toBe(0);
  });

  it('el mismo estilo y distancia en otro nivel (promocional vs federado) no cuenta como repetición', () => {
    const events = [ev('a', 1, { competition_type: 'FEDERADOS' }), ev('b', 101, { competition_type: 'PROMOCIONALES' })];
    const results = [res('a', 'ana'), res('b', 'ana')];
    expect(resolveResultRounds({ events, results }).size).toBe(0);
  });

  it('dos nadadores distintos en la misma prueba no se interfieren', () => {
    const events = [ev('a', 1), ev('b', 201)];
    const results = [res('a', 'ana'), res('b', 'bea')];
    expect(resolveResultRounds({ events, results }).size).toBe(0);
  });

  it('no toca relevos ni tomas de tiempo (serie única)', () => {
    const events = [
      ev('r1', 35, { is_relay: true }),
      ev('r2', 135, { is_relay: true }),
      ev('t1', 40, { round: 'T' }),
      ev('t2', 140, { round: 'T' }),
    ];
    const results = [res('r1', 'ana'), res('r2', 'ana'), res('t1', 'bea'), res('t2', 'bea')];
    expect(resolveResultRounds({ events, results }).size).toBe(0);
  });

  it('si el último nado es una eliminatoria no hay final: no se reclasifica nada', () => {
    const events = [ev('p1', 10, { round: 'P' }), ev('p2', 110, { round: 'P' })];
    const results = [res('p1', 'ana'), res('p2', 'ana')];
    expect(resolveResultRounds({ events, results }).size).toBe(0);
  });

  it('la tabla de eliminatorias leída también como final (misma serie, carril y tiempo) es un nado fantasma', () => {
    const events = [ev('f', 1, { round: 'F' }), ev('p', 1, { round: 'P' })];
    const real = res('p', 'bea', { heat_no: 1, lane_no: 10, final_time_ms: 140_960 });
    const copy = res('f', 'bea', { heat_no: 1, lane_no: 10, final_time_ms: 140_960 });
    // Otra nadadora con final de verdad: mismo número de prueba pero otro tiempo
    const finalist = res('f', 'ana', { heat_no: 1, lane_no: 4, final_time_ms: 137_000 });
    const finalistPrelim = res('p', 'ana', { heat_no: 1, lane_no: 2, final_time_ms: 139_000 });

    const phantoms = findPhantomFinals({ events, results: [real, copy, finalist, finalistPrelim] });
    expect([...phantoms]).toEqual([copy]);

    // El fantasma no se reclasifica como "final": la nadadora eliminada queda con su sola eliminatoria
    const map = resolveResultRounds({ events, results: [real, copy, finalist, finalistPrelim] });
    expect(map.has(copy)).toBe(false);
    expect(map.has(real)).toBe(false);
    expect(map.get(finalistPrelim)).toBe('clasificatorio');
    expect(map.get(finalist)).toBe('final');
  });

  it('una línea sin tiempo (DQ/DNS) no se descarta como copia aunque coincidan serie y carril', () => {
    const events = [ev('f', 1, { round: 'F' }), ev('p', 1, { round: 'P' })];
    const prelimDq = res('p', 'bea', { status: 'DSQ', final_time_ms: null });
    const finalDq = res('f', 'bea', { status: 'DSQ', final_time_ms: null });
    expect(findPhantomFinals({ events, results: [prelimDq, finalDq] }).size).toBe(0);
  });

  it('un DSQ o DNS en la final también cuenta como nado posterior', () => {
    const events = [ev('a', 1), ev('b', 201)];
    const morning = res('a', 'ana');
    const finalDns = res('b', 'ana', { status: 'DNS', final_time_ms: null });
    const map = resolveResultRounds({ events, results: [morning, finalDns] });
    expect(map.get(morning)).toBe('clasificatorio');
    expect(map.get(finalDns)).toBe('final');
  });
});
