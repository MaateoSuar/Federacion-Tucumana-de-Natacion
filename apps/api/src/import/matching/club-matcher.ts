import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NormalizedClub } from '../../ingest/types/normalized-meet.types';
import type { ClubCandidate, ClubMatchResult } from './types';
import { DEFAULT_MATCH_CONFIG, MATCH_CONFIG, type MatchConfig } from './match-config';
import { scoreClubCandidate } from './club-scorer';

@Injectable()
export class ClubMatcher {
  private readonly config: MatchConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(MATCH_CONFIG) config?: MatchConfig,
  ) {
    this.config = config ?? DEFAULT_MATCH_CONFIG;
  }

  async match(
    club: NormalizedClub,
    sourceSystem: string,
  ): Promise<ClubMatchResult> {
    // ── 1. external_id ya mapeado ────────────────────────────────────────────
    const extMap = await this.prisma.externalIdMap.findUnique({
      where: {
        sourceSystem_externalId: {
          sourceSystem,
          externalId: club.external_team_id,
        },
      },
      select: { clubId: true },
    });
    if (extMap?.clubId) {
      return {
        clubRef: club.external_team_id,
        confidence: 'strong',
        clubId: extMap.clubId,
        matchedBy: 'external_id',
        requiresConfirmation: false,
        displayName: club.name,
      };
    }

    // ── 2. short_name exacto (case-insensitive) ──────────────────────────────
    const byShortName = await this.prisma.club.findFirst({
      where: { shortName: { equals: club.short_name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byShortName) {
      return {
        clubRef: club.external_team_id,
        confidence: 'high',
        clubId: byShortName.id,
        matchedBy: 'short_name',
        requiresConfirmation: false,
        displayName: club.name,
      };
    }

    // ── 3. Nombre normalizado exacto ─────────────────────────────────────────
    const byName = await this.prisma.club.findFirst({
      where: { name: { equals: club.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byName) {
      return {
        clubRef: club.external_team_id,
        confidence: 'high',
        clubId: byName.id,
        matchedBy: 'name_exact',
        requiresConfirmation: false,
        displayName: club.name,
      };
    }

    // ── 4. Similitud por palabras, sin importar orden ni palabras genéricas ──
    const allClubs = await this.prisma.club.findMany({
      select: { id: true, name: true, shortName: true },
    });

    const cfg = this.config.club;
    const candidates: ClubCandidate[] = allClubs
      .map((c) => {
        const scored = scoreClubCandidate(
          { name: club.name, shortName: club.short_name },
          { name: c.name, shortName: c.shortName },
          cfg,
        );
        return { clubId: c.id, displayName: c.name, score: scored.score, reasons: scored.reasons };
      })
      .filter((c) => c.score >= cfg.minCandidateScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, cfg.maxCandidates);

    const best = candidates[0];
    if (best) {
      return {
        clubRef: club.external_team_id,
        confidence: 'low',
        clubId: null,
        matchedBy: 'fuzzy',
        requiresConfirmation: true,
        candidateClubId: best.clubId,
        candidates,
        displayName: club.name,
      };
    }

    // ── 5. Sin match → club nuevo ────────────────────────────────────────────
    return {
      clubRef: club.external_team_id,
      confidence: 'none',
      clubId: null,
      matchedBy: 'none',
      requiresConfirmation: false,
      displayName: club.name,
    };
  }
}
