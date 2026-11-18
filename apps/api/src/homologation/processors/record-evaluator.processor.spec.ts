import { Prisma } from '@prisma/client';
import { RecordEvaluatorProcessor } from './record-evaluator.processor';
import type { PostProcessJobData } from '../homologation.queue';

const makeData = (overrides: Partial<PostProcessJobData> = {}): PostProcessJobData => ({
  resultId: 'result-1',
  swimmerId: 'swimmer-1',
  clubId: 'club-1',
  eventDefinitionId: 'evdef-1',
  poolLength: 25,
  categoryId: 'cat-torneo',
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

// Categorías oficiales de récords por alcance
const OFFICIAL: Record<string, Array<{ id: string; minAge: number | null; maxAge: number | null }>> = {
  provincial: [
    { id: 'prov-infantiles', minAge: 10, maxAge: 11 },
    { id: 'prov-mayores', minAge: 19, maxAge: null },
    { id: 'prov-absoluto', minAge: null, maxAge: null },
  ],
  noa: [
    { id: 'noa-infantiles', minAge: 10, maxAge: 11 },
    { id: 'noa-mayores', minAge: 19, maxAge: null },
    { id: 'noa-absoluto', minAge: null, maxAge: null },
  ],
};

interface Options {
  currentRecord?: { id: string; timeMs: number } | null;
  existingForResult?: { id: string } | null;
  clubProvince?: string | null;
  ownAges?: { minAge: number | null; maxAge: number | null } | null;
}

const makePrisma = ({
  currentRecord = null,
  existingForResult = null,
  clubProvince = 'Tucumán',
  ownAges = { minAge: 10, maxAge: 10 }, // Infantil 1
}: Options = {}) => {
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
    record: { findFirst: jest.fn().mockResolvedValue(existingForResult) },
    club: { findUnique: jest.fn().mockResolvedValue({ province: clubProvince }) },
    category: {
      findUnique: jest.fn().mockResolvedValue(ownAges),
      findMany: jest.fn().mockImplementation(({ where }: { where: { scope: string } }) =>
        Promise.resolve(OFFICIAL[where.scope] ?? [])),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
};

const run = (prisma: ReturnType<typeof makePrisma>, data = makeData()) =>
  new RecordEvaluatorProcessor(prisma as never).process(data);

const createdKeys = (prisma: ReturnType<typeof makePrisma>) =>
  prisma.tx.record.create.mock.calls.map(([arg]: [{ data: { scope: string; categoryId: string } }]) =>
    `${arg.data.scope}:${arg.data.categoryId}`);

// Regla 4 (decisión del 13/11/2026): el récord se actualiza solo cuando un resultado
// homologado supera al vigente. El Admin puede volverlo al anterior (records.service).
describe('RecordEvaluatorProcessor — el récord se actualiza solo', () => {
  it('sin récord vigente: publica el primero como vigente y marca el resultado', async () => {
    const prisma = makePrisma();
    await run(prisma);

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
    const prisma = makePrisma({ currentRecord: { id: 'rec-old', timeMs: 65000 } });
    await run(prisma, makeData({ finalTimeMs: 60000 }));

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
    const prisma = makePrisma({ currentRecord: { id: 'rec-old', timeMs: 65000 } });
    await run(prisma);
    expect(Object.keys(prisma.tx.record)).not.toContain('delete');
  });

  it('deja registro en auditoría de la actualización automática', async () => {
    const prisma = makePrisma({ currentRecord: { id: 'rec-old', timeMs: 65000 } });
    await run(prisma, makeData({ finalTimeMs: 60000 }));

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
    const prisma = makePrisma({ currentRecord: { id: 'rec-1', timeMs: currentTime } });
    await run(prisma, makeData({ finalTimeMs: 60000 }));

    expect(prisma.tx.record.create).not.toHaveBeenCalled();
    expect(prisma.tx.record.update).not.toHaveBeenCalled();
    expect(prisma.tx.result.update).not.toHaveBeenCalled();
  });

  it('es idempotente: reprocesar un resultado ya evaluado no hace nada', async () => {
    const prisma = makePrisma({ existingForResult: { id: 'rec-existing' } });
    await run(prisma);

    expect(prisma.record.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sourceResultId: 'result-1' }) }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('si otro job del mismo resultado ganó la carrera (P2002), no falla', async () => {
    const prisma = makePrisma();
    prisma.tx.record.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(run(prisma)).resolves.toBeUndefined();
  });

  it('propaga cualquier otro error de la base', async () => {
    const prisma = makePrisma();
    prisma.tx.record.create.mockRejectedValue(new Error('db caída'));
    await expect(run(prisma)).rejects.toThrow('db caída');
  });

  it.each([
    [25, 'P25'],
    [50, 'P50'],
  ] as const)('piscina de %i m: busca el vigente y crea el récord solo en %s', async (poolLength, prismaPool) => {
    const prisma = makePrisma();
    await run(prisma, makeData({ poolLength }));

    expect(prisma.tx.record.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ poolLength: prismaPool, scope: 'provincial', isCurrent: true }),
    });
    expect(prisma.tx.record.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ poolLength: prismaPool }),
    });
  });
});

