import { Injectable, Logger } from '@nestjs/common';
import { PoolLength, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

/**
 * REGLA 4 (decisión del 13/11/2026): cuando un resultado HOMOLOGADO supera al récord
 * vigente, el récord se actualiza solo: el nuevo queda vigente y el anterior pasa a
 * "superseded". Si resulta ser un error, un Admin lo vuelve al anterior desde el panel
 * (RecordsService.revertRecord), y todo queda en audit_logs.
 *
 * Se sigue cumpliendo: solo resultados homologados, y 25 m y 50 m nunca se comparan
 * (la pileta es parte de la clave del récord).
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

    // Idempotencia: un resultado genera a lo sumo un récord (source_result_id es único).
    const alreadyEvaluated = await this.prisma.record.findUnique({
      where: { sourceResultId: resultId },
      select: { id: true },
    });
    if (alreadyEvaluated) return;

    // Récords nacionales son solo-referencia — solo evaluamos scope=provincial.
    const key = {
      scope: 'provincial' as const,
      eventDefinitionId,
      categoryId,
      gender,
      poolLength: prismaPool,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        // Se lee el vigente DENTRO de la transacción: dos resultados del mismo torneo
        // pueden superar al mismo récord y solo el mejor debe quedar vigente.
        const current = await tx.record.findFirst({ where: { ...key, isCurrent: true } });
        if (current && finalTimeMs >= current.timeMs) return; // no supera al vigente

        if (current) {
          await tx.record.update({
            where: { id: current.id },
            data: { isCurrent: false, status: 'superseded' },
          });
        }

        const created = await tx.record.create({
          data: {
            ...key,
            timeMs: finalTimeMs,
            swimmerId,
            clubId,
            recordDate: new Date(resultDate),
            tournamentName: tournamentName ?? null,
            sourceResultId: resultId,
            status: 'homologated',
            isCurrent: true,
            previousRecordId: current?.id ?? null,
            homologatedAt: new Date(),
            notes: 'Récord actualizado automáticamente al homologar el resultado.',
          },
        });

        await tx.result.update({ where: { id: resultId }, data: { isRecord: true } });

        await tx.auditLog.create({
          data: {
            userId: null,
            action: 'RECORD_AUTO_PUBLISHED',
            entityType: 'Record',
            entityId: created.id,
            payload: {
              timeMs: finalTimeMs,
              swimmerId,
              sourceResultId: resultId,
              supersededRecordId: current?.id ?? null,
              supersededTimeMs: current?.timeMs ?? null,
            },
          },
        });

        this.logger.log(
          `Record auto-published for event ${eventDefinitionId}/${prismaPool}/${gender} — ${finalTimeMs}ms`,
        );
      });
    } catch (err) {
      // Otro job del mismo resultado ganó la carrera (source_result_id único):
      // ya está evaluado, no se corta el resto del post-proceso.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }
}
