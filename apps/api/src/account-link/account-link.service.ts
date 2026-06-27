import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AccountLinkStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkRequestDto } from './dto/create-link-request.dto';
import { ReviewLinkRequestDto } from './dto/review-link-request.dto';

function computeMatchConfidence(
  userFirstName: string,
  userLastName: string,
  swimmerFirstName: string,
  swimmerLastName: string,
  userDocumentId?: string | null,
  swimmerDocumentId?: string | null,
): number {
  if (
    userDocumentId &&
    swimmerDocumentId &&
    userDocumentId.trim() === swimmerDocumentId.trim()
  ) {
    return 95;
  }
  let score = 0;
  if (userFirstName.toLowerCase().trim() === swimmerFirstName.toLowerCase().trim()) score += 40;
  if (userLastName.toLowerCase().trim() === swimmerLastName.toLowerCase().trim()) score += 45;
  return Math.min(score, 100);
}

const REQUEST_SELECT = {
  id: true,
  userId: true,
  swimmerId: true,
  status: true,
  matchConfidence: true,
  requestedAt: true,
  reviewedAt: true,
  decisionReason: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true, email: true } },
  swimmer: { select: { firstName: true, lastName: true, documentId: true, currentClubId: true } },
  reviewer: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class AccountLinkService {
  private readonly logger = new Logger(AccountLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createRequest(userId: string, dto: CreateLinkRequestDto) {
    const [user, swimmer] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, swimmerId: true },
      }),
      this.prisma.swimmer.findUnique({
        where: { id: dto.swimmerId },
        select: { id: true, firstName: true, lastName: true, documentId: true },
      }),
    ]);

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!swimmer) throw new NotFoundException('Nadador no encontrado.');

    if (user.swimmerId) {
      throw new ConflictException('Ya tenés una cuenta vinculada a un nadador.');
    }

    const existingApproved = await this.prisma.accountLinkRequest.findFirst({
      where: { swimmerId: dto.swimmerId, status: AccountLinkStatus.approved },
    });
    if (existingApproved) {
      throw new ConflictException('Este nadador ya tiene una cuenta vinculada.');
    }

    const existingPending = await this.prisma.accountLinkRequest.findFirst({
      where: { userId, status: AccountLinkStatus.pending },
    });
    if (existingPending) {
      throw new ConflictException(
        'Ya tenés una solicitud de vinculación pendiente. Cancelala antes de crear una nueva.',
      );
    }

    const confidence = computeMatchConfidence(
      user.firstName,
      user.lastName,
      swimmer.firstName,
      swimmer.lastName,
    );

    const request = await this.prisma.accountLinkRequest.create({
      data: {
        userId,
        swimmerId: dto.swimmerId,
        matchConfidence: confidence,
      },
      select: REQUEST_SELECT,
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_LINK_REQUESTED',
        entityType: 'AccountLinkRequest',
        entityId: request.id,
        payload: { swimmerId: dto.swimmerId, confidence, reason: dto.reason ?? null },
      },
    });

    this.logger.log(`User ${userId} requested link to swimmer ${dto.swimmerId} (confidence: ${confidence})`);
    return request;
  }

  async listRequests(status?: AccountLinkStatus) {
    return this.prisma.accountLinkRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      select: REQUEST_SELECT,
    });
  }

  async getRequest(id: string) {
    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    return req;
  }

  async getMyRequests(userId: string) {
    return this.prisma.accountLinkRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      select: REQUEST_SELECT,
    });
  }

  async approve(requestId: string, adminId: string, dto: ReviewLinkRequestDto) {
    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, swimmerId: true, status: true },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    if (req.status !== AccountLinkStatus.pending) {
      throw new BadRequestException(
        `Solo se pueden aprobar solicitudes pendientes (estado actual: ${req.status}).`,
      );
    }

    const conflictSwimmer = await this.prisma.accountLinkRequest.findFirst({
      where: { swimmerId: req.swimmerId, status: AccountLinkStatus.approved },
    });
    if (conflictSwimmer) throw new ConflictException('Este nadador ya tiene una cuenta aprobada.');

    const conflictUser = await this.prisma.user.findFirst({
      where: { id: req.userId, NOT: { swimmerId: null } },
    });
    if (conflictUser) throw new ConflictException('Este usuario ya tiene un nadador vinculado.');

    await this.prisma.$transaction([
      this.prisma.accountLinkRequest.update({
        where: { id: requestId },
        data: {
          status: AccountLinkStatus.approved,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          decisionReason: dto.reason ?? null,
        },
      }),
      this.prisma.user.update({
        where: { id: req.userId },
        data: { swimmerId: req.swimmerId },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'ACCOUNT_LINK_APPROVED',
          entityType: 'AccountLinkRequest',
          entityId: requestId,
          payload: { targetUserId: req.userId, swimmerId: req.swimmerId, reason: dto.reason ?? null },
        },
      }),
    ]);

    this.logger.log(`Admin ${adminId} approved link request ${requestId} — user ${req.userId} → swimmer ${req.swimmerId}`);
    return { message: 'Solicitud aprobada. El nadador ahora tiene acceso a su historial.' };
  }

  async reject(requestId: string, adminId: string, dto: ReviewLinkRequestDto) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Se requiere un motivo para rechazar la solicitud.');
    }

    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, swimmerId: true, status: true },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    if (req.status !== AccountLinkStatus.pending) {
      throw new BadRequestException(
        `Solo se pueden rechazar solicitudes pendientes (estado actual: ${req.status}).`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.accountLinkRequest.update({
        where: { id: requestId },
        data: {
          status: AccountLinkStatus.rejected,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          decisionReason: dto.reason,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'ACCOUNT_LINK_REJECTED',
          entityType: 'AccountLinkRequest',
          entityId: requestId,
          payload: { targetUserId: req.userId, swimmerId: req.swimmerId, reason: dto.reason },
        },
      }),
    ]);

    this.logger.log(`Admin ${adminId} rejected link request ${requestId}`);
    return { message: 'Solicitud rechazada.' };
  }

  async cancel(requestId: string, userId: string) {
    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, status: true },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    if (req.userId !== userId) throw new ForbiddenException('No podés cancelar la solicitud de otro usuario.');
    if (req.status !== AccountLinkStatus.pending) {
      throw new BadRequestException(`Solo se pueden cancelar solicitudes pendientes (estado: ${req.status}).`);
    }

    await this.prisma.$transaction([
      this.prisma.accountLinkRequest.update({
        where: { id: requestId },
        data: { status: AccountLinkStatus.cancelled },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'ACCOUNT_LINK_CANCELLED',
          entityType: 'AccountLinkRequest',
          entityId: requestId,
          payload: {},
        },
      }),
    ]);

    return { message: 'Solicitud cancelada.' };
  }

  async getLinkedSwimmer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { swimmerId: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.swimmerId) {
      return { linked: false, swimmer: null };
    }

    const swimmer = await this.prisma.swimmer.findUnique({
      where: { id: user.swimmerId },
      include: {
        currentClub: { select: { id: true, name: true, shortName: true } },
        profile: true,
        personalBests: {
          include: { eventDefinition: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        },
      },
    });

    return { linked: true, swimmer };
  }
}
