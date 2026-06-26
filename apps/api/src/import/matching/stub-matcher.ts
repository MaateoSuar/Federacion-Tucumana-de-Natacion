import type { NormalizedSwimmer, NormalizedClub } from '../../ingest/types/normalized-meet.types';

export interface SwimmerMatchResult {
  status: 'new' | 'matched';
  swimmerId: string | null;
}

export interface ClubMatchResult {
  status: 'new' | 'matched';
  clubId: string | null;
}

/** M7 stub — M8 reemplaza por cascada real de confianza. */
export class StubMatcher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  matchSwimmer(_swimmer: NormalizedSwimmer): SwimmerMatchResult {
    return { status: 'new', swimmerId: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  matchClub(_club: NormalizedClub): ClubMatchResult {
    return { status: 'new', clubId: null };
  }
}
