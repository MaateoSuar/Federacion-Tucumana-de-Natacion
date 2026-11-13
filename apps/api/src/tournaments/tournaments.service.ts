import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HomologationService } from '../homologation/homologation.service';
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
import { UploadDayFileDto } from './dto/upload-day-file.dto';
import { parseSembradosPdf } from '../ingest/adapters/meet-manager-pdf/sembrados-pdf-parser';
import type { SembradoEventMeta } from '../ingest/adapters/meet-manager-pdf/sembrados-pdf-parser';
import { parseResultadosPdf } from '../ingest/adapters/meet-manager-pdf/resultados-pdf-parser';

// Mismo mapeo de códigos de stroke que usa el pipeline oficial (commit.processor.ts)
const STROKE_CODE: Record<string, string> = {
  libre: 'L',
  espalda: 'E',
  pecho: 'P',
  mariposa: 'MA',
  combinado: 'C',
};

// pdf-parse v1 exports a callable function as the default CJS export
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (
  dataBuffer: Buffer,
) => Promise<{ text: string }>;

// Máquina de estados: estado actual → único estado destino válido.
// "finalizado" no tiene transición manual siguiente: al alcanzarlo se
// homologa automáticamente (ver transition()) y el torneo queda en
// "homologado" sin intervención humana adicional.
const VALID_TRANSITIONS: Partial<Record<TournamentStatus, TournamentStatus>> = {
  [TournamentStatus.programado]: TournamentStatus.inscripciones_abiertas,
  [TournamentStatus.inscripciones_abiertas]: TournamentStatus.cerrado,
  [TournamentStatus.cerrado]: TournamentStatus.en_curso,
  [TournamentStatus.en_curso]: TournamentStatus.finalizado,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly homologationService: HomologationService,
  ) {}

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
    // "Finalizado" agrupa también a los ya homologados — la homologación es
    // automática al finalizar, no un estado que el usuario deba filtrar aparte.
    if (status === TournamentStatus.finalizado) {
      where.status = { in: [TournamentStatus.finalizado, TournamentStatus.homologado] };
    } else if (status) {
      where.status = status;
    }
    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (seasonId) where.seasonId = seasonId;
    if (search) {
      // Cada palabra escrita debe aparecer en algún campo, sin importar el
      // orden — evita que "Abierto Catamarca" falle por buscar la frase entera.
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      where.AND = tokens.map((token) => ({
        OR: [
          { name: { contains: token, mode: 'insensitive' } },
          { venue: { contains: token, mode: 'insensitive' } },
        ],
      }));
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

  async transition(id: string, targetStatus: TournamentStatus, userId: string) {
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

    await this.prisma.tournament.update({
      where: { id },
      data: { status: targetStatus },
    });

    // Al finalizar, se homologa automáticamente — no existe un paso manual
    // separado: todo torneo finalizado se da por homologado, y esto dispara
    // el pipeline de ranking/récords/mejores marcas para sus resultados.
    if (targetStatus === TournamentStatus.finalizado) {
      await this.homologationService.homologateTournament(id, userId);
    }

    return this.assertTournamentExists(id);
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

  /**
   * Mueve esta prueba y todas las que le siguen en orden (misma jornada actual)
   * a la próxima jornada. Pensado para corregir el corte por día cuando un
   * sembrado combinado de varias jornadas se subió entero a una sola.
   */
  async splitDayFromEvent(tournamentId: string, eventId: string) {
    const tournament = await this.assertTournamentExists(tournamentId);
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tournamentId } });
    if (!event) throw new NotFoundException(`Prueba ${eventId} no encontrada en este torneo`);

    const start = new Date(tournament.startDate).setHours(0, 0, 0, 0);
    const end = new Date(tournament.endDate).setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.round((end - start) / 86_400_000) + 1);

    const targetDay = event.dayNumber + 1;
    if (targetDay > totalDays) {
      throw new BadRequestException(
        `Este torneo tiene ${totalDays} jornada${totalDays !== 1 ? 's' : ''} — no existe una Jornada ${targetDay}`,
      );
    }

    const { count } = await this.prisma.event.updateMany({
      where: { tournamentId, dayNumber: event.dayNumber, orderNo: { gte: event.orderNo } },
      data: { dayNumber: targetDay },
    });

    return { movedCount: count, targetDay };
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

    // Fetch all sibling events with the same eventDefinition in this tournament
    // so results from all age categories are merged into one view
    const siblingIds = (
      await this.prisma.event.findMany({
        where: { tournamentId, eventDefinitionId: event.eventDefinitionId },
        select: { id: true },
      })
    ).map((e) => e.id);

    const results = await this.prisma.result.findMany({
      where: { eventId: { in: siblingIds } },
      orderBy: [
        { status: 'asc' },
        { finalTime: { sort: 'asc', nulls: 'last' } },
      ],
      include: {
        swimmer: { select: { id: true, firstName: true, lastName: true, gender: true } },
        club: { select: { id: true, name: true, shortName: true } },
        category: { select: { id: true, name: true, orderNo: true } },
        splits: { orderBy: { distance: 'asc' } },
      },
    });

    // Deduplicate: same swimmer in same category (from re-imports or sibling events)
    // Keep the result with the best (lowest) finalTime per swimmer+category pair
    const seen = new Map<string, (typeof results)[0]>();
    for (const r of results) {
      const key = `${r.swimmerId}-${(r.category as { id: string } | null)?.id ?? 'none'}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, r);
      } else if (
        r.finalTime != null &&
        (existing.finalTime == null || r.finalTime < existing.finalTime)
      ) {
        seen.set(key, r);
      }
    }
    const dedupedResults = [...seen.values()].sort((a, b) => {
      if (a.status === 'OK' && b.status !== 'OK') return -1;
      if (a.status !== 'OK' && b.status === 'OK') return 1;
      if (a.finalTime == null) return 1;
      if (b.finalTime == null) return -1;
      return a.finalTime - b.finalTime;
    });

    return { event, results: dedupedResults };
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

  // ─── Archivos de sembrados/resultados por jornada ──────────────────────────
  // Capa de referencia: solo guarda el archivo y, si es un PDF de sembrados
  // reconocible, la tabla extraída para mostrar. Nunca crea/modifica torneos,
  // registraciones ni resultados oficiales — ver sembrados-pdf-parser.ts.

  async addDayFile(
    tournamentId: string,
    dayNumber: number,
    fileBuffer: Buffer,
    fileUrl: string,
    mimeType: string,
    dto: UploadDayFileDto,
    uploadedBy: string,
  ) {
    await this.assertTournamentExists(tournamentId);

    let parsedRows: Prisma.InputJsonValue | undefined;
    let parseWarning: string | null = null;

    if (dto.type === 'sembrados' && mimeType === 'application/pdf') {
      try {
        const { text } = await pdfParse(fileBuffer);
        const result = parseSembradosPdf(text);
        parsedRows = result.rows as unknown as Prisma.InputJsonValue;
        parseWarning = result.warning;
        if (result.events.length > 0) {
          await this.createEventsFromSembrados(tournamentId, dayNumber, result.events);
        }
      } catch (err) {
        parseWarning = `No se pudo leer el PDF: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else if (dto.type === 'resultados' && mimeType === 'application/pdf') {
      try {
        const { text } = await pdfParse(fileBuffer);
        const result = parseResultadosPdf(text);
        parsedRows = result.rows as unknown as Prisma.InputJsonValue;
        parseWarning = result.warning;
      } catch (err) {
        parseWarning = `No se pudo leer el PDF: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return this.prisma.tournamentDayFile.create({
      data: {
        tournamentId,
        dayNumber,
        type: dto.type,
        title: dto.title,
        fileUrl,
        mimeType,
        parsedRows,
        parseWarning,
        uploadedBy,
      },
    });
  }

  async listDayFiles(tournamentId: string, dayNumber: number) {
    await this.assertTournamentExists(tournamentId);
    return this.prisma.tournamentDayFile.findMany({
      where: { tournamentId, dayNumber },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async removeDayFile(tournamentId: string, fileId: string) {
    const file = await this.prisma.tournamentDayFile.findFirst({
      where: { id: fileId, tournamentId },
    });
    if (!file) throw new NotFoundException(`Archivo ${fileId} no encontrado en este torneo`);
    return this.prisma.tournamentDayFile.delete({ where: { id: fileId } });
  }

  /**
   * Crea las Pruebas (Event) reales del torneo a partir de los eventos detectados
   * en un sembrado. Una Prueba por "Evento N" del PDF (no se separa por categoría
   * individual de cada nadador). Idempotente: si la prueba ya existe para este
   * torneo, se reutiliza — no se duplica ni se lanza error al resubir un archivo.
   */
  private async createEventsFromSembrados(
    tournamentId: string,
    dayNumber: number,
    events: SembradoEventMeta[],
  ) {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { orderNo: 'asc' },
    });

    const absCategory = categories.find((c) => c.code === 'ABS');
    let escuelaCategory = categories.find((c) => c.code === 'ESC');
    if (!escuelaCategory) {
      escuelaCategory = await this.prisma.category.create({
        data: {
          code: 'ESC',
          name: 'Escuela',
          minAge: null,
          maxAge: null,
          scope: 'provincial',
          orderNo: 18,
        },
      });
    }

    for (const ev of events) {
      if (!ev.stroke) continue; // no se pudo determinar el estilo (ej. relevos) — no se crea la prueba

      let category: (typeof categories)[number] | undefined;
      if (ev.competitionType === 'federados') {
        category = absCategory;
      } else if (ev.competitionType === 'escuela') {
        category = escuelaCategory;
      } else if (ev.competitionType === 'promocional') {
        category =
          categories.find((c) => c.minAge === ev.ageGroupMin && c.maxAge === ev.ageGroupMax) ??
          categories.find(
            (c) =>
              ev.ageGroupMin !== null &&
              (c.minAge === null || ev.ageGroupMin >= c.minAge) &&
              (c.maxAge === null || ev.ageGroupMin <= c.maxAge),
          ) ??
          absCategory;
      }
      if (!category) continue;

      const gender = ev.gender === 'F' ? 'F' : 'M';
      const strokeCode = STROKE_CODE[ev.stroke] ?? ev.stroke;
      const code = `${ev.distance}${strokeCode}_${gender}`;

      let eventDef = await this.prisma.eventDefinition.findUnique({ where: { code } });
      if (!eventDef) {
        eventDef = await this.prisma.eventDefinition.create({
          data: {
            code,
            stroke: ev.stroke,
            distance: ev.distance,
            gender,
            isRelay: false,
          },
        });
      }

      const existing = await this.prisma.event.findFirst({
        where: { tournamentId, eventDefinitionId: eventDef.id, categoryId: category.id },
      });
      if (existing) continue;

      await this.prisma.event.create({
        data: {
          tournamentId,
          eventDefinitionId: eventDef.id,
          categoryId: category.id,
          round: EventRound.serie_unica,
          orderNo: ev.eventNo,
          dayNumber,
          status: EventStatus.pendiente,
        },
      });
    }
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
