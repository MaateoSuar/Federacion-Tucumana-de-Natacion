import { Injectable, Logger } from '@nestjs/common';
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
  computedAt?: Date;
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
  // Una sola vista: mejor marca por nadador, tomada de la tabla Ranking. Esa
  // tabla ya combina resultados homologados de torneos (poblados por
  // RankingProcessor tras cada homologación) y récords oficiales/históricos
  // cargados manualmente (seed-records.ts, records.service.updateManualRecord)
  // — si un nadador hizo récord en algún momento, aparece acá aunque no tenga
  // un Result asociado. El detalle del récord vigente vive en /records.
  //
  // El campo `position` guardado en la tabla es por categoría (1er puesto de
  // Cadetes, 1er puesto de Absoluto, etc.) — NUNCA se usa para ordenar acá.
  // Un ranking es SIEMPRE por tiempo, de mejor a peor, con posiciones 1,2,3...
  // estrictamente correlativas (sin empates de categorías distintas
  // compartiendo el 1er puesto). Cuando se filtra por una sola categoría da
  // el mismo resultado; cuando es "Todos" (varias categorías mezcladas), el
  // orden real por tiempo es el único que tiene sentido.

  async queryEventRanking(dto: EventRankingQueryDto): Promise<RankingEntry[]> {
    const key = this.cacheKeyEvent(dto);
    const cached = await this.redis.get<RankingEntry[]>(key);
    if (cached) return cached;

    const rows = await this.prisma.ranking.findMany({
      where: {
        eventDefinitionId: dto.eventDefinitionId,
        poolLength: dto.poolLength,
        gender: dto.gender,
        scope: dto.scope ?? 'provincial',
        seasonId: dto.seasonId ?? null,
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      },
      orderBy: { finalTime: 'asc' },
      include: {
        swimmer: { select: { id: true, firstName: true, lastName: true } },
        category: { select: { id: true, name: true } },
      },
    });

    const clubIds = [...new Set(rows.map((r) => r.clubId))];
    const clubs = await this.prisma.club.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, name: true },
    });
    const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

    const result: RankingEntry[] = rows.map((r, idx) => ({
      position: idx + 1,
      swimmerId: r.swimmerId,
      swimmerName: `${r.swimmer.firstName} ${r.swimmer.lastName}`,
      clubId: r.clubId,
      clubName: clubMap.get(r.clubId) ?? '',
      categoryId: r.categoryId,
      categoryName: r.category.name,
      finalTime: r.finalTime,
      sourceResultId: r.sourceResultId,
      computedAt: r.computedAt,
    }));

    await this.redis.set(key, result, CACHE_TTL.EVENT_BEST);
    return result;
  }

  private cacheKeyEvent(dto: EventRankingQueryDto): string {
    return `ranking:event:${dto.eventDefinitionId}:${dto.poolLength}:${dto.gender}:${dto.scope ?? 'provincial'}:${dto.seasonId ?? 'all'}:${dto.categoryId ?? 'all'}`;
  }

  // ─── Club Ranking ──────────────────────────────────────────────────────────

  async queryClubRanking(dto: ClubRankingQueryDto): Promise<ClubRankingEntry[]> {
    const scope = dto.scope ?? 'provincial';
    const key = `ranking:club:${scope}:${dto.seasonId ?? 'all'}`;
    const cached = await this.redis.get<ClubRankingEntry[]>(key);
    if (cached) return cached;

    // Obtener el scoring scheme activo
    const scheme = await this.prisma.scoringScheme.findFirst({
      where: { isActive: true, type: 'placement' },
      orderBy: { createdAt: 'desc' },
    });
    const pointsTable: number[] = scheme
      ? ((scheme.config as unknown as ScoringConfig).points ?? [])
      : [9, 7, 6, 5, 4, 3, 2, 1];

    // Rankings best_per_swimmer (que ya tienen posiciones correctas)
    const rankings = await this.prisma.ranking.findMany({
      where: {
        scope,
        seasonId: dto.seasonId ?? null,
      },
      select: { clubId: true, position: true },
    });

    // Récords vigentes por club
    const records = await this.prisma.record.findMany({
      where: { scope, isCurrent: true, status: 'homologated' },
      select: { clubId: true },
    });

    // Nadadores activos con resultados en la temporada
    const activeSwimmersQuery = await this.prisma.result.findMany({
      where: {
        homologated: true,
        status: 'OK',
        event: {
          tournament: {
            scope,
            ...(dto.seasonId ? { seasonId: dto.seasonId } : {}),
          },
        },
      },
      select: { clubId: true, swimmerId: true },
      distinct: ['clubId', 'swimmerId'],
    });

    const clubIds = new Set([
      ...rankings.map((r) => r.clubId),
      ...records.map((r) => r.clubId),
      ...activeSwimmersQuery.map((r) => r.clubId),
    ]);

    const clubs = await this.prisma.club.findMany({
      where: { id: { in: [...clubIds] } },
      select: { id: true, name: true },
    });
    const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

    // Acumular estadísticas por club
    const stats = new Map<string, { points: number; gold: number; silver: number; bronze: number }>();
    const ensureClub = (id: string) => {
      if (!stats.has(id)) stats.set(id, { points: 0, gold: 0, silver: 0, bronze: 0 });
      return stats.get(id)!;
    };

    for (const r of rankings) {
      const s = ensureClub(r.clubId);
      if (r.position <= pointsTable.length) {
        s.points += pointsTable[r.position - 1] ?? 0;
      }
      if (r.position === 1) s.gold++;
      else if (r.position === 2) s.silver++;
      else if (r.position === 3) s.bronze++;
    }

    // Contar récords por club
    const recordsByClub = new Map<string, number>();
    for (const r of records) {
      recordsByClub.set(r.clubId, (recordsByClub.get(r.clubId) ?? 0) + 1);
    }

    // Contar nadadores activos por club
    const activeByClub = new Map<string, number>();
    for (const r of activeSwimmersQuery) {
      if (!activeByClub.has(r.clubId)) activeByClub.set(r.clubId, 0);
      activeByClub.set(r.clubId, activeByClub.get(r.clubId)! + 1);
    }

    const entries: ClubRankingEntry[] = [...clubIds]
      .map((clubId) => {
        const s = stats.get(clubId) ?? { points: 0, gold: 0, silver: 0, bronze: 0 };
        return {
          position: 0,
          clubId,
          clubName: clubMap.get(clubId) ?? '',
          points: s.points,
          gold: s.gold,
          silver: s.silver,
          bronze: s.bronze,
          activeSwimmers: activeByClub.get(clubId) ?? 0,
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
    await this.redis.del(`ranking:club:${scope}:${seasonId ?? 'all'}`);
    // También invalida el global
    await this.redis.del(`ranking:club:${scope}:all`);
  }
}
