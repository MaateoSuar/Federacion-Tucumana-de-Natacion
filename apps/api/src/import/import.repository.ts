import { Injectable } from '@nestjs/common';
import { ImportStatus, ImportSource, MeetFormat, Prisma, PoolLength } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NormalizedMeet } from '../ingest/types/normalized-meet.types';
import type { MatchResultsPayload } from './matching/types';

@Injectable()
export class ImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByHash(fileHash: string) {
    return this.prisma.importJob.findUnique({
      where: { fileHash },
      include: { meetManagerImport: true },
    });
  }

  findById(id: string) {
    return this.prisma.importJob.findUnique({
      where: { id },
      include: { meetManagerImport: true },
    });
  }

  createJob(data: {
    fileHash: string;
    fileUrl: string;
    source: ImportSource;
    uploadedBy: string;
  }) {
    return this.prisma.importJob.create({
      data: {
        fileHash: data.fileHash,
        fileUrl: data.fileUrl,
        source: data.source,
        uploadedBy: data.uploadedBy,
        status: 'uploaded',
      },
    });
  }

  updateStatus(
    jobId: string,
    status: ImportStatus,
    extra?: Partial<Prisma.ImportJobUpdateInput>,
  ) {
    return this.prisma.importJob.update({
      where: { id: jobId },
      data: { status, ...extra },
    });
  }

  saveStagingPayload(
    jobId: string,
    payload: NormalizedMeet,
    format: MeetFormat,
    stats: {
      newSwimmersCount: number;
      matchedSwimmersCount: number;
      recordsDetectedCount?: number;
      externalMeetId?: string;
      meetName?: string;
      meetCourse?: PoolLength;
      matchResults?: MatchResultsPayload;
    },
  ) {
    return this.prisma.meetManagerImport.upsert({
      where: { importJobId: jobId },
      create: {
        importJobId: jobId,
        format,
        parsedPayload: payload as unknown as Prisma.InputJsonValue,
        newSwimmersCount: stats.newSwimmersCount,
        matchedSwimmersCount: stats.matchedSwimmersCount,
        recordsDetectedCount: stats.recordsDetectedCount ?? 0,
        externalMeetId: stats.externalMeetId,
        meetName: stats.meetName,
        meetCourse: stats.meetCourse,
        matchResults: stats.matchResults as unknown as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
      update: {
        format,
        parsedPayload: payload as unknown as Prisma.InputJsonValue,
        newSwimmersCount: stats.newSwimmersCount,
        matchedSwimmersCount: stats.matchedSwimmersCount,
        recordsDetectedCount: stats.recordsDetectedCount ?? 0,
        externalMeetId: stats.externalMeetId,
        meetName: stats.meetName,
        meetCourse: stats.meetCourse,
        matchResults: stats.matchResults as unknown as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
    });
  }

  saveMapping(jobId: string, mapping: Record<string, unknown>) {
    return this.prisma.meetManagerImport.update({
      where: { importJobId: jobId },
      data: { mapping: mapping as Prisma.InputJsonValue },
    });
  }
}
