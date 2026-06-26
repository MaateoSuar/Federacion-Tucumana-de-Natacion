import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NormalizedSwimmer } from '../../ingest/types/normalized-meet.types';
import type { SwimmerMatchResult } from './types';
import {
  normalizeText,
  similarity,
  FUZZY_SWIMMER_THRESHOLD,
} from './fuzzy';

@Injectable()
export class AthleteMatcher {
  constructor(private readonly prisma: PrismaService) {}

  async match(
    swimmer: NormalizedSwimmer,
    sourceSystem: string,
  ): Promise<SwimmerMatchResult> {
    const displayName = `${swimmer.first_name} ${swimmer.last_name}`;

    // ── 1. DNI exacto ────────────────────────────────────────────────────────
    if (swimmer.document) {
      const found = await this.prisma.swimmer.findUnique({
        where: { documentId: swimmer.document },
        select: { id: true },
      });
      if (found) {
        return {
          swimmerRef: swimmer.external_athlete_id,
          confidence: 'strong',
          swimmerId: found.id,
          matchedBy: 'dni',
          requiresConfirmation: false,
          displayName,
        };
      }
    }

    // ── 2. external_id ya mapeado (mismo source_system) ─────────────────────
    const extMap = await this.prisma.externalIdMap.findUnique({
      where: {
        sourceSystem_externalId: {
          sourceSystem,
          externalId: swimmer.external_athlete_id,
        },
      },
      select: { swimmerId: true },
    });
    if (extMap?.swimmerId) {
      return {
        swimmerRef: swimmer.external_athlete_id,
        confidence: 'strong',
        swimmerId: extMap.swimmerId,
        matchedBy: 'external_id',
        requiresConfirmation: false,
        displayName,
      };
    }

    // ── 3. Nombre + apellido + birth_date + gender exactos ───────────────────
    if (swimmer.birth_date) {
      const birthDate = new Date(swimmer.birth_date);
      const found = await this.prisma.swimmer.findFirst({
        where: {
          firstName: { equals: swimmer.first_name, mode: 'insensitive' },
          lastName: { equals: swimmer.last_name, mode: 'insensitive' },
          birthDate,
          gender: swimmer.gender === 'M' ? 'M' : 'F',
        },
        select: { id: true },
      });
      if (found) {
        return {
          swimmerRef: swimmer.external_athlete_id,
          confidence: 'high',
          swimmerId: found.id,
          matchedBy: 'name_dob_gender',
          requiresConfirmation: false,
          displayName,
        };
      }
    }

    // ── 4. Nombre + apellido + año de nacimiento + club ──────────────────────
    if (swimmer.birth_date || swimmer.age) {
      const birthYear = swimmer.birth_date
        ? new Date(swimmer.birth_date).getFullYear()
        : swimmer.age
          ? new Date().getFullYear() - swimmer.age
          : null;

      if (birthYear) {
        const candidates = await this.prisma.swimmer.findMany({
          where: {
            firstName: { equals: swimmer.first_name, mode: 'insensitive' },
            lastName: { equals: swimmer.last_name, mode: 'insensitive' },
            birthDate: {
              gte: new Date(`${birthYear}-01-01`),
              lte: new Date(`${birthYear}-12-31`),
            },
          },
          include: { currentClub: { select: { shortName: true, name: true } } },
        });

        if (candidates.length === 1 && candidates[0]) {
          return {
            swimmerRef: swimmer.external_athlete_id,
            confidence: 'medium',
            swimmerId: candidates[0].id,
            matchedBy: 'name_year_club',
            requiresConfirmation: true,
            displayName,
          };
        }
      }
    }

    // ── 5. Fuzzy (levenshtein sobre nombre normalizado) ──────────────────────
    const allSwimmers = await this.prisma.swimmer.findMany({
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });

    const fullNameNormalized = normalizeText(`${swimmer.first_name} ${swimmer.last_name}`);
    let bestScore = 0;
    let bestId: string | null = null;

    for (const s of allSwimmers) {
      const candidateName = normalizeText(`${s.firstName} ${s.lastName}`);
      const score = similarity(fullNameNormalized, candidateName);
      if (score > bestScore) {
        bestScore = score;
        bestId = s.id;
      }
    }

    if (bestScore >= FUZZY_SWIMMER_THRESHOLD && bestId) {
      return {
        swimmerRef: swimmer.external_athlete_id,
        confidence: 'low',
        swimmerId: null,
        matchedBy: 'fuzzy',
        requiresConfirmation: true,
        candidateSwimmerId: bestId,
        displayName,
      };
    }

    // ── 6. Sin match → atleta nuevo ──────────────────────────────────────────
    return {
      swimmerRef: swimmer.external_athlete_id,
      confidence: 'none',
      swimmerId: null,
      matchedBy: 'none',
      requiresConfirmation: false,
      displayName,
    };
  }
}
