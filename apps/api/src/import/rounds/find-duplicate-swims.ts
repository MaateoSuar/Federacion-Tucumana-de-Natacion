/**
 * Detecta resultados duplicados que dejó el lector viejo: en los PDF de Eliminatorias + Finales la tabla de los
 * puestos que no pasaron a la final se leyó dos veces (una como final y otra como eliminatoria), con el mismo
 * nadador, serie, carril y tiempo. El importador actual ya no inserta la copia; esto limpia lo ya guardado.
 *
 * Un nadador no repite al centésimo prueba, serie, carril y tiempo en dos nados distintos, así que dos filas con
 * esa clave son el mismo nado leído dos veces. Las dos copias del lector viejo comparten Event (el importador
 * viejo juntaba eliminatoria y final en un evento por prueba y nivel), por eso el evento es parte de la clave:
 * así una eliminatoria y una final ya separadas en eventos distintos nunca se confunden.
 * Se conserva UNA y se borran las demás, salvo que la fila esté "protegida" (referenciada por una marca
 * personal, récord o ranking, marcada como PB/récord, o ya homologada): esas no se borran.
 *
 * Solo considera nados con tiempo, serie y carril: sin eso no hay evidencia de que sea una copia.
 */

export interface StoredResultRow {
  id: string;
  swimmerId: string;
  eventId: string;
  eventDefinitionId: string;
  level: string | null;
  heatNo: number | null;
  lane: number | null;
  /** ms; null si no hay tiempo (esos no se consideran). */
  finalTime: number | null;
  splitCount: number;
  /** Referenciada por PB / récord / ranking, marcada isPb/isRecord o ya homologada: nunca se borra. */
  protectedRow: boolean;
}

export interface DuplicateGroup {
  keep: string;
  remove: string[];
  /** Copias que habría que borrar pero están protegidas: se informan y no se tocan. */
  blocked: string[];
}

export function duplicateKey(r: StoredResultRow): string {
  return `${r.swimmerId}|${r.eventId}|${r.eventDefinitionId}|${r.level ?? ''}|${r.heatNo}|${r.lane}|${r.finalTime}`;
}

export function findDuplicateSwims(rows: StoredResultRow[]): DuplicateGroup[] {
  const groups = new Map<string, StoredResultRow[]>();
  for (const r of rows) {
    if (r.finalTime === null || r.heatNo === null || r.lane === null) continue;
    const k = duplicateKey(r);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }

  const out: DuplicateGroup[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Se conserva la protegida, después la que tiene parciales, después la de id menor (determinístico)
    const ordered = [...list].sort(
      (a, b) => Number(b.protectedRow) - Number(a.protectedRow) || b.splitCount - a.splitCount || a.id.localeCompare(b.id),
    );
    const [keep, ...rest] = ordered as [StoredResultRow, ...StoredResultRow[]];
    out.push({
      keep: keep.id,
      remove: rest.filter((r) => !r.protectedRow).map((r) => r.id),
      blocked: rest.filter((r) => r.protectedRow).map((r) => r.id),
    });
  }
  return out;
}
