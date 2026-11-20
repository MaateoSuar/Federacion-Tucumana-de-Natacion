import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountLinkStatus } from '@prisma/client';
import { AccountLinkService } from './account-link.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  swimmer: { findUnique: jest.fn() },
  accountLinkRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const USER = { id: 'u1', firstName: 'Juan', lastName: 'Gomez', swimmerId: null };
const ADMIN = { id: 'admin1', primaryRole: 'ADMIN' };
const COACH = { id: 'coach1', primaryRole: 'COACH' };
const SWIMMER = { id: 'sw1', firstName: 'Juan', lastName: 'Gomez', documentId: null, currentClub: { name: 'Club Azucena', province: 'Tucumán' } };

describe('AccountLinkService', () => {
  let service: AccountLinkService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountLinkService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AccountLinkService);
  });

  describe('createRequest', () => {
    it('creates a request and calculates confidence', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPrisma.swimmer.findUnique.mockResolvedValue(SWIMMER);
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue(null);
      mockPrisma.accountLinkRequest.create.mockResolvedValue({ id: 'req1', matchConfidence: 85 });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createRequest('u1', { swimmerId: 'sw1' });
      expect(result).toMatchObject({ id: 'req1' });
      expect(mockPrisma.accountLinkRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ swimmerId: 'sw1', userId: 'u1' }) }),
      );
    });

    it('throws ConflictException if user already linked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...USER, swimmerId: 'sw99' });
      mockPrisma.swimmer.findUnique.mockResolvedValue(SWIMMER);
      await expect(service.createRequest('u1', { swimmerId: 'sw1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException if swimmer already approved for another user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPrisma.swimmer.findUnique.mockResolvedValue(SWIMMER);
      mockPrisma.accountLinkRequest.findFirst
        .mockResolvedValueOnce({ id: 'existing', status: 'approved' }); // existingApproved
      await expect(service.createRequest('u1', { swimmerId: 'sw1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException if user already has pending request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPrisma.swimmer.findUnique.mockResolvedValue(SWIMMER);
      mockPrisma.accountLinkRequest.findFirst
        .mockResolvedValueOnce(null) // no approved for swimmer
        .mockResolvedValueOnce({ id: 'pending1', status: 'pending' }); // pending for user
      await expect(service.createRequest('u1', { swimmerId: 'sw1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException if swimmer not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPrisma.swimmer.findUnique.mockResolvedValue(null);
      await expect(service.createRequest('u1', { swimmerId: 'sw-missing' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('solo nadadores de clubes de Tucumán', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(USER);
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue(null);
    });

    it('no se puede pedir vincularse a un nadador de un club de otra provincia', async () => {
      mockPrisma.swimmer.findUnique.mockResolvedValue({ ...SWIMMER, currentClub: { name: 'Club Salteño', province: 'Salta' } });
      await expect(service.createRequest('u1', { swimmerId: 'sw1' })).rejects.toThrow(/solo para nadadores de clubes de Tucumán/);
    });

    it('un club sin provincia asignada tampoco: se le pide a la federación completarla', async () => {
      mockPrisma.swimmer.findUnique.mockResolvedValue({ ...SWIMMER, currentClub: { name: 'Club Sin Datos', province: null } });
      await expect(service.createRequest('u1', { swimmerId: 'sw1' })).rejects.toThrow(/todavía no tiene provincia/);
    });

    it('un nadador sin club no se puede vincular', async () => {
      mockPrisma.swimmer.findUnique.mockResolvedValue({ ...SWIMMER, currentClub: null });
      await expect(service.createRequest('u1', { swimmerId: 'sw1' })).rejects.toThrow(/no tiene club asignado/);
    });

    it('al aprobar se vuelve a verificar: si el club pasó a otra provincia, no se aprueba', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({
        id: 'req1', userId: 'u1', swimmerId: 'sw1', status: AccountLinkStatus.pending,
        swimmer: { currentClubId: 'clubA', currentClub: { name: 'Club A', province: 'Jujuy' } },
      });
      await expect(service.approve('req1', ADMIN, {})).rejects.toThrow(/solo para nadadores de clubes de Tucumán/);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    const pendingReq = { id: 'req1', userId: 'u1', swimmerId: 'sw1', status: AccountLinkStatus.pending, swimmer: { currentClubId: 'clubA', currentClub: { name: 'Club A', province: 'Tucumán' } } };

    it('approves and sets swimmerId on user', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue(null); // no conflict
      mockPrisma.user.findFirst.mockResolvedValue(null); // user not yet linked
      mockPrisma.accountLinkRequest.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.approve('req1', ADMIN, {});
      expect(result).toMatchObject({ message: expect.stringContaining('aprobada') });

      // Transaction called with 3 ops (update request, update user, create audit)
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws BadRequestException if request is not pending', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ ...pendingReq, status: 'approved' });
      await expect(service.approve('req1', ADMIN, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException if swimmer already has another approved link', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue({ id: 'other', status: 'approved' });
      await expect(service.approve('req1', ADMIN, {})).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject', () => {
    const pendingReq = { id: 'req1', userId: 'u1', swimmerId: 'sw1', status: AccountLinkStatus.pending, swimmer: { currentClubId: 'clubA', currentClub: { name: 'Club A', province: 'Tucumán' } } };

    it('rejects with a reason', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.accountLinkRequest.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.reject('req1', ADMIN, { reason: 'Datos incorrectos' });
      expect(result).toMatchObject({ message: 'Solicitud rechazada.' });
    });

    it('throws BadRequestException if no reason provided', async () => {
      await expect(service.reject('req1', ADMIN, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException if request not pending', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ ...pendingReq, status: 'approved' });
      await expect(service.reject('req1', ADMIN, { reason: 'Motivo' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('entrenador: solo nadadores de su club', () => {
    const pendingReq = { id: 'req1', userId: 'u1', swimmerId: 'sw1', status: AccountLinkStatus.pending, swimmer: { currentClubId: 'clubA', currentClub: { name: 'Club A', province: 'Tucumán' } } };
    const asCoachOf = (clubId: string | null, isActive = true) => mockPrisma.user.findUnique.mockResolvedValue({ clubId, isActive });

    beforeEach(() => {
      mockPrisma.accountLinkRequest.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);
    });

    it('aprueba la solicitud de un nadador de su club y deja su rol en la auditoría', async () => {
      asCoachOf('clubA');
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      await expect(service.approve('req1', COACH, {})).resolves.toMatchObject({ message: expect.stringContaining('aprobada') });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'coach1', payload: expect.objectContaining({ reviewerRole: 'COACH', clubId: 'clubA' }) }) }),
      );
    });

    it('NO puede aprobar ni rechazar a un nadador de otro club', async () => {
      asCoachOf('clubB');
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      await expect(service.approve('req1', COACH, {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.reject('req1', COACH, { reason: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('NO puede revisar a un nadador sin club asignado (eso lo ve solo la federación)', async () => {
      asCoachOf('clubA');
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ ...pendingReq, swimmer: { currentClubId: null, currentClub: null } });
      await expect(service.approve('req1', COACH, {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un entrenador sin club, inactivo o con otro rol no revisa nada', async () => {
      asCoachOf(null);
      await expect(service.listRequests(COACH)).rejects.toBeInstanceOf(ForbiddenException);
      asCoachOf('clubA', false);
      await expect(service.listRequests(COACH)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listRequests({ id: 'n1', primaryRole: 'SWIMMER' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('no puede revisar su propia solicitud', async () => {
      asCoachOf('clubA');
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ ...pendingReq, userId: 'coach1' });
      await expect(service.approve('req1', COACH, {})).rejects.toThrow(/tu propia solicitud/);
    });

    it('la lista del entrenador se filtra por el club de los nadadores; la del Admin no', async () => {
      mockPrisma.accountLinkRequest.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      asCoachOf('clubA');
      await service.listRequests(COACH, AccountLinkStatus.pending);
      expect(mockPrisma.accountLinkRequest.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { status: 'pending', swimmer: { currentClubId: 'clubA' } } }),
      );
      await service.listRequests(ADMIN);
      expect(mockPrisma.accountLinkRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
    });

    it('el detalle de una solicitud de otro club da 403', async () => {
      asCoachOf('clubB');
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ id: 'req1', swimmer: { currentClubId: 'clubA', currentClub: { name: 'Club A', province: 'Tucumán' } } });
      await expect(service.getRequest('req1', COACH)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('cancels own pending request', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ id: 'req1', userId: 'u1', status: 'pending' });
      mockPrisma.accountLinkRequest.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.cancel('req1', 'u1');
      expect(result).toMatchObject({ message: 'Solicitud cancelada.' });
    });

    it('throws ForbiddenException if trying to cancel another user\'s request', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ id: 'req1', userId: 'u2', status: 'pending' });
      await expect(service.cancel('req1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException if request not pending', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ id: 'req1', userId: 'u1', status: 'approved' });
      await expect(service.cancel('req1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getLinkedSwimmer', () => {
    it('returns linked: false when user has no swimmer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ swimmerId: null });
      const result = await service.getLinkedSwimmer('u1');
      expect(result).toEqual({ linked: false, swimmer: null });
    });

    it('returns swimmer data when user is linked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ swimmerId: 'sw1' });
      mockPrisma.swimmer.findUnique.mockResolvedValue({ id: 'sw1', firstName: 'Juan', lastName: 'Gomez' });
      const result = await service.getLinkedSwimmer('u1');
      expect(result).toMatchObject({ linked: true, swimmer: { id: 'sw1' } });
    });
  });
});
