import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { MeetManagerPdfAdapter } from '../../ingest/adapters/meet-manager-pdf/meet-manager-pdf-adapter';
import {
  detectJornadas,
  extractEventNumbers,
  extractPoolLength,
  fileKind,
  type JornadaGroup,
  type TournamentFileKind,
} from '../../ingest/jornadas/jornada-detector';
import {
  DRIVE_FOLDERS,
  chooseTournamentName,
  deriveTournamentDates,
  scopeForFolder,
  type DerivedDates,
  type DriveScope,
  type DriveTournamentType,
} from './drive-naming';

// pdf-parse v1 exporta una función como default CJS (igual que en el adaptador)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;

export interface PlanOptions {
  /** De dónde sale el nombre del torneo. Por defecto 'archivo'. */
  nameFrom?: 'archivo' | 'encabezado';
}

export interface ScanFilters {
  folders?: string[];
  years?: number[];
  /** Solo archivos cuyo nombre contenga este texto (sin distinguir mayúsculas). */
  only?: string;
}

export interface FileSummary {
  rows: number;
  events: number;
  swimmers: number;
  clubs: number;
  /** Resultados que traen tiempo de sembrado. */
  withSeed: number;
  /** Largos de pileta de las pruebas leídas (25 / 50). */
  courses: number[];
  /** Nombre del torneo según el encabezado del PDF (null si el PDF no trae encabezado). */
  headerName: string | null;
  headerStart: string;
  headerEnd: string;
  issueErrors: number;
}

export interface ScannedFile {
  folder: string;
  year: number;
  fileName: string;
  absPath: string;
  relPath: string;
  kind: TournamentFileKind;
  hash: string;
  eventNumbers: number[];
  pool: 25 | 50 | 'mixta' | null;
  readError: string | null;
  summary: FileSummary | null;
}

export interface PlannedTournament {
  folder: string;
  year: number;
  /** Nombre base derivado de los archivos (sin tipo ni jornada). */
  baseName: string;
  name: string;
  nameSource: 'encabezado' | 'archivo';
  headerName: string | null;
  scope: DriveScope;
  type: DriveTournamentType;
  pool: 25 | 50;
  dates: DerivedDates;
  /** general = un solo archivo; unir = varias jornadas del mismo torneo. */
  decision: 'general' | 'unir';
  files: ScannedFile[];
  notes: string[];
}

export interface SkippedGroup {
  folder: string;
  year: number;
  torneo: string;
  kind: TournamentFileKind;
  files: string[];
  reason: string;
}

