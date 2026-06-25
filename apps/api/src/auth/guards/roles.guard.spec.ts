import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { SystemRole } from '@ftn/shared';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const buildCtx = (user: object | undefined, requiredRoles: SystemRole[] | undefined) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  // ── Escenario 7: RBAC ───────────────────────────────────────────────────────

  it('permite acceso cuando no se especifican roles requeridos', () => {
    const ctx = buildCtx({ id: 'u1', primaryRole: SystemRole.SWIMMER }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite acceso cuando el rol del usuario está en la lista requerida', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.ADMIN },
      [SystemRole.ADMIN, SystemRole.SUPER_ADMIN],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando el rol del usuario no está en la lista requerida', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.SWIMMER },
      [SystemRole.ADMIN, SystemRole.SUPER_ADMIN],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si no hay usuario autenticado', () => {
    const ctx = buildCtx(undefined, [SystemRole.ADMIN]);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('CLUB_DELEGATE sin acceso a endpoints que requieren ADMIN', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.CLUB_DELEGATE, clubId: 'club-A' },
      [SystemRole.ADMIN, SystemRole.SUPER_ADMIN],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('JUDGE sin acceso a endpoints que requieren ADMIN', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.JUDGE },
      [SystemRole.ADMIN, SystemRole.SUPER_ADMIN],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // ── Escenario 8: scope de club ──────────────────────────────────────────────
  // El guard valida roles; el scope de club se valida en el servicio de cada recurso.
  // El clubId del token es la fuente de verdad para el scope.

  it('CLUB_DELEGATE del club A tiene clubId="club-A" en el payload', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.CLUB_DELEGATE, clubId: 'club-A' },
      [SystemRole.CLUB_DELEGATE],
    );
    expect(guard.canActivate(ctx)).toBe(true);

    const req = ctx.switchToHttp().getRequest() as { user: { clubId: string } };
    expect(req.user.clubId).toBe('club-A');
  });

  it('SUPER_ADMIN puede acceder a endpoints que requieren SUPER_ADMIN', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.SUPER_ADMIN },
      [SystemRole.SUPER_ADMIN],
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('COACH no puede actuar como ADMIN aunque comparta permisos de lectura', () => {
    const ctx = buildCtx(
      { id: 'u1', primaryRole: SystemRole.COACH },
      [SystemRole.ADMIN],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
