import { readFileSync } from 'fs';
import type { INestApplicationContext } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportService } from '../import.service';
import { ImportRepository } from '../import.repository';
import { HOMOLOGATION_QUEUE } from '../../homologation/homologation.queue';
import type { MatchResultsPayload } from '../matching/types';
import type { NormalizedMeet } from '../../ingest/types/normalized-meet.types';
import type { ImportIssue } from '../../ingest/types/import-issue.types';
import type { CommitOptions } from '../processors/commit.processor';
import { applyConservativePolicy, type PendingIdentity } from './match-policy';
import type { PlannedTournament, ScannedFile } from './drive-scan';

export const SYSTEM_USER_EMAIL = 'sistema-importacion@ftn.local';

export interface LoaderOptions {
  /** Homologar (y por lo tanto evaluar récords/rankings) también torneos NOA y Nacionales. */
  homologateNonProvincial: boolean;
  /** Reimporta con otro hash (mismo contenido) los primeros N archivos para probar la regla 5. */
  probeRehash: number;
  log: (line: string) => void;
}

export interface SkippedSummary {
  already_in_tournament: number;
  duplicate_in_file: number;
  gender_mismatch: number;
}

export interface FileOutcome {
  file: string;
  hash: string;
  status: 'cargado' | 'ya-cargado' | 'error' | 'revertido';
  jobId?: string;
  /** Filas que leyó el lector. */
  readerRows: number;
  /** Resultados guardados en la base por este archivo. */
  inserted: number;
  skipped: SkippedSummary;
  /** Filas del lector que no están ni insertadas ni explicadas: debería ser siempre 0. */
  unexplained: number;
  newSwimmers: number;
  newClubs: number;
  pendingIdentities: number;
  parseErrors: number;
  unrecognizedLines: number;
  error?: string;
}

export interface TournamentCounts {
  events: number;
  heats: number;
  results: number;
  withSeedTime: number;
  homologated: number;
  records: number;
}

export interface TournamentOutcome {
  folder: string;
  year: number;
  name: string;
  nameSource: string;
  scope: string;
  pool: number;
  startDate: string;
  endDate: string;
  datesEstimated: boolean;
  tournamentId: string | null;
  files: FileOutcome[];
  readerRows: number;
  counts: TournamentCounts | null;
  homologation: 'homologado' | 'omitido (alcance no provincial)' | 'no aplica';
  notes: string[];
}

export interface GenderMismatch {
  file: string;
  swimmerRef: string;
  detail: string;
  line: number;
}

export interface AutoRecord {
  event: string;
  category: string;
  gender: string;
  pool: string;
  timeMs: number;
  previousTimeMs: number | null;
  swimmer: string;
  club: string;
  clubProvince: string | null;
  tournament: string;
  isCurrent: boolean;
}

export interface LoadReport {
  tournaments: TournamentOutcome[];
  pendingIdentities: PendingIdentity[];
  genderMismatches: GenderMismatch[];
  autoRecords: AutoRecord[];
  probes: Array<{ file: string; inserted: number; skippedAlreadyInTournament: number; ok: boolean; error?: string }>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Reintenta una lectura si la base se cortó un instante (pasó una vez con Docker bajo carga). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

const emptySkipped = (): SkippedSummary => ({ already_in_tournament: 0, duplicate_in_file: 0, gender_mismatch: 0 });

interface StagedJob {
  id: string;
  status: string;
}

export class DriveLoader {
  private readonly prisma: PrismaService;
  private readonly repo: ImportRepository;
  private readonly importService: ImportService;
  private readonly homologationQueue: Queue;
  private systemUserId = '';

  constructor(
    app: INestApplicationContext,
    private readonly opts: LoaderOptions,
  ) {
    this.prisma = app.get(PrismaService, { strict: false });
    this.repo = app.get(ImportRepository, { strict: false });
    this.importService = app.get(ImportService, { strict: false });
    this.homologationQueue = app.get<Queue>(getQueueToken(HOMOLOGATION_QUEUE), { strict: false });
  }

