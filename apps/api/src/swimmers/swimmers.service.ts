import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwimmerDto } from './dto/create-swimmer.dto';
import { UpdateSwimmerDto } from './dto/update-swimmer.dto';
import { AssignClubDto } from './dto/assign-club.dto';
import { Gender, Prisma, ResultSource } from '@prisma/client';

export interface SwimmerFilters {
  search?: string;
  clubId?: string;
  gender?: Gender;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class SwimmersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSwimmerDto) {
    if (dto.documentId) {
      const existing = await this.prisma.swimmer.findUnique({
        where: { documentId: dto.documentId },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe un nadador con DNI "${dto.documentId}"`,
        );
      }
    }

    if (dto.currentClubId) {
      await this.ensureClubExists(dto.currentClubId);
    }

    return this.prisma.swimmer.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        documentId: dto.documentId ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender,
        nationality: dto.nationality ?? 'ARG',
        currentClubId: dto.currentClubId ?? null,
        photoUrl: dto.photoUrl ?? null,
        isActive: dto.isActive ?? true,
        source: ResultSource.manual,
      },
      include: { currentClub: true },
    });
  }

  async findAll(filters: SwimmerFilters = {}) {
    const { search, clubId, gender, isActive, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.SwimmerWhereInput = {};
    if (gender) where.gender = gender;
    if (isActive !== undefined) where.isActive = isActive;
    if (clubId) where.currentClubId = clubId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { documentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.swimmer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: { currentClub: { select: { id: true, name: true, shortName: true } } },
      }),
      this.prisma.swimmer.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const swimmer = await this.prisma.swimmer.findUnique({
      where: { id },
      include: {
        currentClub: true,
        profile: true,
        clubHistory: {
          include: {
            club: { select: { id: true, name: true, shortName: true } },
            season: { select: { id: true, year: true } },
          },
          orderBy: { startDate: 'desc' },
        },
      },
    });
    if (!swimmer) throw new NotFoundException(`Nadador ${id} no encontrado`);
    return swimmer;
  }

  async update(id: string, dto: UpdateSwimmerDto) {
    await this.findOne(id);

    if (dto.documentId) {
      const conflict = await this.prisma.swimmer.findUnique({
        where: { documentId: dto.documentId },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(
          `Ya existe un nadador con DNI "${dto.documentId}"`,
        );
      }
    }

    if (dto.currentClubId) {
      await this.ensureClubExists(dto.currentClubId);
    }

    return this.prisma.swimmer.update({
      where: { id },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.documentId !== undefined && { documentId: dto.documentId }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        }),
        ...(dto.gender && { gender: dto.gender }),
        ...(dto.nationality && { nationality: dto.nationality }),
        ...(dto.currentClubId !== undefined && { currentClubId: dto.currentClubId }),
        ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { currentClub: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.swimmer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assignClub(id: string, dto: AssignClubDto) {
    const swimmer = await this.findOne(id);

    await this.ensureClubExists(dto.clubId);

    const season = await this.prisma.season.findUnique({
      where: { id: dto.seasonId },
    });
    if (!season) {
      throw new NotFoundException(`Temporada ${dto.seasonId} no encontrada`);
    }

    if (swimmer.currentClubId === dto.clubId) {
      throw new BadRequestException('El nadador ya pertenece a ese club');
    }

    const startDate = new Date(dto.startDate);

    return this.prisma.$transaction(async (tx) => {
      // Cerrar entrada activa anterior (si existe)
      await tx.swimmerClubHistory.updateMany({
        where: { swimmerId: id, isActive: true },
        data: { isActive: false, endDate: startDate },
      });

      // Crear nueva entrada
      await tx.swimmerClubHistory.create({
        data: {
          swimmerId: id,
          clubId: dto.clubId,
          seasonId: dto.seasonId,
          startDate,
          isActive: true,
        },
      });

      // Actualizar club actual en el swimmer
      return tx.swimmer.update({
        where: { id },
        data: { currentClubId: dto.clubId },
        include: {
          currentClub: true,
          clubHistory: {
            include: {
              club: { select: { id: true, name: true, shortName: true } },
              season: { select: { id: true, year: true } },
            },
            orderBy: { startDate: 'desc' },
          },
        },
      });
    });
  }

  async getClubHistory(id: string) {
    await this.findOne(id);
    return this.prisma.swimmerClubHistory.findMany({
      where: { swimmerId: id },
      include: {
        club: { select: { id: true, name: true, shortName: true, logoUrl: true } },
        season: { select: { id: true, year: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getPersonalBests(id: string) {
    await this.findOne(id);
    return this.prisma.personalBest.findMany({
      where: { swimmerId: id },
      include: {
        eventDefinition: { select: { id: true, code: true, stroke: true, distance: true } },
        sourceResult: {
          select: {
            id: true,
            event: { select: { tournament: { select: { id: true, name: true, startDate: true } } } },
          },
        },
      },
      orderBy: [{ eventDefinition: { distance: 'asc' } }, { poolLength: 'asc' }],
    });
  }

  async getResults(id: string, page = 1, limit = 20) {
    await this.findOne(id);
    const skip = (page - 1) * limit;
    const [total, results] = await Promise.all([
      this.prisma.result.count({ where: { swimmerId: id, homologated: true, status: 'OK' } }),
      this.prisma.result.findMany({
        where: { swimmerId: id, homologated: true, status: 'OK' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          event: {
            include: {
              eventDefinition: { select: { id: true, code: true, stroke: true, distance: true } },
              tournament: { select: { id: true, name: true, startDate: true, poolLength: true } },
            },
          },
          club: { select: { id: true, name: true, shortName: true } },
          category: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);
    return { total, page, limit, results };
  }

  async getStatistics(swimmerId: string) {
    await this.findOne(swimmerId);
    const [stats, achievements] = await Promise.all([
      this.prisma.athleteStatistics.findMany({
        where: { swimmerId },
        include: { season: { select: { id: true, year: true } } },
        orderBy: [{ seasonId: 'asc' }],
      }),
      this.prisma.athleteAchievement.findMany({
        where: { swimmerId },
        orderBy: { achievedAt: 'desc' },
        take: 20,
        include: {
          tournament: { select: { id: true, name: true } },
          event: { select: { id: true, eventDefinition: { select: { stroke: true, distance: true } } } },
        },
      }),
    ]);
    const global = stats.find((s) => s.seasonId === null);
    const bySeason = stats.filter((s) => s.seasonId !== null);
    return { global, bySeason, achievements };
  }

  async getTimeEvolution(swimmerId: string, poolLength?: string) {
    await this.findOne(swimmerId);

    const where: Prisma.ResultWhereInput = {
      swimmerId,
      homologated: true,
      status: 'OK',
      finalTime: { not: null },
    };
    if (poolLength === 'P25' || poolLength === 'P50') {
      where.event = { tournament: { poolLength: poolLength as 'P25' | 'P50' } };
    }

    const results = await this.prisma.result.findMany({
      where,
      select: {
        finalTime: true,
        isPb: true,
        createdAt: true,
        event: {
          select: {
            eventDefinition: { select: { id: true, stroke: true, distance: true, gender: true } },
            tournament: {
              select: { poolLength: true, startDate: true, season: { select: { year: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by eventDefinitionId + poolLength → array of {year, bestTime}
    const map = new Map<string, { eventDef: { id: string; stroke: string; distance: number; gender: string }; pool: string; bySeason: Map<number, number> }>();

    for (const r of results) {
      if (r.finalTime === null) continue;
      const key = `${r.event.eventDefinition.id}_${r.event.tournament.poolLength}`;
      if (!map.has(key)) {
        map.set(key, {
          eventDef: r.event.eventDefinition,
          pool: r.event.tournament.poolLength,
          bySeason: new Map(),
        });
      }
      const entry = map.get(key)!;
      const year = r.event.tournament.season?.year ?? new Date(r.event.tournament.startDate).getFullYear();
      const current = entry.bySeason.get(year);
      if (current === undefined || r.finalTime < current) {
        entry.bySeason.set(year, r.finalTime);
      }
    }

    return Array.from(map.values()).map(({ eventDef, pool, bySeason }) => {
      const seasons = Array.from(bySeason.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, bestTime]) => ({ year, bestTime }));
      const times = seasons.map((s) => s.bestTime);
      const firstTime = times[0] ?? null;
      const bestTime = times.length ? Math.min(...times) : null;
      const improvementMs = firstTime && bestTime ? firstTime - bestTime : null;
      return { eventDef, pool, seasons, bestTime, improvementMs };
    });
  }

  async getProfile(swimmerId: string) {
    const swimmer = await this.prisma.swimmer.findUnique({
      where: { id: swimmerId },
      select: { id: true, isActive: true },
    });
    if (!swimmer) throw new NotFoundException(`Nadador ${swimmerId} no encontrado`);

    const profile = await this.prisma.athleteProfile.findUnique({
      where: { swimmerId },
    });
    if (!profile) {
      return this.prisma.athleteProfile.create({
        data: { swimmerId },
      });
    }
    return profile;
  }

  async updateProfile(
    swimmerId: string,
    requestingUserId: string,
    data: { bio?: string; photoUrl?: string; publicVisibility?: boolean },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
      select: { swimmerId: true, primaryRole: true },
    });
    const isAdmin = user?.primaryRole === 'ADMIN' || user?.primaryRole === 'SUPER_ADMIN';
    const isOwner = user?.swimmerId === swimmerId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Solo el nadador vinculado o un Admin pueden editar este perfil.');
    }

    await this.findOne(swimmerId);

    return this.prisma.athleteProfile.upsert({
      where: { swimmerId },
      create: { swimmerId, ...data },
      update: data,
    });
  }

  private async ensureClubExists(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException(`Club ${clubId} no encontrado`);
  }
}
