import { Injectable, Logger } from '@nestjs/common';
import { PoolLength } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

@Injectable()
export class RecordEvaluatorProcessor {
  private readonly logger = new Logger(RecordEvaluatorProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: PostProcessJobData): Promise<void> {
    const { resultId, swimmerId, clubId, eventDefinitionId, poolLength, categoryId, gender, finalTimeMs, resultDate } = data;
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

    // Supera o es el primer récord — crear candidato pending
    await this.prisma.record.create({
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
        sourceResultId: resultId,
        status: 'pending_homologation',
        isCurrent: false,
        previousRecordId: current?.id ?? null,
      },
    });

    // Marcar el resultado como candidato a récord
    await this.prisma.result.update({
      where: { id: resultId },
      data: { isRecord: true },
    });

    this.logger.log(`Record candidate created for event ${eventDefinitionId}/${prismaPool}/${gender} — ${finalTimeMs}ms`);
  }
}
