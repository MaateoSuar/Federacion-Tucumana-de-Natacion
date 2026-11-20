/**
 * Carga la planilla "RECORDS NOA" como Tabla Oficial de récords del alcance NOA.
 *
 * Desde apps/api:
 *   pnpm exec ts-node-transpile-only -P tsconfig.json ../../prisma/scripts/load-noa-records.ts \
 *     --file "..\..\RECORDS NOA 05 de NOVIEMBRE 2026.xlsx" --out C:\ruta\informe.md [--apply] [--allow-remote-db]
 *
 * Sin --apply solo lee la planilla y escribe el informe (no toca la base).
 * Con --apply crea las categorías NOA, los clubes y nadadores que falten y los récords. Es idempotente:
 * si ya hay un récord oficial NOA para (prueba, categoría, género, pileta) no se pisa.
 *
 * Reglas (decididas con el usuario):
 *  - Pileta 25 m: Mayores = 19+. Pileta 50 m: Juniors (19-21) y Mayores (22+) se unen en Mayores 19+
 *    quedándose con el mejor tiempo de cada prueba.
 *  - Absoluto NOA = el mejor tiempo de cada prueba entre todas las categorías.
 *  - Postas de clubes: se cargan como una prueba más. Postas de selecciones: NO se cargan.
 *  - Las filas dudosas se cargan tal como vienen (sin corregir datos) y se listan en el informe.
 */
import { PrismaClient, Gender, PoolLength } from '@prisma/client';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const APPLY = process.argv.includes('--apply');

const NOTE = 'Planilla de récords NOA (actualización 05/11/2026).';
const FALLBACK_DATE = new Date('2026-11-05T00:00:00.000Z');

/**
 * Siglas de la planilla que son selecciones, no clubes: provincias (SAL, SGO, TUC, JUJ, CAT), NOA y ARG
 * (Nacional). Sus postas y marcas NO se cargan (decisión con el usuario): son récords de selecciones.
 */
const SELECTION_SIGLAS = new Set(['SAL', 'SGO', 'TUC', 'JUJ', 'CAT', 'NOA', 'ARG']);
/** Provincia de los clubes que se conocen. El resto queda sin provincia y se lista. */
const CLUB_PROVINCE: Record<string, string> = {
  GYT: 'Salta', UZZI: 'Salta', SES: 'Salta', UCASAL: 'Salta',
  MDC: 'Santiago del Estero', SLTC: 'Santiago del Estero', ENMB: 'Santiago del Estero',
  CAZU: 'Tucumán', CCCT: 'Tucumán', AMT: 'Tucumán', IND: 'Tucumán', CTG: 'Tucumán', SEOC: 'Tucumán',
  FANJ: 'Jujuy',
};

const CATEGORY_DEFS = [
  { code: 'NOA_INF', name: 'Infantiles', minAge: 10, maxAge: 11, orderNo: 21 },
  { code: 'NOA_MEN', name: 'Menores', minAge: 12, maxAge: 13, orderNo: 22 },
  { code: 'NOA_CAD', name: 'Cadetes', minAge: 14, maxAge: 15, orderNo: 23 },
  { code: 'NOA_JUV', name: 'Juveniles', minAge: 16, maxAge: 18, orderNo: 24 },
  { code: 'NOA_MAY', name: 'Mayores', minAge: 19, maxAge: null, orderNo: 25 },
  { code: 'NOA_ABS', name: 'Absoluto', minAge: null, maxAge: null, orderNo: 26 },
] as const;

const t = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

function timeMs(s: string): number | null {
  const m = t(s).match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{2})$/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  return ((h * 60 + parseInt(m[2] ?? '0', 10)) * 60 + parseInt(m[3] ?? '0', 10)) * 1000 + parseInt(m[4] ?? '0', 10) * 10;
}

