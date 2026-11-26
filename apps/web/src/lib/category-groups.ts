/**
 * Agrupa las categorías de torneo (Infantil 1, Infantil 2, Cadete 1...) en la categoría "global"
 * a la que pertenecen (Infantiles, Cadetes...). Los resultados de una prueba se ven primero juntos
 * por categoría global y, si se quiere, separados por subcategoría.
 * Es solo para la vista: la categoría congelada de cada resultado no cambia.
 */

export interface CategoryRef {
  id: string;
  code?: string;
  name: string;
  orderNo: number;
}

const GLOBAL_NAME: Record<string, string> = {
  INF: 'Infantiles', MEN: 'Menores', CAD: 'Cadetes', JUV: 'Juveniles',
};

const NAME_PREFIX: Array<[RegExp, string]> = [
  [/^infantil/i, 'INF'], [/^menor/i, 'MEN'], [/^cadete/i, 'CAD'], [/^juvenil/i, 'JUV'],
];

/** Clave de la categoría global: INF, MEN, CAD, JUV; el resto (Pre A, Mayores, Junior...) es su propio grupo. */
export function groupKeyOf(category: CategoryRef): string {
  const code = category.code ?? '';
  const m = code.match(/^(INF|MEN|CAD|JUV)(_\d+)?$/);
  if (m) return m[1] ?? code;
  if (code === '') {
    const byName = NAME_PREFIX.find(([re]) => re.test(category.name));
    if (byName) return byName[1];
  }
  return code || category.id;
}

export interface ResultGroup<T> {
  key: string;
  name: string;
  /** Orden de la categoría global: el menor orden de sus subcategorías. */
  order: number;
  /** Subcategorías presentes, en orden. */
  categories: CategoryRef[];
  results: T[];
}

/** Junta los resultados por categoría global, conservando el orden en que vienen (ya ordenados por tiempo). */
export function groupResultsByCategory<T extends { category: CategoryRef }>(results: T[]): Array<ResultGroup<T>> {
  const groups = new Map<string, ResultGroup<T>>();
  for (const r of results) {
    const key = groupKeyOf(r.category);
    let g = groups.get(key);
    if (!g) {
      g = { key, name: GLOBAL_NAME[key] ?? r.category.name, order: r.category.orderNo, categories: [], results: [] };
      groups.set(key, g);
    }
    g.order = Math.min(g.order, r.category.orderNo);
    if (!g.categories.some((c) => c.id === r.category.id)) g.categories.push(r.category);
    g.results.push(r);
  }
  for (const g of groups.values()) g.categories.sort((a, b) => a.orderNo - b.orderNo);
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
