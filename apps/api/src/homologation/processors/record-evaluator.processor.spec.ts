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
  tournamentName: 'Torneo Test',
  eventId: 'event-1',
  place: 1,
  resultDate: '2026-05-01T00:00:00.000Z',
  homologatedBy: 'admin-1',
  ...overrides,
});

const makePrisma = (currentRecord: { id: string; timeMs: number } | null = null) => {
  const base = {
    record: {
      findFirst: jest.fn().mockResolvedValue(currentRecord),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    result: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return {
    ...base,
    $transaction: jest.fn((cb: (tx: typeof base) => unknown) => cb(base)),
  };
};

describe('RecordEvaluatorProcessor', () => {
  it('homologa automáticamente el primer récord (sin récord vigente previo)', async () => {
    const prisma = makePrisma(null);
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData());
    expect(prisma.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'homologated', isCurrent: true, previousRecordId: null }),
      }),
    );
    expect(prisma.record.update).not.toHaveBeenCalled();
    expect(prisma.result.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isRecord: true } }),
    );
  });

  it('homologa automáticamente y desactiva el récord vigente cuando lo supera', async () => {
    const prisma = makePrisma({ id: 'rec-old', timeMs: 65000 });
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.record.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-old' },
        data: { isCurrent: false, status: 'superseded' },
      }),
    );
    expect(prisma.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'homologated', isCurrent: true, previousRecordId: 'rec-old' }),
      }),
    );
  });

  it('NO homologa si el tiempo es igual o peor al récord vigente', async () => {
    const prisma = makePrisma({ id: 'rec-1', timeMs: 55000 });
    const proc = new RecordEvaluatorProcessor(prisma as never);
    await proc.process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.record.create).not.toHaveBeenCalled();
  });
});