function parseDate(s: string): Date | null {
  const m = t(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = parseInt(m[3] ?? '0', 10);
  const d = new Date(Date.UTC(y < 100 ? 2000 + y : y, parseInt(m[2] ?? '0', 10) - 1, parseInt(m[1] ?? '0', 10)));
  return Number.isNaN(d.getTime()) ? null : d;
}

const STROKE: Record<string, string> = { L: 'L', E: 'E', P: 'P', M: 'MA', C: 'C' };

interface Row {
  line: number;
  pool: 25 | 50;
  gender: 'M' | 'F' | 'MIX';
  categoryCode: string;
  eventCode: string;
  eventLabel: string;
  relay: boolean;
  holder: string;
  ms: number;
  date: Date | null;
  dateRaw: string;
  place: string;
  notes: string[];
}

function eventCode(label: string, gender: 'M' | 'F'): { code: string; gender: 'M' | 'F' | 'MIX'; relay: boolean } | null {
  const rel = label.replace(/\./g, '').match(/^4\s*X\s*(\d+)\s*([A-Z])\s*(MIX)?$/i);
  if (rel) {
    const g = rel[3] ? 'MIX' : gender;
    return { code: `4x${rel[1]}R${STROKE[(rel[2] ?? '').toUpperCase()] ?? '?'}_${g}`, gender: g, relay: true };
  }
  const ind = label.match(/^(\d[\d.,]*)\s*([A-Z])$/i);
  if (!ind) return null;
  const dist = (ind[1] ?? '').replace(/[.,]/g, '');
  return { code: `${dist}${STROKE[(ind[2] ?? '').toUpperCase()] ?? '?'}_${gender}`, gender, relay: false };
}

function categoryCodeOf(label: string): string | null {
  const u = label.toUpperCase();
  if (u.startsWith('INFANTIL')) return 'NOA_INF';
  if (u.startsWith('MENORES')) return 'NOA_MEN';
  if (u.startsWith('CADETES')) return 'NOA_CAD';
  if (u.startsWith('JUVENILES')) return 'NOA_JUV';
  if (u.startsWith('JUNIOR') || u.startsWith('MAYORES')) return 'NOA_MAY';
  return null;
}

function readRows(file: string): { rows: Row[]; skippedSelections: number } {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  const XLSX = req('xlsx') as typeof import('xlsx');
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!sheet) throw new Error('La planilla no tiene hojas.');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });

  const rows: Row[] = [];
  let skippedSelections = 0;
  let pool: 25 | 50 = 25;
  let section: 'individual' | 'club' | 'seleccion' = 'individual';
  const cat: Record<'F' | 'M', string> = { F: '', M: '' };

  grid.forEach((r, i) => {
    const all = r.map(t).join(' ');
    const pm = all.match(/PILETA\s+(25|50)/i);
    if (pm) pool = pm[1] === '25' ? 25 : 50;
    for (const [g, col] of [['F', 3], ['M', 13]] as const) {
      const cm = t(r[col]).match(/^(MUJERES|VARONES)\s*-\s*(.+)$/i);
      if (cm) { cat[g] = `${t(cm[2])} ${t(r[col + 2])}`.trim(); section = 'individual'; }
    }
    const lab = t(r[2]) || t(r[12]);
    if (/POSTAS DE CLUBES/i.test(lab)) { section = 'club'; return; }
    if (/POSTAS DE SELECCIONES/i.test(lab)) { section = 'seleccion'; return; }

    for (const [g, base] of [['F', 2], ['M', 12]] as const) {
      const label = t(r[base]);
      if (!/^(\d[\d.,]*\s*[A-Z]|4\s*X)/i.test(label)) continue;
      const time = t(r[base + 2]);
      if (!time) continue;
      if (section === 'seleccion') { skippedSelections++; continue; }
      const ev = eventCode(label, g);
      const categoryCode = categoryCodeOf(cat[g]);
      const ms = timeMs(time);
      if (!ev || !categoryCode || ms === null) continue;
      const dateRaw = t(r[base + 5]);
      rows.push({
        line: i + 1, pool, gender: ev.gender, categoryCode, eventCode: ev.code, eventLabel: label, relay: ev.relay,
        holder: t(r[base + 1]), ms, date: parseDate(dateRaw), dateRaw, place: t(r[base + 6]), notes: [],
      });
    }
  });
  return { rows, skippedSelections };
}

interface Holder { names: string; club: string; clubKnown: boolean }

