import { Injectable, BadRequestException, Logger, Optional, Inject } from '@nestjs/common';
import {
  Gender,
  ResultStatus,
  ResultSource,
  EventRound,
  Prisma,
  Scope,
  TournamentType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportRepository } from '../import.repository';
import { ResultsGateway } from '../../results-gateway/results.gateway';
import type {
  NormalizedMeet,
  NormalizedStroke,
  CompetitionType,
} from '../../ingest/types/normalized-meet.types';
import type { MatchResolution, MatchResultsPayload } from '../matching/types';
import { countPendingDecisions } from '../matching/pending-decisions';
import { AthleteMatcher } from '../matching/athlete-matcher';
import { ClubMatcher } from '../matching/club-matcher';
import { HomologationService } from '../../homologation/homologation.service';
import { resultIdempotencyKey } from '../matching/duplicate-detector';
import { BASE_ROUND, findPhantomFinals, resolveResultRounds } from '../rounds/resolve-result-rounds';

/** Cómo se encola la homologación del torneo tras confirmar. */
export type HomologationMode = 'background' | 'await' | 'skip';

/**
 * Opciones del commit. Sin opciones, el comportamiento es el de siempre: un torneo nuevo
 * provincial con los datos del encabezado del archivo.
 */
export interface CommitOptions {
  /** Importar dentro de este torneo existente (jornadas) en vez de crear uno nuevo. */
  tournamentId?: string;
  /** Datos del torneo a crear; se ignoran si hay `tournamentId`. Fechas en `YYYY-MM-DD`. */
  tournament?: {
    name?: string;
    venue?: string;
    startDate?: string;
    endDate?: string;
    scope?: Scope;
    type?: TournamentType;
  };
  /** Por defecto 'background' (no bloquea). 'skip' deja los resultados sin homologar. */
  homologation?: HomologationMode;
  /** Tiempo máximo de la transacción (ms). Por defecto 30 s. */
  transactionTimeoutMs?: number;
}

interface RollbackPayload {
  tournamentId: string | null;
  /** false = el import se hizo dentro de un torneo existente (no se borra al revertir). */
  tournamentCreated?: boolean;
  /** Series creadas por este import dentro de pruebas que ya existían. */
  newHeatIds?: string[];
  newSwimmerIds: string[];
  newClubIds: string[];
  newEventIds: string[];
  resultIds: string[];
  /** Grafías de nadadores/clubes aprendidas en este import (external_id_map). */
  learnedExternalIds: string[];
  /** Resultados del archivo que NO se insertaron, con el motivo (queda en `mapping`). */
  skippedResults: SkippedResult[];
}

interface SkippedResult {
  source_line: number;
  event_key: string;
  swimmer_ref: string;
  reason: 'gender_mismatch' | 'duplicate_in_file' | 'already_in_tournament';
  detail: string;
}

/**
 * Cada resultado debe apuntar a UNA prueba por `event_key`. Los payloads analizados
 * antes de M2b referencian por número de prueba, que Meet Manager reutiliza entre
 * categorías y géneros: confirmarlos duplica nados y cruza géneros. Se rechazan.
 */
