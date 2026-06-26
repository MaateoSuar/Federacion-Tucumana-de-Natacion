import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordQueryDto } from './dto/record-query.dto';

const RECORD_INCLUDE = {
  swimmer: { select: { id: true, firstName: true, lastName: true } },
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
          // Si no tenía previousRecordId seteado, lo seteamos ahora
          ...(current && !candidate.previousRecordId
            ? { previousRecordId: current.id }
            : {}),
        },
        include: RECORD_INCLUDE,
      });

      this.logger.log(
        `Record ${recordId} homologated by ${homologatedBy}. Previous: ${current?.id ?? 'none'}`,
      );

      return homologated;
    });
  }
}
