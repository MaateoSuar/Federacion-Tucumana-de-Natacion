/**
 * Récords de referencia por categoría global y marcas "RT" / "RNOA" para los resultados de una prueba.
 *
 * Reglas (decisiones del 18/11/2026):
 *  - Récord tucumano: solo cuentan nadadores de clubes de Tucumán.
 *  - Récord NOA: clubes de cualquiera de las provincias del NOA.
 *  - Récord nacional (RN): lo puede romper cualquier nadador; es solo de referencia (la FTN no lo homologa).
 *  - Los récords de 25 m y 50 m nunca se comparan: la pantalla pide los de la pileta del torneo.
 * La lista de provincias del NOA es la misma que usa la API (apps/api/src/homologation/record-scopes.ts).
 */

export const TUCUMAN_PROVINCE = 'Tucumán';
export const NOA_PROVINCES: readonly string[] = ['Tucumán', 'Salta', 'Jujuy', 'Catamarca', 'Santiago del Estero', 'La Rioja'];

export interface RecordRef {
  id: string;
  scope: string;
  timeMs: number;
  swimmer: { id: string; firstName: string; lastName: string };
  club: { shortName: string };
  category: { code: string };
  sourceResult?: { id: string };
}

export interface GroupRecords {
  tucumano?: RecordRef;
  noa?: RecordRef;
  nacional?: RecordRef;
}

export type RecordMark = 'RT' | 'RNOA' | 'RN';

/** NOA_INF → INF: las categorías NOA se comparan con las de igual nombre. */
const categoryKey = (code: string): string => code.replace(/^NOA_/, '');

/**
 * El mejor récord de cada alcance en la categoría global (INF, MEN, CAD, JUV, MAY...).
 * Los récords se llevan por categoría global y no por subcategoría de torneo (Cadete 1 y Cadete 2
 * comparten el récord de Cadetes): así los guarda el evaluador de récords.
 */
export function recordsForGroup(groupKey: string, records: RecordRef[]): GroupRecords {
  const best = (scope: string): RecordRef | undefined =>
    records
      .filter((r) => r.scope === scope && categoryKey(r.category.code) === groupKey)
      .sort((a, b) => a.timeMs - b.timeMs)[0];
  return { tucumano: best('provincial'), noa: best('noa'), nacional: best('nacional') };
}

/**
 * Récords que rompió un resultado de esta prueba: su tiempo es menor al récord vigente de su categoría,
 * o es justamente el resultado que figura como origen del récord.
 */
export function recordMarks(
  result: { id: string; finalTime: number | null; clubProvince?: string | null },
  refs: GroupRecords,
): RecordMark[] {
  if (result.finalTime === null) return [];
  const broke = (rec: RecordRef | undefined): boolean =>
    rec !== undefined && (result.finalTime! < rec.timeMs || rec.sourceResult?.id === result.id);

  const marks: RecordMark[] = [];
  const province = result.clubProvince ?? '';
  if (province === TUCUMAN_PROVINCE && broke(refs.tucumano)) marks.push('RT');
  if (NOA_PROVINCES.includes(province) && broke(refs.noa)) marks.push('RNOA');
  if (broke(refs.nacional)) marks.push('RN');
  return marks;
}
