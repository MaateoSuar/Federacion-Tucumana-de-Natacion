export type IssueSeverity = 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';
export type IssueStage = 'detect' | 'parse' | 'normalize' | 'validate' | 'match';

export interface ImportIssue {
  severity: IssueSeverity;
  stage: IssueStage;
  message: string;
  source_line?: number;
  record_code?: string;
  raw_line?: string;
  suggested_action?: string;
}
