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
import type { MatchResolution, MatchResultsPayload } from '../matching/types';
import { countPendingDecisions } from '../matching/pending-decisions';
import { AthleteMatcher } from '../matching/athlete-matcher';
import { ClubMatcher } from '../matching/club-matcher';

interface RollbackPayload {
  tournamentId: string | null;
  newSwimmerIds: string[];
  newClubIds: string[];
  newEventIds: string[];
  resultIds: string[];
  /** Grafías de nadadores/clubes aprendidas en este import (external_id_map). */
  learnedExternalIds: string[];
}

const SOURCE_SYSTEM = 'meet_manager';

function resolvedTargetId(resolution: MatchResolution | undefined, matchedId: string | null): string | null {
  if (resolution) return resolution.decision === 'link' ? resolution.targetId : null;
  return matchedId;
}

function bringsNewMatch(
  previousIds: Array<string | null>,
  freshConfidence: string,
  freshIds: Array<string | null>,
): boolean {
  if (freshConfidence === 'none') return false;
  return freshIds.some((id) => id !== null && !previousIds.includes(id));
}

function auditPayload(
  jobId: string,
  nameInFile: string,
  matchedBy: string,
  resolution: MatchResolution,
  candidates: Array<{ id: string; displayName: string; score: number }>,
  committedBy: string | null,
): Prisma.InputJsonValue {
  return {
    importJobId: jobId,
    nameInFile,
    matchedBy,
    decision: resolution.decision,
    targetId: resolution.decision === 'link' ? resolution.targetId : null,
    decidedAt: resolution.decidedAt,
    committedBy,
    candidates,
  };
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
    private readonly athleteMatcher: AthleteMatcher,
    private readonly clubMatcher: ClubMatcher,
    @Optional() private readonly resultsGateway: ResultsGateway | null,
  ) {}

  /**
   * Vuelve a analizar solo lo que el commit crearía como nuevo. Si otra importación confirmada
   * después del análisis creó o aprendió a esa persona/club, el match se reemplaza por el fresco
   * (queda pendiente de revisión) en vez de duplicar. Devuelve cuántos matches cambiaron.
   */
  private async refreshStaleMatches(meet: NormalizedMeet, matchResults: MatchResultsPayload): Promise<number> {
    let refreshed = 0;
    const clubIdByRef: Record<string, string | null> = {};

    for (let i = 0; i < matchResults.clubs.length; i++) {
      const old = matchResults.clubs[i];
      if (!old) continue;
      const target = resolvedTargetId(old.resolution, old.clubId);
      clubIdByRef[old.clubRef] = target;
      if (target) continue;
      const club = meet.clubs.find((c) => c.external_team_id === old.clubRef);
      if (!club) continue;
      const fresh = await this.clubMatcher.match(club, SOURCE_SYSTEM);
      const previousIds = [old.clubId, ...(old.candidates ?? []).map((c) => c.clubId)];
      if (bringsNewMatch(previousIds, fresh.confidence, [fresh.clubId, ...(fresh.candidates ?? []).map((c) => c.clubId)])) {
        matchResults.clubs[i] = fresh;
        refreshed++;
      }
    }

    const swimmerIndexByRef = new Map(matchResults.swimmers.map((m, i) => [m.swimmerRef, i]));
    const toCreate = meet.swimmers.filter((s) => {
      const i = swimmerIndexByRef.get(s.external_athlete_id);
      const m = i === undefined ? undefined : matchResults.swimmers[i];
      return m !== undefined && resolvedTargetId(m.resolution, m.swimmerId) === null;
    });
    if (toCreate.length === 0) return refreshed;

    const seasonYear = parseInt(meet.meet.start_date.slice(0, 4), 10);
    const freshResults = await this.athleteMatcher.matchAll(toCreate, SOURCE_SYSTEM, {
      seasonYear: Number.isNaN(seasonYear) ? undefined : seasonYear,
      clubIdByRef,
    });
    for (const fresh of freshResults) {
      const i = swimmerIndexByRef.get(fresh.swimmerRef);
      const old = i === undefined ? undefined : matchResults.swimmers[i];
      if (i === undefined || !old) continue;
      const previousIds = [old.swimmerId, ...(old.candidates ?? []).map((c) => c.swimmerId)];
      if (bringsNewMatch(previousIds, fresh.confidence, [fresh.swimmerId, ...(fresh.candidates ?? []).map((c) => c.swimmerId)])) {
        matchResults.swimmers[i] = fresh;
        refreshed++;
      }
    }
    return refreshed;
  }

  async commit(jobId: string, committedBy?: string): Promise<string> {
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
    const matchResults = job.meetManagerImport.matchResults as unknown as MatchResultsPayload | null;
    if (!matchResults) {
      throw new BadRequestException('El import no tiene resultados de matching; volvé a subir el archivo.');
    }
    const pending = countPendingDecisions(matchResults);
    if (pending > 0) {
      throw new BadRequestException(
        `Hay ${pending} nadador(es)/club(es) sin decidir. Resolvelos en el preview antes de confirmar.`,
      );
    }
    const refreshed = await this.refreshStaleMatches(normalizedMeet, matchResults);
    if (refreshed > 0) {
      await this.repo.saveMatchResults(jobId, matchResults);
      throw new BadRequestException(
        `Desde que se analizó el archivo aparecieron ${refreshed} coincidencia(s) nueva(s), ` +
          'probablemente por otra importación confirmada. Revisalas en el preview antes de confirmar.',
      );
    }
    const swimmerMatchByRef = new Map(matchResults.swimmers.map((m) => [m.swimmerRef, m]));
    const clubMatchByRef = new Map(matchResults.clubs.map((m) => [m.clubRef, m]));

    const rollback: RollbackPayload = {
      tournamentId: null,
      newSwimmerIds: [],
      newClubIds: [],
      newEventIds: [],
      resultIds: [],
      learnedExternalIds: [],
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
          const match = clubMatchByRef.get(club.external_team_id);
          if (!match) throw new BadRequestException(`Falta el matching del club "${club.name}".`);
          const existingId = resolvedTargetId(match.resolution, match.clubId);
          if (existingId) {
            const stillExists = await tx.club.findUnique({ where: { id: existingId }, select: { id: true } });
            if (!stillExists) {
              throw new BadRequestException(`El club elegido para "${club.name}" ya no existe.`);
            }
            clubIdMap[club.external_team_id] = existingId;
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
          const match = swimmerMatchByRef.get(sw.external_athlete_id);
          if (!match) {
            throw new BadRequestException(
              `Falta el matching del nadador "${sw.first_name} ${sw.last_name}".`,
            );
          }
          const existingId = resolvedTargetId(match.resolution, match.swimmerId);
          const existing = existingId
            ? await tx.swimmer.findUnique({
                where: { id: existingId },
                select: { id: true, currentClubId: true },
              })
            : null;
          if (existingId && !existing) {
            throw new BadRequestException(
              `El nadador elegido para "${sw.first_name} ${sw.last_name}" ya no existe.`,
            );
          }
          if (existing) {
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

        // ── Aprendizaje: cada grafía del PDF queda mapeada a su nadador/club ──
        // Solo PDF: su ID externo se deriva del nombre y es estable entre archivos.
        // Los IDs de CSV/Excel son posicionales y mapearían personas distintas.
        if (normalizedMeet.meet.source === 'pdf') {
          const toLearn = [
            ...normalizedMeet.swimmers
              .filter((s) => swimmerMatchByRef.get(s.external_athlete_id)?.matchedBy !== 'external_id')
              .map((s) => ({ externalId: s.external_athlete_id, swimmerId: swimmerIdMap[s.external_athlete_id] ?? null, clubId: null })),
            ...normalizedMeet.clubs
              .filter((c) => clubMatchByRef.get(c.external_team_id)?.matchedBy !== 'external_id')
              .map((c) => ({ externalId: c.external_team_id, swimmerId: null, clubId: clubIdMap[c.external_team_id] ?? null })),
          ];
          const alreadyMapped = new Set(
            (
              await tx.externalIdMap.findMany({
                where: { sourceSystem: SOURCE_SYSTEM, externalId: { in: toLearn.map((l) => l.externalId) } },
                select: { externalId: true },
              })
            ).map((m) => m.externalId),
          );
          const newMappings = toLearn.filter((l) => !alreadyMapped.has(l.externalId));
          if (newMappings.length > 0) {
            await tx.externalIdMap.createMany({
              data: newMappings.map((l) => ({ sourceSystem: SOURCE_SYSTEM, ...l })),
            });
            rollback.learnedExternalIds.push(...newMappings.map((l) => l.externalId));
          }
        }

        // ── Auditoría de las decisiones humanas de identidad ─────
        const auditEntries: Prisma.AuditLogCreateManyInput[] = [];
        for (const m of matchResults.swimmers) {
          if (!m.resolution) continue;
          auditEntries.push({
            userId: m.resolution.decidedBy,
            action: m.resolution.decision === 'link' ? 'IMPORT_SWIMMER_LINKED' : 'IMPORT_SWIMMER_MARKED_NEW',
            entityType: 'Swimmer',
            entityId: swimmerIdMap[m.swimmerRef] ?? m.swimmerRef,
            payload: auditPayload(
              jobId,
              m.displayName,
              m.matchedBy,
              m.resolution,
              (m.candidates ?? []).map((c) => ({ id: c.swimmerId, displayName: c.displayName, score: c.score })),
              committedBy ?? null,
            ),
          });
        }
        for (const m of matchResults.clubs) {
          if (!m.resolution) continue;
          auditEntries.push({
            userId: m.resolution.decidedBy,
            action: m.resolution.decision === 'link' ? 'IMPORT_CLUB_LINKED' : 'IMPORT_CLUB_MARKED_NEW',
            entityType: 'Club',
            entityId: clubIdMap[m.clubRef] ?? m.clubRef,
            payload: auditPayload(
              jobId,
              m.displayName,
              m.matchedBy,
              m.resolution,
              (m.candidates ?? []).map((c) => ({ id: c.clubId, displayName: c.displayName, score: c.score })),
              committedBy ?? null,
            ),
          });
        }
        if (auditEntries.length > 0) await tx.auditLog.createMany({ data: auditEntries });

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
      if (mapping.learnedExternalIds?.length) {
        await tx.externalIdMap.deleteMany({
          where: { sourceSystem: SOURCE_SYSTEM, externalId: { in: mapping.learnedExternalIds } },
        });
      }
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
