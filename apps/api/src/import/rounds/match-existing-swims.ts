/**
 * Empareja los nados que el lector sacó de un PDF con los resultados que ya están en la base, para poder
 * pasar a "clasificatorio" los de la jornada de pruebas sin reimportar el torneo (ver
 * prisma/scripts/split-rounds.ts).
 *
 * En la base no quedó el número de prueba del PDF, así que un nado se identifica por lo que sí se guardó:
 * estilo, distancia, género, serie, carril y tiempo (ms). Dos nados de nadadores distintos pueden compartir clave
 * (mismo tiempo en series numeradas por separado, o los puestos empatados de una tabla de eliminatorias, donde el
 * "carril" es el puesto): si el PDF pide N nados con esa clave y la base tiene exactamente N filas, se emparejan
 * todas. Si la base tiene MÁS filas que las pedidas (duplicados viejos), es ambiguo y NO se toca (mejor
 * dejarlo como está que moverlo mal).
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
  /** Nados del PDF cuya clave tiene más filas en la base que las pedidas (no se tocan). */
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
  const wantedCount = new Map<string, number>();
  for (const w of wanted) wantedCount.set(swimKey(w), (wantedCount.get(swimKey(w)) ?? 0) + 1);

  const matched: string[] = [];
  let unmatched = 0;
  let ambiguous = 0;
  for (const [key, asked] of wantedCount) {
    const hits = byKey.get(key) ?? [];
    if (hits.length === 0) unmatched += asked;
    else if (hits.length > asked) ambiguous += asked;
    else {
      matched.push(...hits);
      unmatched += asked - hits.length;
    }
  }
  return { matchedResultIds: matched, unmatched, ambiguous };
}
