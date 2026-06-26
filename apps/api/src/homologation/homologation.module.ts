import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { HomologationController } from './homologation.controller';
import { HomologationService } from './homologation.service';
import { HomologationProcessor } from './processors/homologation.processor';
import { PersonalBestProcessor } from './processors/personal-best.processor';
import { RankingProcessor } from './processors/ranking.processor';
import { RecordEvaluatorProcessor } from './processors/record-evaluator.processor';
import { AthleteStatsProcessor } from './processors/athlete-stats.processor';
import { AchievementProcessor } from './processors/achievement.processor';
import { HOMOLOGATION_QUEUE } from './homologation.queue';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: HOMOLOGATION_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
          },
        };
      },
    }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [HomologationController],
  providers: [
    HomologationService,
    HomologationProcessor,
    PersonalBestProcessor,
    RankingProcessor,
    RecordEvaluatorProcessor,
    AthleteStatsProcessor,
    AchievementProcessor,
  ],
  exports: [HomologationService],
})
export class HomologationModule {}
