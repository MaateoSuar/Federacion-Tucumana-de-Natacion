/**
 * seed-demo-clean.ts — Borra todos los datos de demostración.
 * Ejecutar: pnpm db:seed:demo:clean
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAILS = ['admin@ftn.ar', 'entrenador@cna.ar', 'nadador@ftn.ar'];
const DEMO_CLUBS  = ['Club Atlético Natación', 'Club Universitario', 'Natación Norte'];
const DEMO_DOC_PREFIX = 'DEMO-';
const DEMO_TOURNAMENT = 'Torneo Apertura Tucumán 2026';

async function main() {
  console.log('▶ Limpiando datos DEMO...');

  // 1. Tournament (cascades events → results → splits, personal_bests, etc.)
  const tournament = await prisma.tournament.findFirst({ where: { name: DEMO_TOURNAMENT } });
  if (tournament) {
    // Delete in dependency order
    const events = await prisma.event.findMany({ where: { tournamentId: tournament.id }, select: { id: true } });
    const eventIds = events.map((e) => e.id);

    const results = await prisma.result.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
    const resultIds = results.map((r) => r.id);

    await prisma.split.deleteMany({ where: { resultId: { in: resultIds } } });
    await prisma.personalBest.deleteMany({ where: { sourceResultId: { in: resultIds } } });
    await prisma.record.deleteMany({ where: { sourceResultId: { in: resultIds } } });
    await prisma.result.deleteMany({ where: { id: { in: resultIds } } });
    await prisma.registration.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.heat.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { tournamentId: tournament.id } });
    await prisma.tournament.delete({ where: { id: tournament.id } });
    console.log('  ✓ Torneo eliminado');
  }

  // 2. Users
  for (const email of DEMO_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });
      // Unlink swimmer before deleting user
      if (user.swimmerId) {
        await prisma.user.update({ where: { id: user.id }, data: { swimmerId: null } });
      }
      await prisma.user.delete({ where: { id: user.id } });
    }
  }
  console.log('  ✓ Usuarios eliminados');

  // 3. Swimmers (by demo documentId prefix)
  const demoSwimmers = await prisma.swimmer.findMany({
    where: { documentId: { startsWith: DEMO_DOC_PREFIX } },
    select: { id: true },
  });
  const swimmerIds = demoSwimmers.map((s) => s.id);

  if (swimmerIds.length > 0) {
    await prisma.swimmerClubHistory.deleteMany({ where: { swimmerId: { in: swimmerIds } } });
    await prisma.athleteProfile.deleteMany({ where: { swimmerId: { in: swimmerIds } } });
    await prisma.swimmer.deleteMany({ where: { id: { in: swimmerIds } } });
  }
  console.log('  ✓ Nadadores eliminados');

  // 4. Clubs
  for (const name of DEMO_CLUBS) {
    const club = await prisma.club.findFirst({ where: { name } });
    if (club) await prisma.club.delete({ where: { id: club.id } });
  }
  console.log('  ✓ Clubes eliminados');

  console.log('');
  console.log('✅ Datos demo eliminados correctamente.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
