import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MeetFormat } from '@prisma/client';
import { IMPORT_QUEUE } from '../import.queue';
import { ImportRepository } from '../import.repository';
import { FormatDetector } from '../../ingest/format-detector';
import { MeetManagerPdfAdapter } from '../../ingest/adapters/meet-manager-pdf/meet-manager-pdf-adapter';
import { CsvAdapter } from '../../ingest/adapters/csv/csv-adapter';
import { ExcelAdapter } from '../../ingest/adapters/excel/excel-adapter';
import { AthleteMatcher } from '../matching/athlete-matcher';
import { ClubMatcher } from '../matching/club-matcher';
import { DuplicateDetector } from '../matching/duplicate-detector';
import type { MatchResultsPayload } from '../matching/types';
import type { FormatAdapter } from '../../ingest/types/format-adapter.interface';
import { readFileSync } from 'fs';

export interface ProcessImportJobData {
  jobId: string;
  filePath: string;
}

const SOURCE_SYSTEM = 'meet_manager';

@Processor(IMPORT_QUEUE)
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  private readonly adapters: FormatAdapter[];

  constructor(
    private readonly repo: ImportRepository,
    private readonly formatDetector: FormatDetector,
    private readonly pdfAdapter: MeetManagerPdfAdapter,
    private readonly csvAdapter: CsvAdapter,
    private readonly excelAdapter: ExcelAdapter,
    private readonly athleteMatcher: AthleteMatcher,
    private readonly clubMatcher: ClubMatcher,
    private readonly duplicateDetector: DuplicateDetector,
  ) {
    super();
    this.adapters = [pdfAdapter, csvAdapter, excelAdapter];
  }

  async process(job: Job<ProcessImportJobData>): Promise<void> {
    const { jobId, filePath } = job.data;
    this.logger.log(`Processing import job ${jobId}`);

    try {
      // ─── 1. PARSE ───────────────────────────────────────────────
      await this.repo.updateStatus(jobId, 'parsing');

      const fileBuffer = readFileSync(filePath) as Buffer;
      const detected = this.formatDetector.detect(filePath, fileBuffer);

      if (!detected) {
        await this.repo.updateStatus(jobId, 'failed', {
          issues: [
            {
              severity: 'FATAL',
              stage: 'DETECT',
              message: 'Formato de archivo no reconocido.',
              suggestion: 'Subir un archivo PDF, CSV, Excel o HY3 de Meet Manager.',
            },
          ],
        });
        return;
      }

      const adapter = this.adapters.find((a) => a.detect(filePath, fileBuffer.slice(0, 512).toString('utf8')));

      if (!adapter) {
        await this.repo.updateStatus(jobId, 'failed', {
          issues: [
            {
              severity: 'FATAL',
              stage: 'DETECT',
              message: `Formato "${detected}" no soportado. Usá PDF, CSV o Excel.`,
            },
          ],
        });
        return;
      }

      const normalizedMeet = await adapter.parse(fileBuffer, filePath);

      // ─── 2. VALIDATE ────────────────────────────────────────────
      await this.repo.updateStatus(jobId, 'validating');

      const issues = [...normalizedMeet.issues];
      const okRows = normalizedMeet.results.filter(
        (r) => r.status === 'OK' && r.final_time_ms !== null,
      ).length;
      const errorRows = normalizedMeet.results.length - okRows;

      // ─── 3. MATCH ───────────────────────────────────────────────
      await this.repo.updateStatus(jobId, 'matching');

      // Detectar duplicados intra-archivo
      const { issues: dupIssues } = this.duplicateDetector.detectInFile(normalizedMeet);
      issues.push(...dupIssues);

      // Matching de clubes
      const clubResults = await Promise.all(
        normalizedMeet.clubs.map((club) =>
          this.clubMatcher.match(club, SOURCE_SYSTEM),
        ),
      );

      // Matching de nadadores
      const swimmerResults = await Promise.all(
        normalizedMeet.swimmers.map((swimmer) =>
          this.athleteMatcher.match(swimmer, SOURCE_SYSTEM),
        ),
      );

      const matchResults: MatchResultsPayload = {
        swimmers: swimmerResults,
        clubs: clubResults,
      };

      const newSwimmers = swimmerResults.filter((r) => r.confidence === 'none').length;
      const matchedSwimmers = swimmerResults.filter((r) => r.swimmerId !== null).length;

      // Emitir INFO por cada atleta nuevo detectado
      for (const sr of swimmerResults) {
        if (sr.confidence === 'none') {
          issues.push({
            severity: 'INFO',
            stage: 'match',
            message: `Atleta nuevo detectado: "${sr.displayName}" (ID externo: ${sr.swimmerRef}).`,
            suggested_action: 'Se creará como nuevo nadador al confirmar el import.',
          });
        } else if (sr.requiresConfirmation) {
          issues.push({
            severity: 'WARNING',
            stage: 'match',
            message: `Atleta requiere confirmación: "${sr.displayName}" — match ${sr.confidence} por ${sr.matchedBy}.`,
            suggested_action: 'Revisá en el preview antes de confirmar.',
          });
        }
      }

      // ─── 4. SAVE STAGING ────────────────────────────────────────
      const meetFormat =
        detected === 'csv' ? MeetFormat.csv
        : detected === 'excel' ? MeetFormat.excel
        : MeetFormat.pdf;

      await this.repo.saveStagingPayload(jobId, normalizedMeet, meetFormat, {
        newSwimmersCount: newSwimmers,
        matchedSwimmersCount: matchedSwimmers,
        meetName: normalizedMeet.meet.name,
        meetCourse: normalizedMeet.meet.course === 25 ? 'P25' : 'P50',
        externalMeetId: normalizedMeet.meet.external_meet_id,
        matchResults,
      });

      await this.repo.updateStatus(jobId, 'preview', {
        totalRows: normalizedMeet.results.length,
        okRows,
        errorRows,
        issues: issues as unknown as object[],
      });

      this.logger.log(`Job ${jobId} ready for preview — ${okRows} ok, ${errorRows} errors, ${newSwimmers} new swimmers`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Job ${jobId} failed: ${message}`);
      await this.repo.updateStatus(jobId, 'failed', {
        issues: [{ severity: 'FATAL', stage: 'PARSE', message }],
      });
    }
  }
}
