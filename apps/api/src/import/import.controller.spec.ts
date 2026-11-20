import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SystemRole } from '@ftn/shared';
import { ImportController } from './import.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ImportController — permisos', () => {
  it('todos los endpoints de importación requieren rol Admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ImportController)).toEqual([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(GUARDS_METADATA, ImportController)).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('ningún endpoint redefine los roles a algo más permisivo', () => {
    const proto = ImportController.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});
