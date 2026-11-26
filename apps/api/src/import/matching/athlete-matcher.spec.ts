import { AthleteMatcher } from './athlete-matcher';
import type { NormalizedSwimmer } from '../../ingest/types/normalized-meet.types';

const makeSwimmer = (overrides: Partial<NormalizedSwimmer> = {}): NormalizedSwimmer => ({
  external_athlete_id: 'ext-001',
  first_name: 'Juan',
  last_name: 'Pérez',
  gender: 'M',
  birth_date: '2005-03-15',
  club_ref: 'club-a',
  source_line: 1,
  ...overrides,
});

const makePrisma = (overrides: Record<string, unknown> = {}) => ({
  swimmer: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  externalIdMap: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  ...overrides,
});

describe('AthleteMatcher', () => {
  it('retorna strong por DNI si existe', async () => {
    const prisma = makePrisma();
    (prisma.swimmer.findUnique as jest.Mock).mockResolvedValue({ id: 'swimmer-1' });
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(makeSwimmer({ document: '12345678' }), 'meet_manager');
    expect(result.confidence).toBe('strong');
    expect(result.matchedBy).toBe('dni');
    expect(result.swimmerId).toBe('swimmer-1');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('retorna strong por external_id ya mapeado', async () => {
    const prisma = makePrisma();
    (prisma.externalIdMap.findUnique as jest.Mock).mockResolvedValue({ swimmerId: 'swimmer-2' });
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(makeSwimmer(), 'meet_manager');
    expect(result.confidence).toBe('strong');
    expect(result.matchedBy).toBe('external_id');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('retorna high por nombre+dob+gender exactos', async () => {
    const prisma = makePrisma();
    (prisma.swimmer.findFirst as jest.Mock).mockResolvedValue({ id: 'swimmer-3' });
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(makeSwimmer(), 'meet_manager');
    expect(result.confidence).toBe('high');
    expect(result.matchedBy).toBe('name_dob_gender');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('retorna medium por nombre+año+club (un candidato)', async () => {
    const prisma = makePrisma();
    // findFirst devuelve null (no hay match exacto por DOB completo)
    (prisma.swimmer.findFirst as jest.Mock).mockResolvedValue(null);
    // pero findMany devuelve un candidato por año
    (prisma.swimmer.findMany as jest.Mock).mockResolvedValue([
      { id: 'swimmer-4', firstName: 'Juan', lastName: 'Pérez', birthDate: new Date('2005-06-01'), currentClub: null },
    ]);
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(makeSwimmer(), 'meet_manager');
    expect(result.confidence).toBe('medium');
    expect(result.matchedBy).toBe('name_year_club');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('retorna low por fuzzy si hay un match suficientemente cercano', async () => {
    const prisma = makePrisma();
    (prisma.swimmer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.swimmer.findMany as jest.Mock)
      // Primera llamada: búsqueda por año (devuelve vacío)
      .mockResolvedValueOnce([])
      // Segunda llamada: todos los swimmers para fuzzy
      .mockResolvedValueOnce([
        { id: 'swimmer-5', firstName: 'Juan', lastName: 'Perez' },
      ]);
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(makeSwimmer(), 'meet_manager');
    expect(result.confidence).toBe('low');
    expect(result.matchedBy).toBe('fuzzy');
    expect(result.candidateSwimmerId).toBe('swimmer-5');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('sugiere candidatos rankeados con motivo para nombres escritos distinto', async () => {
    const prisma = makePrisma();
    (prisma.swimmer.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'hermano', firstName: 'Juan', lastName: 'Rodriguez Suar', gender: 'M', birthDate: new Date('2010-02-01'), currentClubId: 'club-1', currentClub: { name: 'Club Azucena' } },
        { id: 'mateo', firstName: 'Mateo', lastName: 'Rodriguez Suar', gender: 'M', birthDate: new Date('2010-05-01'), currentClubId: 'club-1', currentClub: { name: 'Club Azucena' } },
        { id: 'otra', firstName: 'Mateo', lastName: 'Suar', gender: 'F', birthDate: null, currentClubId: null, currentClub: null },
      ]);
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(
      makeSwimmer({ first_name: 'Mateo', last_name: 'Suar', birth_date: undefined, age: 16 }),
      'meet_manager',
      { seasonYear: 2026, clubId: 'club-1' },
    );
    expect(result.matchedBy).toBe('fuzzy');
    expect(result.swimmerId).toBeNull();
    expect(result.requiresConfirmation).toBe(true);
    expect(result.candidates?.map((c) => c.swimmerId)).toEqual(['mateo']);
    expect(result.candidates?.[0]?.reasons).toEqual(
      expect.arrayContaining(['comparte apellido Suar', 'mismo club']),
    );
    expect(result.candidates?.[0]?.clubName).toBe('Club Azucena');
  });

  it('matchAll carga el padrón una sola vez', async () => {
    const prisma = makePrisma();
    const pool = [{ id: 'mateo', firstName: 'Mateo', lastName: 'Rodriguez Suar', gender: 'M', birthDate: null, currentClubId: null, currentClub: null }];
    (prisma.swimmer.findMany as jest.Mock).mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(args.select ? pool : []),
    );
    const matcher = new AthleteMatcher(prisma as never);
    const results = await matcher.matchAll(
      [
        makeSwimmer({ external_athlete_id: 'a', first_name: 'Mateo', last_name: 'Suar', birth_date: undefined }),
        makeSwimmer({ external_athlete_id: 'b', first_name: 'Mateo', last_name: 'Rodriguez', birth_date: undefined }),
      ],
      'meet_manager',
      { clubIdByRef: {} },
    );
    const poolCalls = (prisma.swimmer.findMany as jest.Mock).mock.calls.filter(
      ([args]: [{ select?: unknown }]) => args.select,
    );
    expect(poolCalls).toHaveLength(1);
    expect(results.map((r) => r.candidateSwimmerId)).toEqual(['mateo', 'mateo']);
  });

  it('retorna none si no hay match', async () => {
    const prisma = makePrisma();
    (prisma.swimmer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.swimmer.findMany as jest.Mock).mockResolvedValue([]);
    const matcher = new AthleteMatcher(prisma as never);
    const result = await matcher.match(makeSwimmer(), 'meet_manager');
    expect(result.confidence).toBe('none');
    expect(result.swimmerId).toBeNull();
    expect(result.requiresConfirmation).toBe(false);
  });
});
