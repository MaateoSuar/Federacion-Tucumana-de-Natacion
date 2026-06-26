import { Injectable, Logger } from '@nestjs/common';
import { PoolLength } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

@Injectable()
export class RankingProcessor {
  private readonly logger = new Logger(RankingProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

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

      // Ranking global histórico (seasonId = null)
      await this.prisma.ranking.upsert({
        where: {
          swimmerId_eventDefinitionId_poolLength_scope_seasonId_categoryId: {
            swimmerId: r.swimmerId,
            eventDefinitionId,
            poolLength: prismaPool,
            scope: 'provincial',
            seasonId: null as unknown as string,
            categoryId,
          },
        },
        create: {
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
          computedAt: new Date(),
        },
        update: { position, finalTime, sourceResultId: r.id, computedAt: new Date() },
      });

      // Ranking por temporada (solo si el resultado pertenece a esta temporada)
      if (rSeasonId === seasonId) {
        await this.prisma.ranking.upsert({
          where: {
            swimmerId_eventDefinitionId_poolLength_scope_seasonId_categoryId: {
              swimmerId: r.swimmerId,
              eventDefinitionId,
              poolLength: prismaPool,
              scope: 'provincial',
              seasonId,
              categoryId,
            },
          },
          create: {
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
            computedAt: new Date(),
          },
          update: { position, finalTime, sourceResultId: r.id, computedAt: new Date() },
        });
      }
    }

    this.logger.log(`Ranking recalculated for event ${eventDefinitionId}/${poolLength}/${gender} — ${ranked.length} entries`);
  }
}
