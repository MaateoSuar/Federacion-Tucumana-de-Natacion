import { Injectable, Logger } from '@nestjs/common';
import { PoolLength, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

/**
 * REGLA INVIOLABLE 4: este procesador NUNCA publica un récord.
 * Solo detecta que un resultado homologado supera al récord vigente y deja un
 * candidato `pending_homologation` (`isCurrent: false`). El vigente no se toca
 * y `result.isRecord` no se marca: ambas cosas ocurren recién cuando un Admin
 * aprueba el candidato (RecordsService.homologateRecord).
 */
@Injectable()
export class RecordEvaluatorProcessor {
  private readonly logger = new Logger(RecordEvaluatorProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: PostProcessJobData): Promise<void> {
    const {
      resultId, swimmerId, clubId, eventDefinitionId, poolLength, categoryId,
      gender, finalTimeMs, resultDate, tournamentName,
    } = data;
    const prismaPool: PoolLength = poolLength === 25 ? 'P25' : 'P50';

    // Idempotencia: un resultado genera a lo sumo un récord/candidato
    // (source_result_id es único). Reprocesar el mismo resultado no duplica.
    const alreadyEvaluated = await this.prisma.record.findUnique({
      where: { sourceResultId: resultId },
      select: { id: true },
    });
    if (alreadyEvaluated) return;

    // Récords nacionales son solo-referencia — solo evaluamos scope=provincial.
    // La clave incluye poolLength: 25 m y 50 m nunca se comparan entre sí.
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

    // Supera al vigente (o no hay vigente): candidato pendiente de homologación humana.
    try {
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
          tournamentName: tournamentName ?? null,
          sourceResultId: resultId,
          status: 'pending_homologation',
          isCurrent: false,
          previousRecordId: current?.id ?? null,
        },
      });
    } catch (err) {
      // Otro job del mismo resultado ganó la carrera (source_result_id único):
      // ya está evaluado, no se corta el resto del post-proceso.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }

    this.logger.log(
      `Record candidate (pending) for event ${eventDefinitionId}/${prismaPool}/${gender} — ${finalTimeMs}ms`,
    );
  }
}
