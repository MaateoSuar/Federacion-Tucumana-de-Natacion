import { CommitProcessor } from './commit.processor';
import type { NormalizedMeet } from '../../ingest/types/normalized-meet.types';
import type { MatchResultsPayload, MatchResolution } from '../matching/types';

const MATEO = 'suar|mateo|club_azucena|M';
const JUAN = 'perez|juan|club_azucena|M';
const NUEVO = 'lopez|ana|club_azucena|F';

const makeMeet = (source: NormalizedMeet['meet']['source']): NormalizedMeet => ({
  meet: { name: 'Torneo', venue: 'Pileta', course: 25, start_date: '2026-05-01', end_date: '2026-05-01', source },
  clubs: [{ external_team_id: 'club_azucena', name: 'Azucena Club', short_name: '', source_line: 1 }],
  swimmers: [MATEO, JUAN, NUEVO].map((ref, i) => ({
    external_athlete_id: ref,
    first_name: ref.split('|')[1] ?? '',
    last_name: ref.split('|')[0] ?? '',
    gender: ref.endsWith('F') ? 'F' : 'M',
    age: 12,
    club_ref: 'club_azucena',
    source_line: i + 2,
  })),
  events: [
    { event_no: 1, stroke: 'libre', distance: 50, gender: 'M', round: 'F', course: 25, age_group: '11-12', competition_type: 'FEDERADOS', is_relay: false, source_line: 1 },
  ],
  results: [MATEO, JUAN, NUEVO].map((ref, i) => ({
    event_ref: 1,
    swimmer_ref: ref,
    heat_no: 1,
    lane_no: i + 1,
    final_time_ms: 35_000 + i,
    status: 'OK',
    splits: [],
    source_line: i + 10,
  })),
  issues: [],
  meta: { source_file_name: 'x', parsed_at: '2026-05-01', total_lines: 1 },
});

const makeMatches = (opts: { mateo?: MatchResolution; club?: MatchResolution } = {}): MatchResultsPayload => ({
  swimmers: [
    {
      swimmerRef: MATEO,
      confidence: 'low',
      swimmerId: null,
      matchedBy: 'fuzzy',
      requiresConfirmation: true,
      candidateSwimmerId: 'sw-mateo',
      candidates: [{ swimmerId: 'sw-mateo', displayName: 'Mateo Rodriguez Suar', birthYear: null, clubName: null, score: 0.98, reasons: [] }],
      resolution: opts.mateo,
      displayName: 'Mateo Suar',
    },
    { swimmerRef: JUAN, confidence: 'strong', swimmerId: 'sw-juan', matchedBy: 'external_id', requiresConfirmation: false, displayName: 'Juan Perez' },
    { swimmerRef: NUEVO, confidence: 'none', swimmerId: null, matchedBy: 'none', requiresConfirmation: false, displayName: 'Ana Lopez' },
  ],
  clubs: [
    {
      clubRef: 'club_azucena',
      confidence: 'low',
      clubId: null,
      matchedBy: 'fuzzy',
      requiresConfirmation: true,
      candidateClubId: 'club-azu',
      candidates: [{ clubId: 'club-azu', displayName: 'Club Azucena', score: 1, reasons: [] }],
      resolution: opts.club,
      displayName: 'Azucena Club',
    },
  ],
});

const link = (targetId: string): MatchResolution => ({ decision: 'link', targetId, decidedBy: 'admin-1', decidedAt: '2026-05-02T00:00:00Z' });
const asNew: MatchResolution = { decision: 'new', decidedBy: 'admin-1', decidedAt: '2026-05-02T00:00:00Z' };

