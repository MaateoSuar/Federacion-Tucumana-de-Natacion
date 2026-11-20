import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ImportService } from './import.service';
import { ImportRepository } from './import.repository';
import { CommitProcessor } from './processors/commit.processor';
import { IMPORT_QUEUE } from './import.queue';
import { createHash } from 'crypto';

const mockQueue = { add: jest.fn() };

const mockRepo = {
  findByHash: jest.fn(),
  findById: jest.fn(),
  createJob: jest.fn(),
  updateStatus: jest.fn(),
  saveStagingPayload: jest.fn(),
  saveMapping: jest.fn(),
  saveMatchResults: jest.fn(),
};

const mockCommit = {
  commit: jest.fn(),
  rollback: jest.fn(),
};

describe('ImportService', () => {
  let service: ImportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: getQueueToken(IMPORT_QUEUE), useValue: mockQueue },
        { provide: ImportRepository, useValue: mockRepo },
        { provide: CommitProcessor, useValue: mockCommit },
      ],
    }).compile();

    service = module.get(ImportService);
  });

  describe('upload — idempotencia', () => {
    const fakeFile = (content: string): Express.Multer.File =>
      ({
        originalname: 'resultados.pdf',
        buffer: Buffer.from(content),
        mimetype: 'application/pdf',
        size: content.length,
      }) as Express.Multer.File;

    it('devuelve el job existente si el mismo file_hash ya fue procesado', async () => {
      const content = 'same-file-content';
      const hash = createHash('sha256').update(Buffer.from(content)).digest('hex');
      const existingJob = { id: 'existing-job-id', fileHash: hash, status: 'preview' };

      mockRepo.findByHash.mockResolvedValue(existingJob);

      const result = await service.upload(fakeFile(content), 'user-1');

      expect(result.existing).toBe(true);
      expect(result.jobId).toBe('existing-job-id');
      expect(mockRepo.createJob).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('crea un nuevo job si el hash no existe', async () => {
      mockRepo.findByHash.mockResolvedValue(null);
      mockRepo.createJob.mockResolvedValue({ id: 'new-job-id' });
      mockQueue.add.mockResolvedValue({});

      const result = await service.upload(fakeFile('new-content-' + Date.now()), 'user-1');

      expect(result.existing).toBe(false);
      expect(mockRepo.createJob).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('crea nuevo job si el job previo está en estado "failed"', async () => {
      const content = 'failed-file-content';
      const hash = createHash('sha256').update(Buffer.from(content)).digest('hex');
      const failedJob = { id: 'failed-job-id', fileHash: hash, status: 'failed' };

      mockRepo.findByHash.mockResolvedValue(failedJob);
      mockRepo.createJob.mockResolvedValue({ id: 'retry-job-id' });
      mockQueue.add.mockResolvedValue({});

      const result = await service.upload(fakeFile(content), 'user-1');

      expect(result.existing).toBe(false);
      expect(mockRepo.createJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('commit', () => {
    it('delega al CommitProcessor y devuelve tournamentId', async () => {
      mockCommit.commit.mockResolvedValue('tournament-abc');

      const result = await service.commit('job-123', 'admin-1');

      expect(mockCommit.commit).toHaveBeenCalledWith('job-123', 'admin-1');
      expect(result.tournamentId).toBe('tournament-abc');
    });
  });

  describe('rollback', () => {
    it('delega al CommitProcessor.rollback', async () => {
      mockCommit.rollback.mockResolvedValue(undefined);

      await service.rollback('job-123');

      expect(mockCommit.rollback).toHaveBeenCalledWith('job-123');
    });
  });

  describe('getPreview', () => {
    it('lanza error si el job no está en preview', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'job-1', status: 'parsing', meetManagerImport: null, issues: null, totalRows: 0, okRows: 0, errorRows: 0 });

      await expect(service.getPreview('job-1')).rejects.toThrow('Preview no disponible');
    });

    it('retorna preview cuando el job está en estado preview', async () => {
      const staging = {
        newSwimmersCount: 3,
        matchedSwimmersCount: 0,
        recordsDetectedCount: 0,
        parsedPayload: {
          meet: { name: 'Torneo Test', venue: 'Pileta', course: 25, start_date: '2026-05-01', end_date: '2026-05-02', source: 'pdf' },
          clubs: [{ external_team_id: 'T1', name: 'Club A', short_name: 'CA', source_line: 1 }],
          swimmers: [],
          events: [],
          results: [],
          issues: [],
          meta: { source_file_name: 'test.pdf', parsed_at: '2026-05-01', total_lines: 10 },
        },
        matchResults: {
          swimmers: [],
          clubs: [
            { clubRef: 'T1', confidence: 'none', clubId: null, matchedBy: 'none', requiresConfirmation: false, displayName: 'Club A' },
          ],
        },
      };
      mockRepo.findById.mockResolvedValue({
        id: 'job-1',
        status: 'preview',
        totalRows: 10,
        okRows: 9,
        errorRows: 1,
        issues: [],
        meetManagerImport: staging,
      });

      const preview = await service.getPreview('job-1');

      expect(preview.summary.newSwimmers).toBe(3);
      expect(preview.summary.newClubs).toBe(1);
      expect(preview.meetInfo?.name).toBe('Torneo Test');
    });
  });

  describe('resolveMatches', () => {
    const makeJob = (status = 'preview') => ({
      id: 'job-1',
      status,
      totalRows: 0,
      okRows: 0,
      errorRows: 0,
      issues: [],
      meetManagerImport: {
        newSwimmersCount: 0,
        matchedSwimmersCount: 0,
        recordsDetectedCount: 0,
        parsedPayload: null,
        matchResults: {
          swimmers: [
            {
              swimmerRef: 'suar|mateo|azucena|M',
              confidence: 'low',
              swimmerId: null,
              matchedBy: 'fuzzy',
              requiresConfirmation: true,
              candidateSwimmerId: 'sw-mateo',
              candidates: [{ swimmerId: 'sw-mateo', displayName: 'Mateo Rodriguez Suar', birthYear: null, clubName: null, score: 0.98, reasons: [] }],
              displayName: 'Mateo Suar',
            },
            {
              swimmerRef: 'perez|juan|azucena|M',
              confidence: 'strong',
              swimmerId: 'sw-juan',
              matchedBy: 'dni',
              requiresConfirmation: false,
              displayName: 'Juan Perez',
            },
          ],
          clubs: [
            {
              clubRef: 'azucena',
              confidence: 'low',
              clubId: null,
              matchedBy: 'fuzzy',
              requiresConfirmation: true,
              candidateClubId: 'club-azu',
              candidates: [{ clubId: 'club-azu', displayName: 'Club Azucena', score: 1, reasons: [] }],
              displayName: 'Azucena',
            },
          ],
        },
      },
    });

    it('guarda la decisión del admin y baja los pendientes', async () => {
      const job = makeJob();
      mockRepo.findById.mockResolvedValue(job);
      mockRepo.saveMatchResults.mockResolvedValue({});

      const preview = await service.resolveMatches(
        'job-1',
        {
          swimmers: [{ ref: 'suar|mateo|azucena|M', decision: 'link', targetId: 'sw-mateo' }],
          clubs: [{ ref: 'azucena', decision: 'new' }],
        },
        'admin-1',
      );

      const saved = mockRepo.saveMatchResults.mock.calls[0][1];
      expect(saved.swimmers[0].resolution).toMatchObject({ decision: 'link', targetId: 'sw-mateo', decidedBy: 'admin-1' });
      expect(saved.clubs[0].resolution).toMatchObject({ decision: 'new', decidedBy: 'admin-1' });
      expect(preview.summary.pendingDecisions).toBe(0);
    });

    it('rechaza vincular a alguien que no está entre los candidatos', async () => {
      mockRepo.findById.mockResolvedValue(makeJob());
      await expect(
        service.resolveMatches('job-1', { swimmers: [{ ref: 'suar|mateo|azucena|M', decision: 'link', targetId: 'otro' }] }, 'admin-1'),
      ).rejects.toThrow('no está entre los candidatos');
      expect(mockRepo.saveMatchResults).not.toHaveBeenCalled();
    });

    it('rechaza decidir sobre un match que no requiere confirmación', async () => {
      mockRepo.findById.mockResolvedValue(makeJob());
      await expect(
        service.resolveMatches('job-1', { swimmers: [{ ref: 'perez|juan|azucena|M', decision: 'new' }] }, 'admin-1'),
      ).rejects.toThrow('no requiere confirmación');
    });

    it('rechaza referencias inexistentes', async () => {
      mockRepo.findById.mockResolvedValue(makeJob());
      await expect(
        service.resolveMatches('job-1', { clubs: [{ ref: 'no-existe', decision: 'new' }] }, 'admin-1'),
      ).rejects.toThrow('No existe el club');
    });

    it('solo permite decidir en estado preview', async () => {
      mockRepo.findById.mockResolvedValue(makeJob('confirmed'));
      await expect(service.resolveMatches('job-1', {}, 'admin-1')).rejects.toThrow('en preview');
    });

    it('el preview cuenta los pendientes sin decidir', async () => {
      mockRepo.findById.mockResolvedValue(makeJob());
      const preview = await service.getPreview('job-1');
      expect(preview.summary.pendingDecisions).toBe(2);
    });
  });
});
