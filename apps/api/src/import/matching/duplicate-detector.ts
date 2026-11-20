import type { NormalizedMeet, NormalizedResult } from '../../ingest/types/normalized-meet.types';
import type { ImportIssue } from '../../ingest/types/import-issue.types';
import { normalizeText } from './fuzzy';

/** Clave natural de un nado dentro del archivo (regla 5): prueba + nadador + serie + carril. */
export function resultIdempotencyKey(
  r: Pick<NormalizedResult, 'event_key' | 'swimmer_ref' | 'heat_no' | 'lane_no'>,
): string {
  return `${r.event_key}|${r.swimmer_ref}|${r.heat_no}|${r.lane_no}`;
}

export interface DuplicateIssues {
  issues: ImportIssue[];
}

/**
 * Detecta duplicados dentro del archivo normalizado.
 * No toca la base de datos — eso le corresponde a AthleteMatcher (fuzzy contra DB).
 */
export class DuplicateDetector {
  detectInFile(meet: NormalizedMeet): DuplicateIssues {
    const issues: ImportIssue[] = [];

    // ── Nadadores duplicados dentro del archivo ──────────────────────────────
    const swimmerKeys = new Map<string, string[]>();
    for (const s of meet.swimmers) {
      const key = normalizeText(`${s.first_name} ${s.last_name}`) +
        '|' + (s.birth_date ?? s.age?.toString() ?? '');
      const refs = swimmerKeys.get(key) ?? [];
      refs.push(s.external_athlete_id);
      swimmerKeys.set(key, refs);
    }
    for (const [key, refs] of swimmerKeys) {
      if (refs.length > 1) {
        issues.push({
          severity: 'WARNING',
          stage: 'match',
          message: `Nadador duplicado en el archivo: "${key}" aparece ${refs.length} veces (IDs: ${refs.join(', ')}).`,
          suggested_action: 'Revisá si es el mismo atleta o distintos con nombre similar.',
        });
      }
    }

    // ── Resultados duplicados dentro del archivo ─────────────────────────────
    const resultKeys = new Map<string, number[]>();
    for (const r of meet.results) {
      const key = resultIdempotencyKey(r);
      const lines = resultKeys.get(key) ?? [];
      lines.push(r.source_line);
      resultKeys.set(key, lines);
    }
    for (const [key, lines] of resultKeys) {
      if (lines.length > 1) {
        issues.push({
          severity: 'WARNING',
          stage: 'match',
          message: `Resultado duplicado: evento/nadador/serie/carril "${key}" aparece en líneas ${lines.join(', ')}.`,
          suggested_action: 'Se usará el primero; el resto se ignorará en el commit.',
        });
      }
    }

    return { issues };
  }
}
