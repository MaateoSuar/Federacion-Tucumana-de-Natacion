import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExportDocType } from './dto/export-query.dto';
import { buildLenex, msToSwimtime } from './lenex-builder';
import { buildHtml } from './html-builder';
import type { TournamentExportData } from './export.types';

// ─── Fixture data ──────────────────────────────────────────────────────────────

const SAMPLE_DATA: TournamentExportData = {
  id: 'tid1',
  name: 'Torneo FTN Test',
  venue: 'Estadio Tucumán',
  poolLength: 'P50',
  startDate: new Date('2025-03-15T00:00:00.000Z'),
  endDate: new Date('2025-03-16T00:00:00.000Z'),
  seasonYear: 2025,
  events: [
    {
      id: 'eid1',
      orderNo: 1,
      round: 'serie_unica',
      eventDefinition: { code: '50L_M', stroke: 'libre', distance: 50, gender: 'M', isRelay: false },
      category: { code: 'MEN_1', name: 'Menor 1' },
      heats: [
        {
          heatNumber: 1,
          entries: [
            {
              lane: 4,
              swimmer: { id: 'sw1', firstName: 'Juan', lastName: 'Pérez', gender: 'M', birthDate: new Date('2010-05-15') },
              club: { id: 'cl1', name: 'Club Natación Atlético', shortName: 'CNA' },
              entryTime: 28500,
            },
            {
              lane: 5,
              swimmer: { id: 'sw2', firstName: 'Mateo', lastName: 'García', gender: 'M', birthDate: new Date('2011-03-20') },
              club: { id: 'cl1', name: 'Club Natación Atlético', shortName: 'CNA' },
              entryTime: 29100,
            },
          ],
        },
      ],
      results: [
        {
          swimmerId: 'sw1',
          lane: 4,
          finalTime: 27450,
          place: 1,
          status: 'OK',
          dsqCode: null,
          swimmer: { id: 'sw1', firstName: 'Juan', lastName: 'Pérez', gender: 'M', birthDate: new Date('2010-05-15') },
          club: { id: 'cl1', name: 'Club Natación Atlético', shortName: 'CNA' },
          splits: [{ distance: 25, cumulativeTime: 13500 }],
        },
        {
          swimmerId: 'sw2',
          lane: 5,
          finalTime: 28300,
          place: 2,
          status: 'OK',
          dsqCode: null,
          swimmer: { id: 'sw2', firstName: 'Mateo', lastName: 'García', gender: 'M', birthDate: new Date('2011-03-20') },
          club: { id: 'cl1', name: 'Club Natación Atlético', shortName: 'CNA' },
          splits: [{ distance: 25, cumulativeTime: 14100 }],
        },
      ],
    },
  ],
};

// ─── Builder tests — pure functions ───────────────────────────────────────────

describe('buildLenex', () => {
  it('produces valid XML with meet info', () => {
    const xml = buildLenex(SAMPLE_DATA, 'results');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<LENEX version="3.0">');
    expect(xml).toContain('Torneo FTN Test');
    expect(xml).toContain('LCM'); // P50 → LCM
  });

  it('includes RESULTS block when type=results', () => {
    const xml = buildLenex(SAMPLE_DATA, 'results');
    expect(xml).toContain('<RESULTS>');
    expect(xml).toContain('swimtime="00:27.45"');
    expect(xml).toContain('place="1"');
    // entryvalue is the athlete-level entry attribute — must not appear in results mode
    expect(xml).not.toContain('entryvalue=');
  });

  it('includes ENTRIES block when type=entries', () => {
    const xml = buildLenex(SAMPLE_DATA, 'entries');
    expect(xml).toContain('entryvalue="00:28.50"');
    expect(xml).not.toContain('<RESULTS>');
  });

  it('is reproducible — same input produces identical output', () => {
    const xml1 = buildLenex(SAMPLE_DATA, 'results');
    const xml2 = buildLenex(SAMPLE_DATA, 'results');
    expect(xml1).toBe(xml2);
  });

  it('maps pool P25 to SCM', () => {
    const data: TournamentExportData = { ...SAMPLE_DATA, poolLength: 'P25' };
    const xml = buildLenex(data, 'results');
    expect(xml).toContain('SCM');
  });

  it('maps stroke correctly', () => {
    const data: TournamentExportData = {
      ...SAMPLE_DATA,
      events: [
        {
          ...SAMPLE_DATA.events[0]!,
          eventDefinition: { ...SAMPLE_DATA.events[0]!.eventDefinition, stroke: 'espalda' },
        },
      ],
    };
    const xml = buildLenex(data, 'results');
    expect(xml).toContain('stroke="BACK"');
  });

  it('includes splits in results', () => {
    const xml = buildLenex(SAMPLE_DATA, 'results');
    expect(xml).toContain('<SPLITS>');
    expect(xml).toContain('distance="25"');
  });
});

