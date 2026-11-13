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
  timeStandard: { findMany: jest.fn() },
  season: { findUnique: jest.fn() },
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
    mockPrisma.timeStandard.findMany.mockResolvedValue([]);
    mockPrisma.result.findMany.mockResolvedValue([]);
    mockPrisma.record.findMany.mockResolvedValue([]);
  });

  // ─── Ranking por prueba ─────────────────────────────────────────────────────
  // Todos los nadadores, una vez cada uno, con su mejor tiempo del período.

  /** Resultado homologado de torneo, con su categoría y club congelados. */
  const res = (swimmerId: string, categoryId: string, finalTime: number, date = '2026-05-10', clubId = 'c1') => ({
    id: `r-${swimmerId}-${finalTime}`,
    swimmerId,
    clubId,
    categoryId,
    finalTime,
    swimmer: { firstName: 'N', lastName: swimmerId },
    club: { name: `Club ${clubId}` },
    category: { name: categoryId, code: categoryId },
    event: { tournament: { startDate: new Date(`${date}T00:00:00.000Z`) } },
  });
  /** Récord oficial (posiblemente histórico, sin resultado cargado). */
  const rec = (swimmerId: string, categoryId: string, timeMs: number, date = '2019-03-01', sourceResultId: string | null = null) => ({
    swimmerId,
    clubId: 'c9',
    categoryId,
    timeMs,
    recordDate: new Date(`${date}T00:00:00.000Z`),
    sourceResultId,
    swimmer: { firstName: 'N', lastName: swimmerId },
    club: { name: 'Club c9' },
    category: { name: categoryId, code: categoryId },
  });
  const base: EventRankingQueryDto = { eventDefinitionId: 'evt1', poolLength: 'P25', gender: 'F' };

  describe('queryEventRanking', () => {
    it('cada nadador aparece UNA sola vez, con su mejor tiempo', async () => {
      mockPrisma.result.findMany.mockResolvedValue([
        res('s1', 'MEN_1', 35000, '2026-03-01'),
        res('s1', 'MEN_1', 33000, '2026-05-01'),
        res('s1', 'MEN_1', 34000, '2026-08-01'),
        res('s2', 'MEN_1', 33500),
      ]);

      const result = await service.queryEventRanking(base);

      expect(result.map((r) => [r.position, r.swimmerId, r.finalTime])).toEqual([
        [1, 's1', 33000],
        [2, 's2', 33500],
      ]);
      expect(result[0]?.achievedAt).toBe('2026-05-01T00:00:00.000Z');
    });

    it('lista a TODOS los nadadores de todas las categorías, ordenados por tiempo', async () => {
      mockPrisma.result.findMany.mockResolvedValue([
        res('s3', 'MAY', 26000),
        res('s1', 'CAD_1', 24000),
        res('s4', 'MEN_1', 31000),
        res('s2', 'CAD_1', 25000),
      ]);

      const result = await service.queryEventRanking(base);

      expect(result.map((r) => r.swimmerId)).toEqual(['s1', 's2', 's3', 's4']);
      expect(result.map((r) => r.position)).toEqual([1, 2, 3, 4]);
      expect(result.map((r) => r.categoryName)).toEqual(['CAD_1', 'CAD_1', 'MAY', 'MEN_1']);
    });

    it('la categoría y el club mostrados son los congelados del resultado del mejor tiempo', async () => {
      mockPrisma.result.findMany.mockResolvedValue([
        res('s1', 'MEN_2', 34000, '2026-03-01', 'club-viejo'),
        res('s1', 'CAD_1', 32000, '2026-10-01', 'club-nuevo'),
      ]);

      const [row] = await service.queryEventRanking(base);

      expect(row).toMatchObject({ categoryId: 'CAD_1', clubId: 'club-nuevo', clubName: 'Club club-nuevo', finalTime: 32000 });
    });

    it('solo resultados homologados, en estado OK, de la pileta y prueba pedidas', async () => {
      await service.queryEventRanking({ ...base, poolLength: 'P50' });

      expect(mockPrisma.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            homologated: true,
            status: 'OK',
            finalTime: { not: null },
            event: expect.objectContaining({
              eventDefinitionId: 'evt1',
              tournament: expect.objectContaining({ poolLength: 'P50', scope: 'provincial' }),
            }),
          }),
        }),
      );
      // Los récords también se buscan solo para esa pileta: 25 m y 50 m no se cruzan
      expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ poolLength: 'P50', gender: 'F' }) }),
      );
    });

    it('exige el género en la prueba y en el nadador (no entra un resultado del otro género)', async () => {
      await service.queryEventRanking(base);

      const where = mockPrisma.result.findMany.mock.calls[0][0].where;
      expect(where.swimmer).toEqual({ gender: 'F' });
      expect(where.event.eventDefinition).toEqual({ gender: 'F' });
    });

    it('rechaza fechas que no existen', async () => {
      await expect(service.queryEventRanking({ ...base, from: '2026-13-45' })).rejects.toThrow(/no existe/);
      expect(mockPrisma.result.findMany).not.toHaveBeenCalled();
    });

    it('filtro de categoría: cuenta solo lo nadado en esa categoría', async () => {
      await service.queryEventRanking({ ...base, categoryId: 'CAD_1' });

      expect(mockPrisma.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoryId: 'CAD_1' }) }),
      );
      expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoryId: 'CAD_1' }) }),
      );
    });

    describe('recordistas históricos', () => {
      it('un recordista sin resultados cargados entra al ranking con la fecha de su récord', async () => {
        mockPrisma.result.findMany.mockResolvedValue([res('s1', 'MAY', 26000)]);
        mockPrisma.record.findMany.mockResolvedValue([rec('historico', 'MAY', 24000, '2015-06-01')]);

        const result = await service.queryEventRanking(base);

        expect(result.map((r) => r.swimmerId)).toEqual(['historico', 's1']);
        expect(result[0]).toMatchObject({ finalTime: 24000, sourceResultId: null, achievedAt: '2015-06-01T00:00:00.000Z' });
      });

      it('solo cuentan récords homologados (vigentes o superados), nunca candidatos pendientes', async () => {
        await service.queryEventRanking(base);

        expect(mockPrisma.record.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: { in: ['homologated', 'superseded'] } }),
          }),
        );
      });

      it('el mismo récord en su categoría y en Absoluto no duplica al nadador y muestra la categoría específica', async () => {
        mockPrisma.record.findMany.mockResolvedValue([rec('s1', 'ABS', 23870), rec('s1', 'MAY', 23870)]);

        const result = await service.queryEventRanking(base);

        expect(result).toHaveLength(1);
        expect(result[0]?.categoryName).toBe('MAY');
      });

      it('récord nacido de un resultado cargado: no duplica y se queda con la fila del resultado', async () => {
        const r = res('s1', 'CAD_1', 25000);
        mockPrisma.result.findMany.mockResolvedValue([r]);
        mockPrisma.record.findMany.mockResolvedValue([rec('s1', 'CAD', 25000, '2026-05-10', r.id)]);

        const result = await service.queryEventRanking(base);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ categoryId: 'CAD_1', sourceResultId: r.id });
      });
    });

    describe('período', () => {
      it('histórico: sin límite de fechas', async () => {
        await service.queryEventRanking(base);

        const resultWhere = mockPrisma.result.findMany.mock.calls[0][0].where;
        const recordWhere = mockPrisma.record.findMany.mock.calls[0][0].where;
        expect(resultWhere.event.tournament.startDate).toBeUndefined();
        expect(recordWhere.recordDate).toBeUndefined();
      });

      it('por año: usa las fechas de la temporada para torneos y récords', async () => {
        mockPrisma.season.findUnique.mockResolvedValue({
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        });

        await service.queryEventRanking({ ...base, seasonId: 'season-2026' });

        const expected = { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-12-31T23:59:59.999Z') };
        expect(mockPrisma.result.findMany.mock.calls[0][0].where.event.tournament.startDate).toEqual(expected);
        expect(mockPrisma.record.findMany.mock.calls[0][0].where.recordDate).toEqual(expected);
      });

      it('rango elegido: desde/hasta incluye el día completo de "hasta"', async () => {
        await service.queryEventRanking({ ...base, from: '2026-03-01', to: '2026-06-30' });

        const expected = { gte: new Date('2026-03-01T00:00:00.000Z'), lte: new Date('2026-06-30T23:59:59.999Z') };
        expect(mockPrisma.result.findMany.mock.calls[0][0].where.event.tournament.startDate).toEqual(expected);
        expect(mockPrisma.record.findMany.mock.calls[0][0].where.recordDate).toEqual(expected);
      });

      it('solo "desde" o solo "hasta" también valen', async () => {
        await service.queryEventRanking({ ...base, from: '2026-03-01' });
        expect(mockPrisma.result.findMany.mock.calls[0][0].where.event.tournament.startDate).toEqual({
          gte: new Date('2026-03-01T00:00:00.000Z'),
          lte: undefined,
        });
      });

      it('el rango tiene prioridad sobre la temporada', async () => {
        await service.queryEventRanking({ ...base, seasonId: 'season-2026', from: '2026-03-01', to: '2026-06-30' });
        expect(mockPrisma.season.findUnique).not.toHaveBeenCalled();
      });

      it('rechaza un rango invertido y una temporada inexistente', async () => {
        await expect(service.queryEventRanking({ ...base, from: '2026-07-01', to: '2026-06-30' })).rejects.toThrow(/inválido/);
        mockPrisma.season.findUnique.mockResolvedValue(null);
        await expect(service.queryEventRanking({ ...base, seasonId: 'nope' })).rejects.toThrow(/inexistente/);
      });

      it('cada período se cachea por separado', async () => {
        await service.queryEventRanking(base);
        await service.queryEventRanking({ ...base, from: '2026-03-01', to: '2026-06-30' });

        const keys = (mockRedis.set.mock.calls as Array<[string]>).map(([k]) => k);
        expect(new Set(keys).size).toBe(2);
      });
    });

    it('sirve desde cache en la segunda llamada', async () => {
      const cached: RankingEntry[] = [{ position: 1, swimmerId: 's1', swimmerName: 'Juan Pérez', clubId: 'c1', clubName: 'Club A', categoryId: 'cat1', categoryName: 'Mayores', finalTime: 55000, sourceResultId: 'r1', meets: [] }];
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.queryEventRanking({ ...base, categoryId: 'cat1' });

      expect(result).toEqual(cached);
      expect(mockPrisma.result.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── Marcas básicas (P-1) ───────────────────────────────────────────────────

  describe('marcas básicas en el ranking por prueba', () => {
    const std = (setId: string, code: string, orderNo: number, categoryId: string, timeMs: number) => ({
      setId, categoryId, timeMs,
      set: { id: setId, code, name: `Básica ${code}`, shortLabel: code.slice(0, 3), color: 'sky', orderNo },
    });

    it('cumple quien tiene tiempo MENOR O IGUAL a la marca de su categoría', async () => {
      mockPrisma.result.findMany.mockResolvedValue([res('s1', 'MEN_1', 33000), res('s2', 'MEN_1', 34000), res('s3', 'MEN_1', 34010)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([std('nac', 'NACIONAL', 1, 'MEN_1', 34000)]);

      const result = await service.queryEventRanking({ ...base, categoryId: 'MEN_1' });

      expect(result.map((r) => r.meets)).toEqual([['nac'], ['nac'], []]);
    });

    it('cada fila se compara con la marca de SU categoría congelada, no con la de otra', async () => {
      // Misma marca de tiempo: alcanza para Menores 1 (34000) pero no para Cadetes 1 (30410).
      mockPrisma.result.findMany.mockResolvedValue([res('s1', 'CAD_1', 32000), res('s2', 'MEN_1', 32000)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([
        std('nac', 'NACIONAL', 1, 'MEN_1', 34000),
        std('nac', 'NACIONAL', 1, 'CAD_1', 30410),
      ]);

      const result = await service.queryEventRanking(base);

      expect(result.find((r) => r.swimmerId === 's1')?.meets).toEqual([]);
      expect(result.find((r) => r.swimmerId === 's2')?.meets).toEqual(['nac']);
    });

    it('una categoría sin marca (Absoluto, agrupadas) no cumple ni incumple nada', async () => {
      mockPrisma.record.findMany.mockResolvedValue([rec('s1', 'ABS', 20000)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([std('nac', 'NACIONAL', 1, 'MEN_1', 34000)]);

      const result = await service.queryEventRanking(base);

      expect(result[0]?.meets).toEqual([]);
    });

    it('una fila que viene de la tabla de récords no lleva marcas básicas, aunque el tiempo las cumpla', async () => {
      mockPrisma.result.findMany.mockResolvedValue([res('s2', 'MAY', 28000)]);
      mockPrisma.record.findMany.mockResolvedValue([rec('recordista', 'MAY', 23870)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([std('nac', 'NACIONAL', 1, 'MAY', 29000)]);

      const result = await service.queryEventRanking(base);

      expect(result.find((r) => r.swimmerId === 'recordista')?.meets).toEqual([]);
      expect(result.find((r) => r.swimmerId === 's2')?.meets).toEqual(['nac']);
      // Y tampoco cuenta en el total de quienes cumplen
      const [set] = await service.queryEventStandards(base);
      expect(set?.qualifiedCount).toBe(1);
    });

    it('25 m y 50 m no se cruzan: las marcas se buscan solo para la pileta del ranking', async () => {
      await service.queryEventRanking({ ...base, poolLength: 'P50' });

      expect(mockPrisma.timeStandard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eventDefinitionId: 'evt1', poolLength: 'P50', gender: 'F', set: { isActive: true } }),
        }),
      );
    });

    it('varios sets: cada uno se evalúa por separado', async () => {
      mockPrisma.result.findMany.mockResolvedValue([res('s1', 'MEN_1', 33000), res('s2', 'MEN_1', 36000), res('s3', 'MEN_1', 40000)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([
        std('nac', 'NACIONAL', 1, 'MEN_1', 34000),
        std('fed', 'FEDERARSE', 2, 'MEN_1', 37500),
      ]);

      const result = await service.queryEventRanking({ ...base, categoryId: 'MEN_1' });

      expect(result.map((r) => r.meets)).toEqual([['nac', 'fed'], ['fed'], []]);
    });

    it('queryEventStandards: con categoría devuelve la marca y cuántos la cumplen', async () => {
      mockPrisma.result.findMany.mockResolvedValue([res('s1', 'MEN_1', 33000), res('s2', 'MEN_1', 36000), res('s3', 'MEN_1', 40000)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([
        std('nac', 'NACIONAL', 1, 'MEN_1', 34000),
        std('fed', 'FEDERARSE', 2, 'MEN_1', 37500),
      ]);

      const result = await service.queryEventStandards({ ...base, categoryId: 'MEN_1' });

      expect(result).toEqual([
        expect.objectContaining({ setId: 'nac', code: 'NACIONAL', timeMs: 34000, qualifiedCount: 1 }),
        expect.objectContaining({ setId: 'fed', code: 'FEDERARSE', timeMs: 37500, qualifiedCount: 2 }),
      ]);
    });

    it('queryEventStandards: sin categoría no hay una marca única (timeMs null), pero sí el conteo', async () => {
      mockPrisma.result.findMany.mockResolvedValue([res('s1', 'CAD_1', 30000), res('s2', 'MEN_1', 32000)]);
      mockPrisma.timeStandard.findMany.mockResolvedValue([
        std('nac', 'NACIONAL', 1, 'MEN_1', 34000),
        std('nac', 'NACIONAL', 1, 'CAD_1', 30410),
      ]);

      const result = await service.queryEventStandards(base);

      expect(result).toEqual([expect.objectContaining({ setId: 'nac', timeMs: null, qualifiedCount: 2 })]);
    });

    it('relevos mixtos: no se consultan marcas', async () => {
      await service.queryEventRanking({ ...base, gender: 'MIX' });
      expect(mockPrisma.timeStandard.findMany).not.toHaveBeenCalled();
    });
  });

  describe('queryStandardsTable', () => {
    const row = (setId: string, purpose: string, code: string, minAge: number | null, maxAge: number | null, timeMs: number, scope = 'provincial') => ({
      setId, gender: 'F', timeMs,
      set: { id: setId, code: setId.toUpperCase(), name: setId, shortLabel: setId.slice(0, 3).toUpperCase(), color: 'sky', purpose, orderNo: 1 },
      category: { code, minAge, maxAge, scope },
      eventDefinition: { stroke: 'libre', distance: 50 },
    });

    it('devuelve los sets y las marcas por rango de edad, solo de la pileta pedida', async () => {
      mockPrisma.timeStandard.findMany.mockResolvedValue([
        row('nac', 'nacional', 'MEN_1', 12, 12, 34000),
        row('fed', 'federacion', 'MEN_1', 12, 12, 37500),
        row('nac', 'nacional', 'MAY', 19, null, 29000),
      ]);

      const table = await service.queryStandardsTable('P25');

      expect(mockPrisma.timeStandard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ poolLength: 'P25', set: { isActive: true }, category: { scope: 'provincial' } }),
        }),
      );
      expect(table.poolLength).toBe('P25');
      expect(table.sets.map((s) => [s.setId, s.purpose])).toEqual([['nac', 'nacional'], ['fed', 'federacion']]);
      expect(table.standards).toEqual([
        { setId: 'nac', stroke: 'libre', distance: 50, gender: 'F', minAge: 12, maxAge: 12, timeMs: 34000 },
        { setId: 'fed', stroke: 'libre', distance: 50, gender: 'F', minAge: 12, maxAge: 12, timeMs: 37500 },
        { setId: 'nac', stroke: 'libre', distance: 50, gender: 'F', minAge: 19, maxAge: null, timeMs: 29000 },
      ]);
    });

    it('descarta categorías sin rango de edad (no se pueden ubicar por edad)', async () => {
      mockPrisma.timeStandard.findMany.mockResolvedValue([row('nac', 'nacional', 'ABS', null, null, 25000)]);
      const table = await service.queryStandardsTable('P50');
      expect(table.standards).toEqual([]);
    });
  });

  describe('queryClubRanking', () => {
    it('calcula puntos por puesto real de cada resultado homologado (no por mejor marca histórica)', async () => {
      const dto: ClubRankingQueryDto = { scope: 'provincial' };

      mockPrisma.scoringScheme.findFirst.mockResolvedValue({
        config: { points: [9, 7, 6, 5, 4, 3, 2, 1], relay_multiplier: 2 },
      });
      mockPrisma.record.findMany.mockResolvedValue([
        { clubId: 'c1' },
        { clubId: 'c1' },
      ]);
      mockPrisma.result.findMany.mockResolvedValue([
        { clubId: 'c1', swimmerId: 's1', place: 1, event: { eventDefinition: { isRelay: false } } }, // 9 pts, oro
        { clubId: 'c2', swimmerId: 's3', place: 2, event: { eventDefinition: { isRelay: false } } }, // 7 pts, plata
        { clubId: 'c1', swimmerId: 's2', place: 3, event: { eventDefinition: { isRelay: false } } }, // 6 pts, bronce
        { clubId: 'c2', swimmerId: 's3', place: 1, event: { eventDefinition: { isRelay: false } } }, // 9 pts, oro
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
      // Récords y nadadores activos (por swimmerId distinto dentro del filtro)
      expect(c1.currentRecords).toBe(2);
      expect(c1.activeSwimmers).toBe(2);
      expect(c2.activeSwimmers).toBe(1);
    });

    it('duplica los puntos en pruebas de relevo según el scoring scheme', async () => {
      const dto: ClubRankingQueryDto = { scope: 'provincial' };

      mockPrisma.scoringScheme.findFirst.mockResolvedValue({
        config: { points: [9, 7, 6, 5, 4, 3, 2, 1], relay_multiplier: 2 },
      });
      mockPrisma.record.findMany.mockResolvedValue([]);
      mockPrisma.result.findMany.mockResolvedValue([
        { clubId: 'c1', swimmerId: 's1', place: 1, event: { eventDefinition: { isRelay: true } } }, // 9*2 = 18 pts
      ]);
      mockPrisma.club.findMany.mockResolvedValue([{ id: 'c1', name: 'Club A' }]);

      const result = await service.queryClubRanking(dto);

      expect(result[0]!.points).toBe(18);
      expect(result[0]!.gold).toBe(1);
    });

    it('ordena por medallas cuando hay empate en puntos', async () => {
      const dto: ClubRankingQueryDto = { scope: 'provincial' };

      mockPrisma.scoringScheme.findFirst.mockResolvedValue({
        config: { points: [9, 7, 6, 5, 4, 3, 2, 1] },
      });
      // c1 y c2 empatan en puntos (9 cada uno), c1 tiene 1 oro, c2 tiene 1 oro → desempate plata
      mockPrisma.record.findMany.mockResolvedValue([]);
      mockPrisma.result.findMany.mockResolvedValue([
        { clubId: 'c1', swimmerId: 's1', place: 1, event: { eventDefinition: { isRelay: false } } },
        { clubId: 'c2', swimmerId: 's2', place: 1, event: { eventDefinition: { isRelay: false } } },
      ]);
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

    it('filtra por torneo puntual cuando se indica tournamentId', async () => {
      const dto: ClubRankingQueryDto = { scope: 'provincial', tournamentId: 't1' };

      mockPrisma.scoringScheme.findFirst.mockResolvedValue({
        config: { points: [9, 7, 6, 5, 4, 3, 2, 1] },
      });
      mockPrisma.record.findMany.mockResolvedValue([]);
      mockPrisma.result.findMany.mockResolvedValue([
        { clubId: 'c1', swimmerId: 's1', place: 1, event: { eventDefinition: { isRelay: false } } },
      ]);
      mockPrisma.club.findMany.mockResolvedValue([{ id: 'c1', name: 'Club A' }]);

      await service.queryClubRanking(dto);

      expect(mockPrisma.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: { tournament: { scope: 'provincial', id: 't1' } },
          }),
        }),
      );
    });

    it('sirve desde cache en la segunda llamada', async () => {
      const dto: ClubRankingQueryDto = {};
      const cached: ClubRankingEntry[] = [{ position: 1, clubId: 'c1', clubName: 'Club A', points: 15, gold: 1, silver: 0, bronze: 1, activeSwimmers: 2, currentRecords: 0 }];
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.queryClubRanking(dto);

      expect(result).toEqual(cached);
      expect(mockPrisma.result.findMany).not.toHaveBeenCalled();
    });
  });

  describe('invalidateEventCache', () => {
    it('elimina las claves de cache correctas', async () => {
      await service.invalidateEventCache('evt1', 'P25', 'M', 'provincial', 'season1', 'cat1');

      expect(mockRedis.del).toHaveBeenCalledWith('ranking:event:evt1:P25:M:provincial:season1:cat1');
    });
  });
});