function assertEventKeys(meet: NormalizedMeet): void {
  const stale =
    meet.events.some((e) => !e.event_key) || meet.results.some((r) => !r.event_key);
  if (stale) {
    throw new BadRequestException(
      'Este archivo se analizó con una versión anterior del lector y no se puede confirmar. ' +
        'Volvé a analizarlo antes de confirmar.',
    );
  }
  const keys = new Set<string>();
  for (const e of meet.events) {
    if (keys.has(e.event_key)) {
      throw new BadRequestException(`La prueba "${e.event_key}" está repetida en el archivo analizado.`);
    }
    keys.add(e.event_key);
  }
  const orphan = meet.results.find((r) => !keys.has(r.event_key));
  if (orphan) {
    throw new BadRequestException(
      `Hay resultados que apuntan a una prueba inexistente ("${orphan.event_key}", línea ${orphan.source_line}).`,
    );
  }
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

/** Nivel de la prueba en la base. Los tipos sin nivel claro (toma de tiempos, desconocido) quedan sin nivel. */
const LEVEL_MAP: Partial<Record<CompetitionType, string>> = {
  FEDERADOS: 'FEDERADOS',
  PROMOCIONALES: 'PROMOCIONAL',
  ESCUELA: 'ESCUELA',
};

function resolveCategory(
  categories: Array<{ id: string; minAge: number | null; maxAge: number | null }>,
  birthDate: Date | null,
  age: number | null,
  tournamentYear: number,
): string | null {
  let sportAge: number;
  if (birthDate) {
    sportAge = tournamentYear - birthDate.getUTCFullYear();
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
    @Optional() @Inject(HomologationService) private readonly homologationService: HomologationService | null,
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

  async commit(jobId: string, committedBy?: string, options: CommitOptions = {}): Promise<string> {
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
    assertEventKeys(normalizedMeet);
    const swimmerMatchByRef = new Map(matchResults.swimmers.map((m) => [m.swimmerRef, m]));
    const clubMatchByRef = new Map(matchResults.clubs.map((m) => [m.clubRef, m]));

    const rollback: RollbackPayload = {
      tournamentId: null,
      tournamentCreated: true,
      newHeatIds: [],
      newSwimmerIds: [],
      newClubIds: [],
      newEventIds: [],
      resultIds: [],
      learnedExternalIds: [],
      skippedResults: [],
    };

    // Torneo existente (jornadas): se importa adentro; la pileta tiene que coincidir (25 m y 50 m no se mezclan).
    const meetPool = normalizedMeet.meet.course === 25 ? 'P25' : 'P50';
    const target = options.tournamentId
      ? await this.prisma.tournament.findUnique({ where: { id: options.tournamentId } })
      : null;
    if (options.tournamentId && !target) {
      throw new BadRequestException('El torneo elegido para importar no existe.');
    }
    if (target && target.poolLength !== meetPool) {
      throw new BadRequestException(
        `El archivo es de pileta ${meetPool === 'P25' ? '25 m' : '50 m'} y el torneo es de ` +
          `${target.poolLength === 'P25' ? '25 m' : '50 m'}: no se mezclan.`,
      );
    }
    const override = options.tournament ?? {};

    // B-06: start_date puede estar vacío en CSV/Excel; usar año actual como fallback
    const parsedStartDate = target
      ? target.startDate
      : override.startDate
        ? new Date(override.startDate)
        : normalizedMeet.meet.start_date
          ? new Date(normalizedMeet.meet.start_date)
          : new Date();
    const parsedEndDate = override.endDate
      ? new Date(override.endDate)
      : normalizedMeet.meet.end_date
        ? new Date(normalizedMeet.meet.end_date)
        : parsedStartDate;
    const tournamentYear = parsedStartDate.getUTCFullYear();

    // Load categories once outside the transaction (read-only lookup)
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, minAge: true, maxAge: true },
    });

    // Find or create the season (outside tx — idempotent)
    let seasonId: string;
    if (target) {
      seasonId = target.seasonId;
    } else {
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
      seasonId = season.id;
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
        // Género del nadador en la base (el del registro existente manda sobre el del archivo)
        const swimmerGenderMap: Record<string, Gender> = {};
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
                select: { id: true, currentClubId: true, gender: true },
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
            swimmerGenderMap[sw.external_athlete_id] = existing.gender;
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
            swimmerGenderMap[sw.external_athlete_id] = gender;
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
        let tournamentId: string;
        if (target) {
          tournamentId = target.id;
          rollback.tournamentCreated = false;
        } else {
          const tournament = await tx.tournament.create({
            data: {
              name: override.name ?? normalizedMeet.meet.name,
              venue: override.venue ?? normalizedMeet.meet.venue,
              poolLength: meetPool,
              startDate: parsedStartDate,
              endDate: parsedEndDate,
              type: override.type ?? 'provincial',
              scope: override.scope ?? 'provincial',
              seasonId,
              status: 'finalizado',
            },
          });
          tournamentId = tournament.id;
        }
        rollback.tournamentId = tournamentId;

        // ── Events, Heats, Results ───────────────────────────────
        // Cada resultado pertenece a una sola prueba (event_key): se agrupan una vez
        // y cada uno se inserta exactamente una vez (regla 5).
        const resultsByEventKey = new Map<string, NormalizedMeet['results']>();
        for (const r of normalizedMeet.results) {
          const list = resultsByEventKey.get(r.event_key);
          if (list) list.push(r);
          else resultsByEventKey.set(r.event_key, [r]);
        }
        const swimmerByRef = new Map(normalizedMeet.swimmers.map((s) => [s.external_athlete_id, s]));
        // Jornada de pruebas vs final: si el nadador repite la prueba en otra jornada, ese nado es la final.
        const roundByResult = resolveResultRounds(normalizedMeet);
        const phantomFinals = findPhantomFinals(normalizedMeet);
        // Varias pruebas del archivo (una por categoría de edad) comparten Event y serie en la base
        const heatIdByEventAndNo = new Map<string, string>();
        const insertedKeys = new Set<string>();

        // Dentro de un torneo existente: nados que YA estaban cargados antes de este import (evento + nadador +
        // serie + carril). Sirve para que reimportar un archivo con el mismo contenido no duplique (regla 5).
        // No se agregan los nados de este mismo import: dos nados de un nadador en la misma prueba pueden
        // coincidir en serie y carril; son nados distintos.
        // La clave NO incluye la ronda del evento (prueba, nivel, nadador, serie, carril y tiempo): un torneo
        // cargado antes de separar la jornada de pruebas de la final tiene todo en un solo evento, y reimportar
        // no debe duplicar el nado de la mañana en un evento clasificatorio nuevo.
        const swimIdentity = (eventDefinitionId: string, level: string | null, swimmerId: string, heatNo: number | null, lane: number | null, timeMs: number | null) =>
          `${eventDefinitionId}|${level ?? ''}|${swimmerId}|${heatNo ?? ''}|${lane ?? ''}|${timeMs ?? ''}`;
        const existingSwims = new Set<string>();
        if (target) {
          const present = await tx.result.findMany({
            where: { event: { tournamentId } },
            select: {
              swimmerId: true, lane: true, finalTime: true,
              heat: { select: { heatNumber: true } },
              event: { select: { eventDefinitionId: true, level: true } },
            },
          });
          for (const r of present) {
            existingSwims.add(swimIdentity(r.event.eventDefinitionId, r.event.level, r.swimmerId, r.heat?.heatNumber ?? null, r.lane, r.finalTime));
          }
        }

        for (const event of normalizedMeet.events) {
          // Una prueba individual de género desconocido ("X") no es una prueba mixta: toma el género de
          // sus nadadores si todos son del mismo. Antes quedaba una definición "_X" aparte (guardada como
          // masculina) que partía el ranking y las marcas básicas de la prueba real.
          let evGender: 'M' | 'F' | 'X' = event.gender;
          if (evGender === 'X' && !event.is_relay) {
            const genders = new Set<Gender>();
            for (const r of resultsByEventKey.get(event.event_key) ?? []) {
              const sw = swimmerByRef.get(r.swimmer_ref);
              const g = sw ? swimmerGenderMap[sw.external_athlete_id] : undefined;
              if (g) genders.add(g);
            }
            if (genders.size === 1) evGender = [...genders][0] as 'M' | 'F';
          }
          const strokeCode = STROKE_CODE[event.stroke] ?? event.stroke;
          const code = `${event.distance}${strokeCode}_${evGender}`;

          let eventDef = await tx.eventDefinition.findUnique({ where: { code } });
          if (!eventDef) {
            eventDef = await tx.eventDefinition.create({
              data: {
                code,
                stroke: event.stroke,
                distance: event.distance,
                gender: evGender === 'F' ? 'F' : ('M' as Gender),
                isRelay: event.is_relay,
              },
            });
          }

          // Deduplicate: si esa prueba, nivel y ronda ya tienen un evento en este torneo, se reutiliza.
          // La ronda separa la jornada de pruebas (clasificatorio) de la final: son nados distintos.
          const level = LEVEL_MAP[event.competition_type] ?? null;
          const baseRound: EventRound = BASE_ROUND[event.round] ?? 'serie_unica';
          const eventIdByRound = new Map<EventRound, string>();
          const ensureEvent = async (round: EventRound): Promise<string> => {
            const known = eventIdByRound.get(round);
            if (known) return known;
            const existingDbEvent = await tx.event.findFirst({
              where: { tournamentId, eventDefinitionId: eventDef.id, level, round },
              select: { id: true },
            });
            let eventId: string;
            if (existingDbEvent) {
              eventId = existingDbEvent.id;
            } else {
              const created = await tx.event.create({
                data: {
                  tournamentId,
                  eventDefinitionId: eventDef.id,
                  categoryId: fallbackCategory.id,
                  round,
                  orderNo: event.event_no,
                  level,
                  status: 'finalizado',
                },
              });
              eventId = created.id;
              rollback.newEventIds.push(eventId);
            }
            eventIdByRound.set(round, eventId);
            return eventId;
          };

          const resultsForEvent = resultsByEventKey.get(event.event_key) ?? [];
          const eventGender: Gender | null =
            evGender === 'X' || event.is_relay ? null : evGender;
          // Una prueba sin resultados igual queda cargada (con la ronda que dice el archivo)
          if (resultsForEvent.length === 0) await ensureEvent(baseRound);

          for (const result of resultsForEvent) {
            const swimmer = swimmerByRef.get(result.swimmer_ref);
            if (!swimmer) continue;
            const swimmerId = swimmerIdMap[swimmer.external_athlete_id];
            if (!swimmerId) continue;

            const clubId = clubIdMap[swimmer.club_ref];
            if (!clubId) continue;

            // Un nadador no puede tener un resultado en la prueba del otro género
            // (pruebas mixtas y relevos aparte). No se inserta; queda registrado.
            const swimmerGender = swimmerGenderMap[swimmer.external_athlete_id];
            if (eventGender && swimmerGender && swimmerGender !== eventGender) {
              rollback.skippedResults.push({
                source_line: result.source_line,
                event_key: result.event_key,
                swimmer_ref: result.swimmer_ref,
                reason: 'gender_mismatch',
                detail: `Nadador ${swimmerGender} en prueba ${eventGender} (${code})`,
              });
              continue;
            }

            // Copia de la tabla de eliminatorias que el PDF también lista como final: no es un nado nuevo.
            if (phantomFinals.has(result)) {
              rollback.skippedResults.push({
                source_line: result.source_line,
                event_key: result.event_key,
                swimmer_ref: result.swimmer_ref,
                reason: 'duplicate_in_file',
                detail: 'Copia de la eliminatoria leída como final (misma serie, carril y tiempo)',
              });
              continue;
            }

            // Mismo nado repetido dentro del archivo: se usa el primero.
            const idempotencyKey = resultIdempotencyKey(result);
            if (insertedKeys.has(idempotencyKey)) {
              rollback.skippedResults.push({
                source_line: result.source_line,
                event_key: result.event_key,
                swimmer_ref: result.swimmer_ref,
                reason: 'duplicate_in_file',
                detail: `Repite ${idempotencyKey}`,
              });
              continue;
            }
            insertedKeys.add(idempotencyKey);

            const eventId = await ensureEvent(roundByResult.get(result) ?? baseRound);
            const swimKey = swimIdentity(eventDef.id, level, swimmerId, result.heat_no, result.lane_no, result.final_time_ms);
            if (existingSwims.has(swimKey)) {
              rollback.skippedResults.push({
                source_line: result.source_line,
                event_key: result.event_key,
                swimmer_ref: result.swimmer_ref,
                reason: 'already_in_tournament',
                detail: `Ya cargado en el torneo: ${swimKey}`,
              });
              continue;
            }

            const heatKey = `${eventId}|${result.heat_no}`;
            let heatId = heatIdByEventAndNo.get(heatKey);
            if (!heatId) {
              // La serie puede existir ya (otra jornada u otra categoría de la misma prueba).
              const existingHeat = await tx.heat.findUnique({
                where: { eventId_heatNumber: { eventId, heatNumber: result.heat_no } },
                select: { id: true },
              });
              if (existingHeat) {
                heatId = existingHeat.id;
              } else {
                const heat = await tx.heat.create({
                  data: { eventId, heatNumber: result.heat_no },
                });
                heatId = heat.id;
                rollback.newHeatIds?.push(heat.id);
              }
              heatIdByEventAndNo.set(heatKey, heatId);
            }

            // Resolve frozen category
            const birthDate = swimmer.birth_date ? new Date(swimmer.birth_date) : null;
            const catId =
              resolveCategory(categories, birthDate, swimmer.age ?? null, tournamentYear) ??
              fallbackCategory.id;

            const createdResult = await tx.result.create({
              data: {
                eventId,
                swimmerId,
                heatId,
                lane: result.lane_no,
                finalTime: result.final_time_ms,
                place: result.place ?? null,
                status: result.status as ResultStatus,
                dsqCode: result.dsq_code ?? null,
                reactionTime: result.reaction_time_ms ?? null,
                seedTime: result.seed_time_ms ?? null,
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
      { timeout: options.transactionTimeoutMs ?? 30_000 },
    );

    this.logger.log(
      `Job ${jobId} committed — tournament ${rollback.tournamentId}, ` +
        `${rollback.resultIds.length} results, ${rollback.newSwimmerIds.length} new swimmers`,
    );
    if (rollback.skippedResults.length > 0) {
      this.logger.warn(
        `Job ${jobId}: ${rollback.skippedResults.length} resultado(s) no insertados — ` +
          JSON.stringify(rollback.skippedResults.slice(0, 20)),
      );
    }

    if (this.resultsGateway && rollback.tournamentId) {
      this.resultsGateway.notifyResultsUpdated(rollback.tournamentId, rollback.newEventIds);
    }

    // B-10: encolar homologación del torneo recién importado (no bloquea, salvo que se pida esperar)
    const homologation = options.homologation ?? 'background';
    if (this.homologationService && rollback.tournamentId && homologation !== 'skip') {
      const pending = this.homologationService
        .homologateTournament(rollback.tournamentId, committedBy ?? 'system')
        .then(() => undefined)
        .catch((err: unknown) => {
          this.logger.warn(`Homologación post-commit falló para ${rollback.tournamentId}: ${String(err)}`);
        });
      if (homologation === 'await') await pending;
      else void pending;
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
      if (mapping.newHeatIds?.length) {
        await tx.heat.deleteMany({ where: { id: { in: mapping.newHeatIds } } });
      }
      if (mapping.newEventIds?.length) {
        await tx.heat.deleteMany({ where: { eventId: { in: mapping.newEventIds } } });
        await tx.event.deleteMany({ where: { id: { in: mapping.newEventIds } } });
      }
      // Solo se borra el torneo si lo creó este import y ningún otro import cuelga de él.
      if (mapping.tournamentId && mapping.tournamentCreated !== false) {
        const others = await tx.importJob.count({
          where: { tournamentId: mapping.tournamentId, id: { not: jobId } },
        });
        if (others === 0) await tx.tournament.delete({ where: { id: mapping.tournamentId } });
      }
      // B-19: solo borrar nadadores/clubes que no tienen resultados en otros torneos
      if (mapping.newSwimmerIds?.length) {
        const safeToDelete = await tx.result.groupBy({
          by: ['swimmerId'],
          where: { swimmerId: { in: mapping.newSwimmerIds }, id: { notIn: mapping.resultIds ?? [] } },
          _count: true,
        });
        const usedIds = new Set(safeToDelete.map((r) => r.swimmerId));
        const deletable = mapping.newSwimmerIds.filter((id) => !usedIds.has(id));
        if (deletable.length) {
          await tx.swimmer.deleteMany({ where: { id: { in: deletable } } });
        }
      }
      if (mapping.newClubIds?.length) {
        const safeToDelete = await tx.result.groupBy({
          by: ['clubId'],
          where: { clubId: { in: mapping.newClubIds }, id: { notIn: mapping.resultIds ?? [] } },
          _count: true,
        });
        const usedIds = new Set(safeToDelete.map((r) => r.clubId).filter(Boolean) as string[]);
        const deletable = mapping.newClubIds.filter((id) => !usedIds.has(id));
        if (deletable.length) {
          await tx.club.deleteMany({ where: { id: { in: deletable } } });
        }
      }
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: 'rolled_back' },
      });
    });

    this.logger.log(`Job ${jobId} rolled back.`);
  }
}