function splitHolder(raw: string, knownCodes: Set<string>): Holder {
  const v = raw.replace(/[–—]/g, '-').trim();
  let m = v.match(/^(.*?)\s*-\s*([A-ZÑ][A-ZÑ.]{1,6})$/);
  if (m) return { names: t(m[1]), club: (m[2] ?? '').toUpperCase(), clubKnown: true };
  m = v.match(/^(.*?)[\s,]+(GyT)\s+Salta$/i);
  if (m) return { names: t(m[1]), club: 'GYT', clubKnown: true };
  m = v.match(/^(.*?)[\s,-]+([A-ZÑ]{2,6})$/);
  if (m && knownCodes.has(m[2] ?? '')) return { names: t(m[1]), club: m[2] ?? '', clubKnown: true };
  return { names: v, club: '', clubKnown: false };
}

/** Siglas en las que se confía; antes de calcularlas, cualquier cola en mayúsculas cuenta. */
let trustedCodes: Set<string> | null = null;

function rawRelayCode(holder: string): string {
  return holder.replace(/[–—]/g, '-').match(/-\s*([A-ZÑ][A-ZÑ.]{1,8})\s*$/)?.[1] ?? '';
}

/** Sigla del club de una posta; vacía si la última palabra es un apellido y no una sigla. */
function relayCode(holder: string): string {
  const code = rawRelayCode(holder);
  return trustedCodes === null || trustedCodes.has(code) ? code : '';
}

