import { Injectable, Logger } from '@nestjs/common';
import { PoolLength, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';
import { NOA_PROVINCES, TUCUMAN_PROVINCE } from '../record-scopes';

/**
 * REGLA 4 (decisión del 13/11/2026): cuando un resultado HOMOLOGADO supera al récord
 * vigente, el récord se actualiza solo: el nuevo queda vigente y el anterior pasa a
 * "superseded". Si resulta ser un error, un Admin lo vuelve al anterior desde el panel
 * (RecordsService.revertRecord), y todo queda en audit_logs.
 *
 * Un mismo resultado puede ser récord en varios lugares a la vez (decisión del 18/11/2026):
 *  - tucumano, si el club es de Tucumán: en la categoría oficial y en Absoluto;
 *  - NOA, si el club es de una provincia del NOA: en la categoría NOA y en Absoluto NOA.
 * Cada combinación (alcance, categoría) se evalúa por separado. Los nacionales son solo
 * referencia y no se evalúan.
 *
 * Se sigue cumpliendo: solo resultados homologados, y 25 m y 50 m nunca se comparan
 * (la pileta es parte de la clave del récord).
 */
type RecordScope = 'provincial' | 'noa';

interface RecordTarget {
  scope: RecordScope;
  categoryId: string;
}

interface AgeRange {
  id: string;
  minAge: number | null;
  maxAge: number | null;
}

const NEG = Number.NEGATIVE_INFINITY;
const POS = Number.POSITIVE_INFINITY;

@Injectable()
export class RecordEvaluatorProcessor {
  private readonly logger = new Logger(RecordEvaluatorProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categorías de récord de un alcance donde cae un resultado: la categoría oficial más
   * angosta que contiene sus edades, y Absoluto (la oficial sin límites de edad).
   * Las categorías oficiales son las que ya tienen récords cargados de la tabla oficial
   * (source_result_id nulo) en ese alcance. Sin límites de edad (Absoluto, Escuela) o por
   * debajo de las oficiales (Pre A, Pre B): no genera récord.
   */
  private async categoriesFor(scope: RecordScope, own: Omit<AgeRange, 'id'>): Promise<string[]> {
    const official: AgeRange[] = await this.prisma.category.findMany({
      where: { scope, isActive: true, records: { some: { scope, sourceResultId: null } } },
      select: { id: true, minAge: true, maxAge: true },
    });
    const lo = own.minAge ?? NEG;
    const hi = own.maxAge ?? POS;
    const specific = official
      .filter((c) => (c.minAge !== null || c.maxAge !== null) && (c.minAge ?? NEG) <= lo && (c.maxAge ?? POS) >= hi)
      .sort((a, b) => (a.maxAge ?? POS) - (a.minAge ?? NEG) - ((b.maxAge ?? POS) - (b.minAge ?? NEG)));
    // Por debajo de las categorías oficiales (Pre A, Pre B): tampoco cuenta para Absoluto
    if (!specific[0]) return [];
    const absolute = official.find((c) => c.minAge === null && c.maxAge === null);
    return [specific[0].id, absolute?.id].filter((id): id is string => id !== undefined);
  }

  private async targetsFor(clubId: string, resultCategoryId: string): Promise<RecordTarget[]> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { province: true } });
    const province = club?.province ?? null;
    if (province === null) return [];

    const own = await this.prisma.category.findUnique({
      where: { id: resultCategoryId },
      select: { minAge: true, maxAge: true },
    });
    // Sin límites de edad (Absoluto, Escuela): no es una categoría de competencia por edad
    if (!own || (own.minAge === null && own.maxAge === null)) return [];

    const scopes: RecordScope[] = [];
    if (province === TUCUMAN_PROVINCE) scopes.push('provincial');
    if (NOA_PROVINCES.includes(province)) scopes.push('noa');

    const targets: RecordTarget[] = [];
    for (const scope of scopes) {
      for (const categoryId of await this.categoriesFor(scope, own)) targets.push({ scope, categoryId });
    }
    return targets;
  }

  async process(data: PostProcessJobData): Promise<void> {
    const targets = await this.targetsFor(data.clubId, data.categoryId);
    for (const target of targets) await this.evaluate(data, target);
  }

  private async evaluate(data: PostProcessJobData, target: RecordTarget): Promise<void> {
    const {
      resultId, swimmerId, clubId, eventDefinitionId, poolLength, gender,
      finalTimeMs, resultDate, tournamentName,
    } = data;
    const prismaPool: PoolLength = poolLength === 25 ? 'P25' : 'P50';

    // Idempotencia: un resultado genera a lo sumo un récord por (alcance, categoría).
    const alreadyEvaluated = await this.prisma.record.findFirst({
      where: { sourceResultId: resultId, scope: target.scope, categoryId: target.categoryId },
      select: { id: true },
    });
    if (alreadyEvaluated) return;

    const key = {
      scope: target.scope,
      eventDefinitionId,
      categoryId: target.categoryId,
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
              scope: target.scope,
              timeMs: finalTimeMs,
              swimmerId,
              sourceResultId: resultId,
              supersededRecordId: current?.id ?? null,
              supersededTimeMs: current?.timeMs ?? null,
            },
          },
        });

        this.logger.log(
          `Record ${target.scope} auto-published for event ${eventDefinitionId}/${prismaPool}/${gender} — ${finalTimeMs}ms`,
        );
      });
    } catch (err) {
      // Otro job del mismo resultado ganó la carrera (clave única): ya está evaluado,
      // no se corta el resto del post-proceso.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }
}
