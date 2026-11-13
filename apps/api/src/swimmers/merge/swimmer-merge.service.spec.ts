import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SwimmerMergeService } from './swimmer-merge.service';

const swimmer = (id: string, over: Record<string, unknown> = {}) => ({
  id, firstName: 'Nicolas', lastName: 'BABOT', gender: 'M', birthDate: null, documentId: null, currentClubId: null, ...over,
});

function setup(opts: {
  canonical?: Record<string, unknown> | null;
  duplicate?: Record<string, unknown> | null;
  accounts?: Record<string, { id: string } | null>;
} = {}) {
  const canonical = opts.canonical === undefined ? swimmer('can') : opts.canonical;
  const duplicate = opts.duplicate === undefined ? swimmer('dup') : opts.duplicate;
  const many = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  });
  const tx = {
    result: many(), registration: many(), personalBest: many(), ranking: many(), swimmerClubHistory: many(),
    record: many(), externalIdMap: many(), swimmerAlias: many(), accountLinkRequest: many(),
    athleteStatistics: many(), athleteAchievement: many(), athleteProfile: many(), swimmer: many(), auditLog: many(),
  };
  const prisma = {
    swimmer: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === 'can' ? canonical : where.id === 'dup' ? duplicate : null),
      ),
    },
    user: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { swimmerId: string } }) =>
        Promise.resolve(opts.accounts?.[where.swimmerId] ?? null),
      ),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new SwimmerMergeService(prisma as never);
  return { service, tx, prisma };
}

const auditPayload = (tx: ReturnType<typeof setup>['tx']) =>
  (tx.auditLog.create.mock.calls[0] as [{ data: { payload: Record<string, unknown> } }])[0].data.payload;

