/**
 * Códigos de perfil contra Postgres REAL (se activa solo con MERGE_TEST_DATABASE_URL, una base
 * descartable con las migraciones aplicadas; se vacía en cada corrida). Ver merge.integration.spec.ts.
 * IMPORTANTE: correr con --runInBand: las suites de integración comparten (y vacían) la misma base.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { ClaimCodeService } from './claim-code.service';
import { AuthService } from '../auth/auth.service';
import { hashClaimCodeBody, normalizeClaimCode } from './claim-code.util';
import { SwimmerMergeService } from '../swimmers/merge/swimmer-merge.service';

const url = process.env.MERGE_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
jest.setTimeout(60_000);

suite('códigos de perfil contra Postgres real', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prisma = db as unknown as PrismaService;
  const claimCodes = new ClaimCodeService(prisma);
  const config = { get: (_k: string, d?: string) => d, getOrThrow: () => 'x' } as unknown as ConfigService;
  const auth = new AuthService(prisma, {} as JwtService, config, claimCodes);

  let adminId: string;
  let swimmerId: string;
  const registerDto = (over: Record<string, unknown> = {}) => ({
    email: 'emi@test.ar', password: 'Clave1234!', firstName: 'Emiliano', lastName: 'La Marca', ...over,
  });

  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });

  beforeEach(async () => {
    await db.$executeRawUnsafe(`TRUNCATE users, swimmers, clubs RESTART IDENTITY CASCADE`);
    adminId = (await db.user.create({ data: { email: 'admin@t.ar', passwordHash: 'x', firstName: 'Ad', lastName: 'Min', primaryRole: 'ADMIN' } })).id;
    swimmerId = (await db.swimmer.create({ data: { firstName: 'Emiliano', lastName: 'La Marca', gender: 'M' } })).id;
  });

  it('un Admin genera un código: se guarda solo el hash y se muestra una vez', async () => {
    const created = await claimCodes.create(swimmerId, adminId);
    expect(created.code).toMatch(/^FTN-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const row = await db.swimmerClaimCode.findUniqueOrThrow({ where: { id: created.id } });
    const body = normalizeClaimCode(created.code) as string;
    expect(row.codeHash).toBe(hashClaimCodeBody(body));
    expect(JSON.stringify(row)).not.toContain(body);
    expect(row.codeHint).toBe(body.slice(-4));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);
    expect(await db.auditLog.count({ where: { action: 'CLAIM_CODE_CREATED', entityId: swimmerId } })).toBe(1);

    const list = await claimCodes.listForSwimmer(swimmerId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'activo', codeHint: body.slice(-4) });
    expect(JSON.stringify(list)).not.toContain(body);
  });

  it('un código nuevo revoca el activo anterior (un solo código activo por nadador)', async () => {
    const first = await claimCodes.create(swimmerId, adminId);
    await claimCodes.create(swimmerId, adminId);
    const list = await claimCodes.listForSwimmer(swimmerId);
    expect(list.filter((c) => c.status === 'activo')).toHaveLength(1);
    expect(list.find((c) => c.id === first.id)?.status).toBe('revocado');
    await expect(auth.register(registerDto({ claimCode: first.code }) as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registro con código: la cuenta nace verificada y vinculada, con solicitud aprobada y auditoría (regla 6)', async () => {
    const { code, id } = await claimCodes.create(swimmerId, adminId);

    const res = await auth.register(registerDto({ claimCode: code.toLowerCase().replace(/-/g, ' ') }) as never);

    expect(res).toMatchObject({ linked: true, verified: true });
    const user = await db.user.findUniqueOrThrow({ where: { email: 'emi@test.ar' } });
    expect(user.swimmerId).toBe(swimmerId);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.primaryRole).toBe('SWIMMER');

    const request = await db.accountLinkRequest.findFirstOrThrow({ where: { userId: user.id } });
    expect(request).toMatchObject({ swimmerId, status: 'approved', matchConfidence: 100, reviewedBy: adminId });

    const used = await db.swimmerClaimCode.findUniqueOrThrow({ where: { id } });
    expect(used.usedBy).toBe(user.id);
    expect(used.usedAt).not.toBeNull();

    const actions = (await db.auditLog.findMany({ select: { action: true, userId: true } })).map((a) => `${a.action}:${a.userId}`);
    expect(actions).toEqual(expect.arrayContaining([`CLAIM_CODE_REDEEMED:${user.id}`, `ACCOUNT_LINK_APPROVED:${adminId}`]));
  });

  it('un código sirve una sola vez; no se puede crear una segunda cuenta para el mismo nadador', async () => {
    const { code } = await claimCodes.create(swimmerId, adminId);
    await auth.register(registerDto({ claimCode: code }) as never);
    await expect(auth.register(registerDto({ email: 'otro@test.ar', claimCode: code }) as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(await db.user.count({ where: { email: 'otro@test.ar' } })).toBe(0);
    expect(await db.user.count({ where: { swimmerId } })).toBe(1);
  });

  it('código inexistente, mal escrito, vencido o revocado: mismo error y no se crea la cuenta', async () => {
    const { code, id } = await claimCodes.create(swimmerId, adminId);
    const messages = new Set<string>();
    const attempt = async (claimCode: string) => {
      await auth.register(registerDto({ claimCode }) as never).catch((e: Error) => messages.add(e.message));
    };
    await attempt('FTN-ABCD-EFGH'); // no existe
    await attempt('basura'); // sin forma de código
    await db.swimmerClaimCode.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await attempt(code); // vencido
    await db.swimmerClaimCode.update({ where: { id }, data: { expiresAt: new Date(Date.now() + 1e9), revokedAt: new Date() } });
    await attempt(code); // revocado
    expect(messages.size).toBe(1); // no se revela cuál fue el motivo
    expect(await db.user.count({ where: { email: 'emi@test.ar' } })).toBe(0);
  });

  it('dos registros simultáneos con el mismo código: gana uno solo', async () => {
    const { code } = await claimCodes.create(swimmerId, adminId);
    const results = await Promise.allSettled([
      auth.register(registerDto({ email: 'a@test.ar', claimCode: code }) as never),
      auth.register(registerDto({ email: 'b@test.ar', claimCode: code }) as never),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.user.count({ where: { swimmerId } })).toBe(1);
    expect(await db.accountLinkRequest.count({ where: { swimmerId, status: 'approved' } })).toBe(1);
  });

  it('un usuario ya logueado y sin vincular canjea su código; uno ya vinculado no puede', async () => {
    const user = await db.user.create({ data: { email: 'logueado@t.ar', passwordHash: 'x', firstName: 'L', lastName: 'G', emailVerifiedAt: new Date() } });
    const { code } = await claimCodes.create(swimmerId, adminId);

    await expect(claimCodes.redeem(user.id, code)).resolves.toMatchObject({ swimmerId });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).swimmerId).toBe(swimmerId);

    const other = await db.swimmer.create({ data: { firstName: 'Otro', lastName: 'Nadador', gender: 'M' } });
    const second = await claimCodes.create(other.id, adminId);
    await expect(claimCodes.redeem(user.id, second.code)).rejects.toBeInstanceOf(ConflictException);
  });

  it('no se genera código para un nadador que ya tiene cuenta, ni para uno inexistente; se puede revocar', async () => {
    await expect(claimCodes.create('no-existe', adminId)).rejects.toBeInstanceOf(NotFoundException);
    const { id } = await claimCodes.create(swimmerId, adminId);
    await expect(claimCodes.revoke(id, adminId)).resolves.toMatchObject({ message: 'Código revocado.' });
    expect((await claimCodes.listForSwimmer(swimmerId))[0]?.status).toBe('revocado');

    await db.user.create({ data: { email: 'c@t.ar', passwordHash: 'x', firstName: 'C', lastName: 'C', swimmerId } });
    await expect(claimCodes.create(swimmerId, adminId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('un código usado no se puede revocar', async () => {
    const { code, id } = await claimCodes.create(swimmerId, adminId);
    await auth.register(registerDto({ claimCode: code }) as never);
    await expect(claimCodes.revoke(id, adminId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('al unificar nadadores, los códigos sin canjear del duplicado se revocan y no bloquean el borrado', async () => {
    const principal = await db.swimmer.create({ data: { firstName: 'Emiliano', lastName: 'LA MARCA', gender: 'M' } });
    await claimCodes.create(swimmerId, adminId);
    const merge = new SwimmerMergeService(prisma);
    await merge.merge(principal.id, swimmerId, adminId, true);
    expect(await db.swimmer.findUnique({ where: { id: swimmerId } })).toBeNull();
    const moved = await db.swimmerClaimCode.findMany({ where: { swimmerId: principal.id } });
    expect(moved).toHaveLength(1);
    expect(moved[0]?.revokedAt).not.toBeNull();
  });
});
