import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EventRankingQueryDto } from './dto/event-ranking-query.dto';
import { ClubRankingQueryDto } from './dto/club-ranking-query.dto';

export interface RankingEntry {
  position: number;
  swimmerId: string;
  swimmerName: string;
  clubId: string;
  clubName: string;
  categoryId: string;
  categoryName: string;
  finalTime: number;
  sourceResultId: string | null;
  /** Fecha (ISO) del torneo o del récord donde hizo ese tiempo. */
  achievedAt?: string;
  /** Ids de los sets de marcas básicas que este tiempo cumple (tiempo <= marca de SU categoría). */
  meets: string[];
}

/** Un set de marcas básicas aplicado a un ranking por prueba. */
export interface EventStandard {
  setId: string;
  code: string;
  name: string;
  shortLabel: string;
  color: string;
  /** Marca de la categoría filtrada; null si no se filtró por categoría o esa categoría no tiene marca. */
  timeMs: number | null;
  /** Cuántos nadadores del ranking mostrado cumplen la marca de su categoría. */
  qualifiedCount: number;
}

export interface ClubRankingEntry {
  position: number;
  clubId: string;
  clubName: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  activeSwimmers: number;
  currentRecords: number;
}

interface ScoringConfig {
  points: number[];
  relay_multiplier?: number;
  min_competitors?: number;
}

