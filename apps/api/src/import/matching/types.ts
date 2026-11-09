export type MatchConfidence = 'strong' | 'high' | 'medium' | 'low' | 'none';

export type SwimmerMatchedBy =
  | 'dni'
  | 'external_id'
  | 'name_dob_gender'
  | 'name_year_club'
  | 'fuzzy'
  | 'none';

export type ClubMatchedBy =
  | 'external_id'
  | 'short_name'
  | 'name_exact'
  | 'fuzzy'
  | 'none';

export interface SwimmerCandidate {
  swimmerId: string;
  displayName: string;
  birthYear: number | null;
  clubName: string | null;
  /** 0–1. Sugerencia para el admin, nunca una decisión. */
  score: number;
  reasons: string[];
}

export interface ClubCandidate {
  clubId: string;
  displayName: string;
  score: number;
  reasons: string[];
}

export interface SwimmerMatchResult {
  /** Índice en normalizedMeet.swimmers */
  swimmerRef: string;
  confidence: MatchConfidence;
  /** ID del swimmer ya existente en la base, o null si es nuevo */
  swimmerId: string | null;
  matchedBy: SwimmerMatchedBy;
  /** true → requiere confirmación humana en el preview antes del commit */
  requiresConfirmation: boolean;
  /** Solo para fuzzy: ID sugerido, pero no confirmado */
  candidateSwimmerId?: string;
  /** Solo para fuzzy: candidatos ordenados de mayor a menor puntaje */
  candidates?: SwimmerCandidate[];
  displayName: string;
}

export interface ClubMatchResult {
  /** external_team_id del archivo normalizado */
  clubRef: string;
  confidence: MatchConfidence;
  clubId: string | null;
  matchedBy: ClubMatchedBy;
  requiresConfirmation: boolean;
  candidateClubId?: string;
  candidates?: ClubCandidate[];
  displayName: string;
}

export interface MatchResultsPayload {
  swimmers: SwimmerMatchResult[];
  clubs: ClubMatchResult[];
}
