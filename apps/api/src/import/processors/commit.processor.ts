import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import {
  Gender,
  ResultStatus,
  ResultSource,
  EventRound,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportRepository } from '../import.repository';
import { ResultsGateway } from '../../results-gateway/results.gateway';
import type {
  NormalizedMeet,
  NormalizedStroke,
  NormalizedRound,
} from '../../ingest/types/normalized-meet.types';

interface RollbackPayload {
  tournamentId: string | null;
  newSwimmerIds: string[];
  newClubIds: string[];
  newEventIds: string[];
  resultIds: string[];
}

const STROKE_CODE: Record<NormalizedStroke, string> = {
  libre: 'L',
  espalda: 'E',
  pecho: 'P',
  mariposa: 'MA',
  combinado: 'C',
};

const ROUND_MAP: Record<NormalizedRound, EventRound> = {
  F: 'final',
  S: 'serie_unica',
  P: 'clasificatorio',
  T: 'serie_unica',
};

function resolveCategory(
  categories: Array<{ id: string; minAge: number | null; maxAge: number | null }>,
  birthDate: Date | null,
  age: number | null,
  tournamentYear: number,
): string | null {
  let sportAge: number;
  if (birthDate) {
    sportAge = tournamentYear - birthDate.getFullYear();
  } else if (age != null) {
    sportAge = age;
  } else {
    return null;
  }

  const cat = categories.find(
    (c) =>
      (c.minAge === null || sportAge >= c.minAge) &&
      (c.maxAge === null || sportAge <= c.maxAge),
  );
  return cat?.id ?? null;
}

@Injectable()
export class CommitProcessor {
  private readonly logger = new Logger(CommitProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ImportRepository,
    @Optional() private readonly resultsGateway: ResultsGateway | null,
  ) {}

  async commit(jobId: string): Promise<string> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BadRequestException('Job no encontrado.');
    if (job.status !== 'preview') {
      throw new BadRequestException(
        `El job debe estar en estado "preview" para confirmar (estado actual: ${job.status}).`,
      );
    }
    if (!job.meetManagerImport) {
      throw new BadRequestException('No hay datos de staging para este job.');
    }

    const normalizedMeet = job.meetManagerImport.parsedPayload as unknown as NormalizedMeet;
    const rollback: RollbackPayload = {
      tournamentId: null,
      newSwimmerIds: [],
      newClubIds: [],
      newEventIds: [],
      resultIds: [],
    };

    const tournamentYear = new Date(normalizedMeet.meet.start_date).getFullYear();

