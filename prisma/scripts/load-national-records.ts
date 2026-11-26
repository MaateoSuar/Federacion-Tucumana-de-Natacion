/**
 * Carga los récords nacionales argentinos por categoría (fuente: SwimRecords, swimrecords.com.ar,
 * leídos de su página pública el 18/11/2026 → prisma/data/records-nacionales-swimrecords.json).
 *
 * Desde apps/api:
 *   pnpm exec ts-node-transpile-only -P tsconfig.json ../../prisma/scripts/load-national-records.ts \
 *     --out C:\ruta\informe.md [--apply] [--allow-remote-db]
 *
 * Sin --apply solo lee el archivo y escribe el informe (no toca la base).
 *
 * Reglas:
 *  - Los récords nacionales son SOLO DE REFERENCIA (scope nacional): la FTN no los homologa ni los evalúa.
 *  - Las postas: solo las de clubes "(C)". Las postas sin "(C)" son de selecciones y no se cargan.
 *  - Es idempotente: si ya hay un récord nacional para (prueba, categoría, género, pileta) no se pisa.
 *    Para actualizar contra la fuente, volver a leer la página y regenerar el archivo.
 */
import { PrismaClient, Gender, PoolLength } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes('--apply');

interface SourceRow {
  pool: 'P25' | 'P50';
  category: string;
  gender: string;
  club: string;
  date: string;
  event: string;
  time: string;
  name: string;
  asterisk: boolean;
}

/** Categorías nacionales. Junior ya existe en la base como JUN (nacional, 19-21). */
const CATEGORY_DEFS = [
  { source: 'Menores', code: 'NAC_MEN', name: 'Menores', minAge: 12, maxAge: 13, orderNo: 31 },
  { source: 'Cadetes', code: 'NAC_CAD', name: 'Cadetes', minAge: 14, maxAge: 15, orderNo: 32 },
  { source: 'Juveniles', code: 'NAC_JUV', name: 'Juveniles', minAge: 16, maxAge: 18, orderNo: 33 },
  { source: 'Juniors', code: 'JUN', name: 'Junior', minAge: 19, maxAge: 21, orderNo: 12 },
  { source: 'Absolutos', code: 'NAC_ABS', name: 'Absoluto', minAge: null, maxAge: null, orderNo: 34 },
] as const;

const STROKE: Record<string, string> = { Libre: 'L', Espalda: 'E', Pecho: 'P', Mariposa: 'MA', Combinado: 'C' };
const GENDER: Record<string, 'M' | 'F' | 'MIX'> = { Masculino: 'M', Femenino: 'F', Mixto: 'MIX' };
const RELAY_LEG: Record<string, string> = { '200': '50', '400': '100', '800': '200' };

/** "50m Libre" → 50L_M · "400m Relevo Combinado (C)" → 4x100RC_MIX. Null si no se carga. */
function eventCodeOf(event: string, gender: 'M' | 'F' | 'MIX'): { code: string; relay: boolean } | null {
  const relay = event.match(/^(\d+)m Relevo (Libre|Combinado)( \(C\))?$/);
  if (relay) {
    if (!relay[3]) return null; // sin (C): posta de selección, no se carga
    const leg = RELAY_LEG[relay[1] ?? ''];
    return leg ? { code: `4x${leg}R${relay[2] === 'Libre' ? 'L' : 'C'}_${gender}`, relay: true } : null;
  }
  const ind = event.match(/^(\d+)m (Libre|Espalda|Pecho|Mariposa|Combinado)$/);
  if (!ind) return null;
  return { code: `${ind[1]}${STROKE[ind[2] ?? ''] ?? '?'}_${gender}`, relay: false };
}

