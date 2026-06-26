import { AchievementProcessor } from './achievement.processor';
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

const makePrisma = () => ({
  athleteAchievement: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
});

describe('AchievementProcessor', () => {
  it('crea medalla de oro para puesto 1', async () => {
    const prisma = makePrisma();
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: 1 }));
    expect(prisma.athleteAchievement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ medal: 'gold', type: 'medal' }) }),
    );
  });

  it('crea medalla de plata para puesto 2', async () => {
    const prisma = makePrisma();
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: 2 }));
    expect(prisma.athleteAchievement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ medal: 'silver' }) }),
    );
  });

  it('crea medalla de bronce para puesto 3', async () => {
    const prisma = makePrisma();
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: 3 }));
    expect(prisma.athleteAchievement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ medal: 'bronze' }) }),
    );
  });

  it('crea diploma para puesto 4', async () => {
    const prisma = makePrisma();
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: 4 }));
    expect(prisma.athleteAchievement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'badge', title: 'Diploma — Puesto 4' }) }),
    );
  });

  it('no crea logro si place es null', async () => {
    const prisma = makePrisma();
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: null }));
    expect(prisma.athleteAchievement.create).not.toHaveBeenCalled();
  });

  it('no duplica si ya existe el logro', async () => {
    const prisma = makePrisma();
    (prisma.athleteAchievement.findFirst as jest.Mock).mockResolvedValue({ id: 'ach-1' });
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: 1 }));
    expect(prisma.athleteAchievement.create).not.toHaveBeenCalled();
  });

  it('no crea nada para puesto 9 (fuera del rango diploma)', async () => {
    const prisma = makePrisma();
    const proc = new AchievementProcessor(prisma as never);
    await proc.process(makeData({ place: 9 }));
    expect(prisma.athleteAchievement.create).not.toHaveBeenCalled();
  });
});
