import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard';

function contextFor(role?: UserRole): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a user with a required role', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
  });

  it('rejects an authenticated user without the required role', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(contextFor(UserRole.VIEWER))).toThrow(ForbiddenException);
  });

  it('allows routes without role metadata', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(contextFor())).toBe(true);
  });
});
