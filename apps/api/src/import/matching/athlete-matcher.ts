import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { NormalizedSwimmer } from '../../ingest/types/normalized-meet.types';
import type { SwimmerCandidate, SwimmerMatchResult } from './types';
import { DEFAULT_MATCH_CONFIG, MATCH_CONFIG, type MatchConfig } from './match-config';
import { scoreSwimmerCandidate, type SwimmerScoreSource } from './swimmer-scorer';

export interface SwimmerPoolEntry {
  id: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  birthDate?: Date | null;
  currentClubId?: string | null;
  currentClub?: { name: string } | null;
}

export interface AthleteMatchContext {
  /** Año de la competencia; se usa para deducir el año de nacimiento a partir de la edad. */
  seasonYear?: number;
  /** Club del atleta en la base, si el club del archivo ya se resolvió con certeza. */
  clubId?: string | null;
  /** Padrón de nadadores precargado; evita una consulta completa por cada atleta. */
  pool?: SwimmerPoolEntry[];
}

export interface AthleteMatchAllContext {
  seasonYear?: number;
  clubIdByRef: Record<string, string | null>;
}

@Injectable()
export class AthleteMatcher {
  private readonly config: MatchConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(MATCH_CONFIG) config?: MatchConfig,
  ) {
    this.config = config ?? DEFAULT_MATCH_CONFIG;
  }

  async matchAll(
    swimmers: NormalizedSwimmer[],
    sourceSystem: string,
    ctx: AthleteMatchAllContext,
  ): Promise<SwimmerMatchResult[]> {
    const pool = await this.loadPool();
    return Promise.all(
      swimmers.map((s) =>
        this.match(s, sourceSystem, {
          seasonYear: ctx.seasonYear,
          clubId: ctx.clubIdByRef[s.club_ref] ?? null,
          pool,
        }),
      ),
    );
  }

  async match(
    swimmer: NormalizedSwimmer,
    sourceSystem: string,
    ctx: AthleteMatchContext = {},
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

    // ── 4. Nombre + apellido + año de nacimiento ─────────────────────────────
    const { birthYear, estimated } = this.birthYearOf(swimmer, ctx.seasonYear);
    if (birthYear !== null) {
      const candidates = await this.prisma.swimmer.findMany({
        where: {
          firstName: { equals: swimmer.first_name, mode: 'insensitive' },
          lastName: { equals: swimmer.last_name, mode: 'insensitive' },
          birthDate: {
            gte: new Date(`${estimated ? birthYear - this.config.swimmer.estimatedBirthYearTolerance : birthYear}-01-01`),
            lte: new Date(`${birthYear}-12-31`),
          },
        },
        include: { currentClub: { select: { shortName: true, name: true } } },
      });

      const only = candidates.length === 1 ? candidates[0] : undefined;
      if (only) {
        const onlyBirthYear = only.birthDate ? only.birthDate.getUTCFullYear() : null;
        return {
          swimmerRef: swimmer.external_athlete_id,
          confidence: 'medium',
          // Requiere confirmación: con requiresConfirmation=true este swimmerId es una propuesta, no un vínculo.
          swimmerId: only.id,
          matchedBy: 'name_year_club',
          requiresConfirmation: true,
          candidateSwimmerId: only.id,
          candidates: [
            {
              swimmerId: only.id,
              displayName: `${only.firstName} ${only.lastName}`,
              birthYear: onlyBirthYear,
              clubName: only.currentClub?.name ?? null,
              score: 1,
              reasons: [
                'mismo nombre y apellido',
                estimated ? 'año de nacimiento compatible con la edad' : 'mismo año de nacimiento',
              ],
            },
          ],
          displayName,
        };
      }
    }

    // ── 5. Similitud por palabras + señales (género, año, club) ──────────────
    const pool = ctx.pool ?? (await this.loadPool());
    const source: SwimmerScoreSource = {
      firstName: swimmer.first_name,
      lastName: swimmer.last_name,
      gender: swimmer.gender,
      birthYear,
      birthYearIsEstimated: estimated,
      clubId: ctx.clubId ?? null,
    };
    const candidates = this.rankCandidates(source, pool);
    const best = candidates[0];

    if (best) {
      return {
        swimmerRef: swimmer.external_athlete_id,
        confidence: 'low',
        swimmerId: null,
        matchedBy: 'fuzzy',
        requiresConfirmation: true,
        candidateSwimmerId: best.swimmerId,
        candidates,
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

  private loadPool(): Promise<SwimmerPoolEntry[]> {
    return this.prisma.swimmer.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        birthDate: true,
        currentClubId: true,
        currentClub: { select: { name: true } },
      },
    });
  }

  private rankCandidates(source: SwimmerScoreSource, pool: SwimmerPoolEntry[]): SwimmerCandidate[] {
    const cfg = this.config.swimmer;
    const ranked: SwimmerCandidate[] = [];

    for (const entry of pool) {
      const birthYear = entry.birthDate ? entry.birthDate.getUTCFullYear() : null;
      const scored = scoreSwimmerCandidate(
        source,
        {
          firstName: entry.firstName,
          lastName: entry.lastName,
          gender: entry.gender ?? null,
          birthYear,
          clubId: entry.currentClubId ?? null,
        },
        cfg,
      );
      if (!scored || scored.score < cfg.minCandidateScore) continue;
      ranked.push({
        swimmerId: entry.id,
        displayName: `${entry.firstName} ${entry.lastName}`,
        birthYear,
        clubName: entry.currentClub?.name ?? null,
        score: scored.score,
        reasons: scored.reasons,
      });
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, cfg.maxCandidates);
  }

  private birthYearOf(
    swimmer: NormalizedSwimmer,
    seasonYear: number | undefined,
  ): { birthYear: number | null; estimated: boolean } {
    if (swimmer.birth_date) {
      const year = new Date(swimmer.birth_date).getUTCFullYear();
      return Number.isNaN(year) ? { birthYear: null, estimated: false } : { birthYear: year, estimated: false };
    }
    if (swimmer.age) {
      return { birthYear: (seasonYear ?? new Date().getFullYear()) - swimmer.age, estimated: true };
    }
    return { birthYear: null, estimated: false };
  }
}
