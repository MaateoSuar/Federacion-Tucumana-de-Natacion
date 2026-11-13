import { buildProgression, type ProgressionResultRow } from './progression';

function makeDate(year: number, month = 1, day = 1): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function makeRow(overrides: {
  finalTime: number;
  eventDefId?: string;
  pool?: 'P25' | 'P50';
  tournamentId?: string;
  tournamentDate?: Date;
  status?: string;
  homologated?: boolean;
  place?: number | null;
}): ProgressionResultRow {
  const pool = overrides.pool ?? 'P25';
  const eventDefId = overrides.eventDefId ?? 'ed-freestyle-100';
  return {
    id: `r-${Math.random()}`,
    finalTime: overrides.finalTime,
    status: overrides.status ?? 'OK',
    homologated: overrides.homologated ?? true,
    place: overrides.place ?? null,
    isPb: false,
    event: {
      orderNo: 1,
      eventDefinition: {
        id: eventDefId,
        stroke: 'freestyle',
        distance: 100,
        gender: 'M',
        code: '100L-M',
      },
      tournament: {
        id: overrides.tournamentId ?? 't-1',
        name: `Torneo ${overrides.tournamentId ?? 't-1'}`,
        startDate: overrides.tournamentDate ?? makeDate(2025, 3, 1),
        poolLength: pool,
      },
    },
    category: { id: 'cat-1', name: 'Cadetes' },
    club: { id: 'club-1', name: 'Club Atlético', shortName: 'CA' },
  };
}

describe('buildProgression — filtros', () => {
  it('excluye resultados sin homologar', () => {
    const rows = [makeRow({ finalTime: 60_000, homologated: false })];
    const result = buildProgression('sw-1', rows);
    expect(result.events).toHaveLength(0);
  });

  it('excluye resultados con status != OK', () => {
    const rows = [
      makeRow({ finalTime: 60_000, status: 'DSQ' }),
      makeRow({ finalTime: 61_000, status: 'DNS' }),
    ];
    const result = buildProgression('sw-1', rows);
    expect(result.events).toHaveLength(0);
  });

  it('incluye solo resultados OK + homologados', () => {
    const rows = [
      makeRow({ finalTime: 60_000 }),
      makeRow({ finalTime: 61_000, status: 'DSQ' }),
    ];
    const result = buildProgression('sw-1', rows);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.history).toHaveLength(1);
  });
});

describe('buildProgression — separación de piscinas', () => {
  it('25m y 50m son series independientes', () => {
    const rows = [
      makeRow({ finalTime: 60_000, pool: 'P25', tournamentId: 't-1' }),
      makeRow({ finalTime: 65_000, pool: 'P50', tournamentId: 't-2' }),
    ];
    const result = buildProgression('sw-1', rows);
    expect(result.events).toHaveLength(2);
    const p25 = result.events.find((e) => e.pool === 'P25');
    const p50 = result.events.find((e) => e.pool === 'P50');
    expect(p25).toBeDefined();
    expect(p50).toBeDefined();
  });

  it('el filtro poolFilter devuelve solo la piscina pedida', () => {
    const rows = [
      makeRow({ finalTime: 60_000, pool: 'P25' }),
      makeRow({ finalTime: 65_000, pool: 'P50' }),
    ];
    const result = buildProgression('sw-1', rows, 'P25');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.pool).toBe('P25');
  });
});

