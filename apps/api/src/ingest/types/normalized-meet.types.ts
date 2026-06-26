import type { ImportIssue } from './import-issue.types';

export type PoolLength = 25 | 50;
export type NormalizedGender = 'M' | 'F' | 'X';
export type NormalizedResultStatus = 'OK' | 'DSQ' | 'DNS' | 'DNF';
export type NormalizedStroke =
  | 'libre'
  | 'espalda'
  | 'pecho'
  | 'mariposa'
  | 'combinado';
export type NormalizedRound = 'F' | 'S' | 'P' | 'T';
export type CompetitionType =
  | 'FEDERADOS'
  | 'INFANTILES'
  | 'PROMOCIONALES'
  | 'TOMA_DE_TIEMPOS'
  | 'DESCONOCIDO';

export interface NormalizedClub {
  external_team_id: string;
  name: string;
  short_name: string;
  source_line: number;
}

export interface NormalizedSwimmer {
  external_athlete_id: string;
  first_name: string;
  last_name: string;
  gender: NormalizedGender;
  birth_date?: string;
  age?: number;
  document?: string;
  club_ref: string;
  source_line: number;
}

export interface NormalizedEvent {
  event_no: number;
  stroke: NormalizedStroke;
  distance: number;
  gender: NormalizedGender;
  round: NormalizedRound;
  course: PoolLength;
  age_group: string;
  competition_type: CompetitionType;
  is_relay: boolean;
  source_line: number;
}

export interface NormalizedSplit {
  distance: number;
  cumulative_time_ms: number;
}

export interface NormalizedResult {
  event_ref: number;
  swimmer_ref: string;
  heat_no: number;
  lane_no: number;
  final_time_ms: number | null;
  status: NormalizedResultStatus;
  place?: number;
  seed_time_ms?: number;
  reaction_time_ms?: number;
  dsq_code?: string;
  splits: NormalizedSplit[];
  source_line: number;
}

export interface NormalizedMeet {
  meet: {
    name: string;
    venue: string;
    course: PoolLength;
    start_date: string;
    end_date: string;
    source: 'pdf' | 'hy3' | 'csv' | 'excel';
    external_meet_id?: string;
  };
  clubs: NormalizedClub[];
  swimmers: NormalizedSwimmer[];
  events: NormalizedEvent[];
  results: NormalizedResult[];
  issues: ImportIssue[];
  meta: {
    source_file_name: string;
    parsed_at: string;
    total_lines: number;
  };
}
