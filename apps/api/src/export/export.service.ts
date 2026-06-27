import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { buildLenex } from './lenex-builder';
import { buildHtml } from './html-builder';
import { ExportDocType } from './dto/export-query.dto';
import type { TournamentExportData } from './export.types';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async exportLenex(tournamentId: string, type: ExportDocType, userId: string): Promise<Buffer> {
    if (type === ExportDocType.HEAT_SHEET) {
      throw new BadRequestException('El formato Lenex no soporta "heat_sheet". Use "entries" o "results".');
    }

    const data = await this.fetchAndValidate(tournamentId);
    const lenexType = type === ExportDocType.ENTRIES ? 'entries' : 'results';
    const content = buildLenex(data, lenexType);
    const filename = `lenex-${tournamentId}-${lenexType}-${data.seasonYear}.xml`;
    const fileUrl = this.saveFile(content, filename);

    await this.registerExport(tournamentId, 'lenex', type, fileUrl, userId);
    this.logger.log(`Lenex export generated for tournament ${tournamentId} [${lenexType}]`);

    return Buffer.from(content, 'utf-8');
  }

  async exportHtml(tournamentId: string, type: ExportDocType, userId: string): Promise<Buffer> {
    if (type === ExportDocType.ENTRIES) {
      throw new BadRequestException('El reporte HTML no soporta "entries". Use "results" o "heat_sheet".');
    }

    const data = await this.fetchAndValidate(tournamentId);
    const htmlType = type === ExportDocType.HEAT_SHEET ? 'heat_sheet' : 'results';
    const content = buildHtml(data, htmlType);
    const filename = `report-${tournamentId}-${htmlType}-${data.seasonYear}.html`;
    const fileUrl = this.saveFile(content, filename);

    await this.registerExport(tournamentId, 'html', type, fileUrl, userId);
    this.logger.log(`HTML report generated for tournament ${tournamentId} [${htmlType}]`);

    return Buffer.from(content, 'utf-8');
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private async fetchAndValidate(tournamentId: string): Promise<TournamentExportData> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        season: { select: { year: true } },
        events: {
          orderBy: { orderNo: 'asc' },
          include: {
            eventDefinition: {
              select: { code: true, stroke: true, distance: true, gender: true, isRelay: true },
            },
            category: { select: { code: true, name: true } },
            heats: {
              orderBy: { heatNumber: 'asc' },
              include: {
                laneAssignments: {
                  orderBy: { lane: 'asc' },
                  include: {
                    registration: {
                      include: {
                        swimmer: {
                          select: { id: true, firstName: true, lastName: true, gender: true, birthDate: true },
                        },
                        club: { select: { id: true, name: true, shortName: true } },
                      },
                    },
                  },
                },
              },
            },
            results: {
              where: { homologated: true },
              orderBy: [{ place: 'asc' }, { finalTime: 'asc' }],
              include: {
                swimmer: {
                  select: { id: true, firstName: true, lastName: true, gender: true, birthDate: true },
                },
                club: { select: { id: true, name: true, shortName: true } },
                splits: { orderBy: { distance: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException(`Torneo ${tournamentId} no encontrado.`);
    }
    if (tournament.status !== 'homologado') {
      throw new BadRequestException(
        `Solo se pueden exportar torneos homologados. Estado actual: "${tournament.status}".`,
      );
    }

    return {
      id: tournament.id,
      name: tournament.name,
      venue: tournament.venue,
      poolLength: tournament.poolLength as 'P25' | 'P50',
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      seasonYear: tournament.season.year,
      events: tournament.events.map((ev) => ({
        id: ev.id,
        orderNo: ev.orderNo,
        round: ev.round,
        eventDefinition: {
          code: ev.eventDefinition.code,
          stroke: ev.eventDefinition.stroke,
          distance: ev.eventDefinition.distance,
          gender: ev.eventDefinition.gender as 'M' | 'F',
          isRelay: ev.eventDefinition.isRelay,
        },
        category: { code: ev.category.code, name: ev.category.name },
        heats: ev.heats.map((h) => ({
          heatNumber: h.heatNumber,
          entries: h.laneAssignments.map((la) => ({
            lane: la.lane,
            swimmer: {
              id: la.registration.swimmer.id,
              firstName: la.registration.swimmer.firstName,
              lastName: la.registration.swimmer.lastName,
              gender: la.registration.swimmer.gender as 'M' | 'F',
              birthDate: la.registration.swimmer.birthDate,
            },
            club: {
              id: la.registration.club.id,
              name: la.registration.club.name,
              shortName: la.registration.club.shortName,
            },
            entryTime: la.registration.entryTime,
          })),
        })),
        results: ev.results.map((r) => ({
          swimmerId: r.swimmerId,
          lane: r.lane,
          finalTime: r.finalTime,
          place: r.place,
          status: r.status,
          dsqCode: r.dsqCode,
          swimmer: {
            id: r.swimmer.id,
            firstName: r.swimmer.firstName,
            lastName: r.swimmer.lastName,
            gender: r.swimmer.gender as 'M' | 'F',
            birthDate: r.swimmer.birthDate,
          },
          club: {
            id: r.club.id,
            name: r.club.name,
            shortName: r.club.shortName,
          },
          splits: r.splits.map((s) => ({ distance: s.distance, cumulativeTime: s.cumulativeTime })),
        })),
      })),
    };
  }

  private saveFile(content: string, filename: string): string {
    const dir = join(process.cwd(), 'uploads', 'exports');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), content, 'utf-8');
    return `/uploads/exports/${filename}`;
  }

  private async registerExport(
    tournamentId: string,
    format: 'lenex' | 'html',
    scope: ExportDocType,
    fileUrl: string,
    userId: string,
  ): Promise<void> {
    const scopeMap: Record<ExportDocType, 'entries' | 'results' | 'heat_sheet'> = {
      [ExportDocType.ENTRIES]: 'entries',
      [ExportDocType.RESULTS]: 'results',
      [ExportDocType.HEAT_SHEET]: 'heat_sheet',
    };

    await this.prisma.meetManagerExport.create({
      data: {
        tournamentId,
        format,
        scope: scopeMap[scope],
        fileUrl,
        generatedBy: userId,
      },
    });
  }

  /** Expose fetch for test convenience (returns mapped data without DB side-effects). */
  async fetchTournamentExportData(tournamentId: string): Promise<TournamentExportData> {
    return this.fetchAndValidate(tournamentId);
  }

  /** List past exports for a tournament (admin panel). */
  async listExports(tournamentId: string) {
    return this.prisma.meetManagerExport.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
      include: { generator: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }
}

// Helper so tests can access the private random UUID generation is NOT used in filenames
// (filenames are deterministic by tournamentId+type+year, ensuring reproducibility).
export { randomUUID as _randomUUID };
