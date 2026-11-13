import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, Gender, PoolLength, Scope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordQueryDto } from './dto/record-query.dto';
import { UpdateRecordDto } from './dto/update-record.dto';

const RECORD_INCLUDE = {
  swimmer: { select: { id: true, firstName: true, lastName: true } },
  club: { select: { id: true, name: true, shortName: true } },
  eventDefinition: { select: { id: true, code: true, stroke: true, distance: true } },
  category: { select: { id: true, code: true, name: true } },
  sourceResult: {
    select: {
      id: true,
      event: { select: { tournament: { select: { id: true, name: true, startDate: true } } } },
    },
  },
} as const;

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Récords vigentes provinciales ────────────────────────────────────────

  async findCurrent(dto: RecordQueryDto) {
    return this.prisma.record.findMany({
      where: {
        scope: dto.scope ?? 'provincial',
        isCurrent: true,
        status: 'homologated',
        ...(dto.eventDefinitionId ? { eventDefinitionId: dto.eventDefinitionId } : {}),
        ...(dto.poolLength ? { poolLength: dto.poolLength } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
      },
      include: RECORD_INCLUDE,
      orderBy: [
        { eventDefinition: { distance: 'asc' } },
        { category: { orderNo: 'asc' } },
        { gender: 'asc' },
      ],
    });
  }

  // ─── Récords nacionales (solo referencia, read-only) ──────────────────────

  async findNational(dto: RecordQueryDto) {
    return this.prisma.record.findMany({
      where: {
        scope: 'nacional',
        isCurrent: true,
        ...(dto.eventDefinitionId ? { eventDefinitionId: dto.eventDefinitionId } : {}),
        ...(dto.poolLength ? { poolLength: dto.poolLength } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
      },
      include: RECORD_INCLUDE,
      orderBy: [
        { eventDefinition: { distance: 'asc' } },
        { category: { orderNo: 'asc' } },
        { gender: 'asc' },
      ],
    });
  }

  // ─── Candidatos pendientes (admin) ────────────────────────────────────────

  async findCandidates(dto: RecordQueryDto) {
    return this.prisma.record.findMany({
      where: {
        scope: dto.scope ?? 'provincial',
        status: 'pending_homologation',
        ...(dto.eventDefinitionId ? { eventDefinitionId: dto.eventDefinitionId } : {}),
        ...(dto.poolLength ? { poolLength: dto.poolLength } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
      },
      include: {
        ...RECORD_INCLUDE,
        previousRecord: {
          select: {
            id: true,
            timeMs: true,
            recordDate: true,
            swimmer: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Homologación de un récord (Admin) ────────────────────────────────────

  async homologateRecord(recordId: string, homologatedBy: string) {
    const candidate = await this.prisma.record.findUnique({
      where: { id: recordId },
    });

    if (!candidate) throw new NotFoundException('Récord candidato no encontrado.');
    if (candidate.status !== 'pending_homologation') {
      throw new BadRequestException(
        `Solo se pueden homologar candidatos en estado "pending_homologation". Estado actual: "${candidate.status}".`,
      );
    }
    if (candidate.scope === 'nacional') {
      throw new BadRequestException('Los récords nacionales son solo de referencia y no pueden ser homologados.');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Solo se evalúan récords sobre resultados homologados: si el resultado
      // origen fue revertido (rollback de importación) el candidato quedó huérfano.
      const source = candidate.sourceResultId
        ? await tx.result.findUnique({
            where: { id: candidate.sourceResultId },
            select: { homologated: true, status: true },
          })
        : null;
      if (!source || !source.homologated || source.status !== 'OK') {
        throw new BadRequestException(
          'El resultado que originó este candidato ya no existe o no está homologado. Rechazalo.',
        );
      }

      // Desactivar el récord vigente anterior para la misma clave
      const current = await tx.record.findFirst({
        where: {
          scope: candidate.scope,
          eventDefinitionId: candidate.eventDefinitionId,
          categoryId: candidate.categoryId,
          gender: candidate.gender,
          poolLength: candidate.poolLength,
          isCurrent: true,
          id: { not: recordId }, // no es el candidato mismo
        },
      });

      // El vigente pudo cambiar desde que se detectó el candidato (otro candidato
      // aprobado, edición manual). Un candidato que ya no lo mejora no se publica.
      if (current && candidate.timeMs >= current.timeMs) {
        throw new BadRequestException(
          `El candidato (${candidate.timeMs} ms) ya no mejora el récord vigente (${current.timeMs} ms). Rechazalo.`,
        );
      }

      if (current) {
        await tx.record.update({
          where: { id: current.id },
          data: { isCurrent: false, status: 'superseded' },
        });
      }

      // Activar el nuevo récord
      const homologated = await tx.record.update({
        where: { id: recordId },
        data: {
          isCurrent: true,
          status: 'homologated',
          homologatedBy,
          homologatedAt: now,
          // La cadena histórica apunta al vigente real al momento de aprobar
          previousRecordId: current?.id ?? null,
        },
        include: RECORD_INCLUDE,
      });

      // El resultado se marca como récord recién con la aprobación humana
      if (candidate.sourceResultId) {
        await tx.result.update({
          where: { id: candidate.sourceResultId },
          data: { isRecord: true },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: homologatedBy,
          action: 'RECORD_HOMOLOGATED',
          entityType: 'Record',
          entityId: recordId,
          payload: {
            timeMs: candidate.timeMs,
            swimmerId: candidate.swimmerId,
            sourceResultId: candidate.sourceResultId,
            supersededRecordId: current?.id ?? null,
            supersededTimeMs: current?.timeMs ?? null,
          },
        },
      });

      this.logger.log(
        `Record ${recordId} homologated by ${homologatedBy}. Previous: ${current?.id ?? 'none'}`,
      );

      return homologated;
    });
  }

  // ─── Rechazo de un candidato (Admin) ───────────────────────────────────────
  //
  // El candidato rechazado se elimina (RecordStatus no tiene "rejected") y queda
  // una copia completa en audit_logs. Solo aplica a candidatos pendientes: un
  // récord homologado o histórico nunca se borra por acá.

  async rejectCandidate(recordId: string, rejectedBy: string, reason?: string) {
    const candidate = await this.prisma.record.findUnique({ where: { id: recordId } });

    if (!candidate) throw new NotFoundException('Récord candidato no encontrado.');
    if (candidate.status !== 'pending_homologation' || candidate.isCurrent) {
      throw new BadRequestException(
        `Solo se pueden rechazar candidatos en estado "pending_homologation". Estado actual: "${candidate.status}".`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: rejectedBy,
          action: 'RECORD_CANDIDATE_REJECTED',
          entityType: 'Record',
          entityId: recordId,
          payload: {
            reason: reason ?? null,
            candidate: {
              scope: candidate.scope,
              eventDefinitionId: candidate.eventDefinitionId,
              categoryId: candidate.categoryId,
              gender: candidate.gender,
              poolLength: candidate.poolLength,
              timeMs: candidate.timeMs,
              swimmerId: candidate.swimmerId,
              clubId: candidate.clubId,
              recordDate: candidate.recordDate.toISOString(),
              tournamentName: candidate.tournamentName,
              sourceResultId: candidate.sourceResultId,
              previousRecordId: candidate.previousRecordId,
              createdAt: candidate.createdAt.toISOString(),
            },
          },
        },
      });
      await tx.record.delete({ where: { id: recordId } });
    });

    this.logger.log(`Record candidate ${recordId} rejected by ${rejectedBy}`);
    return { id: recordId, rejected: true };
  }

  // ─── Volver al récord anterior (Admin) ─────────────────────────────────────
  //
  // Los récords se actualizan solos cuando un resultado homologado supera al vigente.
  // Si ese resultado estaba mal (tiempo mal cargado, nadador equivocado), el Admin
  // deshace el cambio: el récord erróneo se elimina (queda copia completa en
  // audit_logs) y el anterior vuelve a ser el vigente. El resultado deja de figurar
  // como récord. Solo se puede deshacer el récord VIGENTE.

  async revertRecord(recordId: string, revertedBy: string, reason?: string) {
    const wrong = await this.prisma.record.findUnique({ where: { id: recordId } });

    if (!wrong) throw new NotFoundException('Récord no encontrado.');
    if (wrong.scope === 'nacional') {
      throw new BadRequestException('Los récords nacionales son solo de referencia y no se modifican.');
    }
    if (!wrong.isCurrent || wrong.status !== 'homologated') {
      throw new BadRequestException('Solo se puede volver atrás el récord vigente.');
    }
    // Un récord histórico cargado de la tabla oficial (sin resultado de origen y sin
    // récord anterior) no se puede "volver atrás": se quedaría la prueba sin récord.
    if (!wrong.previousRecordId && !wrong.sourceResultId) {
      throw new BadRequestException('Este récord no tiene uno anterior al cual volver.');
    }

    return this.prisma.$transaction(async (tx) => {
      const previous = wrong.previousRecordId
        ? await tx.record.findUnique({ where: { id: wrong.previousRecordId } })
        : null;
      // El anterior tiene que ser de la MISMA clave (misma prueba, categoría, género y pileta)
      if (
        previous &&
        (previous.scope !== wrong.scope ||
          previous.eventDefinitionId !== wrong.eventDefinitionId ||
          previous.categoryId !== wrong.categoryId ||
          previous.gender !== wrong.gender ||
          previous.poolLength !== wrong.poolLength)
      ) {
        throw new BadRequestException('El récord anterior no corresponde a la misma prueba, categoría y pileta.');
      }

      await tx.auditLog.create({
        data: {
          userId: revertedBy,
          action: 'RECORD_REVERTED',
          entityType: 'Record',
          entityId: recordId,
          payload: {
            reason: reason ?? null,
            restoredRecordId: previous?.id ?? null,
            removed: {
              scope: wrong.scope,
              eventDefinitionId: wrong.eventDefinitionId,
              categoryId: wrong.categoryId,
              gender: wrong.gender,
              poolLength: wrong.poolLength,
              timeMs: wrong.timeMs,
              swimmerId: wrong.swimmerId,
              clubId: wrong.clubId,
              recordDate: wrong.recordDate.toISOString(),
              tournamentName: wrong.tournamentName,
              sourceResultId: wrong.sourceResultId,
              previousRecordId: wrong.previousRecordId,
              homologatedBy: wrong.homologatedBy,
              homologatedAt: wrong.homologatedAt?.toISOString() ?? null,
            },
          },
        },
      });

      if (wrong.sourceResultId) {
        await tx.result.update({ where: { id: wrong.sourceResultId }, data: { isRecord: false } });
      }
      // Primero se elimina el erróneo y después se reactiva el anterior: nunca hay dos vigentes
      await tx.record.delete({ where: { id: recordId } });
      if (previous) {
        await tx.record.update({
          where: { id: previous.id },
          data: { isCurrent: true, status: 'homologated' },
        });
      }

      this.logger.log(`Record ${recordId} reverted by ${revertedBy}. Restored: ${previous?.id ?? 'none'}`);
      return { id: recordId, reverted: true, restoredRecordId: previous?.id ?? null };
    });
  }

  // ─── Edición manual de un récord vigente (Admin) ──────────────────────────
  //
  // Se usa cuando un récord es superado por una marca que no llegó al sistema
  // vía homologación de resultado (torneos externos, marcas históricas, etc.).
  // El récord anterior NUNCA se borra ni pierde su lugar en el ranking: pasa a
  // "superseded" y su fila en Ranking se conserva — solo se recalculan las
  // posiciones de todo el grupo por tiempo. Si "Pepito" tenía el récord y
  // aparecía 1° en el ranking, y se carga a "Fulano" con un tiempo mejor,
  // Fulano pasa a 1° y Pepito queda 2° (no desaparece).

  async updateManualRecord(recordId: string, dto: UpdateRecordDto, adminUserId: string) {
    const current = await this.prisma.record.findUnique({ where: { id: recordId } });

    if (!current) throw new NotFoundException('Récord no encontrado.');
    if (!current.isCurrent || current.status !== 'homologated') {
      throw new BadRequestException('Solo se puede editar el récord vigente (isCurrent=true, homologated).');
    }
    if (current.scope === 'nacional') {
      throw new BadRequestException('Los récords nacionales son solo de referencia y no pueden editarse.');
    }
    if (dto.timeMs >= current.timeMs) {
      throw new BadRequestException(
        `El nuevo tiempo (${dto.timeMs} ms) debe ser mejor que el récord vigente (${current.timeMs} ms).`,
      );
    }

    const club = await this.prisma.club.findUnique({ where: { id: dto.clubId } });
    if (!club) throw new NotFoundException('Club no encontrado.');

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Buscar o crear al nuevo holder por nombre + club (sin DNI, como en la carga histórica)
      let swimmer = await tx.swimmer.findFirst({
        where: { firstName: dto.firstName, lastName: dto.lastName, currentClubId: dto.clubId },
      });
      if (!swimmer) {
        swimmer = await tx.swimmer.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            gender: current.gender === 'MIX' ? 'M' : current.gender,
            currentClubId: dto.clubId,
            source: 'manual',
          },
        });
      }

      // Superseder el récord vigente — se conserva íntegro, incluida su fila de ranking
      await tx.record.update({
        where: { id: current.id },
        data: { isCurrent: false, status: 'superseded' },
      });

      const newRecord = await tx.record.create({
        data: {
          scope: current.scope,
          eventDefinitionId: current.eventDefinitionId,
          categoryId: current.categoryId,
          gender: current.gender,
          poolLength: current.poolLength,
          timeMs: dto.timeMs,
          swimmerId: swimmer.id,
          clubId: dto.clubId,
          recordDate: new Date(dto.recordDate),
          tournamentName: dto.tournamentName ?? null,
          sourceResultId: null,
          status: 'homologated',
          isCurrent: true,
          previousRecordId: current.id,
          homologatedBy: adminUserId,
          homologatedAt: now,
          notes: dto.notes ?? null,
        },
        include: RECORD_INCLUDE,
      });

      // Buscar/crear la fila de ranking del nuevo holder (posición se recalcula abajo).
      // No se usa upsert con la clave compuesta porque Prisma rechaza `null` en
      // seasonId dentro de un where de unique compuesto, aunque la columna sea nullable.
      const existingRanking = await tx.ranking.findFirst({
        where: {
          swimmerId: swimmer.id,
          eventDefinitionId: current.eventDefinitionId,
          poolLength: current.poolLength,
          scope: current.scope,
          seasonId: null,
          categoryId: current.categoryId,
        },
      });

      if (existingRanking) {
        await tx.ranking.update({
          where: { id: existingRanking.id },
          data: { finalTime: dto.timeMs, clubId: dto.clubId, gender: current.gender, computedAt: now },
        });
      } else {
        await tx.ranking.create({
          data: {
            swimmerId: swimmer.id,
            eventDefinitionId: current.eventDefinitionId,
            poolLength: current.poolLength,
            gender: current.gender,
            scope: current.scope,
            seasonId: null,
            categoryId: current.categoryId,
            clubId: dto.clubId,
            position: 1,
            finalTime: dto.timeMs,
            sourceResultId: null,
            computedAt: now,
          },
        });
      }

      await this.recomputeRankingPositions(tx, {
        eventDefinitionId: current.eventDefinitionId,
        poolLength: current.poolLength,
        gender: current.gender,
        scope: current.scope,
        seasonId: null,
        categoryId: current.categoryId,
      });

      this.logger.log(
        `Record ${recordId} editado manualmente por ${adminUserId}. Nuevo holder: ${swimmer.id}, previo: ${current.id}`,
      );

      return newRecord;
    });
  }

  // Recalcula la posición (1..N) de todas las filas de Ranking de una misma
  // clave (evento + pileta + género + scope + temporada + categoría), ordenando
  // por finalTime. No borra ni crea filas — solo reordena.
  private async recomputeRankingPositions(
    tx: Prisma.TransactionClient,
    key: {
      eventDefinitionId: string;
      poolLength: PoolLength;
      gender: Gender;
      scope: Scope;
      seasonId: string | null;
      categoryId: string;
    },
  ): Promise<void> {
    const rows = await tx.ranking.findMany({
      where: {
        eventDefinitionId: key.eventDefinitionId,
        poolLength: key.poolLength,
        gender: key.gender,
        scope: key.scope,
        seasonId: key.seasonId,
        categoryId: key.categoryId,
      },
      orderBy: { finalTime: 'asc' },
    });

    await Promise.all(
      rows.map((row, idx) =>
        row.position === idx + 1
          ? Promise.resolve()
          : tx.ranking.update({ where: { id: row.id }, data: { position: idx + 1 } }),
      ),
    );
  }
}
