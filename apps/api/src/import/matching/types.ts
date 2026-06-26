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
  displayName: string;
}

export interface MatchResultsPayload {
  swimmers: SwimmerMatchResult[];
  clubs: ClubMatchResult[];
}
