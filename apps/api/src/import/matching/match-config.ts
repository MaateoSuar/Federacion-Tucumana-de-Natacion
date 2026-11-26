import { tokenize } from './fuzzy';

export const MATCH_CONFIG = Symbol('MATCH_CONFIG');

export interface TokenMatchConfig {
  /** Jaro-Winkler mínimo para considerar dos palabras como la misma con error de tipeo. */
  tokenSimilarityThreshold: number;
  /** Letras distintas toleradas como error de tipeo: 1 cada N caracteres ("Mateeo" sí, "Martina"/"Maria" no). */
  charsPerAllowedTypo: number;
  /** Puntaje cuando una palabra es la inicial de la otra ("M." / "Mateo"). */
  initialScore: number;
  /** Puntaje cuando una palabra es abreviatura de la otra ("Nat" / "Natacion"). */
  abbreviationScore: number;
  /** Descuento por cada palabra que aparece en un lado y no en el otro. */
  extraTokenPenalty: number;
}

export interface SwimmerMatchConfig extends TokenMatchConfig {
  givenNameWeight: number;
  surnameWeight: number;
  /** Multiplicador cuando el primer nombre del archivo coincide con un segundo nombre del candidato. */
  middleNameFactor: number;
  /** Multiplicador cuando los nombres de pila no coinciden (evita sugerir hermanos). */
  givenNameMismatchFactor: number;
  /** Multiplicador cuando nombre y apellido parecen invertidos en el archivo. */
  swappedNamesFactor: number;
  sameClubBonus: number;
  sameBirthYearBonus: number;
  /**
   * Años de tolerancia cuando el año de nacimiento se deduce de la edad (temporada − edad).
   * Se aplica hacia atrás: con edad a la fecha del torneo, el nacimiento puede ser un año antes.
   */
  estimatedBirthYearTolerance: number;
  /** Multiplicador cuando el año de nacimiento es incompatible. */
  birthYearMismatchFactor: number;
  minCandidateScore: number;
  maxCandidates: number;
}

export interface ClubMatchConfig extends TokenMatchConfig {
  /** Palabras que no distinguen a un club y se ignoran al comparar. */
  genericWords: string[];
  /** Puntaje cuando una sigla coincide con las iniciales del nombre del otro club. */
  acronymScore: number;
  minCandidateScore: number;
  maxCandidates: number;
}

export interface MatchConfig {
  swimmer: SwimmerMatchConfig;
  club: ClubMatchConfig;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  swimmer: {
    tokenSimilarityThreshold: 0.88,
    charsPerAllowedTypo: 6,
    initialScore: 0.6,
    abbreviationScore: 0.9,
    extraTokenPenalty: 0.03,
    givenNameWeight: 0.4,
    surnameWeight: 0.6,
    middleNameFactor: 0.9,
    givenNameMismatchFactor: 0.5,
    swappedNamesFactor: 0.9,
    sameClubBonus: 0.1,
    sameBirthYearBonus: 0.1,
    estimatedBirthYearTolerance: 1,
    birthYearMismatchFactor: 0.4,
    minCandidateScore: 0.6,
    maxCandidates: 3,
  },
  club: {
    tokenSimilarityThreshold: 0.88,
    charsPerAllowedTypo: 6,
    initialScore: 0,
    abbreviationScore: 0.9,
    extraTokenPenalty: 0.03,
    genericWords: ['club', 'asociacion', 'asoc', 'sociedad', 'cn', 'ca', 'cd'],
    acronymScore: 0.85,
    minCandidateScore: 0.7,
    maxCandidates: 3,
  },
};

/**
 * Combina los valores por defecto con un override JSON parcial, p. ej.
 * IMPORT_MATCHING_CONFIG='{"swimmer":{"minCandidateScore":0.65},"club":{"genericWords":["club"]}}'
 */
export function parseMatchConfig(raw: string | undefined): MatchConfig {
  if (!raw || raw.trim() === '') return DEFAULT_MATCH_CONFIG;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('IMPORT_MATCHING_CONFIG no es un JSON válido.');
  }
  if (!isRecord(parsed)) throw new Error('IMPORT_MATCHING_CONFIG debe ser un objeto JSON.');

  return {
    swimmer: mergeSection('swimmer', DEFAULT_MATCH_CONFIG.swimmer, parsed['swimmer']),
    club: mergeSection('club', DEFAULT_MATCH_CONFIG.club, parsed['club']),
  };
}

/** Parámetros enteros con su rango; el resto de los números son puntajes, pesos o factores en [0, 1]. */
const INTEGER_RANGES: Record<string, [number, number]> = {
  charsPerAllowedTypo: [1, 20],
  maxCandidates: [1, 10],
  estimatedBirthYearTolerance: [0, 3],
};

function mergeSection<T extends object>(name: string, defaults: T, override: unknown): T {
  if (override === undefined) return defaults;
  if (!isRecord(override)) throw new Error(`IMPORT_MATCHING_CONFIG.${name} debe ser un objeto.`);

  const result: Record<string, unknown> = Object.fromEntries(Object.entries(defaults));
  for (const [key, value] of Object.entries(override)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
      throw new Error(`IMPORT_MATCHING_CONFIG.${name}.${key} no es un parámetro conocido.`);
    }
    const parsedValue = parseValue(key, result[key], value);
    if (parsedValue === undefined) {
      throw new Error(`IMPORT_MATCHING_CONFIG.${name}.${key} tiene un valor inválido.`);
    }
    result[key] = parsedValue;
  }
  return result as T;
}

function parseValue(key: string, current: unknown, value: unknown): unknown {
  if (Array.isArray(current)) {
    if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) return undefined;
    return value.flatMap((v) => tokenize(v));
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const range = INTEGER_RANGES[key];
  if (range) {
    return Number.isInteger(value) && value >= range[0] && value <= range[1] ? value : undefined;
  }
  return value >= 0 && value <= 1 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
