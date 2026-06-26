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
