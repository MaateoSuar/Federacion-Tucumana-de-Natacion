/**
 * seed-demo.ts — Datos ficticios de demostración para la plataforma FTN.
 * Ejecutar: pnpm db:seed:demo
 * Borrar:   pnpm db:seed:demo:clean
 *
 * Crea:
 *  - 3 usuarios demo (admin, entrenador, nadador)
 *  - 3 clubes
 *  - 12 nadadores
 *  - 1 torneo completo con 5 pruebas y resultados homologados
 */

import { PrismaClient, SystemRole, Gender, PoolLength, TournamentType, Scope, TournamentStatus, EventStatus, ResultStatus, ResultSource } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo1234!';
const DEMO_TAG = '__DEMO__'; // prefijo en notas internas para identificar datos demo

function d(iso: string): Date { return new Date(iso); }

// ─── Clubs ────────────────────────────────────────────────────────────────────

const CLUBS = [
  { name: 'Club Atlético Natación', shortName: 'CAN', locality: 'San Miguel de Tucumán', foundedYear: 1952 },
  { name: 'Club Universitario',      shortName: 'CUN', locality: 'San Miguel de Tucumán', foundedYear: 1948 },
  { name: 'Natación Norte',          shortName: 'NNO', locality: 'Yerba Buena',            foundedYear: 1985 },
];

// ─── Swimmers ─────────────────────────────────────────────────────────────────
// Categoría = edad al 31/12/2026:
//   Cadete 1 (14) → nacido 2012
//   Cadete 2 (15) → nacido 2011
//   Juvenil 1 (16) → nacido 2010
//   Juvenil 2 (17-18) → nacido 2008-2009
//   Mayores (19+) → nacido ≤2007

const SWIMMERS_DATA = [
  // CAN — masculino
  { firstName: 'Lucas',     lastName: 'Díaz',       gender: 'M' as Gender, birthDate: d('2012-03-15'), clubKey: 'CAN' },
  { firstName: 'Tomás',     lastName: 'Pérez',      gender: 'M' as Gender, birthDate: d('2010-07-22'), clubKey: 'CAN' },
  { firstName: 'Nicolás',   lastName: 'Fernández',  gender: 'M' as Gender, birthDate: d('2006-11-08'), clubKey: 'CAN' },
  { firstName: 'Agustín',   lastName: 'López',      gender: 'M' as Gender, birthDate: d('2011-05-30'), clubKey: 'CAN' },
  // CAN — femenino (Valentina será vinculada al usuario nadador demo)
  { firstName: 'Valentina', lastName: 'García',     gender: 'F' as Gender, birthDate: d('2012-01-20'), clubKey: 'CAN' },
  { firstName: 'Julieta',   lastName: 'Morales',    gender: 'F' as Gender, birthDate: d('2011-09-14'), clubKey: 'CAN' },
  // CUN — mixto
  { firstName: 'Santiago',  lastName: 'Rodríguez',  gender: 'M' as Gender, birthDate: d('2008-04-03'), clubKey: 'CUN' },
  { firstName: 'Florencia', lastName: 'Herrera',    gender: 'F' as Gender, birthDate: d('2006-08-17'), clubKey: 'CUN' },
  { firstName: 'Sebastián', lastName: 'Martínez',   gender: 'M' as Gender, birthDate: d('2011-12-01'), clubKey: 'CUN' },
  // NNO — mixto
  { firstName: 'Camila',    lastName: 'Torres',     gender: 'F' as Gender, birthDate: d('2010-02-28'), clubKey: 'NNO' },
  { firstName: 'Milagros',  lastName: 'Castillo',   gender: 'F' as Gender, birthDate: d('2014-06-10'), clubKey: 'NNO' },
  { firstName: 'Facundo',   lastName: 'Acosta',     gender: 'M' as Gender, birthDate: d('2008-10-25'), clubKey: 'NNO' },
];

