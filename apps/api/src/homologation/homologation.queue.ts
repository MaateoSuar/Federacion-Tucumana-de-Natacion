export const HOMOLOGATION_QUEUE = 'homologation';

export const POST_PROCESS_JOB = 'post-process-result';

export interface PostProcessJobData {
  resultId: string;
  swimmerId: string;
  clubId: string;
  eventDefinitionId: string;
  poolLength: 25 | 50;
  categoryId: string;
  gender: 'M' | 'F';
  seasonId: string;
  finalTimeMs: number;
  tournamentId: string;
  eventId: string;
  place: number | null;
  resultDate: string; // ISO
}