describe('RecordEvaluatorProcessor — dónde cae el récord (decisiones del 18/11/2026)', () => {
  it('club de Tucumán: récord tucumano en la categoría oficial y en Absoluto, y también NOA', async () => {
    const prisma = makePrisma({ clubProvince: 'Tucumán' });
    await run(prisma);

    expect(createdKeys(prisma).sort()).toEqual([
      'noa:noa-absoluto', 'noa:noa-infantiles', 'provincial:prov-absoluto', 'provincial:prov-infantiles',
    ]);
  });

  it('club de otra provincia del NOA: solo récord NOA, nunca tucumano', async () => {
    const prisma = makePrisma({ clubProvince: 'Salta' });
    await run(prisma);

    expect(createdKeys(prisma).sort()).toEqual(['noa:noa-absoluto', 'noa:noa-infantiles']);
  });

  it.each([
    ['de una provincia fuera del NOA', 'Córdoba'],
    ['sin provincia cargada', null],
  ])('un club %s no genera ningún récord', async (_label, province) => {
    const prisma = makePrisma({ clubProvince: province });
    await run(prisma);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tx.result.update).not.toHaveBeenCalled();
  });

  it('Mayores se queda en Mayores y además cuenta para Absoluto', async () => {
    const prisma = makePrisma({ ownAges: { minAge: 19, maxAge: null } });
    await run(prisma);

    expect(createdKeys(prisma)).toEqual(expect.arrayContaining(['provincial:prov-mayores', 'provincial:prov-absoluto']));
  });

  it('Junior (19-21) cae en Mayores', async () => {
    const prisma = makePrisma({ ownAges: { minAge: 19, maxAge: 21 } });
    await run(prisma);

    expect(createdKeys(prisma)).toContain('provincial:prov-mayores');
  });

  it.each([
    ['Pre A (por debajo de las oficiales)', { minAge: null, maxAge: 8 }],
    ['Absoluto o Escuela (sin límites de edad)', { minAge: null, maxAge: null }],
  ])('sin categoría de edad oficial: no genera récord: %s', async (_label, ages) => {
    const prisma = makePrisma({ ownAges: ages });
    await run(prisma);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cada (alcance, categoría) se evalúa por separado: supera a uno y no al otro', async () => {
    const prisma = makePrisma({ clubProvince: 'Salta' });
    // Vigente NOA de Infantiles: 65 s (lo supera). Vigente NOA Absoluto: 55 s (no lo supera).
    prisma.tx.record.findFirst
      .mockResolvedValueOnce({ id: 'rec-inf', timeMs: 65000 })
      .mockResolvedValueOnce({ id: 'rec-abs', timeMs: 55000 });
    await run(prisma, makeData({ finalTimeMs: 60000 }));

    expect(createdKeys(prisma)).toHaveLength(1);
    expect(prisma.tx.record.update).toHaveBeenCalledWith({
      where: { id: 'rec-inf' },
      data: { isCurrent: false, status: 'superseded' },
    });
  });
});
