import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'd8c4f9a0-0e2a-4a2d-a3bd-1b2a4e2b1111',
    email: 'admin@tsp.local',
    name: 'TSP Admin',
    passwordHash: '',
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: any;
  let jwt: any;
  let config: any;
  let service: AuthService;

  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('Strong-Test-Password-123!', 4);
    prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user), create: vi.fn() },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: 'refresh-1' }),
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    };
    jwt = { signAsync: vi.fn().mockResolvedValue('test-access-token') };
    config = {
      get: vi.fn((key: string, fallback?: unknown) => ({
        REFRESH_TOKEN_TTL_DAYS: 30,
        JWT_ACCESS_TTL: '15m',
        ALLOW_PUBLIC_REGISTRATION: 'false',
      })[key] ?? fallback),
    };
    service = new AuthService(prisma, jwt as JwtService, config as ConfigService);
  });

  it('authenticates a user and persists only a hash of the refresh token', async () => {
    const result = await service.login(
      { email: 'ADMIN@TSP.LOCAL', password: 'Strong-Test-Password-123!' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(result.accessToken).toBe('test-access-token');
    expect(result.refreshToken).toHaveLength(64);
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    const storedHash = prisma.refreshToken.create.mock.calls[0][0].data.tokenHash;
    expect(storedHash).not.toBe(result.refreshToken);
    expect(storedHash).toHaveLength(64);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('rejects invalid credentials and writes a failed-login audit event', async () => {
    await expect(service.login(
      { email: 'admin@tsp.local', password: 'Wrong-Password-123!' },
      {},
    )).rejects.toThrow('Invalid email or password.');

    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'auth.login.failed' }),
    }));
  });

  it('does not allow public registration unless explicitly enabled', async () => {
    await expect(service.register(
      { email: 'new@tsp.local', name: 'New User', password: 'Strong-Test-Password-123!' },
      {},
    )).rejects.toThrow('Public registration is disabled.');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens and rejects reuse of a revoked token', async () => {
    const refreshToken = 'r'.repeat(64);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-1',
      userId: user.id,
      user,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.refresh(refreshToken, {});
    expect(result.refreshToken).toHaveLength(64);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledOnce();

    prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.refresh(refreshToken, {})).rejects.toThrow('already been used');
  });
});
