/**
 * Carga masiva de torneos desde una copia local del Drive de la FTN.
 *
 *   <root>/<Nacionales|NOA|Tucuman>/<año>/*.pdf
 *
 * Uso (desde apps/api; el lanzador es prisma/scripts/load-drive-tournaments.ts):
 *   pnpm exec ts-node-transpile-only -P tsconfig.json ../../prisma/scripts/load-drive-tournaments.ts \
 *     --root C:\ruta\ftn-drive-copia [--dry-run] [--folder NOA] [--year 2025] [--only texto] \
 *     [--out carpeta-del-informe] [--name-from archivo|encabezado] [--homologate-non-provincial] [--probe-rehash N]
 *
 * La base sale de DATABASE_URL (o del .env de la raíz). Por seguridad, solo corre contra localhost
 * salvo que se pase --allow-remote-db Y exista FTN_ALLOW_REMOTE_DB=yes.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveLoader } from './drive-loader';
import { planTournaments, scanDrive } from './drive-scan';
import { renderMarkdown, summarizePlan, type DbCounts, type FullReport } from './drive-report';

interface CliArgs {
  root: string;
  dryRun: boolean;
  folders?: string[];
  years?: number[];
  only?: string;
  out: string;
  homologateNonProvincial: boolean;
  probeRehash: number;
  allowRemoteDb: boolean;
  nameFrom: 'archivo' | 'encabezado';
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string): boolean => argv.includes(name);
  const root = get('--root');
  if (!root) throw new Error('Falta --root <carpeta de la copia del Drive>.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    root: resolve(root),
    dryRun: has('--dry-run'),
    folders: get('--folder')?.split(','),
    years: get('--year')?.split(',').map((y) => parseInt(y, 10)),
    only: get('--only'),
    out: resolve(get('--out') ?? join(process.cwd(), 'drive-load-report', stamp)),
    homologateNonProvincial: has('--homologate-non-provincial'),
    probeRehash: parseInt(get('--probe-rehash') ?? '0', 10) || 0,
    allowRemoteDb: has('--allow-remote-db'),
    nameFrom: get('--name-from') === 'encabezado' ? 'encabezado' : 'archivo',
  };
}

function loadEnv(): void {
  if (process.env['DATABASE_URL']) return;
  for (const p of [join(process.cwd(), '.env'), join(process.cwd(), '..', '..', '.env')]) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      return;
    }
  }
}

export function assertLocalDatabase(allowRemote: boolean): string {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL no está definida.');
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!local && !(allowRemote && process.env['FTN_ALLOW_REMOTE_DB'] === 'yes')) {
    throw new Error(
      `La base apunta a "${host}", que no es local. Esta carga solo corre contra localhost ` +
        '(para otra base: --allow-remote-db y FTN_ALLOW_REMOTE_DB=yes, con el OK del responsable).',
    );
  }
  return `${host}${new URL(url).pathname}`;
}

const COUNT_TABLES = [
  'tournament', 'event', 'heat', 'result', 'split', 'swimmer', 'club', 'externalIdMap',
  'importJob', 'meetManagerImport', 'personalBest', 'ranking', 'record', 'athleteStatistics', 'auditLog',
] as const;

async function snapshot(prisma: PrismaService): Promise<DbCounts> {
  const out: DbCounts = {};
  const db = prisma as unknown as Record<string, { count: () => Promise<number> }>;
  for (const t of COUNT_TABLES) out[t] = await (db[t] as { count: () => Promise<number> }).count();
  return out;
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  loadEnv();
  const database = assertLocalDatabase(args.allowRemoteDb);
  // eslint-disable-next-line no-console
  const log = (line: string): void => console.log(line);

  log(`Base: ${database}${args.dryRun ? ' (dry-run: no se escribe nada)' : ''}`);
  log(`Recorriendo ${args.root} ...`);
  const files = await scanDrive(args.root, { folders: args.folders, years: args.years, only: args.only });
  const plan = planTournaments(files, { nameFrom: args.nameFrom });
  log(`${files.length} PDF -> ${plan.tournaments.length} torneos a cargar, ${plan.skipped.length} grupos que no se cargan, ${plan.ignoredSembrados.length} sembrados ignorados.`);

  const report: FullReport = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'carga',
    database,
    root: args.root,
    plan: summarizePlan(plan),
    load: null,
    countsBefore: null,
    countsAfter: null,
  };

  if (!args.dryRun) {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
      const prisma = app.get(PrismaService);
      report.countsBefore = await snapshot(prisma);
      const loader = new DriveLoader(app, {
        homologateNonProvincial: args.homologateNonProvincial,
        probeRehash: args.probeRehash,
        log,
      });
      report.load = await loader.load(plan.tournaments);
      report.countsAfter = await snapshot(prisma);
    } finally {
      await app.close();
    }
  }

  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, 'informe.json'), JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(join(args.out, 'informe.md'), renderMarkdown(report), 'utf-8');
  new Logger('DriveLoader').log(`Informe en ${args.out}`);
  log(`Informe en ${args.out}`);
}
