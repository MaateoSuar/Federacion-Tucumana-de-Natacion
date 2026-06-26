import { RecordEvaluatorProcessor } from './record-evaluator.processor';
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

const makePrisma = (currentRecord: { id: string; timeMs: number } | null = null) => ({
  record: {
    findFirst: jest.fn().mockResolvedValue(currentRecord),
    create: jest.fn().mockResolvedValue({}),
  },
  result: {
    update: jest.fn().mockResolvedValue({}),
  },
});

describe('RecordEvaluatorProcessor', () => {
  it('crea candidato si no hay récord vigente (primer récord)', async () => {
    const prisma = makePrisma(null);
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData());
    expect(prisma.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_homologation', isCurrent: false }),
      }),
    );
    expect(prisma.result.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isRecord: true } }),
    );
  });

  it('crea candidato si el tiempo es mejor que el récord vigente', async () => {
    const prisma = makePrisma({ id: 'rec-1', timeMs: 65000 });
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.record.create).toHaveBeenCalled();
  });

  it('NO crea candidato si el tiempo es igual o peor al récord vigente', async () => {
    const prisma = makePrisma({ id: 'rec-1', timeMs: 55000 });
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  it('encadena el previousRecordId cuando supera el récord vigente', async () => {
    const prisma = makePrisma({ id: 'rec-old', timeMs: 65000 });
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousRecordId: 'rec-old' }),
      }),
    );
  });
});
