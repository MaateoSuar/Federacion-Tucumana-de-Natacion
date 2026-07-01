import { Test, TestingModule } from '@nestjs/testing';
import { RankingsService, RankingEntry, ClubRankingEntry } from './rankings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventRankingQueryDto } from './dto/event-ranking-query.dto';
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

  describe('queryEventRanking', () => {
    it('devuelve resultados ordenados por posición, con la categoría de cada fila', async () => {
      const dto: EventRankingQueryDto = {
        eventDefinitionId: 'evt1',
        poolLength: 'P25',
        gender: 'M',
        categoryId: 'cat1',
      };

      mockPrisma.ranking.findMany.mockResolvedValue([
        { position: 1, swimmerId: 's1', clubId: 'c1', categoryId: 'cat1', finalTime: 55000, sourceResultId: 'r1', computedAt: new Date(), swimmer: { id: 's1', firstName: 'Juan', lastName: 'Pérez' }, category: { id: 'cat1', name: 'Mayores' } },
        { position: 2, swimmerId: 's2', clubId: 'c2', categoryId: 'cat1', finalTime: 56000, sourceResultId: 'r2', computedAt: new Date(), swimmer: { id: 's2', firstName: 'Pedro', lastName: 'López' }, category: { id: 'cat1', name: 'Mayores' } },
      ]);
      mockPrisma.club.findMany.mockResolvedValue([
        { id: 'c1', name: 'Club A' },
        { id: 'c2', name: 'Club B' },
      ]);

      const result = await service.queryEventRanking(dto);

      expect(result).toHaveLength(2);
      expect(result[0]!.position).toBe(1);
      expect(result[0]!.finalTime).toBe(55000);
      expect(result[0]!.categoryName).toBe('Mayores');
      expect(result[1]!.position).toBe(2);
      expect(result[1]!.finalTime).toBe(56000);
    });

    it('con varias categorías mezcladas (sin filtro), ordena por tiempo real y no comparte 1er puesto', async () => {
      const dto: EventRankingQueryDto = {
        eventDefinitionId: 'evt1',
        poolLength: 'P25',
        gender: 'M',
        // sin categoryId — "Todos"
      };

      // La tabla Ranking guarda `position` por categoría (cada uno es 1° en la suya),
      // pero el ranking combinado debe ignorar ese campo y ordenar por finalTime real.
      // Prisma ya devuelve ordenado por finalTime (orderBy: { finalTime: 'asc' }).
      mockPrisma.ranking.findMany.mockResolvedValue([
        { position: 1, swimmerId: 's3', clubId: 'c1', categoryId: 'cat-cadetes', finalTime: 24000, sourceResultId: 'r3', computedAt: new Date(), swimmer: { id: 's3', firstName: 'Ana', lastName: 'Gómez' }, category: { id: 'cat-cadetes', name: 'Cadetes' } },
        { position: 1, swimmerId: 's4', clubId: 'c2', categoryId: 'cat-absoluto', finalTime: 25000, sourceResultId: 'r4', computedAt: new Date(), swimmer: { id: 's4', firstName: 'Luis', lastName: 'Ruiz' }, category: { id: 'cat-absoluto', name: 'Absoluto' } },
        { position: 1, swimmerId: 's5', clubId: 'c1', categoryId: 'cat-mayores', finalTime: 26000, sourceResultId: 'r5', computedAt: new Date(), swimmer: { id: 's5', firstName: 'Marta', lastName: 'Díaz' }, category: { id: 'cat-mayores', name: 'Mayores' } },
      ]);
      mockPrisma.club.findMany.mockResolvedValue([
        { id: 'c1', name: 'Club A' },
        { id: 'c2', name: 'Club B' },
      ]);

      const result = await service.queryEventRanking(dto);

      expect(result).toHaveLength(3);
      // Posiciones estrictamente correlativas — nadie comparte el 1er puesto
      expect(result.map((r) => r.position)).toEqual([1, 2, 3]);
      // El más rápido (Cadetes, 24000ms) va 1°, aunque su "position" guardada
      // en la tabla también sea 1 dentro de su categoría — no determina el orden acá
      expect(result[0]!.swimmerId).toBe('s3');
      expect(result[0]!.categoryName).toBe('Cadetes');
      expect(result[1]!.swimmerId).toBe('s4');
      expect(result[2]!.swimmerId).toBe('s5');
    });

    it('sirve desde cache en la segunda llamada', async () => {
      const dto: EventRankingQueryDto = {
        eventDefinitionId: 'evt1',
        poolLength: 'P25',
        gender: 'M',
        categoryId: 'cat1',
      };
      const cached: RankingEntry[] = [{ position: 1, swimmerId: 's1', swimmerName: 'Juan Pérez', clubId: 'c1', clubName: 'Club A', categoryId: 'cat1', categoryName: 'Mayores', finalTime: 55000, sourceResultId: 'r1' }];
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.queryEventRanking(dto);

      expect(result).toEqual(cached);
      expect(mockPrisma.ranking.findMany).not.toHaveBeenCalled();
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
    });
  });
});
