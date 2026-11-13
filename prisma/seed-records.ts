/**
 * seed-records.ts — Carga la Tabla Oficial de Récords Tucumanos de Natación
 * (prisma/data/records-parsed.json, generado por prisma/scripts/parse-records.ts)
 * como Records homologados + Ranking inicial (posición 1, histórico).
 *
 * Requiere haber corrido `pnpm db:seed` antes (categorías INF/MEN/CAD/JUV/MAY/ABS
 * y event_definitions ya deben existir).
 *
 * Ejecutar: npx ts-node prisma/seed-records.ts
 */

import { PrismaClient, Gender, PoolLength } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ParsedRecord {
  poolLength: 'P25' | 'P50';
  categoryCode: 'INF' | 'MEN' | 'CAD' | 'JUV' | 'MAY' | 'ABS';
  gender: 'M' | 'F' | 'MIX';
  eventCode: string;
  stroke: string;
  distance: number;
  isRelay: boolean;
  swimmerRaw: string;
  club: string;
  timeMs: number;
  recordDate: string;
  pool: string | null;
  tournament: string | null;
  sourcePage: number;
}

const IMPORT_NOTE_PREFIX = 'Tabla Oficial FTN';

function noteFor(r: ParsedRecord): string {
  const update = r.poolLength === 'P25' ? '21/06/2026' : '13/06/2026';
  const pool = r.pool ? ` Pileta: ${r.pool}.` : '';
  return `${IMPORT_NOTE_PREFIX} (actualización ${update}, pileta ${r.poolLength === 'P25' ? '25m' : '50m'}).${pool}`;
}

function splitSwimmerName(raw: string): { firstName: string; lastName: string } {
  if (raw.includes(',')) {
    const [last, first] = raw.split(',');
    return {
      lastName: last.trim(),
      firstName: (first ?? '').trim() || '(s/d)',
    };
  }
  // Equipo de relevo: no hay apellido/nombre real, se guarda el equipo completo como "swimmer"
  return { firstName: raw.trim(), lastName: 'Equipo de Relevo' };
}

async function getOrCreateClub(shortName: string): Promise<string> {
  const existing = await prisma.club.findFirst({ where: { shortName } });
  if (existing) return existing.id;
  const created = await prisma.club.create({
    data: {
      name: shortName,
      shortName,
      locality: 'Tucumán',
      status: 'afiliado',
    },
  });
  return created.id;
}

async function getOrCreateSwimmer(
  raw: string,
  clubId: string,
  gender: Gender,
  cache: Map<string, string>,
): Promise<string> {
  const { firstName, lastName } = splitSwimmerName(raw);
  const cacheKey = `${firstName}|${lastName}|${clubId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const existing = await prisma.swimmer.findFirst({
    where: { firstName, lastName, currentClubId: clubId },
  });
  if (existing) {
    cache.set(cacheKey, existing.id);
    return existing.id;
  }

  const created = await prisma.swimmer.create({
    data: {
      firstName,
      lastName,
      gender,
      currentClubId: clubId,
      source: 'pdf',
    },
  });
  cache.set(cacheKey, created.id);
  return created.id;
}

async function main() {
  console.log('▶ Seeding récords — Tabla Oficial de Récords Tucumanos de Natación...');

  const jsonPath = path.join(process.cwd(), 'prisma', 'data', 'records-parsed.json');
  const records: ParsedRecord[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // Verificación previa: categorías y event_definitions deben existir (creadas por seed.ts)
  const categoryCodes = [...new Set(records.map((r) => r.categoryCode))];
  const categories = await prisma.category.findMany({ where: { code: { in: categoryCodes } } });
  const categoryMap = new Map(categories.map((c) => [c.code, c.id]));
  const missingCategories = categoryCodes.filter((c) => !categoryMap.has(c));
  if (missingCategories.length > 0) {
    throw new Error(
      `Faltan categorías en la base: ${missingCategories.join(', ')}. Corré "pnpm db:seed" primero.`,
    );
  }

  const eventCodes = [...new Set(records.map((r) => r.eventCode))];
  const eventDefs = await prisma.eventDefinition.findMany({ where: { code: { in: eventCodes } } });
  const eventDefMap = new Map(eventDefs.map((e) => [e.code, e.id]));
  const missingEventDefs = eventCodes.filter((c) => !eventDefMap.has(c));
  if (missingEventDefs.length > 0) {
    throw new Error(
      `Faltan event_definitions en la base: ${missingEventDefs.join(', ')}. Corré "pnpm db:seed" primero.`,
    );
  }

  const clubCache = new Map<string, string>();
  const swimmerCache = new Map<string, string>();

  let created = 0;
  let skipped = 0;

  for (const r of records) {
    const categoryId = categoryMap.get(r.categoryCode)!;
    const eventDefinitionId = eventDefMap.get(r.eventCode)!;
    const gender = r.gender as Gender;
    const poolLength = r.poolLength as PoolLength;

    // Idempotencia: si ya hay un récord vigente para esta clave, no lo pisamos
    // (puede haber sido reemplazado ya vía edición manual de admin).
    const existingCurrent = await prisma.record.findFirst({
      where: {
        scope: 'provincial',
        eventDefinitionId,
        categoryId,
        gender,
        poolLength,
        isCurrent: true,
      },
    });
    if (existingCurrent) {
      skipped++;
      continue;
    }

    let clubId = clubCache.get(r.club);
    if (!clubId) {
      clubId = await getOrCreateClub(r.club);
      clubCache.set(r.club, clubId);
    }

    // Para relevos MIX no hay un gender de persona real: se usa 'M' como valor
    // técnico del swimmer-equipo (el gender real de la prueba vive en record.gender).
    const swimmerGender: Gender = gender === 'MIX' ? 'M' : gender;
    const swimmerId = await getOrCreateSwimmer(r.swimmerRaw, clubId, swimmerGender, swimmerCache);

    const record = await prisma.record.create({
      data: {
        scope: 'provincial',
        eventDefinitionId,
        categoryId,
        gender,
        poolLength,
        timeMs: r.timeMs,
        swimmerId,
        clubId,
        recordDate: new Date(r.recordDate),
        tournamentName: r.tournament,
        sourceResultId: null,
        status: 'homologated',
        isCurrent: true,
        notes: noteFor(r),
      },
    });

    await prisma.ranking.create({
      data: {
        swimmerId,
        eventDefinitionId,
        poolLength,
        gender,
        scope: 'provincial',
        seasonId: null,
        categoryId,
        clubId,
        position: 1,
        finalTime: r.timeMs,
        sourceResultId: null,
        computedAt: new Date(),
      },
    });

    created++;
    if (created % 50 === 0) console.log(`  → ${created} récords creados...`);
    void record;
  }

  console.log(`✅ Récords: ${created} creados, ${skipped} ya existían (omitidos).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
