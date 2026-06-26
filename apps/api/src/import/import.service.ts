import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ImportRepository } from './import.repository';
import { CommitProcessor } from './processors/commit.processor';
import { IMPORT_QUEUE, PROCESS_JOB } from './import.queue';
import type { ProcessImportJobData } from './processors/import.processor';
import type { PreviewResponseDto, SwimmerMatchGroups, ClubMatchGroups } from './dto/preview-response.dto';
import type { NormalizedMeet } from '../ingest/types/normalized-meet.types';
import type { ImportIssue } from '../ingest/types/import-issue.types';
import type { MatchResultsPayload, SwimmerMatchResult, ClubMatchResult } from './matching/types';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'imports');

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectQueue(IMPORT_QUEUE) private readonly importQueue: Queue,
    private readonly repo: ImportRepository,
    private readonly commitProcessor: CommitProcessor,
  ) {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  async upload(file: Express.Multer.File, uploadedBy: string): Promise<{ jobId: string; existing: boolean }> {
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.repo.findByHash(fileHash);
    if (existing && existing.status !== 'failed') {
      this.logger.log(`File hash ${fileHash.slice(0, 8)} already imported — returning existing job ${existing.id}`);
      return { jobId: existing.id, existing: true };
    }

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(UPLOAD_DIR, filename);
    writeFileSync(filePath, file.buffer);

    const job = await this.repo.createJob({
      fileHash,
      fileUrl: `/uploads/imports/${filename}`,
      source: 'meet_manager',
      uploadedBy,
    });

    await this.importQueue.add(PROCESS_JOB, {
      jobId: job.id,
      filePath,
    } satisfies ProcessImportJobData);

    this.logger.log(`Import job ${job.id} created and enqueued`);
    return { jobId: job.id, existing: false };
  }

  async getJob(jobId: string) {
    const job = await this.repo.findById(jobId);
    if (!job) throw new NotFoundException('Import job no encontrado.');
    return job;
  }

  async getPreview(jobId: string): Promise<PreviewResponseDto> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new NotFoundException('Import job no encontrado.');

    if (!['preview', 'confirmed', 'rolled_back'].includes(job.status)) {
      throw new BadRequestException(
        `Preview no disponible aún — estado actual: ${job.status}`,
      );
    }

    const staging = job.meetManagerImport;
    const payload = staging?.parsedPayload as unknown as NormalizedMeet | null;
    const issues = (job.issues as unknown as ImportIssue[]) ?? [];
    const matchResults = staging?.matchResults as unknown as MatchResultsPayload | null;

    const swimmerMatches = buildSwimmerGroups(matchResults?.swimmers ?? []);
    const clubMatches = buildClubGroups(matchResults?.clubs ?? []);

    const confirmationRequired =
      swimmerMatches.needsConfirmation.length + clubMatches.needsConfirmation.length;

    return {
      jobId: job.id,
      status: job.status,
      summary: {
        totalRows: job.totalRows ?? 0,
        okRows: job.okRows ?? 0,
        errorRows: job.errorRows ?? 0,
        warningCount: issues.filter((i) => i.severity === 'WARNING').length,
        newSwimmers: staging?.newSwimmersCount ?? 0,
        matchedSwimmers: staging?.matchedSwimmersCount ?? 0,
        confirmationRequired,
        newClubs: clubMatches.new.length,
        recordCandidates: staging?.recordsDetectedCount ?? 0,
      },
      issues,
      meetInfo: payload?.meet
        ? {
            name: payload.meet.name,
            venue: payload.meet.venue,
            course: payload.meet.course,
            startDate: payload.meet.start_date,
            endDate: payload.meet.end_date,
            source: payload.meet.source,
          }
        : null,
      swimmerMatches,
      clubMatches,
    };
  }

  async commit(jobId: string): Promise<{ tournamentId: string }> {
    const tournamentId = await this.commitProcessor.commit(jobId);
    return { tournamentId };
  }

  async rollback(jobId: string): Promise<void> {
    await this.commitProcessor.rollback(jobId);
  }
}

function buildSwimmerGroups(swimmers: SwimmerMatchResult[]): SwimmerMatchGroups {
  return {
    strong: swimmers.filter(
      (s) => (s.confidence === 'strong' || s.confidence === 'high') && !s.requiresConfirmation,
    ),
    needsConfirmation: swimmers.filter((s) => s.requiresConfirmation),
    new: swimmers.filter((s) => s.confidence === 'none'),
  };
}

function buildClubGroups(clubs: ClubMatchResult[]): ClubMatchGroups {
  return {
    strong: clubs.filter(
      (c) => (c.confidence === 'strong' || c.confidence === 'high') && !c.requiresConfirmation,
    ),
    needsConfirmation: clubs.filter((c) => c.requiresConfirmation),
    new: clubs.filter((c) => c.confidence === 'none'),
  };
}
