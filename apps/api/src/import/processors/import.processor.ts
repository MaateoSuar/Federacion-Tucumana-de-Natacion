import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MeetFormat } from '@prisma/client';
import { IMPORT_QUEUE } from '../import.queue';
import { ImportRepository } from '../import.repository';
import { FormatDetector } from '../../ingest/format-detector';
import { MeetManagerPdfAdapter } from '../../ingest/adapters/meet-manager-pdf/meet-manager-pdf-adapter';
import { StubMatcher } from '../matching/stub-matcher';
import { readFileSync } from 'fs';

export interface ProcessImportJobData {
  jobId: string;
  filePath: string;
}

@Processor(IMPORT_QUEUE)
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    private readonly repo: ImportRepository,
    private readonly formatDetector: FormatDetector,
    private readonly pdfAdapter: MeetManagerPdfAdapter,
    private readonly stubMatcher: StubMatcher,
  ) {
    super();
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

      // Por ahora solo soportamos PDF; HY3/CSV/Excel se agregan en M8+
      if (detected !== 'pdf') {
        await this.repo.updateStatus(jobId, 'failed', {
          issues: [
            {
              severity: 'FATAL',
              stage: 'DETECT',
              message: `Formato "${detected}" aún no soportado. Usá PDF por ahora.`,
            },
          ],
        });
        return;
      }

      const normalizedMeet = await this.pdfAdapter.parse(fileBuffer, filePath);

      // ─── 2. VALIDATE ────────────────────────────────────────────
      await this.repo.updateStatus(jobId, 'validating');

      const issues = [...normalizedMeet.issues];
      const okRows = normalizedMeet.results.filter(
        (r) => r.status === 'OK' && r.final_time_ms !== null,
      ).length;
      const errorRows = normalizedMeet.results.length - okRows;

      // ─── 3. MATCH (stub) ────────────────────────────────────────
      await this.repo.updateStatus(jobId, 'matching');

      let newSwimmers = 0;
      let matchedSwimmers = 0;
      for (const swimmer of normalizedMeet.swimmers) {
        const result = this.stubMatcher.matchSwimmer(swimmer);
        if (result.status === 'new') newSwimmers++;
        else matchedSwimmers++;
      }

      // ─── 4. SAVE STAGING ────────────────────────────────────────
      await this.repo.saveStagingPayload(jobId, normalizedMeet, MeetFormat.pdf, {
        newSwimmersCount: newSwimmers,
        matchedSwimmersCount: matchedSwimmers,
        meetName: normalizedMeet.meet.name,
        meetCourse: normalizedMeet.meet.course === 25 ? 'P25' : 'P50',
        externalMeetId: normalizedMeet.meet.external_meet_id,
      });

      await this.repo.updateStatus(jobId, 'preview', {
        totalRows: normalizedMeet.results.length,
        okRows,
        errorRows,
        issues: issues as unknown as object[],
      });

      this.logger.log(`Job ${jobId} ready for preview — ${okRows} ok, ${errorRows} errors`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Job ${jobId} failed: ${message}`);
      await this.repo.updateStatus(jobId, 'failed', {
        issues: [{ severity: 'FATAL', stage: 'PARSE', message }],
      });
    }
  }
}
