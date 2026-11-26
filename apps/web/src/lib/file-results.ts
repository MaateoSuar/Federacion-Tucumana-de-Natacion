/**
 * Agrupa las filas de un archivo de resultados (torneos subidos por jornada o "General")
 * en pruebas y categorías. Lo usan la vista pública y la imagen del podio de esos torneos.
 * Es solo presentación: no cambia datos. Tiempos siempre en milisegundos enteros.
 */
import type { ResultadoRow } from './api';

export interface ResultadoRanked {
  row: ResultadoRow;
  displayPlace: number | null;
}

export interface ResultadoCategoryGroup {
  category: string;
  rows: ResultadoRanked[];
}

export interface ResultadoPruebaGroup {
  key: string;
  title: string;
  eventNos: number[];
  categories: ResultadoCategoryGroup[];
  allRows: ResultadoRow[];
}

// El header "Evento N" se repite una vez por categoría (edad+género) dentro del mismo
// número de prueba — el label queda armado como "<distancia+estilo> — <categoría>".
export function splitEventLabel(label: string): { basePrueba: string; category: string } {
  const idx = label.indexOf(' — ');
  if (idx === -1) return { basePrueba: label, category: '' };
  return { basePrueba: label.slice(0, idx), category: label.slice(idx + 3) };
}

export function formatEventNos(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  if (sorted.length === 1) return `Prueba ${sorted[0]}`;
  const isContiguous = sorted.every((n, i) => i === 0 || n === (sorted[i - 1] ?? n) + 1);
  return isContiguous
    ? `Pruebas ${sorted[0]}–${sorted[sorted.length - 1]}`
    : `Pruebas ${sorted.join(', ')}`;
}

// El "Lugar" que trae el PDF original es la posición en la carrera completa del género
// (todas las categorías de edad juntas) — por eso dentro de una sola categoría se ven
// saltos como 1, 2, 5. Acá se recalcula el puesto relativo a la categoría, ordenando por
// tiempo final (igual criterio que Rankings: orden por tiempo, sin saltar por empates).
export function rankByCategory(catRows: ResultadoRow[]): ResultadoRanked[] {
  const ok = catRows
    .filter((r): r is ResultadoRow & { finalTimeMs: number } => r.finalTimeMs !== null)
    .sort((a, b) => a.finalTimeMs - b.finalTimeMs)
    .map((row, i) => ({ row, displayPlace: i + 1 }));
  const rest = catRows.filter((r) => r.finalTimeMs === null).map((row) => ({ row, displayPlace: null }));
  return [...ok, ...rest];
}

/**
 * Una tarjeta por prueba base (mismo género incluido): se juntan los Eventos que comparten
 * exactamente el mismo nombre (ej. Prueba 47 + 49 + 51 + 53, todas "PROMO-MUJERES"), cada
 * uno como una categoría, sin mezclar Mujeres con Varones.
 */
export function groupResultados(rows: ResultadoRow[]): ResultadoPruebaGroup[] {
  const eventNos = Array.from(new Set(rows.map((r) => r.eventNo))).sort((a, b) => a - b);
  const order: string[] = [];
  const merged = new Map<string, ResultadoPruebaGroup>();

  for (const eventNo of eventNos) {
    const eventRows = rows.filter((r) => r.eventNo === eventNo);
    const key = splitEventLabel(eventRows[0]?.eventLabel ?? '').basePrueba;

    const categoryOrder: string[] = [];
    const byCategory = new Map<string, ResultadoRow[]>();
    for (const r of eventRows) {
      const { category } = splitEventLabel(r.eventLabel);
      let list = byCategory.get(category);
      if (!list) {
        list = [];
        categoryOrder.push(category);
        byCategory.set(category, list);
      }
      list.push(r);
    }

    let acc = merged.get(key);
    if (!acc) {
      acc = { key, title: key, eventNos: [], categories: [], allRows: [] };
      merged.set(key, acc);
      order.push(key);
    }
    acc.eventNos.push(eventNo);
    acc.categories.push(...categoryOrder.map((category) => ({ category, rows: rankByCategory(byCategory.get(category) ?? []) })));
    acc.allRows.push(...eventRows);
  }

  return order.flatMap((key) => merged.get(key) ?? []);
}