export interface DrivePlan {
  tournaments: PlannedTournament[];
  skipped: SkippedGroup[];
  /** PDF de sembrados: no se importan (el sembrado viaja en los resultados). */
  ignoredSembrados: string[];
  scannedFiles: number;
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function listDirs(path: string): string[] {
  return existsSync(path)
    ? readdirSync(path).filter((n) => statSync(join(path, n)).isDirectory()).sort()
    : [];
}

async function scanFile(folder: string, year: number, fileName: string, absPath: string, root: string): Promise<ScannedFile> {
  const buffer = readFileSync(absPath);
  const base: ScannedFile = {
    folder,
    year,
    fileName,
    absPath,
    relPath: absPath.startsWith(root) ? absPath.slice(root.length).replace(/^[\\/]/, '') : absPath,
    kind: fileKind(fileName),
    hash: sha256(buffer),
    eventNumbers: [],
    pool: null,
    readError: null,
    summary: null,
  };
  try {
    const { text } = await pdfParse(buffer);
    base.eventNumbers = extractEventNumbers(text);
    base.pool = extractPoolLength(text);
  } catch (err) {
    return { ...base, readError: `No se pudo leer el texto del PDF: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (base.kind !== 'resultados') return base;

  try {
    const meet = await new MeetManagerPdfAdapter().parse(buffer, fileName);
    const hasHeader = meet.meet.start_date !== '';
    base.summary = {
      rows: meet.results.length,
      events: meet.events.length,
      swimmers: meet.swimmers.length,
      clubs: meet.clubs.length,
      withSeed: meet.results.filter((r) => r.seed_time_ms !== undefined).length,
      courses: [...new Set(meet.events.map((e) => e.course))].sort(),
      headerName: hasHeader ? meet.meet.name : null,
      headerStart: meet.meet.start_date,
      headerEnd: meet.meet.end_date,
      issueErrors: meet.issues.filter((i) => i.severity === 'ERROR' || i.severity === 'FATAL').length,
    };
  } catch (err) {
    base.readError = err instanceof Error ? err.message : String(err);
  }
  return base;
}

/** Recorre la copia del Drive (`<root>/<Nacionales|NOA|Tucuman>/<año>/*.pdf`). */
export async function scanDrive(root: string, filters: ScanFilters = {}): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  const wantedFolders = filters.folders?.map((f) => f.toLowerCase());
  for (const folder of DRIVE_FOLDERS) {
    if (wantedFolders && !wantedFolders.includes(folder.toLowerCase())) continue;
    for (const yearDir of listDirs(join(root, folder))) {
      const year = parseInt(yearDir, 10);
      if (Number.isNaN(year) || (filters.years && !filters.years.includes(year))) continue;
      const dir = join(root, folder, yearDir);
      const names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.pdf')).sort();
      for (const name of names) {
        if (filters.only && !name.toLowerCase().includes(filters.only.toLowerCase())) continue;
        out.push(await scanFile(folder, year, name, join(dir, name), root));
      }
    }
  }
  return out;
}

function groupReason(files: ScannedFile[]): string | null {
  const unreadable = files.filter((f) => f.readError || !f.summary);
  if (unreadable.length > 0) {
    return `No se pudo leer: ${unreadable.map((f) => `${f.fileName} (${f.readError ?? 'sin datos'})`).join('; ')}.`;
  }
  const empty = files.filter((f) => (f.summary?.rows ?? 0) === 0);
  if (empty.length > 0) return `El lector no reconoció filas de resultados en: ${empty.map((f) => f.fileName).join(', ')}.`;
  const mixed = files.filter((f) => f.pool === 'mixta' || (f.summary?.courses.length ?? 0) > 1);
  if (mixed.length > 0) {
    return `Mezcla pileta de 25 m y de 50 m: ${mixed.map((f) => f.fileName).join(', ')}. No se mezclan, hay que decidir cómo partirlo.`;
  }
  return null;
}

function poolOf(files: ScannedFile[]): 25 | 50 | null {
  const pools = new Set<number>();
  for (const f of files) {
    for (const c of f.summary?.courses ?? []) pools.add(c);
    if (f.pool === 25 || f.pool === 50) pools.add(f.pool);
  }
  if (pools.size !== 1) return null;
  return [...pools][0] === 50 ? 50 : 25;
}

/** Agrupa los archivos en torneos con el detector de jornadas y deduce alcance, pileta, nombre y fechas. */
export function planTournaments(files: ScannedFile[], options: PlanOptions = {}): DrivePlan {
  const plan: DrivePlan = { tournaments: [], skipped: [], ignoredSembrados: [], scannedFiles: files.length };

  const dirs = new Map<string, ScannedFile[]>();
  for (const f of files) {
    const key = `${f.folder}|${f.year}`;
    dirs.set(key, [...(dirs.get(key) ?? []), f]);
  }

  for (const dirFiles of dirs.values()) {
    const first = dirFiles[0];
    if (!first) continue;
    const scope = scopeForFolder(first.folder);
    if (!scope) continue;
    const byName = new Map(dirFiles.map((f) => [f.fileName, f]));
    const groups: JornadaGroup[] = detectJornadas(
      dirFiles.map((f) => ({
        name: f.fileName,
        eventNumbers: f.eventNumbers,
        poolLength: f.pool === 25 || f.pool === 50 ? f.pool : null,
      })),
    );

    const resultGroups = groups.filter((g) => g.kind === 'resultados');
    const sembradoGroups = groups.filter((g) => g.kind === 'sembrados');
    for (const g of sembradoGroups) plan.ignoredSembrados.push(...g.files.map((f) => `${first.folder}/${first.year}/${f.name}`));

    // Títulos de encabezado que comparten varios torneos de la misma carpeta y año
    const headerCount = new Map<string, number>();
    const headerOf = (g: JornadaGroup): string | null =>
      g.files.map((f) => byName.get(f.name)?.summary?.headerName).find((n): n is string => !!n) ?? null;
    for (const g of resultGroups) {
      const h = headerOf(g)?.toLowerCase();
      if (h) headerCount.set(h, (headerCount.get(h) ?? 0) + 1);
    }
    const shared = new Set([...headerCount].filter(([, n]) => n > 1).map(([h]) => h));

    for (const g of groups) {
      const scanned = g.files.map((f) => byName.get(f.name)).filter((f): f is ScannedFile => !!f);
      const skip = (reason: string): void => {
        plan.skipped.push({ folder: first.folder, year: first.year, torneo: g.torneo, kind: g.kind, files: scanned.map((f) => f.fileName), reason });
      };
      if (g.kind === 'sembrados') continue;
      if (g.kind === 'otro') {
        skip('Toma de tiempos u otro tipo de archivo: no es un resultado de torneo.');
        continue;
      }
      if (g.decision === 'revisar') {
        skip(g.reason);
        continue;
      }
      const problem = groupReason(scanned);
      if (problem) {
        skip(problem);
        continue;
      }
      const pool = poolOf(scanned);
      if (pool === null) {
        skip('No se pudo determinar la pileta (25 m / 50 m) del archivo.');
        continue;
      }

      const headerName = headerOf(g);
      const name = chooseTournamentName({ headerName, baseName: g.torneo, taken: shared, prefer: options.nameFrom });
      const dates = deriveTournamentDates({
        fileNames: scanned.map((f) => f.fileName),
        folderYear: first.year,
        headerDates: scanned
          .filter((f) => f.summary?.headerName)
          .map((f) => ({ start: f.summary?.headerStart ?? '', end: f.summary?.headerEnd ?? '' })),
      });
      const notes: string[] = [];
      if (name.source === 'archivo' && headerName && options.nameFrom === 'encabezado') {
        notes.push(`El título del encabezado ("${headerName}") lo comparten varios torneos de la carpeta: se usó el nombre del archivo.`);
      }
      if (dates.estimated) notes.push(dates.note);
      if (dates.source === 'encabezado' && !dates.startDate.startsWith(String(first.year))) {
        notes.push(`La fecha del encabezado (${dates.startDate}) cae fuera del año de la carpeta (${first.year}).`);
      }
      const hasSeedInResults = scanned.some((f) => (f.summary?.withSeed ?? 0) > 0);
      const hasSembradoPdf = sembradoGroups.some((s) => s.torneo.toLowerCase() === g.torneo.toLowerCase());
      if (!hasSeedInResults && hasSembradoPdf) {
        notes.push('Hay PDF de sembrado y los resultados NO traen tiempo de sembrado: no se importó el sembrado (queda para decidir).');
      }

      plan.tournaments.push({
        folder: first.folder,
        year: first.year,
        baseName: g.torneo,
        name: name.name,
        nameSource: name.source,
        headerName,
        scope: scope.scope,
        type: scope.type,
        pool,
        dates,
        decision: g.decision === 'unir' ? 'unir' : 'general',
        files: scanned,
        notes,
      });
    }
  }
  return plan;
}
