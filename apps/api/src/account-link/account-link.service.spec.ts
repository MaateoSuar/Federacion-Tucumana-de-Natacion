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
  auditLog: { create: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const USER = { id: 'u1', firstName: 'Juan', lastName: 'Gomez', swimmerId: null };
const SWIMMER = { id: 'sw1', firstName: 'Juan', lastName: 'Gomez', documentId: null };

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

  describe('approve', () => {
    const pendingReq = { id: 'req1', userId: 'u1', swimmerId: 'sw1', status: AccountLinkStatus.pending };

    it('approves and sets swimmerId on user', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue(null); // no conflict
      mockPrisma.user.findFirst.mockResolvedValue(null); // user not yet linked
      mockPrisma.accountLinkRequest.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.approve('req1', 'admin1', {});
      expect(result).toMatchObject({ message: expect.stringContaining('aprobada') });

      // Transaction called with 3 ops (update request, update user, create audit)
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws BadRequestException if request is not pending', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ ...pendingReq, status: 'approved' });
      await expect(service.approve('req1', 'admin1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException if swimmer already has another approved link', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.accountLinkRequest.findFirst.mockResolvedValue({ id: 'other', status: 'approved' });
      await expect(service.approve('req1', 'admin1', {})).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject', () => {
    const pendingReq = { id: 'req1', userId: 'u1', swimmerId: 'sw1', status: AccountLinkStatus.pending };

    it('rejects with a reason', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.accountLinkRequest.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.reject('req1', 'admin1', { reason: 'Datos incorrectos' });
      expect(result).toMatchObject({ message: 'Solicitud rechazada.' });
    });

    it('throws BadRequestException if no reason provided', async () => {
      await expect(service.reject('req1', 'admin1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException if request not pending', async () => {
      mockPrisma.accountLinkRequest.findUnique.mockResolvedValue({ ...pendingReq, status: 'approved' });
      await expect(service.reject('req1', 'admin1', { reason: 'Motivo' })).rejects.toBeInstanceOf(BadRequestException);
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