function setup(meet: NormalizedMeet, matches: MatchResultsPayload, existingSwimmers = ['sw-mateo', 'sw-juan']) {
  let seq = 0;
  const tx = {
    club: {
      create: jest.fn().mockImplementation(() => Promise.resolve({ id: `club-new-${++seq}` })),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === 'club-azu' ? { id: 'club-azu' } : null),
      ),
    },
    swimmer: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(existingSwimmers.includes(where.id) ? { id: where.id, currentClubId: 'club-azu' } : null),
      ),
      create: jest.fn().mockImplementation(() => Promise.resolve({ id: `sw-new-${++seq}` })),
      update: jest.fn(),
    },
    externalIdMap: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), deleteMany: jest.fn() },
    auditLog: { createMany: jest.fn() },
    tournament: { create: jest.fn().mockResolvedValue({ id: 't-1' }), delete: jest.fn() },
    eventDefinition: { findUnique: jest.fn().mockResolvedValue({ id: 'ed-1' }), create: jest.fn() },
    event: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'ev-1' }), deleteMany: jest.fn() },
    heat: { create: jest.fn().mockResolvedValue({ id: 'h-1' }), deleteMany: jest.fn() },
    result: { create: jest.fn().mockImplementation(() => Promise.resolve({ id: `r-${++seq}` })), deleteMany: jest.fn() },
    split: { create: jest.fn(), deleteMany: jest.fn() },
    importJob: { update: jest.fn() },
    meetManagerImport: { update: jest.fn() },
  };
  const prisma = {
    category: { findMany: jest.fn().mockResolvedValue([{ id: 'cat-1', minAge: null, maxAge: null }]) },
    season: { findUnique: jest.fn().mockResolvedValue({ id: 'season-1' }) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const repo = {
    findById: jest.fn().mockResolvedValue({
      id: 'job-1',
      status: 'preview',
      meetManagerImport: { parsedPayload: meet, matchResults: matches, mapping: null },
    }),
    saveMatchResults: jest.fn(),
  };
  const noneSwimmer = (s: { external_athlete_id: string }) => ({
    swimmerRef: s.external_athlete_id,
    confidence: 'none',
    swimmerId: null,
    matchedBy: 'none',
    requiresConfirmation: false,
    displayName: '',
  });
  const athleteMatcher = {
    matchAll: jest.fn().mockImplementation((swimmers: Array<{ external_athlete_id: string }>) =>
      Promise.resolve(swimmers.map(noneSwimmer)),
    ),
  };
  const clubMatcher = {
    match: jest.fn().mockImplementation((c: { external_team_id: string }) =>
      Promise.resolve({ clubRef: c.external_team_id, confidence: 'none', clubId: null, matchedBy: 'none', requiresConfirmation: false, displayName: '' }),
    ),
  };
  const processor = new CommitProcessor(prisma as never, repo as never, athleteMatcher as never, clubMatcher as never, null, null);
  return { processor, tx, prisma, repo, athleteMatcher, clubMatcher };
}

const resultSwimmerIds = (tx: ReturnType<typeof setup>['tx']) =>
  (tx.result.create.mock.calls as Array<[{ data: { swimmerId: string; clubId: string } }]>).map(([a]) => a.data.swimmerId);

describe('CommitProcessor — decisiones de matching', () => {
  it('bloquea el commit si hay matches sin decidir', async () => {
    const { processor, prisma } = setup(makeMeet('pdf'), makeMatches());
    await expect(processor.commit('job-1')).rejects.toThrow('2 nadador(es)/club(es) sin decidir');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('vincula al candidato elegido y respeta los matches seguros', async () => {
    const { processor, tx } = setup(makeMeet('csv'), makeMatches({ mateo: link('sw-mateo'), club: link('club-azu') }));
    await processor.commit('job-1');

    expect(tx.club.create).not.toHaveBeenCalled();
    expect(tx.swimmer.create).toHaveBeenCalledTimes(1);
    const ids = resultSwimmerIds(tx);
    expect(ids[0]).toBe('sw-mateo');
    expect(ids[1]).toBe('sw-juan');
    expect(ids[2]).toMatch(/^sw-new-/);
    const clubIds = (tx.result.create.mock.calls as Array<[{ data: { clubId: string } }]>).map(([a]) => a.data.clubId);
    expect(new Set(clubIds)).toEqual(new Set(['club-azu']));
  });

  it('"es nuevo" crea un nadador aunque haya un candidato', async () => {
    const { processor, tx } = setup(makeMeet('csv'), makeMatches({ mateo: asNew, club: link('club-azu') }));
    await processor.commit('job-1');
    expect(tx.swimmer.create).toHaveBeenCalledTimes(2);
    expect(resultSwimmerIds(tx)[0]).toMatch(/^sw-new-/);
  });

  it('no duplica si otra importación ya creó a la persona: actualiza el preview y pide revisar', async () => {
    const { processor, tx, prisma, repo, athleteMatcher } = setup(
      makeMeet('pdf'),
      makeMatches({ mateo: link('sw-mateo'), club: link('club-azu') }),
    );
    athleteMatcher.matchAll.mockResolvedValue([
      {
        swimmerRef: NUEVO,
        confidence: 'strong',
        swimmerId: 'sw-ana-creada-por-otro-import',
        matchedBy: 'external_id',
        requiresConfirmation: false,
        displayName: 'Ana Lopez',
      },
    ]);
    await expect(processor.commit('job-1')).rejects.toThrow('aparecieron 1 coincidencia(s) nueva(s)');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.swimmer.create).not.toHaveBeenCalled();
    const saved = (repo.saveMatchResults.mock.calls[0] as [string, MatchResultsPayload])[1];
    expect(saved.swimmers.find((s) => s.swimmerRef === NUEVO)?.swimmerId).toBe('sw-ana-creada-por-otro-import');
  });

  it('no molesta si el re-análisis no trae nada nuevo (el admin ya descartó ese candidato)', async () => {
    const { processor, tx, athleteMatcher } = setup(makeMeet('csv'), makeMatches({ mateo: asNew, club: link('club-azu') }));
    athleteMatcher.matchAll.mockImplementation((swimmers: Array<{ external_athlete_id: string }>) =>
      Promise.resolve(
        swimmers.map((s) =>
          s.external_athlete_id === MATEO
            ? { swimmerRef: MATEO, confidence: 'low', swimmerId: null, matchedBy: 'fuzzy', requiresConfirmation: true, candidates: [{ swimmerId: 'sw-mateo', displayName: '', birthYear: null, clubName: null, score: 0.98, reasons: [] }], displayName: '' }
            : { swimmerRef: s.external_athlete_id, confidence: 'none', swimmerId: null, matchedBy: 'none', requiresConfirmation: false, displayName: '' },
        ),
      ),
    );
    await processor.commit('job-1');
    expect(tx.swimmer.create).toHaveBeenCalledTimes(2);
  });

  it('falla si el club elegido fue borrado entre el preview y el commit', async () => {
    const { processor } = setup(makeMeet('csv'), makeMatches({ mateo: link('sw-mateo'), club: link('club-borrado') }));
    await expect(processor.commit('job-1')).rejects.toThrow('ya no existe');
  });

  it('falla si el nadador elegido fue borrado entre el preview y el commit', async () => {
    const { processor } = setup(makeMeet('csv'), makeMatches({ mateo: link('sw-mateo'), club: link('club-azu') }), ['sw-juan']);
    await expect(processor.commit('job-1')).rejects.toThrow('ya no existe');
  });

  it('PDF: aprende cada grafía (salvo las ya mapeadas) y la guarda para el rollback', async () => {
    const { processor, tx } = setup(makeMeet('pdf'), makeMatches({ mateo: link('sw-mateo'), club: link('club-azu') }));
    await processor.commit('job-1');

    const learned = (tx.externalIdMap.createMany.mock.calls[0] as [{ data: Array<{ externalId: string; swimmerId: string | null; clubId: string | null }> }])[0].data;
    expect(learned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalId: MATEO, swimmerId: 'sw-mateo', clubId: null }),
        expect.objectContaining({ externalId: NUEVO, clubId: null }),
        expect.objectContaining({ externalId: 'club_azucena', swimmerId: null, clubId: 'club-azu' }),
      ]),
    );
    expect(learned.map((l) => l.externalId)).not.toContain(JUAN);

    const rollbackMapping = (tx.meetManagerImport.update.mock.calls[0] as [{ data: { mapping: { learnedExternalIds: string[] } } }])[0].data.mapping;
    expect(rollbackMapping.learnedExternalIds).toEqual(expect.arrayContaining([MATEO, NUEVO, 'club_azucena']));
  });

  it('PDF: no duplica grafías que ya estaban aprendidas', async () => {
    const { processor, tx } = setup(makeMeet('pdf'), makeMatches({ mateo: link('sw-mateo'), club: link('club-azu') }));
    tx.externalIdMap.findMany.mockResolvedValue([{ externalId: MATEO }, { externalId: NUEVO }, { externalId: 'club_azucena' }]);
    await processor.commit('job-1');
    expect(tx.externalIdMap.createMany).not.toHaveBeenCalled();
  });

  it('CSV: no aprende grafías (sus IDs son posicionales)', async () => {
    const { processor, tx } = setup(makeMeet('csv'), makeMatches({ mateo: link('sw-mateo'), club: link('club-azu') }));
    await processor.commit('job-1');
    expect(tx.externalIdMap.createMany).not.toHaveBeenCalled();
  });

  it('audita cada decisión humana con quién la tomó, quién confirmó y los candidatos', async () => {
    const { processor, tx } = setup(makeMeet('csv'), makeMatches({ mateo: link('sw-mateo'), club: asNew }));
    await processor.commit('job-1', 'admin-2');
    const entries = (tx.auditLog.createMany.mock.calls[0] as [{ data: Array<{ action: string; entityId: string; userId: string; payload: Record<string, unknown> }> }])[0].data;
    expect(entries).toEqual([
      expect.objectContaining({ action: 'IMPORT_SWIMMER_LINKED', entityId: 'sw-mateo', userId: 'admin-1' }),
      expect.objectContaining({ action: 'IMPORT_CLUB_MARKED_NEW', userId: 'admin-1' }),
    ]);
    expect(entries[0]?.payload).toMatchObject({
      decision: 'link',
      targetId: 'sw-mateo',
      committedBy: 'admin-2',
      candidates: [{ id: 'sw-mateo', displayName: 'Mateo Rodriguez Suar', score: 0.98 }],
    });
  });
});

describe('CommitProcessor — rollback', () => {
  it('borra las grafías aprendidas en el import', async () => {
    const { processor, tx, repo } = setup(makeMeet('pdf'), makeMatches());
    repo.findById.mockResolvedValue({
      id: 'job-1',
      status: 'confirmed',
      meetManagerImport: {
        mapping: { tournamentId: 't-1', newSwimmerIds: [], newClubIds: [], newEventIds: [], resultIds: [], learnedExternalIds: [MATEO] },
      },
    });
    await processor.rollback('job-1');
    expect(tx.externalIdMap.deleteMany).toHaveBeenCalledWith({
      where: { sourceSystem: 'meet_manager', externalId: { in: [MATEO] } },
    });
  });
});
