import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NormalizedClub } from '../../ingest/types/normalized-meet.types';
import type { ClubMatchResult } from './types';
import { normalizeText, similarity, FUZZY_CLUB_THRESHOLD } from './fuzzy';

@Injectable()
export class ClubMatcher {
  constructor(private readonly prisma: PrismaService) {}

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

    // ── 4. Fuzzy nombre ──────────────────────────────────────────────────────
    const allClubs = await this.prisma.club.findMany({
      select: { id: true, name: true, shortName: true },
    });

    const nameNorm = normalizeText(club.name);
    let bestScore = 0;
    let bestId: string | null = null;

    for (const c of allClubs) {
      const score = Math.max(
        similarity(nameNorm, normalizeText(c.name)),
        similarity(nameNorm, normalizeText(c.shortName)),
      );
      if (score > bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    }

    if (bestScore >= FUZZY_CLUB_THRESHOLD && bestId) {
      return {
        clubRef: club.external_team_id,
        confidence: 'low',
        clubId: null,
        matchedBy: 'fuzzy',
        requiresConfirmation: true,
        candidateClubId: bestId,
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
