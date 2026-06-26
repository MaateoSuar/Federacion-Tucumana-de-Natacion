import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PostProcessJobData } from '../homologation.queue';

const MEDAL_PLACES: Record<number, { medal: 'gold' | 'silver' | 'bronze'; title: string }> = {
  1: { medal: 'gold', title: 'Medalla de Oro' },
  2: { medal: 'silver', title: 'Medalla de Plata' },
  3: { medal: 'bronze', title: 'Medalla de Bronce' },
};

@Injectable()
export class AchievementProcessor {
  private readonly logger = new Logger(AchievementProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(data: PostProcessJobData): Promise<void> {
    const { swimmerId, tournamentId, eventId, place, resultDate } = data;

    if (place === null) return;

    const medalConfig = MEDAL_PLACES[place];

    if (medalConfig) {
      // Evitar duplicados
      const exists = await this.prisma.athleteAchievement.findFirst({
        where: { swimmerId, eventId, type: 'medal' },
      });
      if (!exists) {
        await this.prisma.athleteAchievement.create({
          data: {
            swimmerId,
            type: 'medal',
            medal: medalConfig.medal,
            tournamentId,
            eventId,
            title: medalConfig.title,
            achievedAt: new Date(resultDate),
          },
        });
        this.logger.log(`Achievement ${medalConfig.medal} created for swimmer ${swimmerId}`);
      }
      return;
    }

    // Diploma para puestos 4–8
    if (place >= 4 && place <= 8) {
      const exists = await this.prisma.athleteAchievement.findFirst({
        where: { swimmerId, eventId, type: 'badge' },
      });
      if (!exists) {
        await this.prisma.athleteAchievement.create({
          data: {
            swimmerId,
            type: 'badge',
            medal: null,
            tournamentId,
            eventId,
            title: `Diploma — Puesto ${place}`,
            achievedAt: new Date(resultDate),
          },
        });
        this.logger.log(`Diploma created for swimmer ${swimmerId} — place ${place}`);
      }
    }
  }
}
