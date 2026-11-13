/**
 * Lee el nombre de una prueba tal como viene en los archivos de Meet Manager
 * ("50m Estilo Libre FEDERADOS", "100m CI PROMOCIONAL", "25m Estilo de Pecho ESCUELA")
 * para poder filtrar por estilo y distancia. Es solo para la vista: no cambia datos.
 */

export type PruebaStroke = 'libre' | 'espalda' | 'pecho' | 'mariposa' | 'combinado';

export interface PruebaInfo {
  distance: number | null;
  stroke: PruebaStroke | null;
  /** Nivel de la prueba tal como lo escribe el archivo, normalizado: FEDERADOS, PROMOCIONAL, ESCUELA… */
  level: string | null;
}

export const STROKE_LABEL: Record<PruebaStroke, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho', mariposa: 'Mariposa', combinado: 'Combinado',
};
const STROKE_ORDER: PruebaStroke[] = ['libre', 'espalda', 'pecho', 'mariposa', 'combinado'];

const STROKE_PATTERNS: Array<[RegExp, PruebaStroke]> = [
  [/\bmariposa\b/i, 'mariposa'],
  [/\bespalda\b/i, 'espalda'],
  [/\bpecho\b/i, 'pecho'],
  [/\b(ci|combinado|medley)\b/i, 'combinado'],
  [/\blibre\b/i, 'libre'],
];

const LEVELS: Array<[RegExp, string]> = [
  [/\bfederad[oa]s?\b/i, 'FEDERADOS'],
  [/\bpromocional(es)?\b/i, 'PROMOCIONAL'],
  [/\bescuela\b/i, 'ESCUELA'],
];

/** Acepta el nombre con o sin la categoría ("… — Niñas 12-13"). */
export function parsePruebaLabel(label: string): PruebaInfo {
  const base = label.split(' — ')[0] ?? label;
  const distanceMatch = base.match(/^\s*(\d{2,4})\s*m\b/i);
  const stroke = STROKE_PATTERNS.find(([re]) => re.test(base))?.[1] ?? null;
  const level = LEVELS.find(([re]) => re.test(base))?.[1] ?? null;
  return { distance: distanceMatch ? parseInt(distanceMatch[1] ?? '', 10) : null, stroke, level };
}

export interface PruebaFilter {
  stroke: PruebaStroke | '';
  distance: number | '';
}

export function matchesPruebaFilter(label: string, filter: PruebaFilter): boolean {
  if (filter.stroke === '' && filter.distance === '') return true;
  const info = parsePruebaLabel(label);
  if (filter.stroke !== '' && info.stroke !== filter.stroke) return false;
  if (filter.distance !== '' && info.distance !== filter.distance) return false;
  return true;
}

/** Estilos y distancias que realmente aparecen en el archivo, en orden natural. */
export function pruebaFilterOptions(labels: string[]): { strokes: PruebaStroke[]; distances: number[] } {
  const strokes = new Set<PruebaStroke>();
  const distances = new Set<number>();
  for (const label of labels) {
    const info = parsePruebaLabel(label);
    if (info.stroke) strokes.add(info.stroke);
    if (info.distance !== null) distances.add(info.distance);
  }
  return {
    strokes: STROKE_ORDER.filter((s) => strokes.has(s)),
    distances: [...distances].sort((a, b) => a - b),
  };
}
