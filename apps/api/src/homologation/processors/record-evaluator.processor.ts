import { Injectable, Logger } from '@nestjs/common';
import { PoolLength } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

@Injectable()
export class RecordEvaluatorProcessor {
  private readonly logger = new Logger(RecordEvaluatorProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: PostProcessJobData): Promise<void> {
    const {
      resultId, swimmerId, clubId, eventDefinitionId, poolLength, categoryId,
      gender, finalTimeMs, resultDate, homologatedBy, tournamentName,
    } = data;
    const prismaPool: PoolLength = poolLength === 25 ? 'P25' : 'P50';

    // Récords nacionales son solo-referencia — solo evaluamos scope=provincial
    const current = await this.prisma.record.findFirst({
      where: {
        scope: 'provincial',
        eventDefinitionId,
        categoryId,
        gender,
        poolLength: prismaPool,
        isCurrent: true,
      },
    });

    if (current && finalTimeMs >= current.timeMs) {
      return; // No supera el récord vigente
    }

    // Supera o es el primer récord — se homologa automáticamente: el resultado
    // ya pasó por homologación de torneo, no requiere aprobación aparte.
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.record.update({
          where: { id: current.id },
          data: { isCurrent: false, status: 'superseded' },
        });
      }

      await tx.record.create({
        data: {
          scope: 'provincial',
          eventDefinitionId,
          categoryId,
          gender,
          poolLength: prismaPool,
          timeMs: finalTimeMs,
          swimmerId,
          clubId,
          recordDate: new Date(resultDate),
          tournamentName: tournamentName ?? null,
          sourceResultId: resultId,
          status: 'homologated',
          isCurrent: true,
          previousRecordId: current?.id ?? null,
          homologatedBy: homologatedBy ?? null,
          homologatedAt: now,
        },
      });

      await tx.result.update({
        where: { id: resultId },
        data: { isRecord: true },
      });
    });

    this.logger.log(`Record auto-homologated for event ${eventDefinitionId}/${prismaPool}/${gender} — ${finalTimeMs}ms`);
  }
}
