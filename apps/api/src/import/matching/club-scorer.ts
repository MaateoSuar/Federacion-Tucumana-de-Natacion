import { tokenize } from './fuzzy';
import type { ClubMatchConfig } from './match-config';
import type { ScoredMatch } from './swimmer-scorer';
import { capitalize, containmentScore, round2 } from './token-match';

const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y']);

export interface ClubScoreInput {
  name: string;
  shortName: string;
}

function significantTokens(text: string, cfg: ClubMatchConfig): string[] {
  const generic = new Set(cfg.genericWords);
  const all = tokenize(text).filter((t) => !CONNECTORS.has(t));
  const significant = all.filter((t) => !generic.has(t));
  return significant.length > 0 ? significant : all;
}

function initials(text: string): string {
  return tokenize(text)
    .filter((t) => !CONNECTORS.has(t))
    .map((t) => t.charAt(0))
    .join('');
}

/** Una sola palabra corta, como "CAT" o "C.N.M." */
function asAcronym(text: string): string | null {
  const tokens = tokenize(text);
  const only = tokens[0];
  return tokens.length === 1 && only && only.length >= 2 && only.length <= 6 ? only : null;
}

function wordsScore(a: string, b: string, cfg: ClubMatchConfig): ScoredMatch {
  const ta = significantTokens(a, cfg);
  const tb = significantTokens(b, cfg);
  const { score, assignment } = containmentScore(ta, tb, cfg);
  if (assignment.pairs.length === 0) return { score: 0, reasons: [] };

  const shared = assignment.pairs.map((p) => capitalize(p.b)).join(' ');
  const complete = assignment.unmatchedA === 0 && assignment.unmatchedB === 0;
  const hasTypo = assignment.pairs.some((p) => p.kind === 'typo');
  const hasAbbreviation = assignment.pairs.some((p) => p.kind === 'abbreviation');

  const reasons: string[] = [];
  if (complete) reasons.push(`mismo nombre sin palabras genéricas (${shared})`);
  else reasons.push(`comparte ${shared}`);
  if (hasAbbreviation) reasons.push('nombre abreviado');
  if (hasTypo) reasons.push('diferencia de tipeo');
  return { score, reasons };
}

function acronymScore(acronymSide: ClubScoreInput, fullSide: ClubScoreInput, cfg: ClubMatchConfig): ScoredMatch {
  let best: ScoredMatch = { score: 0, reasons: [] };
  for (const text of [acronymSide.shortName, acronymSide.name]) {
    const acronym = asAcronym(text);
    if (!acronym) continue;
    if (initials(fullSide.name) === acronym && cfg.acronymScore > best.score) {
      best = {
        score: cfg.acronymScore,
        reasons: [`la sigla ${acronym.toUpperCase()} coincide con las iniciales de ${fullSide.name}`],
      };
    }
  }
  return best;
}

/**
 * Puntúa qué tan probable es que el candidato sea el mismo club del archivo.
 * El orden de las palabras y las palabras genéricas ("Club", "Asociación") no importan.
 */
export function scoreClubCandidate(src: ClubScoreInput, cand: ClubScoreInput, cfg: ClubMatchConfig): ScoredMatch {
  const options: ScoredMatch[] = [
    wordsScore(src.name, cand.name, cfg),
    wordsScore(src.name, cand.shortName, cfg),
    wordsScore(src.shortName, cand.name, cfg),
    acronymScore(src, cand, cfg),
    acronymScore(cand, src, cfg),
  ];
  const best = options.reduce((a, b) => (b.score > a.score ? b : a));
  return { score: round2(best.score), reasons: best.reasons };
}
