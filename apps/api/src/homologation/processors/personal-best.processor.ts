import { Injectable, Logger } from '@nestjs/common';
import { PoolLength } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

@Injectable()
export class PersonalBestProcessor {
  private readonly logger = new Logger(PersonalBestProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: PostProcessJobData): Promise<void> {
    const { swimmerId, eventDefinitionId, poolLength, finalTimeMs, resultId, seasonId, resultDate } = data;
    const prismaPool: PoolLength = poolLength === 25 ? 'P25' : 'P50';

    const existing = await this.prisma.personalBest.findUnique({
      where: { swimmerId_eventDefinitionId_poolLength: { swimmerId, eventDefinitionId, poolLength: prismaPool } },
    });

    if (!existing) {
      await this.prisma.personalBest.create({
        data: {
          swimmerId,
          eventDefinitionId,
          poolLength: prismaPool,
          bestTime: finalTimeMs,
          sourceResultId: resultId,
          seasonId,
          achievedAt: new Date(resultDate),
        },
      });
      this.logger.log(`PB created for swimmer ${swimmerId} — ${finalTimeMs}ms`);
      return;
    }

    if (finalTimeMs < existing.bestTime) {
      await this.prisma.personalBest.update({
        where: { id: existing.id },
        data: {
          bestTime: finalTimeMs,
          sourceResultId: resultId,
          seasonId,
          achievedAt: new Date(resultDate),
        },
      });
      // Marcar el resultado como PB
      await this.prisma.result.update({
        where: { id: resultId },
        data: { isPb: true },
      });
      this.logger.log(`PB improved for swimmer ${swimmerId}: ${existing.bestTime}ms → ${finalTimeMs}ms`);
    }
  }
}
