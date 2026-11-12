import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../prisma/prisma.service';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('TSP-JULES-dummy-login-secret-never-used', 12);

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  private readonly refreshDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    if (!Number.isInteger(this.refreshDays) || this.refreshDays < 1 || this.refreshDays > 90) {
      throw new Error('REFRESH_TOKEN_TTL_DAYS must be between 1 and 90.');
    }
  }

  async register(dto: RegisterDto, context: RequestContext) {
    if (this.config.get<string>('ALLOW_PUBLIC_REGISTRATION', 'false').toLowerCase() !== 'true') {
      throw new ForbiddenException('Public registration is disabled. Ask an administrator to provision an account.');
    }

    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, name: dto.name.trim(), passwordHash, role: UserRole.VIEWER },
        });
        const refreshToken = this.newRefreshToken();

        await tx.refreshToken.create({
          data: {
            tokenHash: this.hashToken(refreshToken),
            userId: user.id,
            expiresAt: this.refreshExpiry(),
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'auth.register.succeeded',
            target: 'User',
            targetId: user.id,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return { user, refreshToken };
      });

      return this.buildAuthResponse(session.user, session.refreshToken);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto, context: RequestContext) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches || !user.isActive) {
      await this.writeAudit({
        action: 'auth.login.failed',
        target: 'User',
        metadata: { email },
        context,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.createSession(user, context, 'auth.login.succeeded');
  }

  async refresh(refreshToken: string, context: RequestContext) {
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt <= new Date() || !existing.user.isActive) {
      throw new UnauthorizedException('Refresh token is invalid, expired or revoked.');
    }

    const nextToken = this.newRefreshToken();
    const nextExpiry = this.refreshExpiry();

    const user = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Refresh token has already been used.');
      }

      await tx.refreshToken.create({
        data: {
          tokenHash: this.hashToken(nextToken),
          userId: existing.userId,
          expiresAt: nextExpiry,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: existing.userId,
          action: 'auth.refresh.succeeded',
          target: 'RefreshToken',
          targetId: existing.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return existing.user;
    });

    return this.buildAuthResponse(user, nextToken);
  }

  async logout(userId: string, refreshToken: string, context: RequestContext): Promise<{ ok: true }> {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { tokenHash, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.logout',
          target: 'User',
          targetId: userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return { ok: true };
  }

  private async createSession(user: User, context: RequestContext, action: string) {
    const refreshToken = this.newRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          tokenHash: this.hashToken(refreshToken),
          userId: user.id,
          expiresAt: this.refreshExpiry(),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action,
          target: 'User',
          targetId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return this.buildAuthResponse(user, refreshToken);
  }

  private async buildAuthResponse(user: User, refreshToken: string) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      refreshToken,
      user: this.safeUser(user),
    };
  }

  private safeUser(user: User): SafeUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private newRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshDays * 24 * 60 * 60 * 1000);
  }

  private async writeAudit(input: {
    action: string;
    target: string;
    metadata?: Prisma.InputJsonValue;
    context: RequestContext;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        target: input.target,
        metadata: input.metadata,
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
      },
    });
  }
}