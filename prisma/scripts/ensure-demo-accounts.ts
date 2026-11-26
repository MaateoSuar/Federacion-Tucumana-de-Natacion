/**
 * Deja VÁLIDAS las cuentas demo del login (contraseña pública a pedido del usuario, para testear):
 *   - entrenador@cna.ar  → Entrenador del club indicado (DEMO_COACH_CLUB, por defecto "Club Azucena")
 *   - nadador@ftn.ar     → Nadador SIN vincular (sirve para probar el canje de código de perfil)
 *   - admin@ftn.ar       → solo se crea si NO existe; si existe no se toca (puede tener otra clave)
 * Idempotente: si ya existen, restablece la contraseña, el rol, el email verificado y el estado
 * activo. El nadador demo nunca se liga a una persona real (regla 6: la vinculación es de un Admin).
 *
 * Uso: DATABASE_URL=... npx ts-node prisma/scripts/ensure-demo-accounts.ts
 */
import { PrismaClient, SystemRole } from '@prisma/client';
import * as argon2 from 'argon2';

const DEMO_PASSWORD = 'Demo1234!';
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const now = new Date();

  const clubName = process.env['DEMO_COACH_CLUB'] ?? 'Club Azucena';
  const club =
    (await prisma.club.findFirst({ where: { name: { equals: clubName, mode: 'insensitive' } } })) ??
    (await prisma.club.findFirst({ where: { name: { contains: 'Azucena', mode: 'insensitive' } }, orderBy: { name: 'asc' } }));
  if (!club) throw new Error(`No encontré el club "${clubName}" para el entrenador demo.`);

  const coachRole = await prisma.role.findFirstOrThrow({ where: { name: 'Entrenador' } });
  const swimmerRole = await prisma.role.findFirstOrThrow({ where: { name: 'Nadador' } });

  // Entrenador demo
  const coach = await prisma.user.upsert({
    where: { email: 'entrenador@cna.ar' },
    update: { passwordHash, primaryRole: SystemRole.COACH, isActive: true, emailVerifiedAt: now, clubId: club.id },
    create: { email: 'entrenador@cna.ar', passwordHash, firstName: 'Ana', lastName: 'Rodríguez', primaryRole: SystemRole.COACH, isActive: true, emailVerifiedAt: now, clubId: club.id },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_clubId: { userId: coach.id, roleId: coachRole.id, clubId: club.id } },
    update: {},
    create: { userId: coach.id, roleId: coachRole.id, clubId: club.id },
  });

  // Nadador demo, sin vincular (si alguna vez quedó vinculado, no se toca el vínculo: solo la clave)
  const swimmerUser = await prisma.user.upsert({
    where: { email: 'nadador@ftn.ar' },
    update: { passwordHash, primaryRole: SystemRole.SWIMMER, isActive: true, emailVerifiedAt: now },
    create: { email: 'nadador@ftn.ar', passwordHash, firstName: 'Nadador', lastName: 'Demo', primaryRole: SystemRole.SWIMMER, isActive: true, emailVerifiedAt: now },
  });
  if (!(await prisma.userRoleAssignment.findFirst({ where: { userId: swimmerUser.id, roleId: swimmerRole.id, clubId: null } }))) {
    await prisma.userRoleAssignment.create({ data: { userId: swimmerUser.id, roleId: swimmerRole.id, clubId: null } });
  }

  // Administrador demo: solo si no existe
  const adminExists = await prisma.user.findUnique({ where: { email: 'admin@ftn.ar' }, select: { id: true } });
  if (!adminExists) {
    const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'Administrador FTN' } });
    const admin = await prisma.user.create({
      data: { email: 'admin@ftn.ar', passwordHash, firstName: 'Administrador', lastName: 'FTN', primaryRole: SystemRole.ADMIN, isActive: true, emailVerifiedAt: now },
    });
    await prisma.userRoleAssignment.create({ data: { userId: admin.id, roleId: adminRole.id, clubId: null } });
  }

  console.log(`OK — entrenador@cna.ar (club: ${club.name}), nadador@ftn.ar (sin vincular), admin@ftn.ar (${adminExists ? 'ya existía, sin tocar' : 'creado'}). Clave demo: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
