import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertTucumanSwimmer } from '../account-link/tucuman-eligibility';
import { generateClaimCode, hashClaimCodeBody, normalizeClaimCode } from './claim-code.util';

export const CLAIM_CODE_DEFAULT_DAYS = 14;
export const CLAIM_CODE_MAX_DAYS = 90;

type Tx = Prisma.TransactionClient;

/** Mismo mensaje para código inexistente, vencido, usado o revocado: no se revela cuál es. */
export const INVALID_CODE = 'El código es inválido, venció o ya fue usado. Pedile uno nuevo a tu club o a la federación.';

// Protección contra adivinanza de códigos. Los intentos fallidos quedan en audit_logs (persisten
// entre reinicios y entre instancias). El espacio de códigos es de ~6,5×10¹¹: con estos topes
// adivinar uno es inviable.
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 8;
const MAX_FAILURES_GLOBAL = 100;

export type ClaimCodeStatus = 'activo' | 'usado' | 'vencido' | 'revocado';

@Injectable()
export class ClaimCodeService {
  private readonly logger = new Logger(ClaimCodeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Un Admin genera un código para UN nadador. El código en claro se devuelve esta única vez.
   * Un nadador tiene a lo sumo un código activo: al generar uno nuevo se revocan los anteriores.
   */
  async create(swimmerId: string, adminId: string, expiresInDays = CLAIM_CODE_DEFAULT_DAYS) {
    const days = Math.min(Math.max(Math.floor(expiresInDays) || CLAIM_CODE_DEFAULT_DAYS, 1), CLAIM_CODE_MAX_DAYS);

    return this.prisma.$transaction(async (tx) => {
      const swimmer = await tx.swimmer.findUnique({
        where: { id: swimmerId },
        select: { id: true, firstName: true, lastName: true, currentClub: { select: { name: true, province: true } } },
      });
      if (!swimmer) throw new NotFoundException('Nadador no encontrado.');
      // Solo nadadores de clubes de Tucumán tienen cuenta
      assertTucumanSwimmer(swimmer);

      // Regla 6: un nadador, una sola cuenta. Si ya tiene una, el código no tiene sentido.
      if (await tx.user.findFirst({ where: { swimmerId }, select: { id: true } })) {
        throw new ConflictException('Este nadador ya tiene una cuenta vinculada: no hace falta un código.');
      }

      await tx.swimmerClaimCode.updateMany({ where: { swimmerId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });

      // Un código nunca se repite: se genera hasta que su hash no exista (colisión casi imposible)
      let code = generateClaimCode();
      for (let i = 0; i < 5 && (await tx.swimmerClaimCode.findUnique({ where: { codeHash: hashClaimCodeBody(normalizeClaimCode(code) as string) } })); i++) {
        code = generateClaimCode();
      }
      const body = normalizeClaimCode(code) as string;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const row = await tx.swimmerClaimCode.create({
        data: { swimmerId, codeHash: hashClaimCodeBody(body), codeHint: body.slice(-4), createdBy: adminId, expiresAt },
      });
      await tx.auditLog.create({
        data: { userId: adminId, action: 'CLAIM_CODE_CREATED', entityType: 'swimmer', entityId: swimmerId, payload: { claimCodeId: row.id, expiresAt: expiresAt.toISOString() } },
      });

      this.logger.log(`Admin ${adminId} generó el código ${row.id} para el nadador ${swimmerId}`);
      return {
        id: row.id,
        code, // se muestra una sola vez
        expiresAt,
        swimmer: { id: swimmer.id, firstName: swimmer.firstName, lastName: swimmer.lastName, club: swimmer.currentClub?.name ?? null },
      };
    });
  }

  /** Códigos de un nadador con su estado (sin el código en claro). */
  async listForSwimmer(swimmerId: string) {
    const rows = await this.prisma.swimmerClaimCode.findMany({
      where: { swimmerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, codeHint: true, expiresAt: true, usedAt: true, revokedAt: true, createdAt: true,
        creator: { select: { firstName: true, lastName: true } },
        redeemer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    const now = Date.now();
    return rows.map((r) => ({
      ...r,
      status: (r.usedAt ? 'usado' : r.revokedAt ? 'revocado' : r.expiresAt.getTime() <= now ? 'vencido' : 'activo') as ClaimCodeStatus,
    }));
  }

  async revoke(codeId: string, adminId: string) {
    const row = await this.prisma.swimmerClaimCode.findUnique({ where: { id: codeId } });
    if (!row) throw new NotFoundException('Código no encontrado.');
    if (row.usedAt) throw new BadRequestException('Ese código ya fue usado: no se puede revocar.');
    if (row.revokedAt) return { message: 'El código ya estaba revocado.' };
    await this.prisma.$transaction([
      this.prisma.swimmerClaimCode.update({ where: { id: codeId }, data: { revokedAt: new Date() } }),
      this.prisma.auditLog.create({
        data: { userId: adminId, action: 'CLAIM_CODE_REVOKED', entityType: 'swimmer', entityId: row.swimmerId, payload: { claimCodeId: codeId } },
      }),
    ]);
    return { message: 'Código revocado.' };
  }

  /**
   * Canjea un código dentro de la transacción del llamador (registro o usuario ya logueado).
   * Todo o nada: valida el código, vincula la cuenta al nadador (que el Admin haya generado el
   * código es la aprobación humana), deja la solicitud de vinculación como aprobada y audita.
   */
  async redeemInTransaction(tx: Tx, userId: string, rawCode: string): Promise<{ swimmerId: string; requestId: string }> {
    const body = normalizeClaimCode(rawCode ?? '');
    if (!body) throw new BadRequestException(INVALID_CODE);

    const found = await tx.swimmerClaimCode.findUnique({ where: { codeHash: hashClaimCodeBody(body) } });
    if (!found) throw new BadRequestException(INVALID_CODE);

    // Se bloquea la fila: dos canjes simultáneos del mismo código no pueden pasar los dos.
    await tx.$queryRaw`SELECT id FROM swimmer_claim_codes WHERE id = ${found.id} FOR UPDATE`;
    const code = await tx.swimmerClaimCode.findUniqueOrThrow({ where: { id: found.id } });
    if (code.usedAt || code.revokedAt || code.expiresAt.getTime() <= Date.now()) throw new BadRequestException(INVALID_CODE);

    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, swimmerId: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.swimmerId) throw new ConflictException('Tu cuenta ya está vinculada a un nadador.');
    if (await tx.user.findFirst({ where: { swimmerId: code.swimmerId }, select: { id: true } })) {
      throw new ConflictException('Este nadador ya tiene una cuenta vinculada.');
    }
    // El club pudo cambiar de provincia desde que se generó el código
    const target = await tx.swimmer.findUniqueOrThrow({ where: { id: code.swimmerId }, select: { currentClub: { select: { name: true, province: true } } } });
    assertTucumanSwimmer(target);

    const now = new Date();
    const request = await tx.accountLinkRequest.create({
      data: {
        userId,
        swimmerId: code.swimmerId,
        status: 'approved',
        matchConfidence: 100,
        reviewedBy: code.createdBy,
        reviewedAt: now,
        decisionReason: 'Código de perfil generado por un administrador',
      },
    });
    await tx.user.update({ where: { id: userId }, data: { swimmerId: code.swimmerId } });
    await tx.swimmerClaimCode.update({ where: { id: code.id }, data: { usedAt: now, usedBy: userId } });
    await tx.auditLog.createMany({
      data: [
        { userId, action: 'CLAIM_CODE_REDEEMED', entityType: 'swimmer', entityId: code.swimmerId, payload: { claimCodeId: code.id, requestId: request.id } },
        // La aprobación humana es la de quien generó el código
        { userId: code.createdBy, action: 'ACCOUNT_LINK_APPROVED', entityType: 'AccountLinkRequest', entityId: request.id, payload: { targetUserId: userId, swimmerId: code.swimmerId, via: 'claim_code', claimCodeId: code.id } },
      ],
    });
    return { swimmerId: code.swimmerId, requestId: request.id };
  }

  /** ¿Existe un código activo (no usado, no revocado, no vencido) con ese valor? Solo lectura, sin revelar el motivo. */
  async isRedeemable(rawCode: string): Promise<boolean> {
    const body = normalizeClaimCode(rawCode ?? '');
    if (!body) return false;
    const code = await this.prisma.swimmerClaimCode.findUnique({ where: { codeHash: hashClaimCodeBody(body) }, select: { usedAt: true, revokedAt: true, expiresAt: true } });
    return !!code && !code.usedAt && !code.revokedAt && code.expiresAt.getTime() > Date.now();
  }

  /** Corta los intentos si esta IP (o el sistema entero) acumuló demasiados códigos incorrectos hace poco. */
  async assertNotLockedOut(ip: string | null): Promise<void> {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const [byIp, global] = await Promise.all([
      ip ? this.prisma.auditLog.count({ where: { action: 'CLAIM_CODE_FAILED', ipAddress: ip, createdAt: { gte: since } } }) : Promise.resolve(0),
      this.prisma.auditLog.count({ where: { action: 'CLAIM_CODE_FAILED', createdAt: { gte: since } } }),
    ]);
    if (byIp >= MAX_FAILURES_PER_IP || global >= MAX_FAILURES_GLOBAL) {
      this.logger.warn(`Registro con código bloqueado (IP ${ip ?? '?'}: ${byIp} fallos, global: ${global})`);
      throw new HttpException('Hubo demasiados intentos con códigos incorrectos. Esperá unos minutos y volvé a probar, o pedile el código a tu club o a la federación.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Anota un intento con código incorrecto (nunca se guarda el código escrito). */
  async recordFailure(ip: string | null, via: 'register' | 'redeem'): Promise<void> {
    await this.prisma.auditLog.create({
      data: { action: 'CLAIM_CODE_FAILED', entityType: 'auth', entityId: via, ipAddress: ip, payload: { via } },
    });
  }

  /** Canje de un usuario ya logueado y sin vincular. */
  async redeem(userId: string, rawCode: string, ip: string | null = null) {
    await this.assertNotLockedOut(ip);
    if (!(await this.isRedeemable(rawCode))) {
      await this.recordFailure(ip, 'redeem');
      throw new BadRequestException(INVALID_CODE);
    }
    const result = await this.prisma.$transaction((tx) => this.redeemInTransaction(tx, userId, rawCode), { maxWait: 10_000, timeout: 30_000 });
    return { message: 'Listo: tu cuenta quedó vinculada a tu perfil de nadador.', swimmerId: result.swimmerId };
  }
}
