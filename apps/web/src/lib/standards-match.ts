import { parsePruebaLabel } from './prueba-label';

/**
 * Marcas básicas (NAC / FED) sobre los resultados de un ARCHIVO de torneo.
 *
 * Es un dato ORIENTATIVO: esos resultados todavía no están homologados y el archivo
 * no trae la categoría oficial, solo la edad. La categoría se ubica por la edad.
 * Regla acordada (13/11/2026), según el nivel de la prueba:
 *   - "FEDERADOS": ya está federado → solo se marca la básica NACIONAL.
 *   - "PROMOCIONAL" / "ESCUELA": todavía no está federado → solo se marca la básica
 *     PARA FEDERARSE (la nacional no le corresponde hasta federarse).
 *   - Nivel no reconocido: se marcan las que cumpla.
 */

export interface StandardsTable {
  poolLength: 'P25' | 'P50';
  sets: Array<{ setId: string; code: string; name: string; shortLabel: string; color: string; purpose: string }>;
  standards: Array<{
    setId: string;
    stroke: string;
    distance: number;
    gender: 'M' | 'F';
    minAge: number | null;
    maxAge: number | null;
    timeMs: number;
  }>;
}

export type StandardSet = StandardsTable['sets'][number];

/** Género según la categoría del archivo: "Niñas 12-13", "Mujeres 19 & Mayores", "Niños 10-11", "Hombres…". */
export function genderFromCategoryLabel(category: string): 'M' | 'F' | null {
  if (/\b(ni[ñn]as?|mujeres|damas|femenino)\b/i.test(category)) return 'F';
  if (/\b(ni[ñn]os?|hombres|varones|caballeros|masculino)\b/i.test(category)) return 'M';
  return null;
}

export interface FileResult {
  /** Nombre completo de la prueba: "50m Estilo Libre FEDERADOS — Niñas 12-13". */
  eventLabel: string;
  age: number | null;
  finalTimeMs: number | null;
}

export interface StandardQuery {
  stroke: string;
  distance: number;
  gender: 'M' | 'F';
  age: number;
  timeMs: number;
  /** FEDERADOS, PROMOCIONAL, ESCUELA o null si el nivel no está definido. */
  level: string | null;
}

/**
 * Sets de marcas básicas que cumple un tiempo: tiempo <= marca de su edad, misma prueba,
 * mismo género y la pileta de la tabla; según el nivel de la prueba (ver el encabezado).
 */
export function standardsMet(q: StandardQuery, table: StandardsTable | null): StandardSet[] {
  if (!table) return [];
  const metSetIds = new Set(
    table.standards
      .filter(
        (s) =>
          s.stroke === q.stroke &&
          s.distance === q.distance &&
          s.gender === q.gender &&
          (s.minAge === null || q.age >= s.minAge) &&
          (s.maxAge === null || q.age <= s.maxAge) &&
          q.timeMs <= s.timeMs,
      )
      .map((s) => s.setId),
  );

  return table.sets.filter((set) => {
    if (!metSetIds.has(set.setId)) return false;
    if (q.level === 'FEDERADOS') return set.purpose !== 'federacion';
    if (q.level === 'PROMOCIONAL' || q.level === 'ESCUELA') return set.purpose === 'federacion';
    return true;
  });
}

/**
 * Sets de marcas básicas que cumple un resultado de archivo (tiempo <= marca de su
 * edad, misma prueba, mismo género y la pileta de la tabla).
 */
export function standardsMetByFileResult(result: FileResult, table: StandardsTable | null): StandardSet[] {
  if (!table || result.finalTimeMs === null || result.age === null) return [];
  const [, category = ''] = result.eventLabel.split(' — ');
  const gender = genderFromCategoryLabel(category);
  const { stroke, distance, level } = parsePruebaLabel(result.eventLabel);
  if (!gender || !stroke || distance === null) return [];
  return standardsMet({ stroke, distance, gender, age: result.age, timeMs: result.finalTimeMs, level }, table);
}
