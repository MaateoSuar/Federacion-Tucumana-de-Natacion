import type { MatchResultsPayload } from './types';

/** Matches que requieren confirmación humana y todavía no tienen decisión. */
export function countPendingDecisions(matchResults: MatchResultsPayload | null): number {
  if (!matchResults) return 0;
  const pending = (m: { requiresConfirmation: boolean; resolution?: unknown }) =>
    m.requiresConfirmation && !m.resolution;
  return matchResults.swimmers.filter(pending).length + matchResults.clubs.filter(pending).length;
}