describe('SwimmerMergeService.merge', () => {
  it('unifica dos recordistas: los récords HOMOLOGADOS también pasan al canónico y el duplicado se elimina', async () => {
    // Caso real: dos "Nicolas BABOT" de la tabla oficial. Antes los récords homologados
    // quedaban en el duplicado y borrarlo fallaba con error 500.
    const { service, tx } = setup();
    tx.record.findMany.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);

    await expect(service.merge('can', 'dup', 'admin-1')).resolves.toEqual({ merged: true });

    expect(tx.record.updateMany).toHaveBeenCalledWith({ where: { swimmerId: 'dup' }, data: { swimmerId: 'can' } });
    expect(tx.swimmer.delete).toHaveBeenCalledWith({ where: { id: 'dup' } });
  });

  it('al mover récords solo cambia el titular: no toca tiempo, estado ni vigencia', async () => {
    const { service, tx } = setup();
    tx.record.findMany.mockResolvedValue([{ id: 'rec-1' }]);
    await service.merge('can', 'dup', 'admin-1');

    const data = (tx.record.updateMany.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(Object.keys(data)).toEqual(['swimmerId']);
  });

  it('audita quién unificó, a quién y qué récords se movieron', async () => {
    const { service, tx } = setup();
    tx.record.findMany.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);
    tx.result.updateMany.mockResolvedValue({ count: 7 });

    await service.merge('can', 'dup', 'admin-1');

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin-1', action: 'SWIMMER_MERGED', entityId: 'can' }),
    });
    expect(auditPayload(tx)).toMatchObject({
      duplicateId: 'dup',
      duplicateName: 'Nicolas BABOT',
      moved: expect.objectContaining({ results: 7, recordIds: ['rec-1', 'rec-2'] }),
    });
  });

  describe('cuentas de usuario (regla 6)', () => {
    it('no unifica si el nadador a eliminar tiene una cuenta vinculada', async () => {
      const { service, prisma } = setup({ accounts: { dup: { id: 'user-1' } } });
      await expect(service.merge('can', 'dup', 'admin-1')).rejects.toThrow(/Unificá al revés/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no unifica si los dos tienen cuenta', async () => {
      const { service, prisma } = setup({ accounts: { dup: { id: 'u1' }, can: { id: 'u2' } } });
      await expect(service.merge('can', 'dup', 'admin-1')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sí unifica si la cuenta es del que queda', async () => {
      const { service, tx } = setup({ accounts: { can: { id: 'u2' } } });
      await service.merge('can', 'dup', 'admin-1');
      expect(tx.swimmer.delete).toHaveBeenCalled();
    });
  });

  describe('choques de claves únicas (antes daban error 500)', () => {
    it('ranking repetido: queda el mejor tiempo', async () => {
      const { service, tx } = setup();
      const key = { eventDefinitionId: 'ev', poolLength: 'P25', scope: 'provincial', seasonId: null, categoryId: 'cat' };
      tx.ranking.findMany.mockResolvedValue([
        { id: 'rk-dup-mejor', finalTime: 25000, ...key },
        { id: 'rk-dup-peor', finalTime: 31000, ...key, categoryId: 'cat2' },
        { id: 'rk-dup-solo', finalTime: 40000, ...key, categoryId: 'cat3' },
      ]);
      tx.ranking.findFirst
        .mockResolvedValueOnce({ id: 'rk-can-1', finalTime: 26000 }) // el del duplicado es mejor
        .mockResolvedValueOnce({ id: 'rk-can-2', finalTime: 30000 }) // el del canónico es mejor
        .mockResolvedValueOnce(null); // no choca

      await service.merge('can', 'dup', 'admin-1');

      expect(tx.ranking.delete).toHaveBeenCalledWith({ where: { id: 'rk-can-1' } });
      expect(tx.ranking.update).toHaveBeenCalledWith({ where: { id: 'rk-dup-mejor' }, data: { swimmerId: 'can' } });
      expect(tx.ranking.delete).toHaveBeenCalledWith({ where: { id: 'rk-dup-peor' } });
      expect(tx.ranking.update).toHaveBeenCalledWith({ where: { id: 'rk-dup-solo' }, data: { swimmerId: 'can' } });
    });

    it('al buscar el ranking que choca, la pileta es parte de la clave (25 m y 50 m no se cruzan)', async () => {
      const { service, tx } = setup();
      tx.ranking.findMany.mockResolvedValue([
        { id: 'rk', finalTime: 25000, eventDefinitionId: 'ev', poolLength: 'P50', scope: 'provincial', seasonId: null, categoryId: 'cat' },
      ]);
      await service.merge('can', 'dup', 'admin-1');
      expect(tx.ranking.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ swimmerId: 'can', poolLength: 'P50', eventDefinitionId: 'ev', categoryId: 'cat' }),
      });
    });

    it('estadísticas de la misma temporada: se descarta la del duplicado', async () => {
      const { service, tx } = setup();
      tx.athleteStatistics.findMany
        .mockResolvedValueOnce([{ seasonId: 's-2026' }]) // canónico
        .mockResolvedValueOnce([{ id: 'st-dup-2026', seasonId: 's-2026' }, { id: 'st-dup-2025', seasonId: 's-2025' }]);

      await service.merge('can', 'dup', 'admin-1');

      expect(tx.athleteStatistics.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['st-dup-2026'] } } });
      expect(tx.athleteStatistics.updateMany).toHaveBeenCalledWith({ where: { swimmerId: 'dup' }, data: { swimmerId: 'can' } });
    });

    it('alias repetido e inscripción repetida: se descartan los del duplicado', async () => {
      const { service, tx } = setup();
      tx.swimmerAlias.findMany
        .mockResolvedValueOnce([{ aliasNormalized: 'nico babot' }])
        .mockResolvedValueOnce([{ id: 'al-1', aliasNormalized: 'nico babot' }, { id: 'al-2', aliasNormalized: 'n babot' }]);
      tx.registration.findMany
        .mockResolvedValueOnce([{ eventId: 'e1' }])
        .mockResolvedValueOnce([{ id: 'rg-1', eventId: 'e1' }, { id: 'rg-2', eventId: 'e2' }]);

      await service.merge('can', 'dup', 'admin-1');

      expect(tx.swimmerAlias.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['al-1'] } } });
      expect(tx.registration.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['rg-1'] } } });
    });
  });

  it('el canónico hereda fecha de nacimiento y documento solo si no los tenía, después de borrar el duplicado', async () => {
    const birth = new Date('2008-04-03');
    const { service, tx } = setup({
      canonical: swimmer('can', { documentId: '111' }),
      duplicate: swimmer('dup', { birthDate: birth, documentId: '222' }),
    });

    await service.merge('can', 'dup', 'admin-1');

    expect(tx.swimmer.update).toHaveBeenCalledWith({ where: { id: 'can' }, data: { birthDate: birth } });
    const order = tx.swimmer.delete.mock.invocationCallOrder[0] ?? 0;
    expect(tx.swimmer.update.mock.invocationCallOrder[0]).toBeGreaterThan(order);
    expect(auditPayload(tx)).toMatchObject({ inheritedFields: ['birthDate'] });
  });

  it('rechaza unificar un nadador consigo mismo, de distinto género o inexistente', async () => {
    await expect(setup().service.merge('can', 'can', 'a')).rejects.toThrow(BadRequestException);
    await expect(setup({ duplicate: swimmer('dup', { gender: 'F' }) }).service.merge('can', 'dup', 'a')).rejects.toThrow(/distinto género/);
    await expect(setup({ duplicate: null }).service.merge('can', 'dup', 'a')).rejects.toThrow(NotFoundException);
  });
});
