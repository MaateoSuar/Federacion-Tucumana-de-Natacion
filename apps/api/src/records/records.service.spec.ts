import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecordsService } from './records.service';
import { PrismaService } from '../prisma/prisma.service';

const txMock = {
  record: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
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
  });
});
