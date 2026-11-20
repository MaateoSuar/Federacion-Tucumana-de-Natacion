/**
 * Crea (o reactiva) un usuario Administrador FTN con la contraseña que se le pase.
 * Pensado para producción: NO usa contraseñas escritas en el repositorio.
 *
 * Uso (con DATABASE_URL apuntando a la base destino):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_FIRST_NAME=... ADMIN_LAST_NAME=... \
 *     node --require ts-node/register prisma/scripts/create-admin.ts
 *
 * Si el email ya existe, solo actualiza la contraseña y el rol. Queda en audit_logs.
 */
import { PrismaClient, SystemRole } from '@prisma/client';
import * as argon2 from 'argon2';

const MIN_PASSWORD_LENGTH = 12;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const email = required('ADMIN_EMAIL').toLowerCase();
  const password = required('ADMIN_PASSWORD');
  const firstName = process.env['ADMIN_FIRST_NAME']?.trim() || 'Administrador';
  const lastName = process.env['ADMIN_LAST_NAME']?.trim() || 'FTN';
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password);
    const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'Administrador FTN' } });

    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, primaryRole: SystemRole.ADMIN, isActive: true },
      create: {
        email,
        passwordHash,
        firstName,
        lastName,
        primaryRole: SystemRole.ADMIN,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    const assignment = await prisma.userRoleAssignment.findFirst({
      where: { userId: user.id, roleId: adminRole.id, clubId: null },
    });
    if (!assignment) {
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: adminRole.id, clubId: null } });
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ADMIN_USER_PROVISIONED',
        entityType: 'User',
        entityId: user.id,
        payload: { email, via: 'prisma/scripts/create-admin.ts' },
      },
    });

    console.log(`Administrador listo: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