  /** Usuario de sistema para la carga: no puede iniciar sesión (hash inválido a propósito). */
  private async ensureSystemUser(): Promise<string> {
    const existing = await this.prisma.user.findUnique({ where: { email: SYSTEM_USER_EMAIL } });
    if (existing) return existing.id;
    const created = await this.prisma.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        passwordHash: '!sin-acceso',
        firstName: 'Sistema',
        lastName: 'Importación',
        primaryRole: 'ADMIN',
        isActive: false,
      },
    });
    return created.id;
  }

  async load(plans: PlannedTournament[]): Promise<LoadReport> {
    const startedAt = new Date();
    this.systemUserId = await this.ensureSystemUser();
    const report: LoadReport = { tournaments: [], pendingIdentities: [], genderMismatches: [], autoRecords: [], probes: [] };

    // En orden cronológico: así la cadena de récords (vigente / reemplazado) refleja la historia real.
    const ordered = [...plans].sort(
      (a, b) => a.dates.startDate.localeCompare(b.dates.startDate) || a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name),
    );
    for (const plan of ordered) {
      this.opts.log(`\n== ${plan.folder}/${plan.year} · ${plan.name} (${plan.scope}, ${plan.pool} m, ${plan.files.length} archivo/s)`);
      report.tournaments.push(await this.loadTournament(plan, report));
    }

    if (this.opts.probeRehash > 0) {
      const loaded = report.tournaments.filter((t) => t.tournamentId);
      let remaining = this.opts.probeRehash;
      for (const t of loaded) {
        const plan = plans.find((p) => p.name === t.name && p.folder === t.folder && p.year === t.year);
        if (!plan || !t.tournamentId) continue;
        for (const file of plan.files) {
          if (remaining <= 0) break;
          remaining--;
          report.probes.push(await this.probeRehash(file, t.tournamentId));
        }
      }
    }
    report.autoRecords = await this.autoPublishedRecords(startedAt);
    return report;
  }

  private async loadTournament(plan: PlannedTournament, report: LoadReport): Promise<TournamentOutcome> {
    const outcome: TournamentOutcome = {
      folder: plan.folder,
      year: plan.year,
      name: plan.name,
      nameSource: plan.nameSource,
      scope: plan.scope,
      pool: plan.pool,
      startDate: plan.dates.startDate,
      endDate: plan.dates.endDate,
      datesEstimated: plan.dates.estimated,
      tournamentId: null,
      files: [],
      readerRows: 0,
      counts: null,
      homologation: 'no aplica',
      notes: [...plan.notes],
    };

    const homologate = plan.scope === 'provincial' || this.opts.homologateNonProvincial;
    outcome.homologation = homologate ? 'homologado' : 'omitido (alcance no provincial)';
    let tournamentId: string | null = null;

    for (const file of plan.files) {
      try {
        const fo = await this.loadFile(file, plan, tournamentId, homologate, report);
        outcome.files.push(fo.outcome);
        if (fo.tournamentId) tournamentId = fo.tournamentId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.log(`   ERROR ${file.fileName}: ${message}`);
        outcome.files.push({
          file: file.fileName,
          hash: file.hash,
          status: 'error',
          readerRows: file.summary?.rows ?? 0,
          inserted: 0,
          skipped: emptySkipped(),
          unexplained: 0,
          newSwimmers: 0,
          newClubs: 0,
          pendingIdentities: 0,
          parseErrors: 0,
          unrecognizedLines: 0,
          error: message,
        });
      }
    }

    outcome.tournamentId = tournamentId;
    outcome.readerRows = outcome.files.reduce((a, f) => a + f.readerRows, 0);
    if (tournamentId) {
      await this.drainHomologation();
      outcome.counts = await this.countTournament(tournamentId);
    }
    return outcome;
  }

  private async loadFile(
    file: ScannedFile,
    plan: PlannedTournament,
    knownTournamentId: string | null,
    homologate: boolean,
    report: LoadReport,
  ): Promise<{ outcome: FileOutcome; tournamentId: string | null }> {
    const base = (): FileOutcome => ({
      file: file.fileName,
      hash: file.hash,
      status: 'cargado',
      readerRows: file.summary?.rows ?? 0,
      inserted: 0,
      skipped: emptySkipped(),
      unexplained: 0,
      newSwimmers: 0,
      newClubs: 0,
      pendingIdentities: 0,
      parseErrors: 0,
      unrecognizedLines: 0,
    });

    let job: StagedJob | null = await this.repo.findByHash(file.hash);

    if (job?.status === 'confirmed') {
      const confirmedId = job.id;
      const full = await withRetry(() => this.repo.findById(confirmedId));
      this.opts.log(`   = ${file.fileName}: ya estaba cargado (job ${job.id.slice(0, 8)}).`);
      const o = base();
      o.status = 'ya-cargado';
      o.jobId = job.id;
      await this.fillFromJob(o, job.id);
      return { outcome: o, tournamentId: full?.tournamentId ?? knownTournamentId };
    }
    if (job?.status === 'rolled_back') {
      const o = base();
      o.status = 'revertido';
      o.jobId = job.id;
      o.error = 'Este archivo ya se importó y se revirtió; el hash sigue registrado. No se recarga solo.';
      return { outcome: o, tournamentId: knownTournamentId };
    }
    const STUCK = ['uploaded', 'parsing', 'validating', 'matching'];
    if (job && (job.status === 'failed' || STUCK.includes(job.status))) {
      // Un intento anterior falló o quedó colgado antes de guardar nada (p. ej. se cortó la conexión
      // a la base): no hay datos de competencia asociados, se descarta para poder reintentar.
      await this.discardJob(job.id);
      job = null;
    }

    let jobId: string;
    if (job) {
      jobId = job.id; // quedó en preview de una corrida cortada: se retoma
    } else {
      const meetOverrides = {
        name: plan.name,
        startDate: plan.dates.startDate,
        endDate: plan.dates.endDate,
      };
      const buffer = readFileSync(file.absPath);
      const up = await this.importService.upload(
        { buffer, originalname: file.fileName } as Express.Multer.File,
        this.systemUserId,
        meetOverrides,
      );
      jobId = up.jobId;
    }
    const staged = await this.waitForPreview(jobId);

    const payload = staged.meetManagerImport?.parsedPayload as unknown as NormalizedMeet;
    const matchResults = staged.meetManagerImport?.matchResults as unknown as MatchResultsPayload;
    const o = base();
    o.jobId = jobId;
    o.readerRows = payload.results.length;

    const pending = applyConservativePolicy(matchResults, `${file.folder}/${file.year}/${file.fileName}`, this.systemUserId, new Date().toISOString());
    if (pending.length > 0) await this.repo.saveMatchResults(jobId, matchResults);
    report.pendingIdentities.push(...pending);
    o.pendingIdentities = pending.length;

    const options: CommitOptions = {
      homologation: homologate ? 'await' : 'skip',
      transactionTimeoutMs: 10 * 60_000,
      ...(knownTournamentId
        ? { tournamentId: knownTournamentId }
        : {
            tournament: {
              name: plan.name,
              startDate: plan.dates.startDate,
              endDate: plan.dates.endDate,
              scope: plan.scope,
              type: plan.type,
            },
          }),
    };
    const tournamentId = (await this.importService.commit(jobId, this.systemUserId, options)).tournamentId;

    await this.fillFromJob(o, jobId, file, report);
    this.opts.log(
      `   + ${file.fileName}: ${o.inserted}/${o.readerRows} resultados` +
        (o.pendingIdentities ? `, ${o.pendingIdentities} identidades para revisar` : '') +
        (o.unexplained ? `, ${o.unexplained} SIN EXPLICAR` : ''),
    );
    return { outcome: o, tournamentId };
  }

  /** Completa conteos del archivo desde el job confirmado (payload, issues y mapa de rollback). */
  private async fillFromJob(o: FileOutcome, jobId: string, file?: ScannedFile, report?: LoadReport): Promise<void> {
    const full = await withRetry(() => this.repo.findById(jobId));
    if (!full?.meetManagerImport) return;
    const payload = full.meetManagerImport.parsedPayload as unknown as NormalizedMeet;
    const mapping = (full.meetManagerImport.mapping ?? {}) as {
      resultIds?: string[];
      newSwimmerIds?: string[];
      newClubIds?: string[];
      skippedResults?: Array<{ reason: keyof SkippedSummary; source_line: number; swimmer_ref: string; detail: string }>;
    };
    const issues = (full.issues as unknown as ImportIssue[] | null) ?? [];
    o.readerRows = payload.results.length;
    o.inserted = mapping.resultIds?.length ?? 0;
    o.newSwimmers = mapping.newSwimmerIds?.length ?? 0;
    o.newClubs = mapping.newClubIds?.length ?? 0;
    o.parseErrors = issues.filter((i) => i.severity === 'ERROR' || i.severity === 'FATAL').length;
    o.unrecognizedLines = issues.filter((i) => i.message.startsWith('Línea no reconocida')).length;
    o.skipped = emptySkipped();
    for (const s of mapping.skippedResults ?? []) {
      o.skipped[s.reason] = (o.skipped[s.reason] ?? 0) + 1;
      if (s.reason === 'gender_mismatch' && report && file) {
        report.genderMismatches.push({
          file: `${file.folder}/${file.year}/${file.fileName}`,
          swimmerRef: s.swimmer_ref,
          detail: s.detail,
          line: s.source_line,
        });
      }
    }
    const explained = o.inserted + o.skipped.already_in_tournament + o.skipped.duplicate_in_file + o.skipped.gender_mismatch;
    o.unexplained = o.readerRows - explained;
  }

  private async waitForPreview(jobId: string, timeoutMs = 15 * 60_000) {
    const started = Date.now();
    for (;;) {
      const job = await withRetry(() => this.repo.findById(jobId));
      if (!job) throw new Error(`El job ${jobId} desapareció.`);
      if (job.status === 'preview') return job;
      if (job.status === 'failed') {
        const issues = (job.issues as unknown as ImportIssue[] | null) ?? [];
        throw new Error(`El análisis falló: ${issues.map((i) => i.message).join(' | ') || 'sin detalle'}`);
      }
      if (job.status === 'confirmed') throw new Error('El job ya estaba confirmado.');
      if (Date.now() - started > timeoutMs) throw new Error(`Tiempo agotado esperando el análisis (estado: ${job.status}).`);
      await sleep(400);
    }
  }

  private async discardJob(jobId: string): Promise<void> {
    await this.prisma.meetManagerImport.deleteMany({ where: { importJobId: jobId } });
    await this.prisma.importJob.delete({ where: { id: jobId } });
  }

  /** Récords que se publicaron solos durante la carga (regla 4), para que un Admin los revise. */
  async autoPublishedRecords(since: Date): Promise<AutoRecord[]> {
    const rows = await this.prisma.record.findMany({
      where: { createdAt: { gte: since }, sourceResultId: { not: null } },
      include: {
        swimmer: { select: { firstName: true, lastName: true } },
        club: { select: { name: true, province: true } },
        eventDefinition: { select: { code: true } },
        category: { select: { name: true } },
        previousRecord: { select: { timeMs: true } },
        sourceResult: { select: { event: { select: { tournament: { select: { name: true, scope: true } } } } } },
      },
      orderBy: [{ recordDate: 'asc' }],
    });
    return rows.map((r) => ({
      event: r.eventDefinition.code,
      category: r.category.name,
      gender: r.gender,
      pool: r.poolLength,
      timeMs: r.timeMs,
      previousTimeMs: r.previousRecord?.timeMs ?? null,
      swimmer: `${r.swimmer.firstName} ${r.swimmer.lastName}`,
      club: r.club.name,
      clubProvince: r.club.province,
      tournament: r.sourceResult?.event.tournament.name ?? '',
      isCurrent: r.isCurrent,
    }));
  }

  /** Espera a que la cola de homologación (PB, rankings, récords) termine lo encolado. */
  private async drainHomologation(timeoutMs = 30 * 60_000): Promise<void> {
    const started = Date.now();
    for (;;) {
      const c = await this.homologationQueue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      const busy = (c['waiting'] ?? 0) + (c['active'] ?? 0) + (c['delayed'] ?? 0) + (c['prioritized'] ?? 0);
      if (busy === 0) return;
      if (Date.now() - started > timeoutMs) throw new Error('Tiempo agotado esperando la cola de homologación.');
      await sleep(500);
    }
  }

  private async countTournament(tournamentId: string): Promise<TournamentCounts> {
    const [events, heats, results, withSeedTime, homologated, records] = await Promise.all([
      this.prisma.event.count({ where: { tournamentId } }),
      this.prisma.heat.count({ where: { event: { tournamentId } } }),
      this.prisma.result.count({ where: { event: { tournamentId } } }),
      this.prisma.result.count({ where: { event: { tournamentId }, seedTime: { not: null } } }),
      this.prisma.result.count({ where: { event: { tournamentId }, homologated: true } }),
      this.prisma.record.count({ where: { sourceResult: { event: { tournamentId } } } }),
    ]);
    return { events, heats, results, withSeedTime, homologated, records };
  }

  /**
   * Prueba de idempotencia a nivel de base: sube el mismo contenido con otro hash (se le agrega
   * una marca al final del PDF), lo confirma dentro del torneo ya cargado y verifica que no
   * agregue ningún resultado. Después descarta el job de prueba.
   */
  private async probeRehash(file: ScannedFile, tournamentId: string) {
    const label = `${file.folder}/${file.year}/${file.fileName}`;
    try {
      const buffer = Buffer.concat([readFileSync(file.absPath), Buffer.from('\n%probe-rehash\n')]);
      const up = await this.importService.upload({ buffer, originalname: file.fileName } as Express.Multer.File, this.systemUserId);
      if (up.existing) throw new Error('El hash de prueba ya existía.');
      const staged = await this.waitForPreview(up.jobId);
      const matchResults = staged.meetManagerImport?.matchResults as unknown as MatchResultsPayload;
      const pending = applyConservativePolicy(matchResults, label, this.systemUserId, new Date().toISOString());
      if (pending.length > 0) await this.repo.saveMatchResults(up.jobId, matchResults);
      await this.importService.commit(up.jobId, this.systemUserId, { tournamentId, homologation: 'skip', transactionTimeoutMs: 10 * 60_000 });
      const o = { ...emptyOutcome(file) };
      await this.fillFromJob(o, up.jobId);
      // Se deshace el import de prueba: no deja nada propio (no inserta) salvo el job.
      await this.importService.rollback(up.jobId);
      await this.discardJob(up.jobId);
      const ok = o.inserted === 0 && o.newSwimmers === 0 && o.newClubs === 0;
      this.opts.log(`   ~ probe ${file.fileName}: +${o.inserted} resultados (esperado 0), ${o.skipped.already_in_tournament} ya presentes -> ${ok ? 'OK' : 'FALLA'}`);
      return { file: label, inserted: o.inserted, skippedAlreadyInTournament: o.skipped.already_in_tournament, ok };
    } catch (err) {
      return { file: label, inserted: -1, skippedAlreadyInTournament: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function emptyOutcome(file: ScannedFile): FileOutcome {
  return {
    file: file.fileName,
    hash: file.hash,
    status: 'cargado',
    readerRows: 0,
    inserted: 0,
    skipped: emptySkipped(),
    unexplained: 0,
    newSwimmers: 0,
    newClubs: 0,
    pendingIdentities: 0,
    parseErrors: 0,
    unrecognizedLines: 0,
  };
}
