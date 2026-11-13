import { Prisma } from '@prisma/client';
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

const makePrisma = (
  currentRecord: { id: string; timeMs: number } | null = null,
  existingForResult: { id: string } | null = null,
) => {
  const tx = {
    record: {
      findFirst: jest.fn().mockResolvedValue(currentRecord),
      create: jest.fn().mockResolvedValue({ id: 'rec-new' }),
      update: jest.fn().mockResolvedValue({}),
    },
    result: { update: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return {
    tx,
    record: { findUnique: jest.fn().mockResolvedValue(existingForResult) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
};

// Regla 4 (decisión del 13/11/2026): el récord se actualiza solo cuando un resultado
// homologado supera al vigente. El Admin puede volverlo al anterior (records.service).
describe('RecordEvaluatorProcessor — el récord se actualiza solo', () => {
  it('sin récord vigente: publica el primero como vigente y marca el resultado', async () => {
    const prisma = makePrisma(null);
    await new RecordEvaluatorProcessor(prisma as never).process(makeData());

    expect(prisma.tx.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'homologated',
        isCurrent: true,
        previousRecordId: null,
        sourceResultId: 'result-1',
        timeMs: 60000,
        scope: 'provincial',
      }),
    });
    expect(prisma.tx.record.update).not.toHaveBeenCalled();
    expect(prisma.tx.result.update).toHaveBeenCalledWith({ where: { id: 'result-1' }, data: { isRecord: true } });
  });

  it('supera al vigente: el nuevo queda vigente, el anterior pasa a superseded y queda encadenado', async () => {
    const prisma = makePrisma({ id: 'rec-old', timeMs: 65000 });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ finalTimeMs: 60000 }));

    expect(prisma.tx.record.update).toHaveBeenCalledWith({
      where: { id: 'rec-old' },
      data: { isCurrent: false, status: 'superseded' },
    });
    expect(prisma.tx.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'homologated', isCurrent: true, previousRecordId: 'rec-old' }),
    });
    // Primero se desactiva el vigente y después se crea el nuevo: nunca hay dos vigentes
    expect(prisma.tx.record.update.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.tx.record.create.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('el anterior no se borra: se conserva para poder volver atrás', async () => {
    const prisma = makePrisma({ id: 'rec-old', timeMs: 65000 });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData());
    expect(Object.keys(prisma.tx.record)).not.toContain('delete');
  });

  it('deja registro en auditoría de la actualización automática', async () => {
    const prisma = makePrisma({ id: 'rec-old', timeMs: 65000 });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ finalTimeMs: 60000 }));

    expect(prisma.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RECORD_AUTO_PUBLISHED',
        entityType: 'Record',
        entityId: 'rec-new',
        payload: expect.objectContaining({ timeMs: 60000, supersededRecordId: 'rec-old', supersededTimeMs: 65000 }),
      }),
    });
  });

  it.each([
    ['peor que el vigente', 55000],
    ['igual al vigente', 60000],
  ])('no toca nada si el tiempo es %s', async (_label, currentTime) => {
    const prisma = makePrisma({ id: 'rec-1', timeMs: currentTime });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ finalTimeMs: 60000 }));

    expect(prisma.tx.record.create).not.toHaveBeenCalled();
    expect(prisma.tx.record.update).not.toHaveBeenCalled();
    expect(prisma.tx.result.update).not.toHaveBeenCalled();
  });

  it('es idempotente: reprocesar un resultado ya evaluado no hace nada', async () => {
    const prisma = makePrisma(null, { id: 'rec-existing' });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData());

    expect(prisma.record.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceResultId: 'result-1' } }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('si otro job del mismo resultado ganó la carrera (P2002), no falla', async () => {
    const prisma = makePrisma(null);
    prisma.tx.record.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(new RecordEvaluatorProcessor(prisma as never).process(makeData())).resolves.toBeUndefined();
  });

  it('propaga cualquier otro error de la base', async () => {
    const prisma = makePrisma(null);
    prisma.tx.record.create.mockRejectedValue(new Error('db caída'));
    await expect(new RecordEvaluatorProcessor(prisma as never).process(makeData())).rejects.toThrow('db caída');
  });

  it.each([
    [25, 'P25'],
    [50, 'P50'],
  ] as const)('piscina de %i m: busca el vigente y crea el récord solo en %s', async (poolLength, prismaPool) => {
    const prisma = makePrisma(null);
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ poolLength }));

    expect(prisma.tx.record.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ poolLength: prismaPool, scope: 'provincial', isCurrent: true }),
    });
    expect(prisma.tx.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ poolLength: prismaPool }),
    });
  });
});