describe('msToSwimtime', () => {
  it('converts ms to MM:SS.cc', () => {
    expect(msToSwimtime(27450)).toBe('00:27.45');
    expect(msToSwimtime(68410)).toBe('01:08.41');
    expect(msToSwimtime(0)).toBe('00:00.00');
    expect(msToSwimtime(3599990)).toBe('59:59.99');
  });
});

describe('buildHtml', () => {
  it('produces valid HTML with tournament title', () => {
    const html = buildHtml(SAMPLE_DATA, 'results');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Torneo FTN Test');
    expect(html).toContain('Temporada 2025');
  });

  it('includes results table with place and swimmer name', () => {
    const html = buildHtml(SAMPLE_DATA, 'results');
    expect(html).toContain('Pérez');
    expect(html).toContain('García');
    expect(html).toContain('27.45'); // formatted time
  });

  it('heat_sheet shows heat structure with lanes', () => {
    const html = buildHtml(SAMPLE_DATA, 'heat_sheet');
    expect(html).toContain('Serie 1');
    expect(html).toContain('Carril');
    expect(html).toContain('Pérez');
  });

  it('is reproducible — same input produces identical output', () => {
    const html1 = buildHtml(SAMPLE_DATA, 'results');
    const html2 = buildHtml(SAMPLE_DATA, 'results');
    expect(html1).toBe(html2);
  });

  it('shows Piscina 50 m for P50', () => {
    const html = buildHtml(SAMPLE_DATA, 'results');
    expect(html).toContain('Piscina 50 m');
  });

  it('shows Piscina 25 m for P25', () => {
    const data: TournamentExportData = { ...SAMPLE_DATA, poolLength: 'P25' };
    const html = buildHtml(data, 'results');
    expect(html).toContain('Piscina 25 m');
  });
});

// ─── Service tests — with mocked Prisma ───────────────────────────────────────

describe('ExportService', () => {
  let service: ExportService;
  let prisma: jest.Mocked<PrismaService>;

  const mockTournament = {
    id: 'tid1',
    name: 'Torneo Test',
    venue: 'Piscina FTN',
    poolLength: 'P50',
    status: 'homologado',
    startDate: new Date('2025-03-15'),
    endDate: new Date('2025-03-16'),
    season: { year: 2025 },
    events: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: PrismaService,
          useValue: {
            tournament: {
              findUnique: jest.fn(),
            },
            meetManagerExport: {
              create: jest.fn().mockResolvedValue({}),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
    prisma = module.get(PrismaService);
  });

  it('throws NotFoundException when tournament does not exist', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.exportLenex('missing', ExportDocType.RESULTS, 'user1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when tournament is not homologado', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue({
      ...mockTournament,
      status: 'finalizado',
    });
    await expect(service.exportLenex('tid1', ExportDocType.RESULTS, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when requesting Lenex with heat_sheet type', async () => {
    await expect(service.exportLenex('tid1', ExportDocType.HEAT_SHEET, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when requesting HTML with entries type', async () => {
    await expect(service.exportHtml('tid1', ExportDocType.ENTRIES, 'user1')).rejects.toThrow(BadRequestException);
  });

  it('registers export in meet_manager_exports after generation', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    await service.exportLenex('tid1', ExportDocType.RESULTS, 'user1');
    expect(prisma.meetManagerExport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tournamentId: 'tid1',
          format: 'lenex',
          scope: 'results',
          generatedBy: 'user1',
        }),
      }),
    );
  });

  it('returns Buffer with XML content for Lenex export', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    const buffer = await service.exportLenex('tid1', ExportDocType.RESULTS, 'user1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toContain('<LENEX');
  });

  it('returns Buffer with HTML content for HTML export', async () => {
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(mockTournament);
    const buffer = await service.exportHtml('tid1', ExportDocType.RESULTS, 'user1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toContain('<!DOCTYPE html>');
  });

  it('listExports returns prior exports for tournament', async () => {
    (prisma.meetManagerExport.findMany as jest.Mock).mockResolvedValue([
      { id: 'ex1', format: 'lenex', scope: 'results', createdAt: new Date() },
    ]);
    const result = await service.listExports('tid1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ format: 'lenex' });
  });
});