function timeMs(s: string): number | null {
  const m = s.match(/^(\d{2}):(\d{2})\.(\d{2})$/);
  return m ? (parseInt(m[1] ?? '0', 10) * 60 + parseInt(m[2] ?? '0', 10)) * 1000 + parseInt(m[3] ?? '0', 10) * 10 : null;
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(parseInt(m[3] ?? '0', 10), parseInt(m[2] ?? '0', 10) - 1, parseInt(m[1] ?? '0', 10)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "BERRINO Andrea" → apellido BERRINO, nombre Andrea. Los apellidos van en mayúsculas. */
function splitName(raw: string): { firstName: string; lastName: string } {
  const tokens = raw.trim().split(/\s+/);
  const lastTokens = tokens.filter((t, i) => i === 0 || t === t.toUpperCase());
  const firstTokens = tokens.slice(lastTokens.length);
  return { lastName: lastTokens.join(' '), firstName: firstTokens.join(' ') || '(s/d)' };
}

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function main(): Promise<void> {
  const out = arg('--out');
  if (!out) throw new Error('Falta --out.');
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL no está definida.');
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (APPLY && !local && !(process.argv.includes('--allow-remote-db') && process.env['FTN_ALLOW_REMOTE_DB'] === 'yes')) {
    throw new Error(`La base apunta a "${host}", que no es local (ver --allow-remote-db y FTN_ALLOW_REMOTE_DB=yes).`);
  }

  const file = path.join(process.cwd(), '..', '..', 'prisma', 'data', 'records-nacionales-swimrecords.json');
  const source = JSON.parse(fs.readFileSync(file, 'utf8')) as { source: string; fetchedAt: string; records: SourceRow[] };

  const rows = source.records.flatMap((r) => {
    const gender = GENDER[r.gender];
    const cat = CATEGORY_DEFS.find((c) => c.source === r.category);
    const ev = gender ? eventCodeOf(r.event, gender) : null;
    const ms = timeMs(r.time);
    // Una fila "individual" con cuatro nombres es una posta de selección mal rotulada en la fuente: no se carga
    if (ev && !ev.relay && r.name.includes(' - ')) return [];
    return gender && cat && ev && ms !== null ? [{ ...r, genderCode: gender, cat, ev, ms }] : [];
  });
  const skipped = source.records.length - rows.length;

  const L: string[] = [];
  L.push(`# Récords nacionales (${APPLY ? 'APLICADO' : 'solo lectura'})`, '');
  L.push(`- Fuente: ${source.source} · leído el ${source.fetchedAt}`);
  L.push(`- Filas leídas: ${source.records.length} · a cargar: ${rows.length} · no se cargan (postas de selecciones): ${skipped}`);
  L.push(`- Con asterisco en la fuente (sin leyenda): ${rows.filter((r) => r.asterisk).length}`, '');
  L.push('| Categoría | Individuales | Postas de clubes |', '|---|---|---|');
  for (const c of CATEGORY_DEFS) {
    const own = rows.filter((r) => r.cat.code === c.code);
    L.push(`| ${c.name} (${c.code}) | ${own.filter((r) => !r.ev.relay).length} | ${own.filter((r) => r.ev.relay).length} |`);
  }

  if (!APPLY) {
    fs.writeFileSync(out, L.join('\n') + '\n');
    console.log(`Informe: ${out}\n${rows.length} récords a cargar, ${skipped} no se cargan. No se escribió nada en la base.`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const categories = new Map<string, string>();
    for (const def of CATEGORY_DEFS) {
      const c = await prisma.category.upsert({
        where: { code: def.code },
        update: {},
        create: { code: def.code, name: def.name, minAge: def.minAge, maxAge: def.maxAge, scope: 'nacional', orderNo: def.orderNo },
      });
      categories.set(def.code, c.id);
    }
    const eventDefs = new Map((await prisma.eventDefinition.findMany()).map((e) => [e.code, e.id]));
    const missing = [...new Set(rows.map((r) => r.ev.code))].filter((c) => !eventDefs.has(c));
    if (missing.length > 0) throw new Error(`Faltan definiciones de prueba: ${missing.join(', ')}`);

    const clubCache = new Map<string, string>();
    const getClub = async (shortName: string): Promise<string> => {
      const cached = clubCache.get(shortName);
      if (cached) return cached;
      const existing = await prisma.club.findFirst({ where: { shortName: { equals: shortName, mode: 'insensitive' } } });
      const id = existing?.id ?? (await prisma.club.create({
        data: { name: shortName, shortName, locality: '—', status: 'afiliado' },
      })).id;
      clubCache.set(shortName, id);
      return id;
    };
    const swimmerCache = new Map<string, string>();
    const getSwimmer = async (r: (typeof rows)[number], clubId: string): Promise<string> => {
      const g: Gender = r.genderCode === 'MIX' ? 'M' : r.genderCode;
      const { firstName, lastName } = r.ev.relay
        ? { firstName: r.name, lastName: 'Equipo de Relevo' }
        : splitName(r.name);
      const key = `${plain(lastName)}|${plain(firstName)}|${r.ev.relay ? clubId : g}`;
      const cached = swimmerCache.get(key);
      if (cached) return cached;
      const candidates = await prisma.swimmer.findMany({ where: { lastName: { equals: lastName, mode: 'insensitive' } } });
      const found = candidates.find((s) => plain(s.firstName) === plain(firstName) && (r.ev.relay ? s.currentClubId === clubId : s.gender === g));
      const id = found?.id ?? (await prisma.swimmer.create({
        data: { firstName, lastName, gender: g, currentClubId: clubId, source: 'pdf' },
      })).id;
      swimmerCache.set(key, id);
      return id;
    };

    let created = 0; let existed = 0;
    const createdIds: string[] = [];
    for (const r of rows) {
      const categoryId = categories.get(r.cat.code);
      const eventDefinitionId = eventDefs.get(r.ev.code);
      if (!categoryId || !eventDefinitionId) continue;
      const poolLength: PoolLength = r.pool;
      const key = { scope: 'nacional' as const, eventDefinitionId, categoryId, gender: r.genderCode as Gender, poolLength };
      if (await prisma.record.findFirst({ where: { ...key, sourceResultId: null } })) { existed++; continue; }
      const clubId = await getClub(r.club);
      const swimmerId = await getSwimmer(r, clubId);
      const rec = await prisma.record.create({
        data: {
          ...key, timeMs: r.ms, swimmerId, clubId,
          recordDate: parseDate(r.date ?? '') ?? new Date(`${source.fetchedAt}T00:00:00.000Z`),
          status: 'homologated', isCurrent: true, homologatedAt: new Date(),
          notes: `Récord nacional de referencia. Fuente: SwimRecords (${source.source}), leído el ${source.fetchedAt}.${r.asterisk ? ' Marcado con * en la fuente.' : ''}${r.date ? '' : ' Sin fecha en la fuente: se usa la fecha de lectura.'}`,
        },
      });
      createdIds.push(rec.id);
      created++;
    }
    await prisma.auditLog.create({
      data: { userId: null, action: 'NATIONAL_RECORDS_LOADED', entityType: 'Record', entityId: 'nacional', payload: { source: source.source, fetchedAt: source.fetchedAt, created, existed, recordIds: createdIds } },
    });
    L.push('', '## Resultado', '', `- Récords nacionales creados: ${created} · ya existían: ${existed}`);
    fs.writeFileSync(out, L.join('\n') + '\n');
    console.log(`Creados ${created}, ya existían ${existed}. Informe: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
