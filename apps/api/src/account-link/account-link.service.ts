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
import { assertTucumanSwimmer } from './tucuman-eligibility';

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
  swimmer: {
    select: {
      firstName: true,
      lastName: true,
      documentId: true,
      currentClubId: true,
      currentClub: { select: { name: true } },
      _count: { select: { results: true } },
    },
  },
  reviewer: { select: { firstName: true, lastName: true } },
} as const;

/** Quién revisa la solicitud: un Admin (todas) o un Entrenador (solo nadadores de su club). */
export interface ReviewerActor {
  id: string;
  primaryRole: string;
}

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

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
        select: { id: true, firstName: true, lastName: true, documentId: true, currentClub: { select: { name: true, province: true } } },
      }),
    ]);

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!swimmer) throw new NotFoundException('Nadador no encontrado.');
    // Solo nadadores de clubes de Tucumán tienen cuenta con seguimiento
    assertTucumanSwimmer(swimmer);

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

  /**
   * Alcance de quien revisa: el Admin ve todo; el Entrenador, solo a los nadadores de SU club
   * (el club se lee de la base, no del token). Cualquier otro rol no revisa.
   */
  private async reviewScope(actor: ReviewerActor): Promise<{ all: true } | { all: false; clubId: string }> {
    if (ADMIN_ROLES.includes(actor.primaryRole)) return { all: true };
    if (actor.primaryRole === 'COACH') {
      const coach = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { clubId: true, isActive: true } });
      if (coach?.isActive && coach.clubId) return { all: false, clubId: coach.clubId };
      throw new ForbiddenException('Tu cuenta de entrenador no tiene un club asignado.');
    }
    throw new ForbiddenException('No tenés permiso para revisar solicitudes de vinculación.');
  }

  private assertInScope(scope: { all: true } | { all: false; clubId: string }, swimmerClubId: string | null) {
    if (!scope.all && swimmerClubId !== scope.clubId) {
      throw new ForbiddenException('Solo podés revisar solicitudes de nadadores de tu club.');
    }
  }

  /** El motivo que escribió quien pidió vincularse vive en el registro de auditoría de la solicitud. */
  private async withReasons<T extends { id: string }>(requests: T[]): Promise<(T & { reason: string | null })[]> {
    if (requests.length === 0) return [];
    const logs = await this.prisma.auditLog.findMany({
      where: { action: 'ACCOUNT_LINK_REQUESTED', entityType: 'AccountLinkRequest', entityId: { in: requests.map((r) => r.id) } },
      select: { entityId: true, payload: true },
    });
    const byId = new Map(logs.map((l) => [l.entityId, (l.payload as { reason?: string | null } | null)?.reason ?? null]));
    return requests.map((r) => ({ ...r, reason: byId.get(r.id) ?? null }));
  }

  async listRequests(actor: ReviewerActor, status?: AccountLinkStatus) {
    const scope = await this.reviewScope(actor);
    const requests = await this.prisma.accountLinkRequest.findMany({
      where: { ...(status ? { status } : {}), ...(scope.all ? {} : { swimmer: { currentClubId: scope.clubId } }) },
      orderBy: { requestedAt: 'desc' },
      select: REQUEST_SELECT,
    });
    return this.withReasons(requests);
  }

  async getRequest(id: string, actor: ReviewerActor) {
    const scope = await this.reviewScope(actor);
    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    this.assertInScope(scope, req.swimmer.currentClubId);
    return (await this.withReasons([req]))[0];
  }

  async getMyRequests(userId: string) {
    return this.prisma.accountLinkRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      select: REQUEST_SELECT,
    });
  }

  async approve(requestId: string, actor: ReviewerActor, dto: ReviewLinkRequestDto) {
    const adminId = actor.id;
    const scope = await this.reviewScope(actor);
    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, swimmerId: true, status: true, swimmer: { select: { currentClubId: true, currentClub: { select: { name: true, province: true } } } } },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    this.assertInScope(scope, req.swimmer.currentClubId);
    if (req.userId === actor.id) throw new ForbiddenException('No podés revisar tu propia solicitud.');
    // El club pudo cambiar de provincia desde que se pidió
    assertTucumanSwimmer(req.swimmer);
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
          payload: { targetUserId: req.userId, swimmerId: req.swimmerId, reason: dto.reason ?? null, reviewerRole: actor.primaryRole, clubId: req.swimmer.currentClubId },
        },
      }),
    ]);

    this.logger.log(`Reviewer ${adminId} (${actor.primaryRole}) approved link request ${requestId} — user ${req.userId} → swimmer ${req.swimmerId}`);
    return { message: 'Solicitud aprobada. El nadador ahora tiene acceso a su historial.' };
  }

  async reject(requestId: string, actor: ReviewerActor, dto: ReviewLinkRequestDto) {
    const adminId = actor.id;
    if (!dto.reason?.trim()) {
      throw new BadRequestException('Se requiere un motivo para rechazar la solicitud.');
    }
    const scope = await this.reviewScope(actor);

    const req = await this.prisma.accountLinkRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, swimmerId: true, status: true, swimmer: { select: { currentClubId: true } } },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada.');
    this.assertInScope(scope, req.swimmer.currentClubId);
    if (req.userId === actor.id) throw new ForbiddenException('No podés revisar tu propia solicitud.');
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
          payload: { targetUserId: req.userId, swimmerId: req.swimmerId, reason: dto.reason, reviewerRole: actor.primaryRole, clubId: req.swimmer.currentClubId },
        },
      }),
    ]);

    this.logger.log(`Reviewer ${adminId} (${actor.primaryRole}) rejected link request ${requestId}`);
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
