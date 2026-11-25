/**
 * Empareja los nados que el lector sacó de un PDF con los resultados que ya están en la base, para poder
 * pasar a "clasificatorio" los de la jornada de pruebas sin reimportar el torneo (ver
 * prisma/scripts/split-rounds.ts).
 *
 * En la base no quedó el número de prueba del PDF, así que un nado se identifica por lo que sí se guardó:
 * estilo, distancia, género, serie, carril y tiempo (ms). Si más de un resultado coincide, el nado es
 * ambiguo y NO se toca (mejor dejarlo como está que moverlo mal).
 */

export interface SwimKeyParts {
  stroke: string;
  distance: number;
  gender: string;
  heatNo: number;
  lane: number | null;
  /** Tiempo en ms; null para DSQ/DNS/DNF. */
  finalTimeMs: number | null;
}

export function swimKey(p: SwimKeyParts): string {
  return `${p.stroke}|${p.distance}|${p.gender}|${p.heatNo}|${p.lane ?? ''}|${p.finalTimeMs ?? ''}`;
}

export interface StoredSwim extends SwimKeyParts {
  resultId: string;
}

export interface MatchOutcome {
  /** Resultados de la base que hay que mover a la jornada de pruebas. */
  matchedResultIds: string[];
  /** Nados del PDF sin ningún resultado equivalente en la base. */
  unmatched: number;
  /** Nados del PDF que coinciden con más de un resultado de la base (no se tocan). */
  ambiguous: number;
}

export function matchSwims(wanted: SwimKeyParts[], stored: StoredSwim[]): MatchOutcome {
  const byKey = new Map<string, string[]>();
  for (const s of stored) {
    const k = swimKey(s);
    const list = byKey.get(k);
    if (list) list.push(s.resultId);
    else byKey.set(k, [s.resultId]);
  }

  const matched = new Set<string>();
  let unmatched = 0;
  let ambiguous = 0;
  for (const w of wanted) {
    const hits = byKey.get(swimKey(w));
    if (!hits || hits.length === 0) unmatched++;
    else if (hits.length > 1) ambiguous++;
    else matched.add(hits[0]!);
  }
  return { matchedResultIds: [...matched], unmatched, ambiguous };
}