// ─── Tournament ───────────────────────────────────────────────────────────────

const TOURNAMENT = {
  name: 'Torneo Apertura Tucumán 2026',
  venue: 'Complejo Acuático Tucumán',
  poolLength: 'P25' as PoolLength,
  startDate: d('2026-06-07'),
  endDate:   d('2026-06-07'),
  type: 'provincial' as TournamentType,
  scope: 'provincial' as Scope,
  status: 'homologado' as TournamentStatus,
  hostClubKey: 'CAN',
};

// ─── Results config ───────────────────────────────────────────────────────────
// Tiempos en ms. Todos son plausibles para jóvenes en piscina 25m.

interface ResultRow {
  swimmerKey: string; // `${firstName} ${lastName}`
  timeMs: number | null;
  status: ResultStatus;
  place: number | null;
  isPb: boolean;
}

interface EventConfig {
  eventCode: string;   // matches EventDefinition.code
  categoryCode: string;
  results: ResultRow[];
}

const EVENTS_CONFIG: EventConfig[] = [
  {
    eventCode: '50L_M',
    categoryCode: 'CAD_1',
    results: [
      { swimmerKey: 'Lucas Díaz',     timeMs: 27450, status: 'OK', place: 1, isPb: true  },
      { swimmerKey: 'Agustín López',  timeMs: 28910, status: 'OK', place: 2, isPb: true  },
    ],
  },
  {
    eventCode: '50L_F',
    categoryCode: 'CAD_1',
    results: [
      { swimmerKey: 'Valentina García', timeMs: 29820, status: 'OK', place: 1, isPb: true  },
      { swimmerKey: 'Julieta Morales',  timeMs: 31550, status: 'OK', place: 2, isPb: false },
    ],
  },
  {
    eventCode: '100L_M',
    categoryCode: 'JUV_1',
    results: [
      { swimmerKey: 'Tomás Pérez',      timeMs: 59340, status: 'OK', place: 1, isPb: true  },
      { swimmerKey: 'Sebastián Martínez', timeMs: 62180, status: 'OK', place: 2, isPb: true  },
    ],
  },
  {
    eventCode: '100L_F',
    categoryCode: 'JUV_1',
    results: [
      { swimmerKey: 'Camila Torres',  timeMs: 65720, status: 'OK', place: 1, isPb: true  },
      { swimmerKey: 'Camila Torres',  timeMs: null,   status: 'DNS', place: null, isPb: false }, // placeholder segundo
    ],
  },
  {
    eventCode: '100MA_M',
    categoryCode: 'JUV_2',
    results: [
      { swimmerKey: 'Santiago Rodríguez', timeMs: 61450, status: 'OK', place: 1, isPb: true  },
      { swimmerKey: 'Facundo Acosta',     timeMs: 64890, status: 'OK', place: 2, isPb: true  },
    ],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('▶ Seed DEMO — iniciando...');

  // 1. Clubs
  console.log('  → Clubes demo...');
  const clubMap: Record<string, string> = {};
  for (const c of CLUBS) {
    const club = await prisma.club.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        shortName: c.shortName,
        locality: c.locality,
        foundedYear: c.foundedYear,
        contactEmail: `secretaria@${c.shortName.toLowerCase()}.ar`,
      },
    });
    clubMap[c.shortName] = club.id;
  }
  console.log(`     ${CLUBS.length} clubes OK`);

  // 2. Season (should exist from main seed, just fetch)
  const season = await prisma.season.findFirst({ where: { year: 2026 } });
  if (!season) throw new Error('Primero ejecutá pnpm db:seed para crear las temporadas.');

  // 3. Swimmers
  console.log('  → Nadadores demo...');
  const swimmerMap: Record<string, string> = {};
  for (const sw of SWIMMERS_DATA) {
    const clubId = clubMap[sw.clubKey]!;
    const swimmer = await prisma.swimmer.upsert({
      where: {
        // Use a synthetic documentId for demo
        documentId: `DEMO-${sw.firstName.toUpperCase()}-${sw.lastName.toUpperCase()}`,
      },
      update: {},
      create: {
        firstName:    sw.firstName,
        lastName:     sw.lastName,
        gender:       sw.gender,
        birthDate:    sw.birthDate,
        nationality:  'ARG',
        currentClubId: clubId,
        documentId:   `DEMO-${sw.firstName.toUpperCase()}-${sw.lastName.toUpperCase()}`,
        source:       ResultSource.manual,
        isActive:     true,
      },
    });
    swimmerMap[`${sw.firstName} ${sw.lastName}`] = swimmer.id;

    // Club history
    await prisma.swimmerClubHistory.upsert({
      where: {
        swimmerId_clubId_seasonId: {
          swimmerId: swimmer.id,
          clubId,
          seasonId: season.id,
        },
      },
      update: {},
      create: {
        swimmerId: swimmer.id,
        clubId,
        seasonId: season.id,
        startDate: d('2026-01-01'),
        isActive: true,
      },
    });
  }
  console.log(`     ${SWIMMERS_DATA.length} nadadores OK`);

  // 4. Users
  console.log('  → Usuarios demo...');
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const now = new Date();

  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'Administrador FTN' } });
  const coachRole = await prisma.role.findFirstOrThrow({ where: { name: 'Entrenador' } });
  const swimmerRole = await prisma.role.findFirstOrThrow({ where: { name: 'Nadador' } });

  // Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ftn.ar' },
    update: {},
    create: {
      email: 'admin@ftn.ar',
      passwordHash,
      firstName: 'Carlos',
      lastName: 'Martínez',
      primaryRole: SystemRole.ADMIN,
      isActive: true,
      emailVerifiedAt: now,
    },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_clubId: { userId: adminUser.id, roleId: adminRole.id, clubId: null } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id, clubId: null },
  });

  // Entrenador (scoped to CAN)
  const canId = clubMap['CAN']!;
  const coachUser = await prisma.user.upsert({
    where: { email: 'entrenador@cna.ar' },
    update: {},
    create: {
      email: 'entrenador@cna.ar',
      passwordHash,
      firstName: 'Ana',
      lastName: 'Rodríguez',
      primaryRole: SystemRole.COACH,
      isActive: true,
      emailVerifiedAt: now,
      clubId: canId,
    },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_clubId: { userId: coachUser.id, roleId: coachRole.id, clubId: canId } },
    update: {},
    create: { userId: coachUser.id, roleId: coachRole.id, clubId: canId },
  });

  // Nadador (linked to Valentina García)
  const valentinaId = swimmerMap['Valentina García']!;
  const swimmerUser = await prisma.user.upsert({
    where: { email: 'nadador@ftn.ar' },
    update: {},
    create: {
      email: 'nadador@ftn.ar',
      passwordHash,
      firstName: 'Valentina',
      lastName: 'García',
      primaryRole: SystemRole.SWIMMER,
      isActive: true,
      emailVerifiedAt: now,
      swimmerId: valentinaId,
    },
  });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId_clubId: { userId: swimmerUser.id, roleId: swimmerRole.id, clubId: null } },
    update: {},
    create: { userId: swimmerUser.id, roleId: swimmerRole.id, clubId: null },
  });

  console.log('     3 usuarios OK  (admin@ftn.ar / entrenador@cna.ar / nadador@ftn.ar)');

  // 5. Tournament
  console.log('  → Torneo demo...');
  const existingTournament = await prisma.tournament.findFirst({
    where: { name: TOURNAMENT.name },
  });

  let tournamentId: string;

  if (existingTournament) {
    tournamentId = existingTournament.id;
    console.log('     Torneo ya existe, reutilizando.');
  } else {
    const tournament = await prisma.tournament.create({
      data: {
        name:       TOURNAMENT.name,
        venue:      TOURNAMENT.venue,
        poolLength: TOURNAMENT.poolLength,
        startDate:  TOURNAMENT.startDate,
        endDate:    TOURNAMENT.endDate,
        type:       TOURNAMENT.type,
        scope:      TOURNAMENT.scope,
        status:     TOURNAMENT.status,
        seasonId:   season.id,
        hostClubId: clubMap[TOURNAMENT.hostClubKey],
      },
    });
    tournamentId = tournament.id;
    console.log(`     Torneo "${TOURNAMENT.name}" creado.`);

    // 6. Events + Results
    let orderNo = 1;
    for (const evConfig of EVENTS_CONFIG) {
      const eventDef = await prisma.eventDefinition.findFirst({
        where: { code: evConfig.eventCode },
      });
      if (!eventDef) {
        console.warn(`     ⚠ EventDefinition "${evConfig.eventCode}" no encontrada, saltando.`);
        continue;
      }

      const category = await prisma.category.findFirst({
        where: { code: evConfig.categoryCode },
      });
      if (!category) {
        console.warn(`     ⚠ Categoría "${evConfig.categoryCode}" no encontrada, saltando.`);
        continue;
      }

      const event = await prisma.event.create({
        data: {
          tournamentId,
          eventDefinitionId: eventDef.id,
          categoryId:        category.id,
          round:             'serie_unica',
          orderNo:           orderNo++,
          status:            EventStatus.finalizado,
        },
      });

      for (const r of evConfig.results) {
        const swimmerId = swimmerMap[r.swimmerKey];
        if (!swimmerId) {
          console.warn(`     ⚠ Nadador "${r.swimmerKey}" no encontrado, saltando resultado.`);
          continue;
        }

        // Find the swimmer's club
        const swimmer = await prisma.swimmer.findUniqueOrThrow({
          where: { id: swimmerId },
          select: { currentClubId: true },
        });
        const clubId = swimmer.currentClubId ?? canId;

        const result = await prisma.result.create({
          data: {
            eventId:    event.id,
            swimmerId,
            finalTime:  r.timeMs,
            place:      r.place,
            status:     r.status,
            isPb:       r.isPb,
            isRecord:   false,
            homologated:   true,
            homologatedAt: now,
            homologatedBy: adminUser.id,
            source:        ResultSource.manual,
            categoryId:    category.id,
            clubId,
          },
        });

        // Personal best
        if (r.isPb && r.timeMs !== null) {
          await prisma.personalBest.upsert({
            where: {
              swimmerId_eventDefinitionId_poolLength: {
                swimmerId,
                eventDefinitionId: eventDef.id,
                poolLength:        TOURNAMENT.poolLength,
              },
            },
            update: {
              bestTime:       r.timeMs,
              achievedAt:     TOURNAMENT.startDate,
              sourceResultId: result.id,
            },
            create: {
              swimmerId,
              eventDefinitionId: eventDef.id,
              poolLength:        TOURNAMENT.poolLength,
              bestTime:          r.timeMs,
              achievedAt:        TOURNAMENT.startDate,
              sourceResultId:    result.id,
            },
          });
        }
      }
    }
    console.log(`     ${EVENTS_CONFIG.length} pruebas y resultados creados.`);
  }

  console.log('');
  console.log('✅ Seed DEMO completado.');
  console.log('');
  console.log('   Credenciales de acceso:');
  console.log(`   👤 admin@ftn.ar       — ${DEMO_PASSWORD}  (Administrador FTN)`);
  console.log(`   👤 entrenador@cna.ar  — ${DEMO_PASSWORD}  (Entrenador · Club CAN)`);
  console.log(`   👤 nadador@ftn.ar     — ${DEMO_PASSWORD}  (Nadador · Valentina García)`);
  console.log('');
  console.log(`   Para borrar estos datos: pnpm db:seed:demo:clean`);
  console.log('');
  console.log(`   Torneo visible en: http://localhost:3000/torneos`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
