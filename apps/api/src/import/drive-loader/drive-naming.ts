/**
 * Reglas puras (sin base de datos ni archivos) para cargar el Drive de la FTN:
 * alcance según la carpeta, fechas del torneo y nombre. Todo lo que no sale del
 * encabezado del PDF queda marcado como estimado, para que un Admin lo revise.
 */

export type DriveScope = 'provincial' | 'noa' | 'nacional';
export type DriveTournamentType = 'provincial' | 'nacional';

export const DRIVE_FOLDERS = ['Nacionales', 'NOA', 'Tucuman'] as const;
export type DriveFolder = (typeof DRIVE_FOLDERS)[number];

/**
 * Nacionales -> nacional, NOA -> noa, Tucuman -> provincial.
 * `TournamentType` no tiene valor para NOA: se usa `provincial` y el alcance lo marca `scope`.
 */
export function scopeForFolder(folder: string): { scope: DriveScope; type: DriveTournamentType } | null {
  switch (folder.toLowerCase()) {
    case 'nacionales':
      return { scope: 'nacional', type: 'nacional' };
    case 'noa':
      return { scope: 'noa', type: 'provincial' };
    case 'tucuman':
      return { scope: 'provincial', type: 'provincial' };
    default:
      return null;
  }
}

export type DateSource = 'encabezado' | 'nombre-mes-anio' | 'nombre-dia-mes' | 'carpeta';

export interface DerivedDates {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  source: DateSource;
  /** true si no salió del encabezado del PDF: hay que marcarlo en el informe. */
  estimated: boolean;
  note: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** "Junior 12-2024 Verano" -> { month: 12, year: 2024 }. El mes tiene que estar entre 1 y 12. */
export function monthYearFromName(name: string): { month: number; year: number } | null {
  for (const m of name.matchAll(/(?<!\d)(\d{1,2})-(\d{4})(?!\d)/g)) {
    const month = parseInt(m[1] ?? '', 10);
    const year = parseInt(m[2] ?? '', 10);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { month, year };
  }
  return null;
}

/**
 * "Infantiles y Menores 06-24 Invierno" -> { month: 6, year: 2024 }, solo si el año de dos cifras
 * coincide con el año de la carpeta (así "Verano 23-24", que es una temporada, no se interpreta).
 */
export function monthShortYearFromName(name: string, folderYear: number): { month: number; year: number } | null {
  for (const m of name.matchAll(/(?<![\d-])(\d{1,2})-(\d{2})(?![\d-])/g)) {
    const month = parseInt(m[1] ?? '', 10);
    const year = 2000 + parseInt(m[2] ?? '', 10);
    if (month >= 1 && month <= 12 && year === folderYear) return { month, year };
  }
  return null;
}

/**
 * "Batalla de Tucuman 28-09 CC" -> { day: 28, month: 9 }. Solo si hay una única lectura posible
 * (día-mes con día > 12); "Verano 23-24" (temporada) o "05-06" (ambiguo) no se interpretan.
 */
export function dayMonthFromName(name: string, year: number): { day: number; month: number } | null {
  for (const m of name.matchAll(/(?<![\d-])(\d{1,2})-(\d{1,2})(?![\d-])/g)) {
    const a = parseInt(m[1] ?? '', 10);
    const b = parseInt(m[2] ?? '', 10);
    if (a > 12 && b >= 1 && b <= 12 && isRealDate(year, b, a)) return { day: a, month: b };
  }
  return null;
}

export interface DateInput {
  fileNames: string[];
  /** Año de la carpeta del Drive. */
  folderYear: number;
  /** Fechas "YYYY-MM-DD" que trajo el encabezado de cada archivo del torneo (puede estar vacío). */
  headerDates: Array<{ start: string; end: string }>;
}

export function deriveTournamentDates(input: DateInput): DerivedDates {
  const valid = input.headerDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.start));
  if (valid.length > 0) {
    const starts = valid.map((d) => d.start).sort();
    const ends = valid.map((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d.end) ? d.end : d.start)).sort();
    const startDate = starts[0] ?? '';
    const endDate = ends[ends.length - 1] ?? startDate;
    return { startDate, endDate: endDate < startDate ? startDate : endDate, source: 'encabezado', estimated: false, note: 'Fechas del encabezado del PDF.' };
  }

  for (const name of input.fileNames) {
    const my = monthYearFromName(name);
    if (my) {
      const d = `${my.year}-${pad(my.month)}-01`;
      return {
        startDate: d,
        endDate: d,
        source: 'nombre-mes-anio',
        estimated: true,
        note: `El PDF no trae fecha: se tomó el mes y el año del nombre del archivo ("${name}"); día 1 estimado.`,
      };
    }
  }
  for (const name of input.fileNames) {
    const my = monthShortYearFromName(name, input.folderYear);
    if (my) {
      const d = `${my.year}-${pad(my.month)}-01`;
      return {
        startDate: d,
        endDate: d,
        source: 'nombre-mes-anio',
        estimated: true,
        note: `El PDF no trae fecha: se tomó el mes y el año (de dos cifras) del nombre del archivo ("${name}"); día 1 estimado.`,
      };
    }
  }
  for (const name of input.fileNames) {
    const dm = dayMonthFromName(name, input.folderYear);
    if (dm) {
      const d = `${input.folderYear}-${pad(dm.month)}-${pad(dm.day)}`;
      return {
        startDate: d,
        endDate: d,
        source: 'nombre-dia-mes',
        estimated: true,
        note: `El PDF no trae fecha: día y mes del nombre del archivo ("${name}") con el año de la carpeta (${input.folderYear}).`,
      };
    }
  }
  const d = `${input.folderYear}-01-01`;
  return {
    startDate: d,
    endDate: d,
    source: 'carpeta',
    estimated: true,
    note: `Sin fecha en el PDF ni en el nombre: se usó el 1 de enero del año de la carpeta (${input.folderYear}). Hay que corregirla.`,
  };
}

/**
 * Nombre del torneo. Por defecto el del archivo del Drive (curado por la FTN, lleva la sede y el mes;
 * los títulos de encabezado traen erratas del organizador y suelen omitir la ciudad). Con
 * prefer = 'encabezado' se usa el título del PDF, salvo que lo compartan varios torneos de la
 * misma carpeta y año.
 */
export function chooseTournamentName(args: {
  headerName: string | null;
  baseName: string;
  /** 'archivo' (por defecto): nombre curado del Drive; 'encabezado': título del PDF si no se repite. */
  prefer?: 'archivo' | 'encabezado';
  /** Títulos de encabezado (en minúsculas) que comparten dos o más torneos de la misma carpeta y año. */
  taken: ReadonlySet<string>;
}): { name: string; source: 'encabezado' | 'archivo' } {
  const header = args.headerName?.trim();
  if (args.prefer !== 'encabezado') return { name: args.baseName, source: 'archivo' };
  if (header && !args.taken.has(header.toLowerCase())) return { name: header, source: 'encabezado' };
  return { name: args.baseName, source: 'archivo' };
}
