import { tokenize } from './fuzzy';
import type { SwimmerMatchConfig } from './match-config';
import {
  capitalize,
  containmentScore,
  matchTokens,
  round2,
  type TokenMatch,
} from './token-match';

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'van', 'von']);

export interface SwimmerScoreSource {
  firstName: string;
  lastName: string;
  gender: string;
  birthYear: number | null;
  /** true cuando el año se dedujo de la edad (tolerancia de ±1). */
  birthYearIsEstimated: boolean;
  clubId: string | null;
}

export interface SwimmerScoreCandidate {
  firstName: string;
  lastName: string;
  gender: string | null;
  birthYear: number | null;
  clubId: string | null;
}

export interface ScoredMatch {
  score: number;
  reasons: string[];
}

interface NameParts {
  given: string[];
  surnames: string[];
}

interface NameScore {
  score: number;
  reasons: string[];
}

function nameTokens(text: string): string[] {
  return tokenize(text).filter((t) => !NAME_PARTICLES.has(t));
}

function givenNameScore(src: string[], cand: string[], cfg: SwimmerMatchConfig): NameScore {
  const srcFirst = src[0];
  const candFirst = cand[0];
  if (!srcFirst || !candFirst) return { score: 0, reasons: [] };

  const first = matchTokens(srcFirst, candFirst, cfg);
  let best: { match: TokenMatch; score: number; middle: boolean } | null = first
    ? { match: first, score: first.score, middle: false }
    : null;

  for (const s of src) {
    for (const c of cand) {
      if (s === srcFirst && c === candFirst) continue;
      const m = matchTokens(s, c, cfg);
      if (m && m.kind !== 'initial') {
        const score = m.score * cfg.middleNameFactor;
        if (!best || score > best.score) best = { match: m, score, middle: true };
      }
    }
  }
  if (!best) return { score: 0, reasons: [] };

  const label = capitalize(candFirst);
  const reason = best.middle
    ? 'el nombre coincide con un segundo nombre'
    : best.match.kind === 'exact'
      ? `mismo nombre (${label})`
      : best.match.kind === 'initial'
        ? `la inicial coincide con ${label}`
        : `nombre parecido (${capitalize(srcFirst)} / ${label})`;
  return { score: best.score, reasons: [reason] };
}

function surnameScore(src: string[], cand: string[], cfg: SwimmerMatchConfig): NameScore {
  const { score, assignment } = containmentScore(src, cand, cfg);
  if (assignment.pairs.length === 0) return { score: 0, reasons: [] };

  const shared = assignment.pairs.map((p) => capitalize(p.b)).join(' ');
  const complete = assignment.unmatchedA === 0 && assignment.unmatchedB === 0;
  const sameOrder = assignment.pairs.every((p) => p.aIndex === p.bIndex);
  const hasTypo = assignment.pairs.some((p) => p.kind !== 'exact');

  let reason: string;
  if (complete && sameOrder) reason = hasTypo ? `apellido parecido (${shared})` : `mismo apellido (${shared})`;
  else if (complete) reason = `mismos apellidos en otro orden (${shared})`;
  else reason = `comparte apellido ${shared}`;

  return { score, reasons: [reason] };
}

function structuredNameScore(src: NameParts, cand: NameParts, cfg: SwimmerMatchConfig): NameScore {
  const given = givenNameScore(src.given, cand.given, cfg);
  const surname = surnameScore(src.surnames, cand.surnames, cfg);
  let score = cfg.givenNameWeight * given.score + cfg.surnameWeight * surname.score;
  if (given.score < cfg.initialScore) score *= cfg.givenNameMismatchFactor;
  return { score, reasons: [...given.reasons, ...surname.reasons] };
}

function fullNameScore(src: NameParts, cand: NameParts, cfg: SwimmerMatchConfig): NameScore {
  const all = (p: NameParts) => [...p.given, ...p.surnames];
  const { score, assignment } = containmentScore(all(src), all(cand), cfg);
  if (assignment.pairs.length < 2) return { score: 0, reasons: [] };
  return {
    score: score * cfg.swappedNamesFactor,
    reasons: [`nombre incompleto en el archivo; coinciden ${assignment.pairs.map((p) => capitalize(p.b)).join(' ')}`],
  };
}

function nameScore(src: NameParts, cand: NameParts, cfg: SwimmerMatchConfig): NameScore {
  if (src.given.length === 0 || src.surnames.length === 0 || cand.given.length === 0) {
    return fullNameScore(src, cand, cfg);
  }

  const direct = structuredNameScore(src, cand, cfg);
  const swappedRaw = structuredNameScore({ given: src.surnames, surnames: src.given }, cand, cfg);
  const swapped = {
    score: swappedRaw.score * cfg.swappedNamesFactor,
    reasons: ['nombre y apellido invertidos en el archivo', ...swappedRaw.reasons],
  };
  return swapped.score > direct.score ? swapped : direct;
}

/**
 * Puntúa qué tan probable es que el candidato sea el mismo nadador del archivo.
 * Devuelve null si el género lo descarta. Nunca decide: el resultado es solo una sugerencia.
 */
export function scoreSwimmerCandidate(
  src: SwimmerScoreSource,
  cand: SwimmerScoreCandidate,
  cfg: SwimmerMatchConfig,
): ScoredMatch | null {
  if (
    (src.gender === 'M' || src.gender === 'F') &&
    (cand.gender === 'M' || cand.gender === 'F') &&
    src.gender !== cand.gender
  ) {
    return null;
  }

  const name = nameScore(
    { given: nameTokens(src.firstName), surnames: nameTokens(src.lastName) },
    { given: nameTokens(cand.firstName), surnames: nameTokens(cand.lastName) },
    cfg,
  );
  if (name.score === 0) return { score: 0, reasons: [] };

  const reasons = [...name.reasons];
  let bonus = 0;
  let factor = 1;

  if (src.clubId && cand.clubId === src.clubId) {
    bonus += cfg.sameClubBonus;
    reasons.push('mismo club');
  }

  if (src.birthYear !== null && cand.birthYear !== null) {
    const tolerance = src.birthYearIsEstimated ? cfg.estimatedBirthYearTolerance : 0;
    const earliest = src.birthYear - tolerance;
    const diff =
      cand.birthYear > src.birthYear
        ? cand.birthYear - src.birthYear
        : cand.birthYear < earliest
          ? earliest - cand.birthYear
          : 0;
    if (diff === 0) {
      bonus += cfg.sameBirthYearBonus;
      reasons.push(
        src.birthYearIsEstimated
          ? `año de nacimiento compatible con la edad (${cand.birthYear})`
          : `mismo año de nacimiento (${cand.birthYear})`,
      );
    } else if (diff === 1) {
      reasons.push(`año de nacimiento cercano (${src.birthYear} / ${cand.birthYear})`);
    } else {
      factor = cfg.birthYearMismatchFactor;
      reasons.push(`año de nacimiento distinto (${src.birthYear} / ${cand.birthYear})`);
    }
  }

  return { score: round2(Math.min(1, name.score + bonus) * factor), reasons };
}