function splitName(names: string): { firstName: string; lastName: string } {
  const clean = names.replace(/\s*-\s*/g, ' ').replace(/\s*,\s*/g, ', ').trim();
  if (clean.includes(',')) {
    const [last, ...rest] = clean.split(',');
    return { lastName: t(last), firstName: t(rest.join(' ')) || '(s/d)' };
  }
  const tokens = clean.split(' ');
  return { lastName: tokens[0] ?? clean, firstName: tokens.slice(1).join(' ') || '(s/d)' };
}

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function main(): Promise<void> {
  const file = arg('--file');
  const out = arg('--out');
  if (!file || !out) throw new Error('Faltan --file y --out.');
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL no está definida.');
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (APPLY && !local && !(process.argv.includes('--allow-remote-db') && process.env['FTN_ALLOW_REMOTE_DB'] === 'yes')) {
    throw new Error(`La base apunta a "${host}", que no es local (ver --allow-remote-db y FTN_ALLOW_REMOTE_DB=yes).`);
  }

  const { rows: allRows, skippedSelections } = readRows(file);

  // Siglas de club confiables: las que aparecen con formato limpio varias veces
  const seen = new Map<string, number>();
  for (const r of allRows.filter((x) => !x.relay)) {
    const m = r.holder.replace(/[–—]/g, '-').match(/-\s*([A-ZÑ][A-ZÑ.]{1,6})$/);
    if (m) seen.set(m[1] ?? '', (seen.get(m[1] ?? '') ?? 0) + 1);
  }
  const knownCodes = new Set([...seen.entries()].filter(([, n]) => n >= 2).map(([c]) => c));

  // En las postas, la última palabra es una sigla solo si se repite o ya se la conoce de otro lado
  const relayCounts = new Map<string, number>();
  for (const r of allRows.filter((x) => x.relay)) {
    const c = rawRelayCode(r.holder);
    relayCounts.set(c, (relayCounts.get(c) ?? 0) + 1);
  }
  trustedCodes = new Set([
    ...seen.keys(), ...knownCodes, ...SELECTION_SIGLAS, ...Object.keys(CLUB_PROVINCE),
    ...[...relayCounts.entries()].filter(([c, n]) => c !== '' && n >= 2).map(([c]) => c),
  ]);

  // Las filas de selecciones (provincias, NOA, ARG) no se cargan: en algunas categorías la planilla
  // no marca el título "POSTAS DE SELECCIONES" y se las reconoce por la sigla.
  const codeOf = (r: Row): string => (r.relay ? relayCode(r.holder) : splitHolder(r.holder, knownCodes).club);
  const selectionRows = allRows.filter((r) => SELECTION_SIGLAS.has(codeOf(r)));
  const raw = allRows.filter((r) => !SELECTION_SIGLAS.has(codeOf(r)));

  // 50 m: Junior + Mayores se unen en Mayores 19+ con el mejor tiempo de cada prueba. Para eso
  // todas las filas "mayores" (de Junior o de Mayores) compiten por la misma clave.
  const byKey = new Map<string, Row>();
  const dropped: Row[] = [];
  for (const r of raw) {
    const k = `${r.pool}|${r.gender}|${r.eventCode}|${r.categoryCode}`;
    const prev = byKey.get(k);
    if (!prev || r.ms < prev.ms) { if (prev) dropped.push(prev); byKey.set(k, r); } else dropped.push(r);
  }
  const rows = [...byKey.values()];

  // Absoluto = mejor tiempo entre todas las categorías
  const abs = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.pool}|${r.gender}|${r.eventCode}`;
    const prev = abs.get(k);
    if (!prev || r.ms < prev.ms) abs.set(k, r);
  }
  const all: Row[] = [...rows, ...[...abs.values()].map((r) => ({ ...r, categoryCode: 'NOA_ABS' }))];

  // Marcas de dudas (no se corrige nada: se carga como viene)
  for (const r of rows) {
    if (!r.dateRaw) r.notes.push('sin fecha');
    else if (!r.date) r.notes.push(`fecha rara "${r.dateRaw}"`);
    if (!r.place) r.notes.push('sin lugar');
    if (r.relay && relayCode(r.holder) === '') r.notes.push('posta sin sigla de club');
    if (!r.relay) {
      const h = splitHolder(r.holder, knownCodes);
      if (!h.clubKnown) r.notes.push('sin club');
      else if (!/-\s*[A-ZÑ.]+$/.test(r.holder.replace(/[–—]/g, '-'))) r.notes.push('separador raro');
      if (!/,/.test(h.names)) r.notes.push('nombre sin coma');
    }
  }
  const doubtful = rows.filter((r) => r.notes.length > 0);

  const L: string[] = [];
  L.push(`# Planilla NOA → récords (${APPLY ? 'APLICADO' : 'solo lectura'})`, '');
  L.push(`- Filas con tiempo leídas (sin selecciones): ${raw.length} · selecciones NO cargadas: ${skippedSelections + selectionRows.length} (${skippedSelections} bajo el título de selecciones + ${selectionRows.length} reconocidas por la sigla SAL/SGO/TUC/JUJ/CAT/NOA/ARG)`);
  L.push(`- Quedan ${rows.length} récords por categoría (se descartaron ${dropped.length} que perdían contra otra fila de la misma clave, p. ej. Junior vs Mayores en 50 m) + ${abs.size} de Absoluto.`);
  L.push(`- Filas dudosas (se cargan como vienen): ${doubtful.length}`, '');
  L.push('## Filas dudosas', '', '| Fila | Pileta | Género | Categoría | Prueba | Titular | Tiempo | Motivo |', '|---|---|---|---|---|---|---|---|');
  for (const r of doubtful) L.push(`| ${r.line} | ${r.pool} m | ${r.gender} | ${r.categoryCode} | ${r.eventLabel} | ${r.holder} | ${r.ms} ms | ${r.notes.join(', ')} |`);

  // Siglas → clubes
  const codes = new Map<string, number>();
  for (const r of rows) {
    const code = codeOf(r);
    codes.set(code, (codes.get(code) ?? 0) + 1);
  }
  L.push('', '## Siglas de la planilla', '', '| Sigla | Récords | Tratamiento |', '|---|---|---|');
  for (const [code, n] of [...codes.entries()].sort((a, b) => b[1] - a[1])) {
    const treat = code === '' ? 'sin club → "(sin club)"' : CLUB_PROVINCE[code] ? `club de ${CLUB_PROVINCE[code]}` : 'club sin provincia asignada';
    L.push(`| ${code || '(vacía)'} | ${n} | ${treat} |`);
  }

  L.push('', '## Selecciones no cargadas (reconocidas por la sigla)', '', '| Fila | Pileta | Género | Categoría | Prueba | Titular | Tiempo |', '|---|---|---|---|---|---|---|');
  for (const r of selectionRows) L.push(`| ${r.line} | ${r.pool} m | ${r.gender} | ${r.categoryCode} | ${r.eventLabel} | ${r.holder} | ${r.ms} ms |`);

  if (!APPLY) {
    fs.writeFileSync(out, L.join('\n') + '\n');
    console.log(`Informe: ${out}\n${rows.length} récords + ${abs.size} Absoluto, ${doubtful.length} dudosos. No se escribió nada en la base.`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const categories = new Map<string, string>();
    for (const def of CATEGORY_DEFS) {
      const c = await prisma.category.upsert({
        where: { code: def.code },
        update: {},
        create: { code: def.code, name: def.name, minAge: def.minAge, maxAge: def.maxAge, scope: 'noa', orderNo: def.orderNo },
      });
      categories.set(def.code, c.id);
    }
    const eventDefs = new Map((await prisma.eventDefinition.findMany()).map((e) => [e.code, e.id]));
    const missing = [...new Set(all.map((r) => r.eventCode))].filter((c) => !eventDefs.has(c));
    if (missing.length > 0) throw new Error(`Faltan definiciones de prueba: ${missing.join(', ')}`);

    const clubCache = new Map<string, string>();
    const getClub = async (code: string): Promise<string> => {
      const cached = clubCache.get(code);
      if (cached) return cached;
      const shortName = code === '' ? '(sin club)' : code;
      const existing = await prisma.club.findFirst({ where: { shortName: { equals: shortName, mode: 'insensitive' } } });
      let id = existing?.id;
      if (!id) {
        const created = await prisma.club.create({
          data: {
            name: shortName,
            shortName,
            locality: CLUB_PROVINCE[code] ?? '—',
            province: CLUB_PROVINCE[code] ?? null,
            status: 'afiliado',
          },
        });
        id = created.id;
      }
      clubCache.set(code, id);
      return id;
    };

    const swimmerCache = new Map<string, string>();
    const getSwimmer = async (r: Row, clubId: string): Promise<string> => {
      const g: Gender = r.gender === 'MIX' ? 'M' : r.gender;
      let firstName: string; let lastName: string;
      if (r.relay) {
        const names = r.holder.replace(/[–—]/g, '-').replace(/\s*-\s*[A-ZÑ][A-ZÑ.]{1,8}\s*$/, '').trim();
        firstName = names; lastName = 'Equipo de Relevo';
      } else {
        ({ firstName, lastName } = splitName(splitHolder(r.holder, knownCodes).names));
      }
      const key = `${plain(lastName)}|${plain(firstName)}|${r.relay ? clubId : g}`;
      const cached = swimmerCache.get(key);
      if (cached) return cached;
      const candidates = await prisma.swimmer.findMany({ where: { lastName: { equals: lastName, mode: 'insensitive' } } });
      const found = candidates.find((s) => plain(s.firstName) === plain(firstName) && (r.relay ? s.currentClubId === clubId : s.gender === g));
      const id = found?.id ?? (await prisma.swimmer.create({
        data: { firstName, lastName, gender: g, currentClubId: clubId, source: 'pdf' },
      })).id;
      swimmerCache.set(key, id);
      return id;
    };

    let created = 0; let skipped = 0;
    const createdIds: string[] = [];
    for (const r of all) {
      const categoryId = categories.get(r.categoryCode);
      const eventDefinitionId = eventDefs.get(r.eventCode);
      if (!categoryId || !eventDefinitionId) continue;
      const poolLength: PoolLength = r.pool === 25 ? 'P25' : 'P50';
      const key = { scope: 'noa' as const, eventDefinitionId, categoryId, gender: r.gender as Gender, poolLength };
      if (await prisma.record.findFirst({ where: { ...key, sourceResultId: null } })) { skipped++; continue; }
      const code = codeOf(r);
      const clubId = await getClub(code);
      const swimmerId = await getSwimmer(r, clubId);
      const rec = await prisma.record.create({
        data: {
          ...key, timeMs: r.ms, swimmerId, clubId,
          recordDate: r.date ?? FALLBACK_DATE,
          tournamentName: r.place || null,
          status: 'homologated', isCurrent: true, homologatedAt: new Date(),
          notes: `${NOTE}${r.notes.length ? ` Dudas: ${r.notes.join(', ')}.` : ''}${r.date ? '' : ' Fecha tomada de la actualización de la planilla (no figura en la fila).'}`,
        },
      });
      createdIds.push(rec.id);
      created++;
    }
    await prisma.auditLog.create({
      data: { userId: null, action: 'NOA_RECORDS_LOADED', entityType: 'Record', entityId: 'noa', payload: { created, skipped, doubtful: doubtful.length, recordIds: createdIds } },
    });
    L.push('', `## Resultado`, '', `- Récords NOA creados: ${created} · ya existían: ${skipped}`);
    fs.writeFileSync(out, L.join('\n') + '\n');
    console.log(`Creados ${created}, ya existían ${skipped}. Informe: ${out}`);
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
