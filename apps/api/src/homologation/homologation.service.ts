import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { HOMOLOGATION_QUEUE, POST_PROCESS_JOB } from './homologation.queue';
import type { PostProcessJobData } from './homologation.queue';

@Injectable()
export class HomologationService {
  private readonly logger = new Logger(HomologationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(HOMOLOGATION_QUEUE) private readonly queue: Queue,
  ) {}

  async homologateTournament(
    tournamentId: string,
    homologatedBy: string,
  ): Promise<{ homologated: number; skipped: number }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        events: {
          include: {
            results: {
              where: { status: 'OK', homologated: false, finalTime: { not: null } },
              include: { event: { include: { tournament: true, eventDefinition: true } } },
            },
          },
        },
        season: true,
      },
    });

    if (!tournament) throw new NotFoundException('Torneo no encontrado.');

    const statuses = ['programado', 'inscripciones_abiertas', 'cerrado'];
    if (statuses.includes(tournament.status)) {
      throw new BadRequestException(
        `No se puede homologar un torneo en estado "${tournament.status}". Debe estar finalizado o en curso.`,
      );
    }

    const now = new Date();
    let homologated = 0;
    let skipped = 0;

    for (const event of tournament.events) {
      for (const result of event.results) {
        if (result.homologated) {
          skipped++;
          continue;
        }

        // Marcar como homologado
        await this.prisma.result.update({
          where: { id: result.id },
          data: { homologated: true, homologatedAt: now, homologatedBy },
        });

        // Encolar post-procesamiento
        const jobData: PostProcessJobData = {
          resultId: result.id,
          swimmerId: result.swimmerId,
          clubId: result.clubId,
          eventDefinitionId: result.event.eventDefinitionId,
          poolLength: tournament.poolLength === 'P25' ? 25 : 50,
          categoryId: result.categoryId,
          // Esta cola solo procesa resultados individuales — su EventDefinition
          // nunca es MIX (eso solo existe para relevos, que no pasan por acá).
          gender: result.event.eventDefinition.gender as 'M' | 'F',
          seasonId: tournament.seasonId,
          finalTimeMs: result.finalTime!,
          tournamentId,
          eventId: event.id,
          place: result.place,
          resultDate: tournament.startDate.toISOString(),
        };

        await this.queue.add(POST_PROCESS_JOB, jobData);
        homologated++;
      }
    }

    // Actualizar estado del torneo a homologado
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'homologado' },
    });

    this.logger.log(`Tournament ${tournamentId} homologated — ${homologated} results, ${skipped} skipped`);
    return { homologated, skipped };
  }

  async homologateResult(
    resultId: string,
    homologatedBy: string,
  ): Promise<void> {
    const result = await this.prisma.result.findUnique({
      where: { id: resultId },
      include: {
        event: {
          include: {
            tournament: true,
            eventDefinition: true,
          },
        },
      },
    });

    if (!result) throw new NotFoundException('Resultado no encontrado.');
    if (result.status !== 'OK') {
      throw new BadRequestException('Solo se pueden homologar resultados en estado OK.');
    }
    if (result.homologated) {
      throw new BadRequestException('El resultado ya está homologado.');
    }
    if (result.finalTime === null) {
      throw new BadRequestException('El resultado no tiene tiempo final.');
    }

    const tournament = result.event.tournament;

    await this.prisma.result.update({
      where: { id: resultId },
      data: { homologated: true, homologatedAt: new Date(), homologatedBy },
    });

    const jobData: PostProcessJobData = {
      resultId,
      swimmerId: result.swimmerId,
      clubId: result.clubId,
      eventDefinitionId: result.event.eventDefinitionId,
      poolLength: tournament.poolLength === 'P25' ? 25 : 50,
      categoryId: result.categoryId,
      // Esta cola solo procesa resultados individuales — su EventDefinition
      // nunca es MIX (eso solo existe para relevos, que no pasan por acá).
      gender: result.event.eventDefinition.gender as 'M' | 'F',
      seasonId: tournament.seasonId,
      finalTimeMs: result.finalTime,
      tournamentId: tournament.id,
      eventId: result.eventId,
      place: result.place,
      resultDate: tournament.startDate.toISOString(),
    };

    await this.queue.add(POST_PROCESS_JOB, jobData);
    this.logger.log(`Result ${resultId} homologated and post-processing enqueued`);
  }
}
