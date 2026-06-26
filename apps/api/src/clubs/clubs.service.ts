import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubStatus, Prisma } from '@prisma/client';

export interface ClubFilters {
  search?: string;
  status?: ClubStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClubDto) {
    const existing = await this.prisma.club.findFirst({
      where: { shortName: dto.shortName },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un club con el identificador corto "${dto.shortName}"`,
      );
    }

    return this.prisma.club.create({ data: dto });
  }

  async findAll(filters: ClubFilters = {}) {
    const { search, status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ClubWhereInput = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shortName: { contains: search, mode: 'insensitive' } },
        { locality: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.club.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.club.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        affiliations: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { swimmers: true } },
      },
    });
    if (!club) throw new NotFoundException(`Club ${id} no encontrado`);
    return club;
  }

  async update(id: string, dto: UpdateClubDto) {
    await this.findOne(id);

    if (dto.shortName) {
      const conflict = await this.prisma.club.findFirst({
        where: { shortName: dto.shortName, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(
          `Ya existe un club con el identificador corto "${dto.shortName}"`,
        );
      }
    }

    return this.prisma.club.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.club.update({
      where: { id },
      data: { status: ClubStatus.baja },
    });
  }
}
