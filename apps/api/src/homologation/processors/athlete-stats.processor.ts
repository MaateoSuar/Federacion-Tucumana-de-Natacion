import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

@Injectable()
export class AthleteStatsProcessor {
  private readonly logger = new Logger(AthleteStatsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: PostProcessJobData): Promise<void> {
    const { swimmerId, seasonId } = data;

    // Recalcular para temporada actual y global (seasonId = null)
    await Promise.all([
      this.recalculate(swimmerId, seasonId),
      this.recalculate(swimmerId, null),
    ]);
  }

  private async recalculate(swimmerId: string, seasonId: string | null): Promise<void> {
    const results = await this.prisma.result.findMany({
      where: {
        swimmerId,
        homologated: true,
        status: 'OK',
        ...(seasonId
          ? { event: { tournament: { seasonId } } }
          : {}),
      },
      select: {
        finalTime: true,
        isPb: true,
        place: true,
        event: { select: { tournamentId: true } },
      },
    });

    const totalEvents = results.length;
    const totalPbs = results.filter((r) => r.isPb).length;
    const gold = results.filter((r) => r.place === 1).length;
    const silver = results.filter((r) => r.place === 2).length;
    const bronze = results.filter((r) => r.place === 3).length;
    const totalMedals = gold + silver + bronze;
    const tournamentIds = new Set(results.map((r) => r.event.tournamentId));
    const totalCompetitions = tournamentIds.size;

    await this.prisma.athleteStatistics.upsert({
      where: { swimmerId_seasonId: { swimmerId, seasonId: seasonId as string } },
      create: {
        swimmerId,
        seasonId,
        totalCompetitions,
        totalEvents,
        totalPbs,
        gold,
        silver,
        bronze,
        totalMedals,
        computedAt: new Date(),
      },
      update: {
        totalCompetitions,
        totalEvents,
        totalPbs,
        gold,
        silver,
        bronze,
        totalMedals,
        computedAt: new Date(),
      },
    });

    this.logger.log(`AthleteStatistics updated for swimmer ${swimmerId} season=${seasonId ?? 'global'}`);
  }
}
