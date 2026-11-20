/**
 * Detecta, sin que nadie lo indique, qué torneos tienen sus archivos partidos por jornada
 * y necesitan un archivo "general" (D-1). Es lógica pura: recibe nombres de archivo y lo
 * que se leyó de cada uno; no lee el Drive ni escribe nada.
 *
 * Regla:
 *  1. Los archivos de una misma carpeta se agrupan por nombre de torneo, quitando el tipo
 *     (Resultados / Sembrado / Tomas de Tiempo) y el número de jornada ("Resultados2",
 *     "Sembrado 3", "1ra Jornada"). La palabra "Fecha" NO se quita: cada fecha es otro torneo.
 *  2. Un solo archivo de un tipo → ya es el general.
 *  3. Dos o más del mismo tipo cuyos números de prueba no se pisan → son jornadas: unir.
 *  4. Si alguna prueba aparece en dos archivos, o las piletas difieren (25 m / 50 m), o un
 *     archivo no se pudo leer → no se une: queda para revisar, con el motivo.
 */

export type TournamentFileKind = 'resultados' | 'sembrados' | 'otro';

export interface TournamentFileInfo {
  /** Nombre del archivo tal como está en la carpeta. */
  name: string;
  /** Números de prueba que trae el archivo (sin repetir). */
  eventNumbers: number[];
  /** Pileta que declara el archivo: 25, 50, o null si no lo dice. */
  poolLength: 25 | 50 | null;
}

export type JornadaDecision = 'general' | 'unir' | 'revisar';

export interface JornadaGroup {
  torneo: string;
  kind: TournamentFileKind;
  /** En el orden en que hay que unirlos (por primera prueba). */
  files: TournamentFileInfo[];
  decision: JornadaDecision;
  /** Motivo en palabras, para mostrarle a un Admin. */
  reason: string;
  /** Pruebas que aparecen en más de un archivo (solo si decision = 'revisar'). */
  repeatedEvents: number[];
}

const KIND_SUFFIX_RE = /\s*-?\s*(resultados?|sembrados?|tomas? de tiempo)\s*(fed|promo)?\s*\d*\s*$/i;
const JORNADA_RE = /\s*-?\s*\d+\s*(ra|da|ta|era|ma|na|va)?\.?\s+jornada\b/i;

export function fileKind(fileName: string): TournamentFileKind {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  if (/sembrados?\s*\d*\s*$/i.test(base) || /\bsembrad/i.test(base)) return 'sembrados';
  if (/\btomas? de tiempo\b/i.test(base) && !/\bresultad/i.test(base)) return 'otro';
  return 'resultados';
}

/** "Provincia 2025 - 2da Fecha - Resultados2.pdf" → "Provincia 2025 - 2da Fecha". */
export function tournamentBaseName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(JORNADA_RE, '')
    .replace(KIND_SUFFIX_RE, '')
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Números de prueba ("Evento N …") presentes en el texto de un PDF de Meet Manager. */
export function extractEventNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/^\s*Evento\s+(\d+)\s/gim)) found.add(parseInt(m[1] ?? '0', 10));
  return [...found].sort((a, b) => a - b);
}

/** Pileta del archivo según sus encabezados de prueba: CC = 25 m, CL/LC = 50 m. */
export function extractPoolLength(text: string): 25 | 50 | 'mixta' | null {
  const short = /^\s*Evento\s+\d+\s.*\b\d+\s+CC\s+Metro\b/im.test(text);
  const long = /^\s*Evento\s+\d+\s.*\b\d+\s+(CL|LC|LM)\s+Metro\b/im.test(text);
  if (short && long) return 'mixta';
  if (short) return 25;
  if (long) return 50;
  return null;
}

function firstEvent(f: TournamentFileInfo): number {
  return f.eventNumbers.length > 0 ? Math.min(...f.eventNumbers) : Number.POSITIVE_INFINITY;
}

export function detectJornadas(files: TournamentFileInfo[]): JornadaGroup[] {
  const groups = new Map<string, { torneo: string; kind: TournamentFileKind; files: TournamentFileInfo[] }>();
  for (const f of files) {
    const kind = fileKind(f.name);
    const torneo = tournamentBaseName(f.name);
    const key = `${torneo.toLowerCase()}|${kind}`;
    const g = groups.get(key) ?? { torneo, kind, files: [] };
    g.files.push(f);
    groups.set(key, g);
  }

  return [...groups.values()].map((g): JornadaGroup => {
    const ordered = [...g.files].sort((a, b) => firstEvent(a) - firstEvent(b) || a.name.localeCompare(b.name));
    const base = { torneo: g.torneo, kind: g.kind, files: ordered, repeatedEvents: [] as number[] };

    if (ordered.length === 1) return { ...base, decision: 'general', reason: 'Un solo archivo: ya es el general.' };
    if (g.kind === 'otro') return { ...base, decision: 'revisar', reason: 'Varios archivos que no son sembrados ni resultados.' };

    const unread = ordered.filter((f) => f.eventNumbers.length === 0);
    if (unread.length > 0) {
      return { ...base, decision: 'revisar', reason: `No se pudieron leer las pruebas de: ${unread.map((f) => f.name).join(', ')}.` };
    }

    const pools = new Set(ordered.map((f) => f.poolLength).filter((p): p is 25 | 50 => p !== null));
    if (pools.size > 1) {
      return { ...base, decision: 'revisar', reason: 'Los archivos son de piletas distintas (25 m y 50 m): no se mezclan.' };
    }

    const seen = new Set<number>();
    const repeated = new Set<number>();
    for (const f of ordered) {
      for (const n of new Set(f.eventNumbers)) {
        if (seen.has(n)) repeated.add(n);
        seen.add(n);
      }
    }
    if (repeated.size > 0) {
      const list = [...repeated].sort((a, b) => a - b);
      return {
        ...base,
        decision: 'revisar',
        repeatedEvents: list,
        reason: `Las pruebas ${list.join(', ')} aparecen en más de un archivo: pueden ser torneos distintos.`,
      };
    }

    return { ...base, decision: 'unir', reason: `${ordered.length} jornadas sin archivo general: hay que unirlas.` };
  });
}
