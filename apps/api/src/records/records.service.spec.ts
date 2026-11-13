import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecordsService } from './records.service';
import { PrismaService } from '../prisma/prisma.service';

const txMock = {
  record: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  result: { update: jest.fn(), findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
};

const mockPrisma = {
  record: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

const CANDIDATE = {
  id: 'rec1',
  scope: 'provincial' as const,
  eventDefinitionId: 'evt1',
  categoryId: 'cat1',
  gender: 'M' as const,
  poolLength: 'P25' as const,
  timeMs: 54000,
  swimmerId: 's1',
  clubId: 'c1',
  status: 'pending_homologation' as const,
  isCurrent: false,
  previousRecordId: null,
  homologatedBy: null,
  homologatedAt: null,
  recordDate: new Date('2026-01-15'),
  createdAt: new Date(),
  sourceResultId: 'r1',
};

const CURRENT_RECORD = {
  id: 'rec0',
  scope: 'provincial' as const,
  eventDefinitionId: 'evt1',
  categoryId: 'cat1',
  gender: 'M' as const,
  poolLength: 'P25' as const,
  timeMs: 56000,
  isCurrent: true,
  status: 'homologated' as const,
};

describe('RecordsService', () => {
  let service: RecordsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<RecordsService>(RecordsService);
    jest.clearAllMocks();
    txMock.result.findUnique.mockResolvedValue({ homologated: true, status: 'OK' });
  });

  // ─── findCurrent ────────────────────────────────────────────────────────────

  describe('findCurrent', () => {
    it('filtra por scope=provincial e isCurrent=true status=homologated', async () => {
      mockPrisma.record.findMany.mockResolvedValue([]);
      await service.findCurrent({ scope: 'provincial' });
      expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scope: 'provincial', isCurrent: true, status: 'homologated' }),
        }),
      );
    });

    it('aplica filtros adicionales cuando se proporcionan', async () => {
      mockPrisma.record.findMany.mockResolvedValue([]);
      await service.findCurrent({ scope: 'provincial', poolLength: 'P25', gender: 'M' });
      expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ poolLength: 'P25', gender: 'M' }),
        }),
      );
    });
  });

  // ─── findNational ───────────────────────────────────────────────────────────

  describe('findNational', () => {
    it('consulta scope=nacional e isCurrent=true (sin filtro de status)', async () => {
      mockPrisma.record.findMany.mockResolvedValue([]);
      await service.findNational({});
      expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scope: 'nacional', isCurrent: true }),
        }),
      );
    });
  });

  // ─── findCandidates ─────────────────────────────────────────────────────────

  describe('findCandidates', () => {
    it('consulta status=pending_homologation', async () => {
      mockPrisma.record.findMany.mockResolvedValue([]);
      await service.findCandidates({});
      expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending_homologation' }),
        }),
      );
    });
  });

  // ─── homologateRecord ───────────────────────────────────────────────────────

  describe('homologateRecord', () => {
    it('homologa el candidato y pone el anterior en superseded', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      txMock.record.findFirst.mockResolvedValue(CURRENT_RECORD);
      txMock.record.update
        .mockResolvedValueOnce({ ...CURRENT_RECORD, isCurrent: false, status: 'superseded' })
        .mockResolvedValueOnce({ ...CANDIDATE, isCurrent: true, status: 'homologated' });

      await service.homologateRecord('rec1', 'admin1');

      // Desactiva el record anterior
      expect(txMock.record.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec0' },
          data: expect.objectContaining({ isCurrent: false, status: 'superseded' }),
        }),
      );
      // Activa el nuevo
      expect(txMock.record.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec1' },
          data: expect.objectContaining({ isCurrent: true, status: 'homologated' }),
        }),
      );
    });

    it('lanza NotFoundException si el candidato no existe', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(null);
      await expect(service.homologateRecord('noop', 'admin1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el récord no está en pending_homologation', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...CANDIDATE, status: 'homologated' });
      await expect(service.homologateRecord('rec1', 'admin1')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si se intenta homologar un récord nacional', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...CANDIDATE, scope: 'nacional' });
      await expect(service.homologateRecord('rec1', 'admin1')).rejects.toThrow(BadRequestException);
    });

    it('homologa como primer récord cuando no hay vigente anterior', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      txMock.record.findFirst.mockResolvedValue(null); // no hay récord vigente anterior
      txMock.record.update.mockResolvedValue({ ...CANDIDATE, isCurrent: true, status: 'homologated' });

      await service.homologateRecord('rec1', 'admin1');

      // No debe intentar desactivar un récord anterior
      expect(txMock.record.update).toHaveBeenCalledTimes(1);
      expect(txMock.record.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec1' },
          data: expect.objectContaining({ isCurrent: true, status: 'homologated' }),
        }),
      );
    });

    it('25m y 50m son claves independientes — busca el vigente por la clave correcta', async () => {
      const candidate25 = { ...CANDIDATE, poolLength: 'P25' as const };
      mockPrisma.record.findUnique.mockResolvedValue(candidate25);
      txMock.record.findFirst.mockResolvedValue(null);
      txMock.record.update.mockResolvedValue({ ...candidate25, isCurrent: true, status: 'homologated' });

      await service.homologateRecord('rec1', 'admin1');

      expect(txMock.record.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ poolLength: 'P25' }),
        }),
      );
    });

    it('un único is_current por clave tras homologar', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      txMock.record.findFirst.mockResolvedValue(CURRENT_RECORD);
      txMock.record.update
        .mockResolvedValueOnce({ ...CURRENT_RECORD, isCurrent: false, status: 'superseded' })
        .mockResolvedValueOnce({ ...CANDIDATE, isCurrent: true, status: 'homologated' });

      await service.homologateRecord('rec1', 'admin1');

      // Se llama exactamente 2 veces: una para superseded, una para homologated
      expect(txMock.record.update).toHaveBeenCalledTimes(2);
    });

    it('rechaza si el candidato ya no mejora al vigente (no pisa un récord más rápido)', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE); // 54000
      txMock.record.findFirst.mockResolvedValue({ ...CURRENT_RECORD, timeMs: 53000 });

      await expect(service.homologateRecord('rec1', 'admin1')).rejects.toThrow(BadRequestException);
      expect(txMock.record.update).not.toHaveBeenCalled();
      expect(txMock.result.update).not.toHaveBeenCalled();
    });

    it('rechaza si el candidato iguala al vigente', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      txMock.record.findFirst.mockResolvedValue({ ...CURRENT_RECORD, timeMs: CANDIDATE.timeMs });

      await expect(service.homologateRecord('rec1', 'admin1')).rejects.toThrow(BadRequestException);
      expect(txMock.record.update).not.toHaveBeenCalled();
    });

    it('marca result.isRecord recién al aprobar y encadena al vigente real', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...CANDIDATE, previousRecordId: 'rec-viejo' });
      txMock.record.findFirst.mockResolvedValue(CURRENT_RECORD);
      txMock.record.update.mockResolvedValue({});

      await service.homologateRecord('rec1', 'admin1');

      expect(txMock.result.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isRecord: true } });
      expect(txMock.record.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec1' },
          data: expect.objectContaining({ previousRecordId: 'rec0', homologatedBy: 'admin1' }),
        }),
      );
    });

    it.each([
      ['el resultado fue borrado', null],
      ['el resultado no está homologado', { homologated: false, status: 'OK' }],
    ])('rechaza un candidato huérfano: %s', async (_label, source) => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      txMock.result.findUnique.mockResolvedValue(source);
      txMock.record.findFirst.mockResolvedValue(null);

      await expect(service.homologateRecord('rec1', 'admin1')).rejects.toThrow(BadRequestException);
      expect(txMock.record.update).not.toHaveBeenCalled();
    });

    it('audita la homologación con el Admin que la aprobó', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      txMock.record.findFirst.mockResolvedValue(CURRENT_RECORD);
      txMock.record.update.mockResolvedValue({});

      await service.homologateRecord('rec1', 'admin1');

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin1',
          action: 'RECORD_HOMOLOGATED',
          entityType: 'Record',
          entityId: 'rec1',
          payload: expect.objectContaining({ supersededRecordId: 'rec0', timeMs: 54000 }),
        }),
      });
    });
  });

  // ─── revertRecord ───────────────────────────────────────────────────────────

  describe('revertRecord (volver al récord anterior)', () => {
    const WRONG = {
      ...CANDIDATE, id: 'rec-malo', status: 'homologated' as const, isCurrent: true, previousRecordId: 'rec0',
      tournamentName: 'Torneo X', homologatedBy: null, homologatedAt: new Date('2026-06-01'),
    };
    const PREVIOUS = { ...CURRENT_RECORD, isCurrent: false, status: 'superseded' as const };

    it('elimina el récord erróneo y el anterior vuelve a ser el vigente', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(WRONG);
      txMock.record.findUnique.mockResolvedValue(PREVIOUS);

      const result = await service.revertRecord('rec-malo', 'admin1', 'tiempo mal cargado');

      expect(txMock.record.delete).toHaveBeenCalledWith({ where: { id: 'rec-malo' } });
      expect(txMock.record.update).toHaveBeenCalledWith({
        where: { id: 'rec0' },
        data: { isCurrent: true, status: 'homologated' },
      });
      // Se borra antes de reactivar: nunca hay dos vigentes para la misma clave
      expect(txMock.record.delete.mock.invocationCallOrder[0]).toBeLessThan(
        txMock.record.update.mock.invocationCallOrder[0] ?? 0,
      );
      expect(result).toEqual({ id: 'rec-malo', reverted: true, restoredRecordId: 'rec0' });
    });

    it('el resultado deja de figurar como récord', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(WRONG);
      txMock.record.findUnique.mockResolvedValue(PREVIOUS);
      await service.revertRecord('rec-malo', 'admin1');
      expect(txMock.result.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { isRecord: false } });
    });

    it('deja en auditoría quién lo deshizo, el motivo y una copia completa del récord eliminado', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(WRONG);
      txMock.record.findUnique.mockResolvedValue(PREVIOUS);

      await service.revertRecord('rec-malo', 'admin1', 'tiempo mal cargado');

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin1',
          action: 'RECORD_REVERTED',
          entityId: 'rec-malo',
          payload: expect.objectContaining({
            reason: 'tiempo mal cargado',
            restoredRecordId: 'rec0',
            removed: expect.objectContaining({ timeMs: 54000, swimmerId: 's1', sourceResultId: 'r1' }),
          }),
        }),
      });
    });

    it('si era el primer récord de esa prueba, se elimina y no queda ninguno vigente', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...WRONG, previousRecordId: null });

      const result = await service.revertRecord('rec-malo', 'admin1');

      expect(txMock.record.delete).toHaveBeenCalled();
      expect(txMock.record.update).not.toHaveBeenCalled();
      expect(result.restoredRecordId).toBeNull();
    });

    it('un récord histórico sin anterior ni resultado de origen no se puede volver atrás', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...WRONG, previousRecordId: null, sourceResultId: null });
      await expect(service.revertRecord('rec-malo', 'admin1')).rejects.toThrow(/no tiene uno anterior/);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('no reactiva un "anterior" de otra pileta o categoría', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(WRONG);
      txMock.record.findUnique.mockResolvedValue({ ...PREVIOUS, poolLength: 'P50' });

      await expect(service.revertRecord('rec-malo', 'admin1')).rejects.toThrow(BadRequestException);
      expect(txMock.record.delete).not.toHaveBeenCalled();
    });

    it('solo se puede volver atrás el récord vigente; los nacionales no se tocan', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...WRONG, isCurrent: false, status: 'superseded' });
      await expect(service.revertRecord('rec-malo', 'admin1')).rejects.toThrow(/vigente/);

      mockPrisma.record.findUnique.mockResolvedValue({ ...WRONG, scope: 'nacional' });
      await expect(service.revertRecord('rec-malo', 'admin1')).rejects.toThrow(/nacionales/);

      mockPrisma.record.findUnique.mockResolvedValue(null);
      await expect(service.revertRecord('noop', 'admin1')).rejects.toThrow(NotFoundException);
      expect(txMock.record.delete).not.toHaveBeenCalled();
    });
  });

  // ─── rejectCandidate ────────────────────────────────────────────────────────

  describe('rejectCandidate', () => {
    it('elimina el candidato y deja copia en audit_logs', async () => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...CANDIDATE, tournamentName: 'Torneo X' });

      await service.rejectCandidate('rec1', 'admin1', 'cruce de género');

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin1',
          action: 'RECORD_CANDIDATE_REJECTED',
          entityId: 'rec1',
          payload: expect.objectContaining({
            reason: 'cruce de género',
            candidate: expect.objectContaining({ timeMs: 54000, swimmerId: 's1', sourceResultId: 'r1' }),
          }),
        }),
      });
      expect(txMock.record.delete).toHaveBeenCalledWith({ where: { id: 'rec1' } });
    });

    it('no toca el récord vigente ni ningún resultado', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(CANDIDATE);
      await service.rejectCandidate('rec1', 'admin1');
      expect(txMock.record.update).not.toHaveBeenCalled();
      expect(txMock.result.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.record.findUnique.mockResolvedValue(null);
      await expect(service.rejectCandidate('noop', 'admin1')).rejects.toThrow(NotFoundException);
    });

    it.each(['homologated', 'superseded'] as const)('nunca borra un récord %s', async (status) => {
      mockPrisma.record.findUnique.mockResolvedValue({ ...CANDIDATE, status });
      await expect(service.rejectCandidate('rec1', 'admin1')).rejects.toThrow(BadRequestException);
      expect(txMock.record.delete).not.toHaveBeenCalled();
    });
  });
});
