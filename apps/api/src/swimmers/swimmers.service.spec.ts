import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SwimmersService } from './swimmers.service';
import { PrismaService } from '../prisma/prisma.service';
import { Gender, ClubStatus, ResultSource } from '@prisma/client';

const mockClub = {
  id: 'club-1',
  name: 'Club Atlético',
  shortName: 'CA',
  locality: 'Tucumán',
  logoUrl: null,
  foundedYear: null,
  contactEmail: null,
  status: ClubStatus.afiliado,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSeason = {
  id: 'season-1',
  year: 2025,
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
  createdAt: new Date(),
};

const mockSwimmer = {
  id: 'swimmer-1',
  firstName: 'Juan',
  lastName: 'Pérez',
  documentId: '30123456',
  birthDate: new Date('2005-03-15'),
  gender: Gender.M,
  nationality: 'ARG',
  currentClubId: null,
  photoUrl: null,
  isActive: true,
  source: ResultSource.manual,
  createdAt: new Date(),
  updatedAt: new Date(),
  currentClub: null,
  profile: null,
  clubHistory: [],
};

const prismaMock = {
  swimmer: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  club: {
    findUnique: jest.fn(),
  },
  season: {
    findUnique: jest.fn(),
  },
  swimmerClubHistory: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('SwimmersService', () => {
  let service: SwimmersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwimmersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SwimmersService>(SwimmersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('crea un nadador sin DNI sin verificar duplicado', async () => {
      prismaMock.swimmer.create.mockResolvedValue({ ...mockSwimmer, documentId: null });

      const result = await service.create({
        firstName: 'Juan',
        lastName: 'Pérez',
        gender: Gender.M,
      });

      expect(result.firstName).toBe('Juan');
      expect(prismaMock.swimmer.findUnique).not.toHaveBeenCalled();
    });

    it('lanza ConflictException si el DNI ya existe', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue(mockSwimmer);

      await expect(
        service.create({
          firstName: 'Otro',
          lastName: 'Nadador',
          gender: Gender.M,
          documentId: '30123456',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza NotFoundException si el club no existe', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue(null); // no DNI conflict
      prismaMock.club.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          firstName: 'Juan',
          lastName: 'Pérez',
          gender: Gender.M,
          currentClubId: 'club-inexistente',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('devuelve el nadador si existe', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue(mockSwimmer);
      const result = await service.findOne('swimmer-1');
      expect(result.id).toBe('swimmer-1');
    });

    it('lanza NotFoundException si no existe', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue(null);
      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignClub', () => {
    it('cierra historial anterior y crea nueva entrada en una transacción', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue({
        ...mockSwimmer,
        currentClubId: 'club-old',
        clubHistory: [],
      });
      prismaMock.club.findUnique.mockResolvedValue(mockClub);
      prismaMock.season.findUnique.mockResolvedValue(mockSeason);

      const updatedSwimmer = { ...mockSwimmer, currentClubId: 'club-1' };
      prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
        return fn(prismaMock);
      });
      prismaMock.swimmerClubHistory.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.swimmerClubHistory.create.mockResolvedValue({});
      prismaMock.swimmer.update.mockResolvedValue(updatedSwimmer);

      const result = await service.assignClub('swimmer-1', {
        clubId: 'club-1',
        seasonId: 'season-1',
        startDate: '2025-03-01',
      });

      expect(prismaMock.swimmerClubHistory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { swimmerId: 'swimmer-1', isActive: true } }),
      );
      expect(prismaMock.swimmerClubHistory.create).toHaveBeenCalledTimes(1);
      expect(result.currentClubId).toBe('club-1');
    });

    it('lanza BadRequestException si el nadador ya pertenece al mismo club', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue({
        ...mockSwimmer,
        currentClubId: 'club-1',
        clubHistory: [],
      });
      prismaMock.club.findUnique.mockResolvedValue(mockClub);
      prismaMock.season.findUnique.mockResolvedValue(mockSeason);

      await expect(
        service.assignClub('swimmer-1', {
          clubId: 'club-1',
          seasonId: 'season-1',
          startDate: '2025-03-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el club destino no existe', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue({ ...mockSwimmer, clubHistory: [] });
      prismaMock.club.findUnique.mockResolvedValue(null);

      await expect(
        service.assignClub('swimmer-1', {
          clubId: 'no-existe',
          seasonId: 'season-1',
          startDate: '2025-03-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('desactiva el nadador (soft delete)', async () => {
      prismaMock.swimmer.findUnique.mockResolvedValue({ ...mockSwimmer, clubHistory: [] });
      prismaMock.swimmer.update.mockResolvedValue({ ...mockSwimmer, isActive: false });

      const result = await service.remove('swimmer-1');
      expect(result.isActive).toBe(false);
    });
  });
});
