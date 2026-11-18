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
const TUCUMAN_PROVINCE = 'Tucumán';

@Injectable()
export class RecordEvaluatorProcessor {
  private readonly logger = new Logger(RecordEvaluatorProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categoría oficial de récords que contiene a la categoría del resultado, o null si no hay.
   * Las categorías oficiales son las que ya tienen récords de la Tabla Oficial (source_result_id
   * nulo); se elige la de rango de edades más angosto. Sin límites de edad (Absoluto, Escuela)
   * o por debajo de las categorías oficiales (Pre A, Pre B): no genera récord.
   * Pendiente: Absoluto no se actualiza solo (un resultado genera hoy un solo récord, por la
   * clave única de source_result_id); sigue siendo la Tabla Oficial hasta aprobar el cambio de esquema.
   */
  private async resolveRecordCategory(resultCategoryId: string): Promise<string | null> {
    const own = await this.prisma.category.findUnique({
      where: { id: resultCategoryId },
      select: { minAge: true, maxAge: true },
    });
    if (!own || (own.minAge === null && own.maxAge === null)) return null;

    const official = await this.prisma.category.findMany({
      where: { scope: 'provincial', isActive: true, records: { some: { sourceResultId: null } } },
      select: { id: true, minAge: true, maxAge: true },
    });
    const lo = own.minAge ?? Number.NEGATIVE_INFINITY;
    const hi = own.maxAge ?? Number.POSITIVE_INFINITY;
    const containing = official
      .filter((c) => (c.minAge !== null || c.maxAge !== null)
        && (c.minAge ?? Number.NEGATIVE_INFINITY) <= lo
        && (c.maxAge ?? Number.POSITIVE_INFINITY) >= hi)
      .sort((a, b) =>
        ((a.maxAge ?? Number.POSITIVE_INFINITY) - (a.minAge ?? Number.NEGATIVE_INFINITY))
        - ((b.maxAge ?? Number.POSITIVE_INFINITY) - (b.minAge ?? Number.NEGATIVE_INFINITY)));
    return containing[0]?.id ?? null;
  }

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

    // Decisión del 18/11/2026: el récord tucumano solo cuenta nadadores de clubes de Tucumán.
    // Un club de otra provincia (o sin provincia cargada) no genera récord provincial.
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { province: true } });
    if (club?.province !== TUCUMAN_PROVINCE) return;

    // El récord vive en la categoría oficial (Infantiles, Menores, Cadetes, Juveniles, Mayores),
    // no en la de torneo (Infantil 1, Cadete 2...). El resultado conserva su categoría congelada.
    const recordCategoryId = await this.resolveRecordCategory(categoryId);
    if (!recordCategoryId) return;

    // Récords nacionales son solo-referencia — solo evaluamos scope=provincial.
    const key = {
      scope: 'provincial' as const,
      eventDefinitionId,
      categoryId: recordCategoryId,
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