    // Load categories once outside the transaction (read-only lookup)
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, minAge: true, maxAge: true },
    });

    // Find or create the season (outside tx — idempotent)
    let season = await this.prisma.season.findUnique({ where: { year: tournamentYear } });
    if (!season) {
      season = await this.prisma.season.create({
        data: {
          year: tournamentYear,
          startDate: new Date(`${tournamentYear}-01-01`),
          endDate: new Date(`${tournamentYear}-12-31`),
        },
      });
    }

    // Fallback category: the one with no maxAge (Mayores) or first active
    const fallbackCategory =
      categories.find((c) => c.maxAge === null) ?? categories[0];
    if (!fallbackCategory) throw new BadRequestException('No hay categorías activas en la base.');

    const sourceMap: Record<string, ResultSource> = {
      pdf: ResultSource.pdf,
      hy3: ResultSource.hy3,
      csv: ResultSource.csv,
      excel: ResultSource.excel,
    };
    const resultSource: ResultSource =
      sourceMap[normalizedMeet.meet.source] ?? ResultSource.manual;

    await this.prisma.$transaction(
      async (tx) => {
        // ── Clubs ────────────────────────────────────────────────
        const clubIdMap: Record<string, string> = {};
        for (const club of normalizedMeet.clubs) {
          const existing = await tx.club.findFirst({
            where: { name: { equals: club.name, mode: 'insensitive' } },
            select: { id: true },
          });
          if (existing) {
            clubIdMap[club.external_team_id] = existing.id;
          } else {
            const created = await tx.club.create({
              data: {
                name: club.name,
                shortName: club.short_name || club.name.substring(0, 10),
                locality: 'Tucumán',
              },
            });
            clubIdMap[club.external_team_id] = created.id;
            rollback.newClubIds.push(created.id);
          }
        }

        // ── Swimmers ─────────────────────────────────────────────
        const swimmerIdMap: Record<string, string> = {};
        for (const sw of normalizedMeet.swimmers) {
          const gender: Gender = sw.gender === 'F' ? 'F' : 'M';
          const clubId = clubIdMap[sw.club_ref] ?? null;
          // Find existing swimmer by name + gender (idempotent re-import)
          const existing = await tx.swimmer.findFirst({
            where: {
              firstName: { equals: sw.first_name, mode: 'insensitive' },
              lastName: { equals: sw.last_name, mode: 'insensitive' },
              gender,
            },
            select: { id: true, currentClubId: true },
          });
          if (existing) {
            // Update currentClub if not set yet
            if (!existing.currentClubId && clubId) {
              await tx.swimmer.update({ where: { id: existing.id }, data: { currentClubId: clubId } });
            }
            swimmerIdMap[sw.external_athlete_id] = existing.id;
          } else {
            const created = await tx.swimmer.create({
              data: {
                firstName: sw.first_name,
                lastName: sw.last_name,
                gender,
                birthDate: sw.birth_date ? new Date(sw.birth_date) : null,
                documentId: sw.document ?? null,
                currentClubId: clubId,
                source: resultSource,
              },
            });
            swimmerIdMap[sw.external_athlete_id] = created.id;
            rollback.newSwimmerIds.push(created.id);
          }
        }

        // ── Tournament ───────────────────────────────────────────
        const tournament = await tx.tournament.create({
          data: {
            name: normalizedMeet.meet.name,
            venue: normalizedMeet.meet.venue,
            poolLength: normalizedMeet.meet.course === 25 ? 'P25' : 'P50',
            startDate: new Date(normalizedMeet.meet.start_date),
            endDate: new Date(normalizedMeet.meet.end_date),
            type: 'provincial',
            scope: 'provincial',
            seasonId: season.id,
            status: 'finalizado',
          },
        });
        rollback.tournamentId = tournament.id;

        // ── Events, Heats, Results ───────────────────────────────
        for (const event of normalizedMeet.events) {
          const strokeCode = STROKE_CODE[event.stroke] ?? event.stroke;
          const code = `${event.distance}${strokeCode}_${event.gender}`;

          let eventDef = await tx.eventDefinition.findUnique({ where: { code } });
          if (!eventDef) {
            eventDef = await tx.eventDefinition.create({
              data: {
                code,
                stroke: event.stroke,
                distance: event.distance,
                gender: event.gender === 'F' ? 'F' : ('M' as Gender),
                isRelay: event.is_relay,
              },
            });
          }

          // Deduplicate: if this eventDefinition already has an event in this tournament, reuse it
          const existingDbEvent = await tx.event.findFirst({
            where: { tournamentId: tournament.id, eventDefinitionId: eventDef.id },
            select: { id: true },
          });
          let createdEvent: { id: string };
          if (existingDbEvent) {
            createdEvent = existingDbEvent;
          } else {
            createdEvent = await tx.event.create({
              data: {
                tournamentId: tournament.id,
                eventDefinitionId: eventDef.id,
                categoryId: fallbackCategory.id,
                round: ROUND_MAP[event.round] ?? 'serie_unica',
                orderNo: event.event_no,
                status: 'finalizado',
              },
            });
            rollback.newEventIds.push(createdEvent.id);
          }

          const resultsForEvent = normalizedMeet.results.filter(
            (r) => r.event_ref === event.event_no,
          );
          const heatNos = [...new Set(resultsForEvent.map((r) => r.heat_no))];

          const heatIdMap: Record<number, string> = {};
          for (const heatNo of heatNos) {
            const heat = await tx.heat.create({
              data: { eventId: createdEvent.id, heatNumber: heatNo },
            });
            heatIdMap[heatNo] = heat.id;
          }

          for (const result of resultsForEvent) {
            const swimmer = normalizedMeet.swimmers.find(
              (s) => s.external_athlete_id === result.swimmer_ref,
            );
            if (!swimmer) continue;
            const swimmerId = swimmerIdMap[swimmer.external_athlete_id];
            if (!swimmerId) continue;

            const clubId = clubIdMap[swimmer.club_ref];
            if (!clubId) continue;

            // Resolve frozen category
            const birthDate = swimmer.birth_date ? new Date(swimmer.birth_date) : null;
            const catId =
              resolveCategory(categories, birthDate, swimmer.age ?? null, tournamentYear) ??
              fallbackCategory.id;

            const createdResult = await tx.result.create({
              data: {
                eventId: createdEvent.id,
                swimmerId,
                heatId: heatIdMap[result.heat_no] ?? null,
                lane: result.lane_no,
                finalTime: result.final_time_ms,
                place: result.place ?? null,
                status: result.status as ResultStatus,
                dsqCode: result.dsq_code ?? null,
                reactionTime: result.reaction_time_ms ?? null,
                source: resultSource,
                categoryId: catId,
                clubId,
              },
            });
            rollback.resultIds.push(createdResult.id);

            for (const split of result.splits) {
              await tx.split.create({
                data: {
                  resultId: createdResult.id,
                  distance: split.distance,
                  cumulativeTime: split.cumulative_time_ms,
                },
              });
            }
          }
        }

        // ── Update ImportJob ─────────────────────────────────────
        await tx.importJob.update({
          where: { id: jobId },
          data: {
            status: 'confirmed',
            tournamentId: rollback.tournamentId,
            finishedAt: new Date(),
          },
        });

        await tx.meetManagerImport.update({
          where: { importJobId: jobId },
          data: { mapping: rollback as unknown as Prisma.InputJsonValue },
        });
      },
      { timeout: 30_000 },
    );

    this.logger.log(
      `Job ${jobId} committed — tournament ${rollback.tournamentId}, ` +
        `${rollback.resultIds.length} results, ${rollback.newSwimmerIds.length} new swimmers`,
    );

    if (this.resultsGateway && rollback.tournamentId) {
      this.resultsGateway.notifyResultsUpdated(rollback.tournamentId, rollback.newEventIds);
    }

    return rollback.tournamentId!;
  }

  async rollback(jobId: string): Promise<void> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new BadRequestException('Job no encontrado.');
    if (job.status !== 'confirmed') {
      throw new BadRequestException(
        `Solo se puede hacer rollback de imports confirmados (estado: ${job.status}).`,
      );
    }

    const mapping = (job.meetManagerImport?.mapping ?? {}) as unknown as RollbackPayload;

    await this.prisma.$transaction(async (tx) => {
      if (mapping.resultIds?.length) {
        await tx.split.deleteMany({ where: { resultId: { in: mapping.resultIds } } });
        await tx.result.deleteMany({ where: { id: { in: mapping.resultIds } } });
      }
      if (mapping.newEventIds?.length) {
        await tx.heat.deleteMany({ where: { eventId: { in: mapping.newEventIds } } });
        await tx.event.deleteMany({ where: { id: { in: mapping.newEventIds } } });
      }
      if (mapping.tournamentId) {
        await tx.tournament.delete({ where: { id: mapping.tournamentId } });
      }
      if (mapping.newSwimmerIds?.length) {
        await tx.swimmer.deleteMany({ where: { id: { in: mapping.newSwimmerIds } } });
      }
      if (mapping.newClubIds?.length) {
        await tx.club.deleteMany({ where: { id: { in: mapping.newClubIds } } });
      }
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: 'rolled_back' },
      });
    });

    this.logger.log(`Job ${jobId} rolled back.`);
  }
}