const CACHE_TTL = {
  EVENT_BEST: 60,
  CLUB: 120,
};

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Event Rankings ────────────────────────────────────────────────────────
  //
  // Ranking por prueba: TODOS los nadadores, una sola vez cada uno, con su mejor
  // tiempo dentro del período elegido (histórico, una temporada o un rango de
  // fechas). Se calcula en el momento desde dos fuentes:
  //   - resultados homologados de torneos (por fecha del torneo), y
  //   - récords oficiales homologados (por fecha del récord), para no perder las
  //     marcas históricas cuyos resultados no están cargados.
  // Siempre se ordena por tiempo, con posiciones 1,2,3… correlativas. La tabla
  // `rankings` (precalculada por temporada) ya no se usa para esta vista.

  async queryEventRanking(dto: EventRankingQueryDto): Promise<RankingEntry[]> {
    const key = this.cacheKeyEvent(dto);
    const cached = await this.redis.get<RankingEntry[]>(key);
    // Entradas cacheadas antes de existir `meets` se descartan y se recalculan.
    if (cached && cached.every((c) => Array.isArray(c.meets))) return cached;

    const scope = dto.scope ?? 'provincial';
    const period = await this.resolvePeriod(dto);
    const dateFilter = period ? { gte: period.from, lte: period.to } : undefined;

    // 1) Resultados homologados de torneos. La pileta es la del torneo (congelada):
    //    25 m y 50 m nunca se mezclan. Categoría y club son los congelados del resultado.
    const results = await this.prisma.result.findMany({
      where: {
        homologated: true,
        status: 'OK',
        finalTime: { not: null },
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        // El género se exige en la prueba y en el nadador: un resultado cargado en
        // la prueba del otro género no entra al ranking.
        ...(dto.gender === 'MIX' ? {} : { swimmer: { gender: dto.gender } }),
        event: {
          eventDefinitionId: dto.eventDefinitionId,
          eventDefinition: { gender: dto.gender },
          tournament: {
            poolLength: dto.poolLength,
            scope,
            ...(dateFilter ? { startDate: dateFilter } : {}),
          },
        },
      },
      select: {
        id: true,
        swimmerId: true,
        clubId: true,
        categoryId: true,
        finalTime: true,
        swimmer: { select: { firstName: true, lastName: true } },
        club: { select: { name: true } },
        category: { select: { name: true, code: true } },
        event: { select: { tournament: { select: { startDate: true } } } },
      },
    });

    // 2) Récords oficiales homologados (vigentes o ya superados): incluyen marcas
    //    históricas cuyos resultados no están cargados. Entran con la fecha del récord.
    const records = await this.prisma.record.findMany({
      where: {
        scope,
        eventDefinitionId: dto.eventDefinitionId,
        poolLength: dto.poolLength,
        gender: dto.gender,
        status: { in: ['homologated', 'superseded'] },
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dateFilter ? { recordDate: dateFilter } : {}),
      },
      select: {
        swimmerId: true,
        clubId: true,
        categoryId: true,
        timeMs: true,
        recordDate: true,
        sourceResultId: true,
        swimmer: { select: { firstName: true, lastName: true } },
        club: { select: { name: true } },
        category: { select: { name: true, code: true } },
      },
    });

    interface Candidate {
      swimmerId: string;
      swimmerName: string;
      clubId: string;
      clubName: string;
      categoryId: string;
      categoryName: string;
      categoryCode: string;
      finalTime: number;
      sourceResultId: string | null;
      achievedAt: Date;
      fromResult: boolean;
    }
    const candidates: Candidate[] = [
      ...results.map((r) => ({
        swimmerId: r.swimmerId,
        swimmerName: `${r.swimmer.firstName} ${r.swimmer.lastName}`,
        clubId: r.clubId,
        clubName: r.club.name,
        categoryId: r.categoryId,
        categoryName: r.category.name,
        categoryCode: r.category.code,
        finalTime: r.finalTime as number,
        sourceResultId: r.id,
        achievedAt: r.event.tournament.startDate,
        fromResult: true,
      })),
      ...records.map((r) => ({
        swimmerId: r.swimmerId,
        swimmerName: `${r.swimmer.firstName} ${r.swimmer.lastName}`,
        clubId: r.clubId,
        clubName: r.club.name,
        categoryId: r.categoryId,
        categoryName: r.category.name,
        categoryCode: r.category.code,
        finalTime: r.timeMs,
        sourceResultId: r.sourceResultId,
        achievedAt: r.recordDate,
        fromResult: false,
      })),
    ];

    // Un nadador aparece UNA sola vez, con su mejor tiempo del período. A igual
    // tiempo se prefiere la fila que viene de un resultado (trae la categoría fina
    // congelada), después una categoría específica antes que Absoluto, y la más antigua.
    const isBetter = (a: Candidate, b: Candidate): boolean => {
      if (a.finalTime !== b.finalTime) return a.finalTime < b.finalTime;
      if (a.fromResult !== b.fromResult) return a.fromResult;
      const aOpen = a.categoryCode === 'ABS';
      const bOpen = b.categoryCode === 'ABS';
      if (aOpen !== bOpen) return !aOpen;
      return a.achievedAt.getTime() < b.achievedAt.getTime();
    };
    const bestBySwimmer = new Map<string, Candidate>();
    for (const c of candidates) {
      const current = bestBySwimmer.get(c.swimmerId);
      if (!current || isBetter(c, current)) bestBySwimmer.set(c.swimmerId, c);
    }
    const ranked = [...bestBySwimmer.values()].sort(
      (a, b) => a.finalTime - b.finalTime || a.achievedAt.getTime() - b.achievedAt.getTime(),
    );

    // Marcas básicas de esta prueba/pileta/género. La clave incluye poolLength:
    // una marca de 25 m nunca se compara con un tiempo de 50 m. Cada tiempo se
    // compara con la marca de la categoría congelada de su fila.
    const standards = await this.findStandards(dto);
    const standardsByCategory = new Map<string, Array<{ setId: string; timeMs: number }>>();
    for (const st of standards) {
      const list = standardsByCategory.get(st.categoryId) ?? [];
      list.push({ setId: st.setId, timeMs: st.timeMs });
      standardsByCategory.set(st.categoryId, list);
    }

    const result: RankingEntry[] = ranked.map((c, idx) => ({
      position: idx + 1,
      swimmerId: c.swimmerId,
      swimmerName: c.swimmerName,
      clubId: c.clubId,
      clubName: c.clubName,
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      finalTime: c.finalTime,
      sourceResultId: c.sourceResultId,
      achievedAt: c.achievedAt.toISOString(),
      meets: (standardsByCategory.get(c.categoryId) ?? [])
        .filter((st) => c.finalTime <= st.timeMs)
        .map((st) => st.setId),
    }));

    await this.redis.set(key, result, CACHE_TTL.EVENT_BEST);
    return result;
  }

  /**
   * Período del ranking: un rango explícito (from/to) tiene prioridad; si no, la
   * temporada elegida; si no hay ninguno, histórico (sin límite de fechas).
   * `to` incluye el día completo.
   */
  private async resolvePeriod(dto: EventRankingQueryDto): Promise<{ from?: Date; to?: Date } | null> {
    if (dto.from || dto.to) {
      const from = dto.from ? new Date(`${dto.from}T00:00:00.000Z`) : undefined;
      const to = dto.to ? new Date(`${dto.to}T23:59:59.999Z`) : undefined;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        throw new BadRequestException('El período es inválido: alguna de las fechas no existe.');
      }
      if (from && to && from.getTime() > to.getTime()) {
        throw new BadRequestException('El período es inválido: "desde" es posterior a "hasta".');
      }
      return { from, to };
    }
    if (dto.seasonId) {
      const season = await this.prisma.season.findUnique({
        where: { id: dto.seasonId },
        select: { startDate: true, endDate: true },
      });
      if (!season) throw new BadRequestException('Temporada inexistente.');
      const to = new Date(season.endDate);
      to.setUTCHours(23, 59, 59, 999);
      return { from: season.startDate, to };
    }
    return null;
  }

  // ─── Marcas básicas del ranking por prueba ─────────────────────────────────

  private findStandards(dto: EventRankingQueryDto) {
    if (dto.gender === 'MIX') return Promise.resolve([]);
    return this.prisma.timeStandard.findMany({
      where: {
        eventDefinitionId: dto.eventDefinitionId,
        poolLength: dto.poolLength,
        gender: dto.gender,
        set: { isActive: true },
      },
      include: { set: true },
      orderBy: { set: { orderNo: 'asc' } },
    });
  }

  async queryEventStandards(dto: EventRankingQueryDto): Promise<EventStandard[]> {
    const [ranking, standards] = await Promise.all([this.queryEventRanking(dto), this.findStandards(dto)]);
    const sets = new Map<string, EventStandard>();
    for (const st of standards) {
      const entry = sets.get(st.setId) ?? {
        setId: st.setId,
        code: st.set.code,
        name: st.set.name,
        shortLabel: st.set.shortLabel,
        color: st.set.color,
        timeMs: null,
        qualifiedCount: ranking.filter((r) => r.meets.includes(st.setId)).length,
      };
      if (dto.categoryId && st.categoryId === dto.categoryId) entry.timeMs = st.timeMs;
      sets.set(st.setId, entry);
    }
    return [...sets.values()];
  }

  private cacheKeyEvent(dto: EventRankingQueryDto): string {
    const period = dto.from || dto.to ? `:${dto.from ?? ''}_${dto.to ?? ''}` : '';
    return `ranking:event:${dto.eventDefinitionId}:${dto.poolLength}:${dto.gender}:${dto.scope ?? 'provincial'}:${dto.seasonId ?? 'all'}:${dto.categoryId ?? 'all'}${period}`;
  }

  // ─── Club Ranking ──────────────────────────────────────────────────────────
  //
  // Puntos y medallero se calculan sobre el PUESTO REAL que sacó cada resultado
  // homologado (Result.place, congelado por resultado) en el torneo/temporada
  // filtrados — no sobre la tabla Ranking (que es "mejor marca histórica", un
  // concepto distinto usado para /rankings?tab=prueba). Así un club suma
  // puntos por cómo le fue en cada carrera puntual, igual que ya se hace a
  // nivel nadador individual en achievement.processor.ts.

  async queryClubRanking(dto: ClubRankingQueryDto): Promise<ClubRankingEntry[]> {
    const scope = dto.scope ?? 'provincial';
    const key = `ranking:club:${scope}:${dto.tournamentId ?? 'all'}:${dto.seasonId ?? 'all'}`;
    const cached = await this.redis.get<ClubRankingEntry[]>(key);
    if (cached) return cached;

    // Obtener el scoring scheme activo
    const scheme = await this.prisma.scoringScheme.findFirst({
      where: { isActive: true, type: 'placement' },
      orderBy: { createdAt: 'desc' },
    });
    const config: ScoringConfig = scheme
      ? (scheme.config as unknown as ScoringConfig)
      : { points: [9, 7, 6, 5, 4, 3, 2, 1], relay_multiplier: 2 };
    const pointsTable = config.points ?? [];
    const relayMultiplier = config.relay_multiplier ?? 1;

    // Resultados homologados con puesto real — fuente de puntos, medallero y nadadores activos
    // (torneo puntual acota más que la temporada entera; si viene tournamentId se ignora seasonId)
    const results = await this.prisma.result.findMany({
      where: {
        homologated: true,
        status: 'OK',
        place: { not: null },
        event: {
          tournament: {
            scope,
            ...(dto.tournamentId
              ? { id: dto.tournamentId }
              : dto.seasonId
                ? { seasonId: dto.seasonId }
                : {}),
          },
        },
      },
      select: {
        clubId: true,
        swimmerId: true,
        place: true,
        event: { select: { eventDefinition: { select: { isRelay: true } } } },
      },
    });

    // Récords vigentes por club (estado actual, no depende del filtro de torneo/temporada)
    const records = await this.prisma.record.findMany({
      where: { scope, isCurrent: true, status: 'homologated' },
      select: { clubId: true },
    });

    const clubIds = new Set([
      ...results.map((r) => r.clubId),
      ...records.map((r) => r.clubId),
    ]);

    const clubs = await this.prisma.club.findMany({
      where: { id: { in: [...clubIds] } },
      select: { id: true, name: true },
    });
    const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

    // Acumular puntos, medallero y nadadores activos por club
    const stats = new Map<
      string,
      { points: number; gold: number; silver: number; bronze: number; swimmers: Set<string> }
    >();
    const ensureClub = (id: string) => {
      if (!stats.has(id)) stats.set(id, { points: 0, gold: 0, silver: 0, bronze: 0, swimmers: new Set() });
      return stats.get(id)!;
    };

    for (const r of results) {
      const place = r.place!;
      const s = ensureClub(r.clubId);
      s.swimmers.add(r.swimmerId);
      if (place <= pointsTable.length) {
        const base = pointsTable[place - 1] ?? 0;
        s.points += r.event.eventDefinition.isRelay ? base * relayMultiplier : base;
      }
      if (place === 1) s.gold++;
      else if (place === 2) s.silver++;
      else if (place === 3) s.bronze++;
    }

    // Contar récords por club
    const recordsByClub = new Map<string, number>();
    for (const r of records) {
      recordsByClub.set(r.clubId, (recordsByClub.get(r.clubId) ?? 0) + 1);
    }

    const entries: ClubRankingEntry[] = [...clubIds]
      .map((clubId) => {
        const s = stats.get(clubId) ?? { points: 0, gold: 0, silver: 0, bronze: 0, swimmers: new Set<string>() };
        return {
          position: 0,
          clubId,
          clubName: clubMap.get(clubId) ?? '',
          points: s.points,
          gold: s.gold,
          silver: s.silver,
          bronze: s.bronze,
          activeSwimmers: s.swimmers.size,
          currentRecords: recordsByClub.get(clubId) ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze)
      .map((e, idx) => ({ ...e, position: idx + 1 }));

    await this.redis.set(key, entries, CACHE_TTL.CLUB);
    this.logger.log(`Club ranking computed — ${entries.length} clubs`);
    return entries;
  }

  // ─── Cache Invalidation (llamado desde ranking.processor.ts) ──────────────

  async invalidateEventCache(
    eventDefinitionId: string,
    poolLength: 'P25' | 'P50',
    gender: 'M' | 'F',
    scope: string,
    seasonId: string | null,
    categoryId: string,
  ): Promise<void> {
    const baseKey = `ranking:event:${eventDefinitionId}:${poolLength}:${gender}:${scope}:${seasonId ?? 'all'}:${categoryId}`;
    await this.redis.del(baseKey);
  }

  async invalidateClubCache(scope: string, seasonId: string | null): Promise<void> {
    await this.redis.del(`ranking:club:${scope}:all:${seasonId ?? 'all'}`);
    // También invalida el global
    await this.redis.del(`ranking:club:${scope}:all:all`);
  }
}
