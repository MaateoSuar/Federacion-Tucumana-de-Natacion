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

  const age = result.age;
  const time = result.finalTimeMs;
  const metSetIds = new Set(
    table.standards
      .filter(
        (s) =>
          s.stroke === stroke &&
          s.distance === distance &&
          s.gender === gender &&
          (s.minAge === null || age >= s.minAge) &&
          (s.maxAge === null || age <= s.maxAge) &&
          time <= s.timeMs,
      )
      .map((s) => s.setId),
  );

  return table.sets.filter((set) => {
    if (!metSetIds.has(set.setId)) return false;
    if (level === 'FEDERADOS') return set.purpose !== 'federacion';
    if (level === 'PROMOCIONAL' || level === 'ESCUELA') return set.purpose === 'federacion';
    return true;
  });
}
