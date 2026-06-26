import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClubStatus } from '@prisma/client';

const mockClub = {
  id: 'club-1',
  name: 'Club Atlético Tucumán',
  shortName: 'CAT',
  locality: 'San Miguel de Tucumán',
  logoUrl: null,
  foundedYear: 1985,
  contactEmail: 'cat@example.com',
  status: ClubStatus.afiliado,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const prismaMock = {
  club: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('ClubsService', () => {
  let service: ClubsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClubsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ClubsService>(ClubsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('crea un club cuando el shortName no existe', async () => {
      prismaMock.club.findFirst.mockResolvedValue(null);
      prismaMock.club.create.mockResolvedValue(mockClub);

      const result = await service.create({
        name: 'Club Atlético Tucumán',
        shortName: 'CAT',
        locality: 'San Miguel de Tucumán',
      });

      expect(result).toEqual(mockClub);
      expect(prismaMock.club.create).toHaveBeenCalledTimes(1);
    });

    it('lanza ConflictException si el shortName ya existe', async () => {
      prismaMock.club.findFirst.mockResolvedValue(mockClub);

      await expect(
        service.create({
          name: 'Otro Club',
          shortName: 'CAT',
          locality: 'Tucumán',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.club.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('devuelve items paginados y total', async () => {
      prismaMock.club.findMany.mockResolvedValue([mockClub]);
      prismaMock.club.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('findOne', () => {
    it('devuelve el club si existe', async () => {
      prismaMock.club.findUnique.mockResolvedValue({ ...mockClub, affiliations: [], _count: { swimmers: 3 } });

      const result = await service.findOne('club-1');
      expect(result.id).toBe('club-1');
    });

    it('lanza NotFoundException si no existe', async () => {
      prismaMock.club.findUnique.mockResolvedValue(null);
      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza el club correctamente', async () => {
      prismaMock.club.findUnique.mockResolvedValue({ ...mockClub, affiliations: [], _count: { swimmers: 0 } });
      prismaMock.club.findFirst.mockResolvedValue(null);
      prismaMock.club.update.mockResolvedValue({ ...mockClub, name: 'Nombre Nuevo' });

      const result = await service.update('club-1', { name: 'Nombre Nuevo' });
      expect(result.name).toBe('Nombre Nuevo');
    });

    it('lanza ConflictException si el nuevo shortName ya pertenece a otro club', async () => {
      prismaMock.club.findUnique.mockResolvedValue({ ...mockClub, affiliations: [], _count: { swimmers: 0 } });
      prismaMock.club.findFirst.mockResolvedValue({ ...mockClub, id: 'club-2' });

      await expect(service.update('club-1', { shortName: 'CAT' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('cambia el status a baja (soft delete)', async () => {
      prismaMock.club.findUnique.mockResolvedValue({ ...mockClub, affiliations: [], _count: { swimmers: 0 } });
      prismaMock.club.update.mockResolvedValue({ ...mockClub, status: ClubStatus.baja });

      const result = await service.remove('club-1');
      expect(result.status).toBe(ClubStatus.baja);
    });
  });
});
