import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimCodeService, INVALID_CODE } from '../claim-codes/claim-code.service';
import * as argon2 from 'argon2';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  email: 'test@ftn.ar',
  passwordHash: 'hashed',
  firstName: 'Juan',
  lastName: 'Pérez',
  primaryRole: 'SWIMMER',
  clubId: null,
  isActive: true,
  emailVerifiedAt: new Date(),
  refreshTokenHash: null,
  passwordResetToken: null,
  passwordResetExpiresAt: null,
  lastLoginAt: null,
  ...overrides,
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockClaimCodes = {
  redeemInTransaction: jest.fn(),
  assertNotLockedOut: jest.fn(),
  isRedeemable: jest.fn(),
  recordFailure: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-token'),
  verify: jest.fn(),
  signAsync: jest.fn().mockResolvedValue('signed-token'),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const vals: Record<string, string> = {
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
    };
    return vals[key] ?? key;
  }),
  get: jest.fn((key: string, fallback?: string) => fallback ?? key),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ClaimCodeService, useValue: mockClaimCodes },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── 1. register ─────────────────────────────────────────────────────────────

  describe('register (solo con código de perfil)', () => {
    const dto = { email: 'nuevo@ftn.ar', password: 'miPassword8', firstName: 'Ana', lastName: 'Gómez', claimCode: 'FTN-7K3M-9PQX' };
    const tx = { user: { create: jest.fn() } };

    beforeEach(() => {
      mockClaimCodes.assertNotLockedOut.mockResolvedValue(undefined);
      mockClaimCodes.isRedeemable.mockResolvedValue(true);
      mockClaimCodes.recordFailure.mockResolvedValue(undefined);
      mockClaimCodes.redeemInTransaction.mockResolvedValue({ swimmerId: 'sw1', requestId: 'r1' });
      tx.user.create.mockResolvedValue(makeUser({ id: 'nuevo-1', email: 'nuevo@ftn.ar' }));
      mockPrisma.$transaction.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it('sin código no se crea la cuenta (el código es obligatorio)', async () => {
      await expect(service.register({ ...dto, claimCode: '' }, '1.2.3.4')).rejects.toThrow(/necesitás el código de perfil/);
      await expect(service.register({ ...dto, claimCode: '   ' }, '1.2.3.4')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('con un código válido crea la cuenta verificada y vinculada, todo en una transacción', async () => {
      const result = await service.register(dto, '1.2.3.4');
      expect(result).toMatchObject({ linked: true, verified: true });
      expect(tx.user.create.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(mockClaimCodes.redeemInTransaction).toHaveBeenCalledWith(tx, 'nuevo-1', 'FTN-7K3M-9PQX');
    });

    it('con un código inválido: error genérico, intento anotado y NO se hashea ni se toca la base de usuarios', async () => {
      mockClaimCodes.isRedeemable.mockResolvedValue(false);
      await expect(service.register(dto, '1.2.3.4')).rejects.toThrow(INVALID_CODE);
      expect(mockClaimCodes.recordFailure).toHaveBeenCalledWith('1.2.3.4', 'register');
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled(); // no se puede sondear qué emails existen sin un código válido
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('si la IP está bloqueada por demasiados intentos, corta antes de mirar el código', async () => {
      mockClaimCodes.assertNotLockedOut.mockRejectedValue(new BadRequestException('bloqueada'));
      await expect(service.register(dto, '1.2.3.4')).rejects.toThrow('bloqueada');
      expect(mockClaimCodes.isRedeemable).not.toHaveBeenCalled();
    });

    it('lanza ConflictException si el email ya existe (solo con un código válido)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      await expect(service.register(dto, '1.2.3.4')).rejects.toThrow(ConflictException);
    });

    it('si otro registro canjea el código en el medio, falla y cuenta como intento fallido', async () => {
      mockClaimCodes.redeemInTransaction.mockRejectedValue(new BadRequestException(INVALID_CODE));
      await expect(service.register(dto, '1.2.3.4')).rejects.toThrow(INVALID_CODE);
      expect(mockClaimCodes.recordFailure).toHaveBeenCalledWith('1.2.3.4', 'register');
    });

    it('hashea la contraseña con argon2 (nunca guarda en claro)', async () => {
      await service.register(dto, '1.2.3.4');
      const data = tx.user.create.mock.calls[0][0].data as { passwordHash: string };
      expect(data.passwordHash).not.toBe('miPassword8');
      expect(await argon2.verify(data.passwordHash, 'miPassword8')).toBe(true);
    });
  });

  // ── 2. verifyEmail ───────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('marca emailVerifiedAt cuando el token es válido', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@ftn.ar',
        purpose: 'email_verification',
      });
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ emailVerifiedAt: null }));
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const result = await service.verifyEmail('valid-token');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
        }),
      );
      expect(result.message).toMatch(/verificado/i);
    });

    it('lanza BadRequestException con token inválido', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si purpose no es email_verification', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'user-1',
        email: 'test@ftn.ar',
        purpose: 'reset_password', // propósito incorrecto
      });

      await expect(service.verifyEmail('wrong-purpose-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── 3. login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('devuelve accessToken y refreshToken con credenciales correctas', async () => {
      const user = makeUser();
      const realHash = await argon2.hash('password123');
      mockPrisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: realHash });
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await service.login({ email: 'test@ftn.ar', password: 'password123' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('lanza UnauthorizedException con contraseña incorrecta', async () => {
      const realHash = await argon2.hash('correctPassword');
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: realHash }));

      await expect(
        service.login({ email: 'test@ftn.ar', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el email no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'noexiste@ftn.ar', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el email no está verificado', async () => {
      const realHash = await argon2.hash('password123');
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash: realHash, emailVerifiedAt: null }),
      );

      await expect(
        service.login({ email: 'test@ftn.ar', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la cuenta está deshabilitada', async () => {
      const realHash = await argon2.hash('password123');
      mockPrisma.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash: realHash, isActive: false }),
      );

      await expect(
        service.login({ email: 'test@ftn.ar', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── 4. refresh ───────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('rota los tokens y actualiza el hash', async () => {
      const rawToken = 'my-refresh-token';
      const storedHash = await argon2.hash(rawToken);
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ refreshTokenHash: storedHash }));
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const result = await service.refresh('user-1', rawToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refreshTokenHash: expect.any(String) }),
        }),
      );
    });

    it('lanza UnauthorizedException si el refresh token no coincide', async () => {
      const storedHash = await argon2.hash('correct-token');
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ refreshTokenHash: storedHash }));

      await expect(service.refresh('user-1', 'wrong-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si no hay refresh token almacenado (logout previo)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ refreshTokenHash: null }));

      await expect(service.refresh('user-1', 'any-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── 5. forgotPassword ────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('genera token y actualiza el usuario si el email existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const result = await service.forgotPassword('test@ftn.ar');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordResetToken: expect.any(String),
            passwordResetExpiresAt: expect.any(Date),
          }),
        }),
      );
      expect(result.message).toBeDefined();
    });

    it('responde 200 aunque el email no exista (no revela existencia)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('noexiste@ftn.ar');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(result.message).toBeDefined();
    });
  });

  // ── 6. resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('cambia la contraseña e invalida el refresh token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({
          passwordResetToken: 'valid-token',
          passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        }),
      );
      mockPrisma.user.update.mockResolvedValue(makeUser());

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'newPass123',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordResetToken: null,
            passwordResetExpiresAt: null,
            refreshTokenHash: null,
          }),
        }),
      );
      expect(result.message).toMatch(/restablecida/i);
    });

    it('lanza BadRequestException con token inválido', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bad', newPassword: 'newPass123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException con token expirado', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({
          passwordResetToken: 'expired-token',
          passwordResetExpiresAt: new Date(Date.now() - 1000), // ya venció
        }),
      );

      await expect(
        service.resetPassword({ token: 'expired-token', newPassword: 'newPass123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
