import { HomologationService } from './homologation.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const makeResult = (overrides = {}) => ({
  id: 'result-1',
  swimmerId: 'swimmer-1',
  clubId: 'club-1',
  categoryId: 'cat-1',
  finalTime: 60000,
  status: 'OK',
  homologated: false,
  place: 1,
  event: {
    id: 'event-1',
    eventDefinitionId: 'evdef-1',
    eventDefinition: { gender: 'M' },
    tournament: {
      id: 'tourn-1',
      poolLength: 'P25',
      seasonId: 'season-1',
      startDate: new Date('2026-05-01'),
      status: 'finalizado',
    },
  },
  ...overrides,
});

const makeTournament = (results = [makeResult()]) => ({
  id: 'tourn-1',
  status: 'finalizado',
  poolLength: 'P25',
  seasonId: 'season-1',
  startDate: new Date('2026-05-01'),
  events: [
    {
      id: 'event-1',
      results,
    },
  ],
  season: { id: 'season-1' },
});

const makeQueue = () => ({ add: jest.fn().mockResolvedValue({}) });

const makePrisma = (tournament = makeTournament()) => ({
  tournament: {
    findUnique: jest.fn().mockResolvedValue(tournament),
    update: jest.fn().mockResolvedValue({}),
  },
  result: {
    findUnique: jest.fn().mockResolvedValue(makeResult()),
    update: jest.fn().mockResolvedValue({}),
  },
});

describe('HomologationService', () => {
  describe('homologateTournament', () => {
    it('lanza NotFoundException si el torneo no existe', async () => {
      const prisma = makePrisma();
      (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      await expect(service.homologateTournament('xxx', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el torneo está en estado programado', async () => {
      const tournament = { ...makeTournament(), status: 'programado' };
      const prisma = makePrisma(tournament);
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      await expect(service.homologateTournament('tourn-1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('homologa todos los resultados OK y encola jobs', async () => {
      const prisma = makePrisma();
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      const result = await service.homologateTournament('tourn-1', 'admin-1');
      expect(result.homologated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(prisma.result.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'result-1' }, data: expect.objectContaining({ homologated: true }) }),
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('saltea resultados ya homologados', async () => {
      const tournament = makeTournament([makeResult({ homologated: true })]);
      const prisma = makePrisma(tournament);
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      const result = await service.homologateTournament('tourn-1', 'admin-1');
      expect(result.homologated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('es idempotente — segunda llamada no vuelve a homologar', async () => {
      // Primera pasada: todo ya homologado
      const tournament = makeTournament([makeResult({ homologated: true })]);
      const prisma = makePrisma(tournament);
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      const r1 = await service.homologateTournament('tourn-1', 'admin-1');
      const r2 = await service.homologateTournament('tourn-1', 'admin-1');
      expect(r1.homologated).toBe(0);
      expect(r2.homologated).toBe(0);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('homologateResult', () => {
    it('lanza NotFoundException si el resultado no existe', async () => {
      const prisma = makePrisma();
      (prisma.result.findUnique as jest.Mock).mockResolvedValue(null);
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      await expect(service.homologateResult('xxx', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el resultado no es OK', async () => {
      const prisma = makePrisma();
      (prisma.result.findUnique as jest.Mock).mockResolvedValue(makeResult({ status: 'DSQ' }));
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      await expect(service.homologateResult('result-1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si ya está homologado', async () => {
      const prisma = makePrisma();
      (prisma.result.findUnique as jest.Mock).mockResolvedValue(makeResult({ homologated: true }));
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      await expect(service.homologateResult('result-1', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('homologa y encola el job', async () => {
      const prisma = makePrisma();
      const queue = makeQueue();
      const service = new HomologationService(prisma as never, queue as never);
      await service.homologateResult('result-1', 'admin-1');
      expect(prisma.result.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ homologated: true }) }),
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });
});