describe('buildProgression — mejor tiempo por torneo', () => {
  it('si compitió dos veces en el mismo torneo, toma el mejor tiempo', () => {
    const rows = [
      makeRow({ finalTime: 62_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 3, 1) }),
      makeRow({ finalTime: 60_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 3, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    expect(result.events[0]!.history).toHaveLength(1);
    expect(result.events[0]!.history[0]!.timeMs).toBe(60_000);
  });
});

describe('buildProgression — deltas e isPb', () => {
  it('primer registro: deltaVsPrevious y deltaVsPb son null, isPb true', () => {
    const rows = [makeRow({ finalTime: 60_000 })];
    const result = buildProgression('sw-1', rows);
    const h = result.events[0]!.history[0]!;
    expect(h.deltaVsPreviousMs).toBeNull();
    expect(h.deltaVsPbMs).toBeNull();
    expect(h.isPb).toBe(true);
  });

  it('mejora: delta negativo y isPb true', () => {
    const rows = [
      makeRow({ finalTime: 60_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1) }),
      makeRow({ finalTime: 58_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 6, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    const h = result.events[0]!.history;
    expect(h[1]!.deltaVsPreviousMs).toBe(-2_000);
    expect(h[1]!.deltaVsPbMs).toBe(-2_000);
    expect(h[1]!.isPb).toBe(true);
  });

  it('empeora: delta positivo y isPb false', () => {
    const rows = [
      makeRow({ finalTime: 58_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1) }),
      makeRow({ finalTime: 61_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 6, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    const h = result.events[0]!.history;
    expect(h[1]!.deltaVsPreviousMs).toBe(3_000);
    expect(h[1]!.deltaVsPbMs).toBe(3_000);
    expect(h[1]!.isPb).toBe(false);
  });

  it('totalImprovementMs = primer tiempo - PB actual', () => {
    const rows = [
      makeRow({ finalTime: 65_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1) }),
      makeRow({ finalTime: 62_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 4, 1) }),
      makeRow({ finalTime: 60_000, tournamentId: 't-3', tournamentDate: makeDate(2025, 8, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    expect(result.events[0]!.totalImprovementMs).toBe(5_000); // 65k - 60k
  });

  it('con un solo resultado totalImprovementMs es null', () => {
    const rows = [makeRow({ finalTime: 60_000 })];
    const result = buildProgression('sw-1', rows);
    expect(result.events[0]!.totalImprovementMs).toBeNull();
  });
});

describe('buildProgression — personalBest y last', () => {
  it('personalBest apunta al torneo donde se logró el PB', () => {
    const rows = [
      makeRow({ finalTime: 65_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1) }),
      makeRow({ finalTime: 60_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 6, 1) }),
      makeRow({ finalTime: 62_000, tournamentId: 't-3', tournamentDate: makeDate(2025, 10, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    const ev = result.events[0]!;
    expect(ev.personalBest!.timeMs).toBe(60_000);
    expect(ev.personalBest!.tournamentId).toBe('t-2');
  });

  it('last apunta al torneo más reciente', () => {
    const rows = [
      makeRow({ finalTime: 65_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1) }),
      makeRow({ finalTime: 60_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 6, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    expect(result.events[0]!.last!.tournamentId).toBe('t-2');
  });
});

describe('buildProgression — medallas', () => {
  it('asigna medalla correcta según place', () => {
    const rows = [
      makeRow({ finalTime: 60_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1), place: 1 }),
      makeRow({ finalTime: 61_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 6, 1), place: 3 }),
    ];
    const result = buildProgression('sw-1', rows);
    const h = result.events[0]!.history;
    expect(h[0]!.medal).toBe('gold');
    expect(h[1]!.medal).toBe('bronze');
  });

  it('sin place la medalla es null', () => {
    const rows = [makeRow({ finalTime: 60_000, place: null })];
    const result = buildProgression('sw-1', rows);
    expect(result.events[0]!.history[0]!.medal).toBeNull();
  });
});

describe('buildProgression — resumen de torneos', () => {
  it('cuenta correctamente events, pbs y medallas por torneo', () => {
    const rows = [
      makeRow({ finalTime: 60_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 3, 1), place: 1 }),
      makeRow({ finalTime: 65_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 3, 1), eventDefId: 'ed-back-50', place: 2 }),
      makeRow({ finalTime: 59_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 8, 1), place: 1 }),
    ];
    // Para ed-back-50 necesitamos que tenga eventDefinition.id distinto
    rows[1]!.event.eventDefinition.id = 'ed-back-50';
    rows[1]!.event.eventDefinition.stroke = 'backstroke';

    const result = buildProgression('sw-1', rows);
    const t1 = result.tournaments.find((t) => t.tournamentId === 't-1');
    expect(t1!.events).toBe(2);
    expect(t1!.pbs).toBe(2); // ambas son primer registro = pb
    expect(t1!.medals.gold).toBe(1);
    expect(t1!.medals.silver).toBe(1);
  });

  it('los torneos se devuelven en orden cronológico', () => {
    const rows = [
      makeRow({ finalTime: 60_000, tournamentId: 't-3', tournamentDate: makeDate(2025, 12, 1) }),
      makeRow({ finalTime: 61_000, tournamentId: 't-1', tournamentDate: makeDate(2025, 1, 1) }),
      makeRow({ finalTime: 62_000, tournamentId: 't-2', tournamentDate: makeDate(2025, 6, 1) }),
    ];
    const result = buildProgression('sw-1', rows);
    const ids = result.tournaments.map((t) => t.tournamentId);
    expect(ids).toEqual(['t-1', 't-2', 't-3']);
  });
});

describe('buildProgression — sin datos', () => {
  it('devuelve estructura vacía para un nadador sin resultados válidos', () => {
    const result = buildProgression('sw-999', []);
    expect(result.swimmerId).toBe('sw-999');
    expect(result.events).toHaveLength(0);
    expect(result.tournaments).toHaveLength(0);
  });
});
