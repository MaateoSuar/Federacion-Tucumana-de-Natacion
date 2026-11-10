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
) => ({
  record: {
    findUnique: jest.fn().mockResolvedValue(existingForResult),
    findFirst: jest.fn().mockResolvedValue(currentRecord),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  result: {
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn(),
});

// Regla inviolable 4: la publicación de un récord requiere homologación humana.
describe('RecordEvaluatorProcessor — nunca publica, solo crea candidatos', () => {
  it('sin récord vigente: crea un candidato pending_homologation, no vigente', async () => {
    const prisma = makePrisma(null);
    await new RecordEvaluatorProcessor(prisma as never).process(makeData());

    expect(prisma.record.create).toHaveBeenCalledTimes(1);
    expect(prisma.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'pending_homologation',
        isCurrent: false,
        previousRecordId: null,
        sourceResultId: 'result-1',
        timeMs: 60000,
        scope: 'provincial',
      }),
    });
  });

  it('supera al vigente: crea candidato y NO toca el récord vigente', async () => {
    const prisma = makePrisma({ id: 'rec-old', timeMs: 65000 });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ finalTimeMs: 60000 }));

    expect(prisma.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'pending_homologation',
        isCurrent: false,
        previousRecordId: 'rec-old',
      }),
    });
    expect(prisma.record.update).not.toHaveBeenCalled();
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['sin vigente', null],
    ['superando al vigente', { id: 'rec-old', timeMs: 65000 }],
  ])('%s: nunca escribe homologated / isCurrent / homologatedBy ni marca result.isRecord', async (_label, current) => {
    const prisma = makePrisma(current);
    await new RecordEvaluatorProcessor(prisma as never).process(makeData());

    const created = (prisma.record.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(created.status).toBe('pending_homologation');
    expect(created.isCurrent).toBe(false);
    expect(created.homologatedBy).toBeUndefined();
    expect(created.homologatedAt).toBeUndefined();
    expect(prisma.result.update).not.toHaveBeenCalled();
    expect(prisma.result.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no crea candidato si el tiempo es peor que el vigente', async () => {
    const prisma = makePrisma({ id: 'rec-1', timeMs: 55000 });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  it('no crea candidato si el tiempo iguala al vigente', async () => {
    const prisma = makePrisma({ id: 'rec-1', timeMs: 60000 });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ finalTimeMs: 60000 }));
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  it('es idempotente: reprocesar un resultado ya evaluado no crea otro candidato', async () => {
    const prisma = makePrisma(null, { id: 'rec-existing' });
    await new RecordEvaluatorProcessor(prisma as never).process(makeData());

    expect(prisma.record.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceResultId: 'result-1' } }),
    );
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  it('si otro job del mismo resultado ganó la carrera (P2002), no falla', async () => {
    const prisma = makePrisma(null);
    prisma.record.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(new RecordEvaluatorProcessor(prisma as never).process(makeData())).resolves.toBeUndefined();
  });

  it('propaga cualquier otro error de la base', async () => {
    const prisma = makePrisma(null);
    prisma.record.create.mockRejectedValue(new Error('db caída'));
    await expect(new RecordEvaluatorProcessor(prisma as never).process(makeData())).rejects.toThrow('db caída');
  });

  it.each([
    [25, 'P25'],
    [50, 'P50'],
  ] as const)('piscina de %i m: busca el vigente y crea el candidato solo en %s', async (poolLength, prismaPool) => {
    const prisma = makePrisma(null);
    await new RecordEvaluatorProcessor(prisma as never).process(makeData({ poolLength }));

    expect(prisma.record.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ poolLength: prismaPool, scope: 'provincial', isCurrent: true }),
    });
    expect(prisma.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ poolLength: prismaPool }),
    });
  });
});
