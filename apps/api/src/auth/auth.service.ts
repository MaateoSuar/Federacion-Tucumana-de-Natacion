import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtAccessPayload {
  sub: string;
  email: string;
  primaryRole: string;
  clubId: string | null;
}

interface JwtRefreshPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Registro ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('El email ya está registrado');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    const verificationToken = this.signEmailVerificationToken(user.id, user.email);
    this.sendEmailVerification(user.email, verificationToken);

    return { message: 'Registro exitoso. Revisá tu email para verificar tu cuenta.' };
  }

  // ── Verificación de email ─────────────────────────────────────────────────

  async verifyEmail(token: string) {
    let payload: { sub: string; email: string; purpose: string };
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }) as typeof payload;
    } catch {
      throw new BadRequestException('Token de verificación inválido o expirado');
    }

    if (payload.purpose !== 'email_verification') {
      throw new BadRequestException('Token de verificación inválido');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.emailVerifiedAt) return { message: 'Email ya verificado' };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    return { message: 'Email verificado correctamente' };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) throw new UnauthorizedException('Credenciales inválidas');

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Debés verificar tu email antes de ingresar');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Cuenta deshabilitada');
    }

    const tokens = await this.generateTokenPair(user.id, user.email, user.primaryRole, user.clubId);

    // Guardar hash del refresh token para validación posterior
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await argon2.hash(tokens.refreshToken),
        lastLoginAt: new Date(),
      },
    });

    return tokens;
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  async refresh(userId: string, rawRefreshToken: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokenOk = await argon2.verify(user.refreshTokenHash, rawRefreshToken);
    if (!tokenOk) throw new UnauthorizedException('Refresh token inválido');

    const tokens = await this.generateTokenPair(user.id, user.email, user.primaryRole, user.clubId);

    // Rotación: reemplazar el hash con el nuevo token
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await argon2.hash(tokens.refreshToken) },
    });

    return tokens;
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { message: 'Sesión cerrada' };
  }

  // ── Recuperación de contraseña ────────────────────────────────────────────

  async forgotPassword(email: string) {
    // Siempre responde 200 para no revelar si el email existe
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: token,
          passwordResetExpiresAt: expiresAt,
        },
      });

      this.sendPasswordResetEmail(email, token);
    }

    return { message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: dto.token },
    });

    if (!user || !user.passwordResetExpiresAt) {
      throw new BadRequestException('Token inválido o expirado');
    }

    if (user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Token expirado');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        // Invalidar refresh tokens activos al cambiar contraseña
        refreshTokenHash: null,
      },
    });

    return { message: 'Contraseña restablecida correctamente' };
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async generateTokenPair(
    userId: string,
    email: string,
    primaryRole: string,
    clubId: string | null,
  ): Promise<TokenPair> {
    const accessPayload: JwtAccessPayload = { sub: userId, email, primaryRole, clubId };
    const refreshPayload: JwtRefreshPayload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private signEmailVerificationToken(userId: string, email: string): string {
    return this.jwt.sign(
      { sub: userId, email, purpose: 'email_verification' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '24h',
      },
    );
  }

  // Stub de email — en producción se reemplaza con nodemailer/SendGrid
  private sendEmailVerification(email: string, token: string) {
    const url = `${this.config.get('APP_URL', 'http://localhost:3000')}/auth/verify-email?token=${token}`;
    this.logger.log(`[EMAIL-STUB] Verificación para ${email}: ${url}`);
  }

  private sendPasswordResetEmail(email: string, token: string) {
    const url = `${this.config.get('APP_URL', 'http://localhost:3000')}/auth/reset-password?token=${token}`;
    this.logger.log(`[EMAIL-STUB] Reset de contraseña para ${email}: ${url}`);
  }
}
