import { ClubMatcher } from './club-matcher';
import type { NormalizedClub } from '../../ingest/types/normalized-meet.types';

const makeClub = (overrides: Partial<NormalizedClub> = {}): NormalizedClub => ({
  external_team_id: 'ext-club-01',
  name: 'Club Atlético Tucumán',
  short_name: 'CAT',
  source_line: 1,
  ...overrides,
});

const makePrisma = () => ({
  externalIdMap: { findUnique: jest.fn().mockResolvedValue(null) },
  club: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

describe('ClubMatcher', () => {
  it('strong por external_id mapeado', async () => {
    const prisma = makePrisma();
    (prisma.externalIdMap.findUnique as jest.Mock).mockResolvedValue({ clubId: 'club-1' });
    const matcher = new ClubMatcher(prisma as never);
    const result = await matcher.match(makeClub(), 'meet_manager');
    expect(result.confidence).toBe('strong');
    expect(result.matchedBy).toBe('external_id');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('high por short_name exacto', async () => {
    const prisma = makePrisma();
    (prisma.club.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'club-2' });
    const matcher = new ClubMatcher(prisma as never);
    const result = await matcher.match(makeClub(), 'meet_manager');
    expect(result.confidence).toBe('high');
    expect(result.matchedBy).toBe('short_name');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('high por nombre exacto', async () => {
    const prisma = makePrisma();
    (prisma.club.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)   // short_name no encontrado
      .mockResolvedValueOnce({ id: 'club-3' });
    const matcher = new ClubMatcher(prisma as never);
    const result = await matcher.match(makeClub(), 'meet_manager');
    expect(result.confidence).toBe('high');
    expect(result.matchedBy).toBe('name_exact');
  });

  it('low por fuzzy cercano', async () => {
    const prisma = makePrisma();
    (prisma.club.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.club.findMany as jest.Mock).mockResolvedValue([
      { id: 'club-4', name: 'Club Atletico Tucuman', shortName: 'CAT' },
    ]);
    const matcher = new ClubMatcher(prisma as never);
    const result = await matcher.match(makeClub(), 'meet_manager');
    expect(result.confidence).toBe('low');
    expect(result.matchedBy).toBe('fuzzy');
    expect(result.candidateClubId).toBe('club-4');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('none si no hay match', async () => {
    const prisma = makePrisma();
    const matcher = new ClubMatcher(prisma as never);
    const result = await matcher.match(makeClub({ name: 'Xyz Qrs', short_name: 'XQ' }), 'meet_manager');
    expect(result.confidence).toBe('none');
    expect(result.clubId).toBeNull();
  });
});
