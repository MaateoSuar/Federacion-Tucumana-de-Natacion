import { PersonalBestProcessor } from './personal-best.processor';
import type { PostProcessJobData } from '../homologation.queue';

const makeData = (overrides: Partial<PostProcessJobData> = {}): PostProcessJobData => ({
  resultId: 'result-1',
  swimmerId: 'swimmer-1',
  clubId: 'club-1',
  eventDefinitionId: 'evdef-1',
  poolLength: 25,
  categoryId: 'cat-1',
  gender: 'M',
  seasonId: 'season-1',
  finalTimeMs: 60000,
  tournamentId: 'tourn-1',
  eventId: 'event-1',
  place: 1,
  resultDate: '2026-05-01T00:00:00.000Z',
  ...overrides,
});

const makePrisma = (existing: { id: string; bestTime: number } | null = null) => ({
  personalBest: {
    findUnique: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  result: {
    update: jest.fn().mockResolvedValue({}),
  },
});

describe('PersonalBestProcessor', () => {
  it('crea PB si no existe', async () => {
    const prisma = makePrisma(null);
    const proc = new PersonalBestProcessor(prisma as never);
    await proc.process(makeData());
    expect(prisma.personalBest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bestTime: 60000 }) }),
    );
  });

  it('actualiza PB si el tiempo mejora', async () => {
    const prisma = makePrisma({ id: 'pb-1', bestTime: 65000 });
    const proc = new PersonalBestProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.personalBest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bestTime: 60000 }) }),
    );
    expect(prisma.result.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPb: true } }),
    );
  });

  it('NO actualiza PB si el tiempo es peor', async () => {
    const prisma = makePrisma({ id: 'pb-1', bestTime: 55000 });
    const proc = new PersonalBestProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.personalBest.update).not.toHaveBeenCalled();
    expect(prisma.result.update).not.toHaveBeenCalled();
  });

  it('NO actualiza PB si el tiempo es igual', async () => {
    const prisma = makePrisma({ id: 'pb-1', bestTime: 60000 });
    const proc = new PersonalBestProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.personalBest.update).not.toHaveBeenCalled();
  });
});
