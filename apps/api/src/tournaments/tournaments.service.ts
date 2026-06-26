import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TournamentStatus,
  TournamentType,
  Scope,
  EventRound,
  EventStatus,
  Prisma,
} from '@prisma/client';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { AddEventDto } from './dto/add-event.dto';
import { GenerateHeatsDto } from './dto/generate-heats.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

// Máquina de estados: estado actual → único estado destino válido
const VALID_TRANSITIONS: Partial<Record<TournamentStatus, TournamentStatus>> = {
  [TournamentStatus.programado]: TournamentStatus.inscripciones_abiertas,
  [TournamentStatus.inscripciones_abiertas]: TournamentStatus.cerrado,
  [TournamentStatus.cerrado]: TournamentStatus.en_curso,
  [TournamentStatus.en_curso]: TournamentStatus.finalizado,
  [TournamentStatus.finalizado]: TournamentStatus.homologado,
};

export interface TournamentFilters {
  search?: string;
  status?: TournamentStatus;
  type?: TournamentType;
  scope?: Scope;
  seasonId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Catálogos (para selectores de UI) ────────────────────────────────────

  getEventDefinitions() {
    return this.prisma.eventDefinition.findMany({
      orderBy: [{ distance: 'asc' }, { stroke: 'asc' }],
    });
  }

  getCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { orderNo: 'asc' },
    });
  }

  getSeasons() {
    return this.prisma.season.findMany({
      orderBy: { year: 'desc' },
    });
  }

  // ─── CRUD de torneos ──────────────────────────────────────────────────────

  async create(dto: CreateTournamentDto) {
    await this.assertSeasonExists(dto.seasonId);
    if (dto.hostClubId) await this.assertClubExists(dto.hostClubId);

    return this.prisma.tournament.create({
      data: {
        name: dto.name,
        hostClubId: dto.hostClubId ?? null,
        venue: dto.venue ?? null,
        poolLength: dto.poolLength,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        type: dto.type,
        scope: dto.scope ?? Scope.provincial,
        seasonId: dto.seasonId,
        status: TournamentStatus.programado,
      },
      include: { hostClub: true, season: true },
    });
  }

  async findAll(filters: TournamentFilters = {}) {
    const { search, status, type, scope, seasonId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TournamentWhereInput = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (seasonId) where.seasonId = seasonId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { venue: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          hostClub: { select: { id: true, name: true, shortName: true } },
          season: { select: { id: true, year: true } },
          _count: { select: { events: true, documents: true } },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        hostClub: { select: { id: true, name: true, shortName: true } },
        season: { select: { id: true, year: true } },
        events: {
          orderBy: { orderNo: 'asc' },
          include: {
            eventDefinition: true,
            category: true,
            heats: {
              orderBy: { heatNumber: 'asc' },
              include: { laneAssignments: true },
            },
            _count: { select: { registrations: true, results: true } },
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          include: { uploader: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!tournament) throw new NotFoundException(`Torneo ${id} no encontrado`);
    return tournament;
  }

  async update(id: string, dto: UpdateTournamentDto) {
    await this.assertTournamentExists(id);
    if (dto.seasonId) await this.assertSeasonExists(dto.seasonId);
    if (dto.hostClubId) await this.assertClubExists(dto.hostClubId);

    return this.prisma.tournament.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: { hostClub: true, season: true },
    });
  }

  // ─── Máquina de estados ───────────────────────────────────────────────────

  async transition(id: string, targetStatus: TournamentStatus) {
    const tournament = await this.assertTournamentExists(id);
    const validNext = VALID_TRANSITIONS[tournament.status];

    if (!validNext) {
      throw new BadRequestException(
        `El torneo ya está en estado terminal "${tournament.status}"`,
      );
    }
    if (validNext !== targetStatus) {
      throw new BadRequestException(
        `La transición "${tournament.status}" → "${targetStatus}" no es válida. ` +
          `La transición permitida es hacia "${validNext}"`,
      );
    }

    // Pre-condiciones por transición
    if (targetStatus === TournamentStatus.inscripciones_abiertas) {
      const eventCount = await this.prisma.event.count({ where: { tournamentId: id } });
      if (eventCount === 0) {
        throw new BadRequestException(
          'El torneo debe tener al menos una prueba antes de abrir inscripciones',
        );
      }
    }

    if (targetStatus === TournamentStatus.en_curso) {
      const heatCount = await this.prisma.heat.count({
        where: { event: { tournamentId: id } },
      });
      if (heatCount === 0) {
        throw new BadRequestException(
          'Se debe generar al menos una serie antes de iniciar el torneo',
        );
      }
    }

    return this.prisma.tournament.update({
      where: { id },
      data: { status: targetStatus },
    });
  }

  // ─── Pruebas (Events) ─────────────────────────────────────────────────────

  async addEvent(tournamentId: string, dto: AddEventDto) {
    await this.assertTournamentExists(tournamentId);

    const [eventDef, category] = await Promise.all([
      this.prisma.eventDefinition.findUnique({ where: { id: dto.eventDefinitionId } }),
      this.prisma.category.findUnique({ where: { id: dto.categoryId } }),
    ]);
    if (!eventDef) throw new NotFoundException(`EventDefinition ${dto.eventDefinitionId} no encontrado`);
    if (!category) throw new NotFoundException(`Categoría ${dto.categoryId} no encontrada`);

    // Evitar duplicar la misma prueba+categoría+ronda en el mismo torneo
    const existing = await this.prisma.event.findFirst({
      where: {
        tournamentId,
        eventDefinitionId: dto.eventDefinitionId,
        categoryId: dto.categoryId,
        round: dto.round ?? EventRound.serie_unica,
      },
    });
    if (existing) {
      throw new ConflictException(
        `La prueba "${eventDef.code}" para la categoría "${category.name}" (${dto.round ?? 'serie_unica'}) ya existe en este torneo`,
      );
    }

    const maxOrder = await this.prisma.event.aggregate({
      where: { tournamentId },
      _max: { orderNo: true },
    });
    const orderNo = dto.orderNo ?? (maxOrder._max.orderNo ?? 0) + 1;

    return this.prisma.event.create({
      data: {
        tournamentId,
        eventDefinitionId: dto.eventDefinitionId,
        categoryId: dto.categoryId,
        round: dto.round ?? EventRound.serie_unica,
        orderNo,
        status: EventStatus.pendiente,
      },
      include: { eventDefinition: true, category: true },
    });
  }

  async removeEvent(tournamentId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tournamentId },
      include: {
        _count: { select: { registrations: true, heats: true, results: true } },
      },
    });
    if (!event) throw new NotFoundException(`Prueba ${eventId} no encontrada en este torneo`);

    if (event._count.registrations > 0 || event._count.results > 0) {
      throw new BadRequestException(
        'No se puede eliminar una prueba que tiene inscripciones o resultados registrados',
      );
    }

    // Eliminar heats y lane_assignments en cascada antes de borrar el event
    const heats = await this.prisma.heat.findMany({ where: { eventId }, select: { id: true } });
    for (const heat of heats) {
      await this.prisma.laneAssignment.deleteMany({ where: { heatId: heat.id } });
    }
    await this.prisma.heat.deleteMany({ where: { eventId } });
    return this.prisma.event.delete({ where: { id: eventId } });
  }

  async getEvents(tournamentId: string) {
    await this.assertTournamentExists(tournamentId);
    return this.prisma.event.findMany({
      where: { tournamentId },
      orderBy: { orderNo: 'asc' },
      include: {
        eventDefinition: true,
        category: true,
        _count: { select: { registrations: true, heats: true, results: true } },
      },
    });
  }

  // ─── Series (Heats) ───────────────────────────────────────────────────────

  async generateHeats(tournamentId: string, eventId: string, dto: GenerateHeatsDto) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tournamentId } });
    if (!event) throw new NotFoundException(`Prueba ${eventId} no encontrada en este torneo`);

    const lanesPerHeat = dto.lanesPerHeat ?? 8;

    // Obtener inscripciones aceptadas ordenadas por entryTime ASC (nulls al final)
    const registrations = await this.prisma.registration.findMany({
      where: { eventId, status: 'aceptada' },
      orderBy: [{ entryTime: { sort: 'asc', nulls: 'last' } }],
    });

    // Limpiar heats existentes (idempotencia)
    const existingHeats = await this.prisma.heat.findMany({
      where: { eventId },
      select: { id: true },
    });
    for (const h of existingHeats) {
      await this.prisma.laneAssignment.deleteMany({ where: { heatId: h.id } });
    }
    await this.prisma.heat.deleteMany({ where: { eventId } });

    if (registrations.length === 0) {
      // Sin inscripciones: crear 1 heat vacío para que se pueda iniciar el torneo
      await this.prisma.heat.create({ data: { eventId, heatNumber: 1 } });
      return this.getHeats(tournamentId, eventId);
    }

    // Agrupar en heats — las más lentas (índice 0) van en el primer heat
    const heatChunks: typeof registrations[] = [];
    for (let i = 0; i < registrations.length; i += lanesPerHeat) {
      heatChunks.push(registrations.slice(i, i + lanesPerHeat));
    }

    // Crear heats y lane_assignments
    let heatNumber = 1;
    for (const chunk of heatChunks) {
      const heat = await this.prisma.heat.create({
        data: { eventId, heatNumber: heatNumber++ },
      });
      for (let lane = 0; lane < chunk.length; lane++) {
        const registration = chunk[lane];
        if (!registration) continue;
        await this.prisma.laneAssignment.create({
          data: {
            heatId: heat.id,
            registrationId: registration.id,
            lane: lane + 1,
          },
        });
      }
    }

    return this.getHeats(tournamentId, eventId);
  }

  async getHeats(tournamentId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tournamentId } });
    if (!event) throw new NotFoundException(`Prueba ${eventId} no encontrada en este torneo`);

    return this.prisma.heat.findMany({
      where: { eventId },
      orderBy: { heatNumber: 'asc' },
      include: {
        laneAssignments: {
          orderBy: { lane: 'asc' },
          include: {
            registration: {
              include: { swimmer: true, club: true },
            },
          },
        },
      },
    });
  }

  // ─── Resultados públicos de una prueba ───────────────────────────────────

  async getEventResults(tournamentId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tournamentId },
      include: {
        eventDefinition: true,
        category: true,
        tournament: { select: { id: true, name: true, poolLength: true, startDate: true, scope: true } },
      },
    });
    if (!event) throw new NotFoundException(`Prueba ${eventId} no encontrada en este torneo`);

    const results = await this.prisma.result.findMany({
      where: { eventId },
      orderBy: [
        { status: 'asc' }, // OK primero
        { finalTime: { sort: 'asc', nulls: 'last' } },
      ],
      include: {
        swimmer: { select: { id: true, firstName: true, lastName: true, gender: true } },
        club: { select: { id: true, name: true, shortName: true } },
        splits: { orderBy: { distance: 'asc' } },
      },
    });

    return { event, results };
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  async addDocument(
    tournamentId: string,
    fileUrl: string,
    mimeType: string,
    dto: UploadDocumentDto,
    uploadedBy: string,
  ) {
    await this.assertTournamentExists(tournamentId);
    return this.prisma.tournamentDocument.create({
      data: {
        tournamentId,
        type: dto.type,
        title: dto.title,
        fileUrl,
        mimeType,
        uploadedBy,
      },
    });
  }

  async listDocuments(tournamentId: string) {
    await this.assertTournamentExists(tournamentId);
    return this.prisma.tournamentDocument.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async removeDocument(tournamentId: string, docId: string) {
    const doc = await this.prisma.tournamentDocument.findFirst({
      where: { id: docId, tournamentId },
    });
    if (!doc) throw new NotFoundException(`Documento ${docId} no encontrado en este torneo`);
    return this.prisma.tournamentDocument.delete({ where: { id: docId } });
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async assertTournamentExists(id: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Torneo ${id} no encontrado`);
    return t;
  }

  private async assertSeasonExists(id: string) {
    const s = await this.prisma.season.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Temporada ${id} no encontrada`);
    return s;
  }

  private async assertClubExists(id: string) {
    const c = await this.prisma.club.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Club ${id} no encontrado`);
    return c;
  }
}
