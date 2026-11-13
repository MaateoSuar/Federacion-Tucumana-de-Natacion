import { Injectable, Logger } from '@nestjs/common';
import { Gender, PoolLength, Scope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { PostProcessJobData } from '../homologation.queue';

interface UpsertRankingInput {
  swimmerId: string;
  eventDefinitionId: string;
  poolLength: PoolLength;
  gender: Gender;
  scope: Scope;
  seasonId: string | null;
  categoryId: string;
  clubId: string;
  position: number;
  finalTime: number;
  sourceResultId: string;
}

@Injectable()
export class RankingProcessor {
  private readonly logger = new Logger(RankingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async process(data: PostProcessJobData): Promise<void> {
    const { eventDefinitionId, poolLength, gender, seasonId, categoryId } = data;
    const prismaPool: PoolLength = poolLength === 25 ? 'P25' : 'P50';

    // Obtener todos los resultados homologados OK para esta tupla (best_per_swimmer)
    const results = await this.prisma.result.findMany({
      where: {
        homologated: true,
        status: 'OK',
        finalTime: { not: null },
        categoryId,
        event: {
          eventDefinitionId,
          tournament: { poolLength: prismaPool, scope: 'provincial' },
        },
        swimmer: { gender },
      },
      select: {
        id: true,
        swimmerId: true,
        clubId: true,
        finalTime: true,
        eventId: true,
      },
      orderBy: { finalTime: 'asc' },
    });

    // Obtener seasonId para cada resultado vía eventId → tournament
    const eventIds = [...new Set(results.map((r) => r.eventId))];
    const events = await this.prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, tournament: { select: { seasonId: true } } },
    });
    const eventSeasonMap = new Map(events.map((e) => [e.id, e.tournament.seasonId]));

    // best_per_swimmer: un solo resultado por nadador (el mejor tiempo)
    const bestPerSwimmer = new Map<string, typeof results[0]>();
    for (const r of results) {
      if (!bestPerSwimmer.has(r.swimmerId)) {
        bestPerSwimmer.set(r.swimmerId, r);
      }
    }

    const ranked = Array.from(bestPerSwimmer.values());

    for (const [idx, r] of ranked.entries()) {
      const position = idx + 1;
      const finalTime = r.finalTime!;
      const rSeasonId = eventSeasonMap.get(r.eventId) ?? null;

      // Ranking global histórico (seasonId = null).
      // No se usa upsert con la clave compuesta: Prisma rechaza `null` en un
      // campo de un where de unique compuesto en runtime, aunque la columna
      // (seasonId) sea nullable — el cast `as unknown as string` solo
      // engañaba al compilador y esta query fallaba con
      // "Argument seasonId must not be null" en cuanto se ejecutaba de verdad.
      await this.upsertRanking({
        swimmerId: r.swimmerId,
        eventDefinitionId,
        poolLength: prismaPool,
        gender,
        scope: 'provincial',
        seasonId: null,
        categoryId,
        clubId: r.clubId,
        position,
        finalTime,
        sourceResultId: r.id,
      });

      // Ranking por temporada (solo si el resultado pertenece a esta temporada)
      if (rSeasonId === seasonId) {
        await this.upsertRanking({
          swimmerId: r.swimmerId,
          eventDefinitionId,
          poolLength: prismaPool,
          gender,
          scope: 'provincial',
          seasonId,
          categoryId,
          clubId: r.clubId,
          position,
          finalTime,
          sourceResultId: r.id,
        });
      }
    }

    // Invalida cache global y por temporada
    const cacheBase = `ranking:event:${eventDefinitionId}:${prismaPool}:${gender}:provincial`;
    await this.redis.del(`${cacheBase}:all:${categoryId}`);
    if (seasonId) {
      await this.redis.del(`${cacheBase}:${seasonId}:${categoryId}`);
    }
    await this.redis.del(`ranking:club:provincial:all`);
    if (seasonId) await this.redis.del(`ranking:club:provincial:${seasonId}`);

    this.logger.log(`Ranking recalculated for event ${eventDefinitionId}/${poolLength}/${gender} — ${ranked.length} entries`);
  }

  // find-then-create/update en vez de upsert: Prisma no acepta `null` como
  // valor de un campo dentro del where de un unique compuesto en runtime,
  // aunque la columna (seasonId) sea nullable.
  private async upsertRanking(input: UpsertRankingInput): Promise<void> {
    const { swimmerId, eventDefinitionId, poolLength, scope, seasonId, categoryId } = input;
    const existing = await this.prisma.ranking.findFirst({
      where: { swimmerId, eventDefinitionId, poolLength, scope, seasonId, categoryId },
    });

    const computedAt = new Date();
    if (existing) {
      await this.prisma.ranking.update({
        where: { id: existing.id },
        data: {
          position: input.position,
          finalTime: input.finalTime,
          sourceResultId: input.sourceResultId,
          computedAt,
        },
      });
    } else {
      await this.prisma.ranking.create({
        data: {
          swimmerId,
          eventDefinitionId,
          poolLength,
          gender: input.gender,
          scope,
          seasonId,
          categoryId,
          clubId: input.clubId,
          position: input.position,
          finalTime: input.finalTime,
          sourceResultId: input.sourceResultId,
          computedAt,
        },
      });
    }
  }
}
