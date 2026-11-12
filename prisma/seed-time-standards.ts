/**
 * seed-time-standards.ts — Carga las marcas básicas (prisma/data/time-standards.json,
 * generado por apps/api/scripts/parse-time-standards.ts a partir de la planilla oficial).
 *
 * Idempotente: se puede correr las veces que haga falta. Actualiza sets y tiempos
 * existentes, crea los que falten y borra las marcas de esos sets que ya no estén
 * en el archivo (la planilla es la fuente de verdad de cada set que trae).
 *
 * Ejecutar: pnpm db:seed:standards
 */
import { PrismaClient, Gender, PoolLength } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface FileSet {
  code: string; name: string; shortLabel: string; purpose: string; color: string; orderNo: number; source: string | null;
}
interface FileStandard {
  set: string; stroke: string; distance: number; gender: 'M' | 'F'; category: string; pool: 'P25' | 'P50'; timeMs: number;
}

async function main(): Promise<void> {
  // process.cwd(): el seed se corre desde la raíz del repo (igual que seed-records.ts)
  const file = path.join(process.cwd(), 'prisma', 'data', 'time-standards.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as { sets: FileSet[]; standards: FileStandard[] };
  console.log(`▶ Marcas básicas — ${data.standards.length} marcas en ${data.sets.length} sets`);

  const categories = new Map((await prisma.category.findMany()).map((c) => [c.code, c.id]));
  const eventDefs = new Map(
    (await prisma.eventDefinition.findMany({ where: { isRelay: false } })).map((e) => [`${e.stroke}|${e.distance}|${e.gender}`, e.id]),
  );

  const setIds = new Map<string, string>();
  for (const s of data.sets) {
    const fields = { name: s.name, shortLabel: s.shortLabel, purpose: s.purpose, color: s.color, orderNo: s.orderNo, source: s.source };
    const set = await prisma.timeStandardSet.upsert({ where: { code: s.code }, update: fields, create: { code: s.code, ...fields } });
    setIds.set(s.code, set.id);
  }

  const keep = new Map<string, Set<string>>();
  let written = 0;
  for (const st of data.standards) {
    if (!Number.isInteger(st.timeMs) || st.timeMs <= 0) throw new Error(`Tiempo inválido: ${JSON.stringify(st)}`);
    const setId = setIds.get(st.set);
    const categoryId = categories.get(st.category);
    const eventDefinitionId = eventDefs.get(`${st.stroke}|${st.distance}|${st.gender}`);
    if (!setId || !categoryId || !eventDefinitionId) {
      throw new Error(`No se pudo ubicar set/categoría/prueba de: ${JSON.stringify(st)}`);
    }
    const key = {
      setId, eventDefinitionId, categoryId, gender: st.gender as Gender, poolLength: st.pool as PoolLength,
    };
    const row = await prisma.timeStandard.upsert({
      where: { setId_eventDefinitionId_categoryId_gender_poolLength: key },
      update: { timeMs: st.timeMs },
      create: { ...key, timeMs: st.timeMs },
    });
    if (!keep.has(setId)) keep.set(setId, new Set());
    keep.get(setId)?.add(row.id);
    written++;
  }

  let removed = 0;
  for (const [setId, ids] of keep) {
    const res = await prisma.timeStandard.deleteMany({ where: { setId, id: { notIn: [...ids] } } });
    removed += res.count;
  }

  console.log(`✅ Marcas básicas: ${written} cargadas/actualizadas, ${removed} eliminadas por no estar más en la planilla.`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
