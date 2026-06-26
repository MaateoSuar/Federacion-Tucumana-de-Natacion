import { Injectable } from '@nestjs/common';
import type { NormalizedMeet } from './types/normalized-meet.types';

/**
 * Post-parse normalization pass.
 * The adapters do most coercion inline; this service handles cross-cutting concerns
 * (deduplication, swimmer key uniqueness, final type assertions).
 */
@Injectable()
export class Normalizer {
  normalize(meet: NormalizedMeet): NormalizedMeet {
    // Deduplicate clubs by external_team_id
    const clubsSeen = new Set<string>();
    const clubs = meet.clubs.filter((c) => {
      if (clubsSeen.has(c.external_team_id)) return false;
      clubsSeen.add(c.external_team_id);
      return true;
    });

    // Deduplicate swimmers by external_athlete_id
    const swimmersSeen = new Set<string>();
    const swimmers = meet.swimmers.filter((s) => {
      if (swimmersSeen.has(s.external_athlete_id)) return false;
      swimmersSeen.add(s.external_athlete_id);
      return true;
    });

    // Assert times are integers (guard against adapter bugs)
    const results = meet.results.map((r) => ({
      ...r,
      final_time_ms:
        r.final_time_ms !== null ? Math.round(r.final_time_ms) : null,
      seed_time_ms:
        r.seed_time_ms !== undefined ? Math.round(r.seed_time_ms) : undefined,
      splits: r.splits.map((s) => ({
        ...s,
        cumulative_time_ms: Math.round(s.cumulative_time_ms),
      })),
    }));

    return { ...meet, clubs, swimmers, results };
  }
}
