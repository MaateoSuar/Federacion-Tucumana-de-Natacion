import type { ImportIssue } from '../../ingest/types/import-issue.types';
import type { SwimmerMatchResult, ClubMatchResult } from '../matching/types';

export interface PreviewSummary {
  totalRows: number;
  okRows: number;
  errorRows: number;
  warningCount: number;
  newSwimmers: number;
  matchedSwimmers: number;
  confirmationRequired: number;
  newClubs: number;
  recordCandidates: number;
}

export interface PreviewMeetInfo {
  name: string;
  venue: string;
  course: number;
  startDate: string;
  endDate: string;
  source: string;
}

export interface SwimmerMatchGroups {
  /** Match fuerte/alto — se procesarán automáticamente en el commit */
  strong: SwimmerMatchResult[];
  /** Match medio/bajo — el admin debe confirmar antes del commit */
  needsConfirmation: SwimmerMatchResult[];
  /** Sin match — se crearán como nuevos nadadores */
  new: SwimmerMatchResult[];
}

export interface ClubMatchGroups {
  strong: ClubMatchResult[];
  needsConfirmation: ClubMatchResult[];
  new: ClubMatchResult[];
}

export interface PreviewResponseDto {
  jobId: string;
  status: string;
  summary: PreviewSummary;
  issues: ImportIssue[];
  meetInfo: PreviewMeetInfo | null;
  swimmerMatches: SwimmerMatchGroups;
  clubMatches: ClubMatchGroups;
}
