import { jaroWinkler, levenshtein } from './fuzzy';
import type { TokenMatchConfig } from './match-config';

export type TokenMatchKind = 'exact' | 'typo' | 'abbreviation' | 'initial';

export interface TokenMatch {
  kind: TokenMatchKind;
  score: number;
}

export interface TokenPair extends TokenMatch {
  a: string;
  b: string;
  aIndex: number;
  bIndex: number;
}

export interface TokenAssignment {
  pairs: TokenPair[];
  sum: number;
  unmatchedA: number;
  unmatchedB: number;
}

export function matchTokens(a: string, b: string, cfg: TokenMatchConfig): TokenMatch | null {
  if (a === b) return { kind: 'exact', score: 1 };

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 1) {
    return cfg.initialScore > 0 && long.startsWith(short)
      ? { kind: 'initial', score: cfg.initialScore }
      : null;
  }

  const jw = jaroWinkler(a, b);
  const maxEdits = Math.max(1, Math.floor(long.length / cfg.charsPerAllowedTypo));
  if (jw >= cfg.tokenSimilarityThreshold && levenshtein(a, b) <= maxEdits) {
    return { kind: 'typo', score: jw };
  }

  if (short.length >= 3 && long.startsWith(short)) {
    return { kind: 'abbreviation', score: cfg.abbreviationScore };
  }
  return null;
}

/** Empareja palabras uno a uno, priorizando las coincidencias más fuertes. El orden no importa. */
export function assignTokens(a: string[], b: string[], cfg: TokenMatchConfig): TokenAssignment {
  const candidates: TokenPair[] = [];
  a.forEach((ta, aIndex) => {
    b.forEach((tb, bIndex) => {
      const m = matchTokens(ta, tb, cfg);
      if (m) candidates.push({ ...m, a: ta, b: tb, aIndex, bIndex });
    });
  });
  candidates.sort((x, y) => y.score - x.score);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: TokenPair[] = [];
  for (const p of candidates) {
    if (usedA.has(p.aIndex) || usedB.has(p.bIndex)) continue;
    usedA.add(p.aIndex);
    usedB.add(p.bIndex);
    pairs.push(p);
  }

  pairs.sort((x, y) => x.bIndex - y.bIndex);
  return {
    pairs,
    sum: pairs.reduce((acc, p) => acc + p.score, 0),
    unmatchedA: a.length - pairs.length,
    unmatchedB: b.length - pairs.length,
  };
}

/**
 * Puntaje de contención: cuánto del lado más corto está presente en el más largo,
 * con un descuento por cada palabra sobrante. "Suar" vs "Rodriguez Suar" ≈ 0.97.
 */
export function containmentScore(a: string[], b: string[], cfg: TokenMatchConfig): {
  score: number;
  assignment: TokenAssignment;
} {
  const assignment = assignTokens(a, b, cfg);
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return { score: 0, assignment };
  const base = assignment.sum / minLen;
  const penalty = cfg.extraTokenPenalty * (assignment.unmatchedA + assignment.unmatchedB);
  return { score: Math.max(0, base - penalty), assignment };
}

export function capitalize(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
