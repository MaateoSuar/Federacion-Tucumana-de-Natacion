import type { ImportIssue } from '../../ingest/types/import-issue.types';

export interface PreviewSummary {
  totalRows: number;
  okRows: number;
  errorRows: number;
  warningCount: number;
  newSwimmers: number;
  matchedSwimmers: number;
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

export interface PreviewResponseDto {
  jobId: string;
  status: string;
  summary: PreviewSummary;
  issues: ImportIssue[];
  meetInfo: PreviewMeetInfo | null;
}
