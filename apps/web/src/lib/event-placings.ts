/**
 * Puesto de cada nadador dentro de su categoría en una prueba importada.
 * Mismo criterio que la página de la prueba: los resultados llegan ordenados por tiempo
 * y el puesto es el orden entre los resultados OK de la misma categoría congelada.
 * Los que no tienen estado OK (descalificado, no se presentó) quedan sin puesto.
 */
export interface PlacingSource {
  status: string;
  category: { id: string };
}

export function categoryPlacings<T extends PlacingSource>(results: T[]): Array<{ result: T; place: number | null }> {
  const counters = new Map<string, number>();
  return results.map((result) => {
    if (result.status !== 'OK') return { result, place: null };
    const place = (counters.get(result.category.id) ?? 0) + 1;
    counters.set(result.category.id, place);
    return { result, place };
  });
}
