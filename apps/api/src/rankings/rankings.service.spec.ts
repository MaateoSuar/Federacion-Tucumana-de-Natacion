import { Test, TestingModule } from '@nestjs/testing';
import { RankingsService, RankingEntry, ClubRankingEntry } from './rankings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventRankingQueryDto, RankingMode } from './dto/event-ranking-query.dto';
import { ClubRankingQueryDto } from './dto/club-ranking-query.dto';

const mockPrisma = {
  ranking: { findMany: jest.fn() },
  result: { findMany: jest.fn() },
  club: { findMany: jest.fn() },
  scoringScheme: { findFirst: jest.fn() },
  record: { findMany: jest.fn() },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPattern: jest.fn().mockResolvedValue(undefined),
};

describe('RankingsService', () => {
  let service: RankingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    service = module.get<RankingsService>(RankingsService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  describe('queryEventRanking — best_per_swimmer', () => {
    it('devuelve resultados ordenados por posición', async () => {
      const dto: EventRankingQueryDto = {
        eventDefinitionId: 'evt1',
        poolLength: 'P25',
        gender: 'M',
        categoryId: 'cat1',
        mode: RankingMode.BEST_PER_SWIMMER,
      };

      mockPrisma.ranking.findMany.mockResolvedValue([
        { position: 1, swimmerId: 's1', clubId: 'c1', finalTime: 55000, sourceResultId: 'r1', computedAt: new Date(), swimmer: { id: 's1', firstName: 'Juan', lastName: 'Pérez' } },
        { position: 2, swimmerId: 's2', clubId: 'c2', finalTime: 56000, sourceResultId: 'r2', computedAt: new Date(), swimmer: { id: 's2', firstName: 'Pedro', lastName: 'López' } },
      ]);
      mockPrisma.club.findMany.mockResolvedValue([
        { id: 'c1', name: 'Club A' },
        { id: 'c2', name: 'Club B' },
      ]);

      const result = await service.queryEventRanking(dto);

      expect(result).toHaveLength(2);
      expect(result[0]!.position).toBe(1);
      expect(result[0]!.finalTime).toBe(55000);
      expect(result[1]!.position).toBe(2);
      expect(result[1]!.finalTime).toBe(56000);
    });

    it('sirve desde cache en la segunda llamada', async () => {
      const dto: EventRankingQueryDto = {
        eventDefinitionId: 'evt1',
        poolLength: 'P25',
        gender: 'M',
        categoryId: 'cat1',
        mode: RankingMode.BEST_PER_SWIMMER,
      };
      const cached: RankingEntry[] = [{ position: 1, swimmerId: 's1', swimmerName: 'Juan Pérez', clubId: 'c1', clubName: 'Club A', finalTime: 55000, sourceResultId: 'r1' }];
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.queryEventRanking(dto);

      expect(result).toEqual(cached);
      expect(mockPrisma.ranking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('queryEventRanking — all_performances', () => {
    it('devuelve todas las performances ordenadas por tiempo', async () => {
      const dto: EventRankingQueryDto = {
        eventDefinitionId: 'evt1',
        poolLength: 'P25',
        gender: 'M',
        categoryId: 'cat1',
        mode: RankingMode.ALL_PERFORMANCES,
      };

      // Mock devuelve ya ordenado por tiempo (Prisma aplica orderBy: { finalTime: 'asc' })
      mockPrisma.result.findMany.mockResolvedValue([
        { id: 'r1', swimmerId: 's1', clubId: 'c1', finalTime: 55000, swimmer: { id: 's1', firstName: 'Juan', lastName: 'Pérez' } },
        { id: 'r3', swimmerId: 's2', clubId: 'c2', finalTime: 56000, swimmer: { id: 's2', firstName: 'Pedro', lastName: 'López' } },
        { id: 'r2', swimmerId: 's1', clubId: 'c1', finalTime: 57000, swimmer: { id: 's1', firstName: 'Juan', lastName: 'Pérez' } },
      ]);
      mockPrisma.club.findMany.mockResolvedValue([
        { id: 'c1', name: 'Club A' },
        { id: 'c2', name: 'Club B' },
      ]);

      const result = await service.queryEventRanking(dto);

      expect(result).toHaveLength(3);
      // Múltiples performances del mismo nadador están permitidas en all_performances
      expect(result.filter((r) => r.swimmerId === 's1')).toHaveLength(2);
      // Ordenados por tiempo (la query de DB ya devuelve ordenado)
      expect(result[0]!.finalTime).toBe(55000);
      expect(result[2]!.finalTime).toBe(57000);
    });
  });

  describe('queryClubRanking', () => {
    it('calcula puntos FINA correctamente por posición', async () => {
      const dto: ClubRankingQueryDto = { scope: 'provincial' };

      mockPrisma.scoringScheme.findFirst.mockResolvedValue({
        config: { points: [9, 7, 6, 5, 4, 3, 2, 1] },
      });
      mockPrisma.ranking.findMany.mockResolvedValue([
        { clubId: 'c1', position: 1 }, // 9 pts, oro
        { clubId: 'c2', position: 2 }, // 7 pts, plata
        { clubId: 'c1', position: 3 }, // 6 pts, bronce
        { clubId: 'c2', position: 1 }, // 9 pts, oro
      ]);
      mockPrisma.record.findMany.mockResolvedValue([
        { clubId: 'c1' },
        { clubId: 'c1' },
      ]);
      mockPrisma.result.findMany.mockResolvedValue([
        { clubId: 'c1', swimmerId: 's1' },
        { clubId: 'c1', swimmerId: 's2' },
        { clubId: 'c2', swimmerId: 's3' },
      ]);
      mockPrisma.club.findMany.mockResolvedValue([
        { id: 'c1', name: 'Club A' },
        { id: 'c2', name: 'Club B' },
      ]);

      const result = await service.queryClubRanking(dto);

      // c1: 9 + 6 = 15 pts; c2: 7 + 9 = 16 pts → c2 primero
      const c2 = result.find((e) => e.clubId === 'c2')!;
      const c1 = result.find((e) => e.clubId === 'c1')!;
      expect(c2.points).toBe(16);
      expect(c1.points).toBe(15);
      expect(c2.position).toBe(1);
      expect(c1.position).toBe(2);
      // Récords y nadadores activos
      expect(c1.currentRecords).toBe(2);
      expect(c1.activeSwimmers).toBe(2);
      expect(c2.activeSwimmers).toBe(1);
    });

    it('ordena por medallas cuando hay empate en puntos', async () => {
      const dto: ClubRankingQueryDto = { scope: 'provincial' };

      mockPrisma.scoringScheme.findFirst.mockResolvedValue({
        config: { points: [9, 7, 6, 5, 4, 3, 2, 1] },
      });
      // c1 y c2 empatan en puntos (9 cada uno), c1 tiene 1 oro, c2 tiene 1 oro → desempate plata
      mockPrisma.ranking.findMany.mockResolvedValue([
        { clubId: 'c1', position: 1 }, // 9 pts, 1 oro
        { clubId: 'c2', position: 1 }, // 9 pts, 1 oro
      ]);
      mockPrisma.record.findMany.mockResolvedValue([]);
      mockPrisma.result.findMany.mockResolvedValue([]);
      mockPrisma.club.findMany.mockResolvedValue([
        { id: 'c1', name: 'Club A' },
        { id: 'c2', name: 'Club B' },
      ]);

      const result = await service.queryClubRanking(dto);

      // Empate total — ambos con 9 pts, 1 oro, el primero en el mapa gana el #1
      expect(result).toHaveLength(2);
      const positions = result.map((e) => e.position).sort();
      expect(positions).toEqual([1, 2]);
    });

    it('sirve desde cache en la segunda llamada', async () => {
      const dto: ClubRankingQueryDto = {};
      const cached: ClubRankingEntry[] = [{ position: 1, clubId: 'c1', clubName: 'Club A', points: 15, gold: 1, silver: 0, bronze: 1, activeSwimmers: 2, currentRecords: 0 }];
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.queryClubRanking(dto);

      expect(result).toEqual(cached);
      expect(mockPrisma.ranking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('invalidateEventCache', () => {
    it('elimina las claves de cache correctas', async () => {
      await service.invalidateEventCache('evt1', 'P25', 'M', 'provincial', 'season1', 'cat1');

      expect(mockRedis.del).toHaveBeenCalledWith('ranking:event:evt1:P25:M:provincial:season1:cat1');
      expect(mockRedis.del).toHaveBeenCalledWith('ranking:event:evt1:P25:M:provincial:season1:cat1:all');
    });
  });
});
