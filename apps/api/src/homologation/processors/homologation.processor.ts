import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { HOMOLOGATION_QUEUE, POST_PROCESS_JOB } from '../homologation.queue';
import type { PostProcessJobData } from '../homologation.queue';
import { PersonalBestProcessor } from './personal-best.processor';
import { RankingProcessor } from './ranking.processor';
import { RecordEvaluatorProcessor } from './record-evaluator.processor';
import { AthleteStatsProcessor } from './athlete-stats.processor';
import { AchievementProcessor } from './achievement.processor';

@Processor(HOMOLOGATION_QUEUE)
export class HomologationProcessor extends WorkerHost {
  private readonly logger = new Logger(HomologationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly personalBest: PersonalBestProcessor,
    private readonly ranking: RankingProcessor,
    private readonly recordEvaluator: RecordEvaluatorProcessor,
    private readonly athleteStats: AthleteStatsProcessor,
    private readonly achievement: AchievementProcessor,
  ) {
    super();
  }

  async process(job: Job<PostProcessJobData>): Promise<void> {
    const data = job.data;
    this.logger.log(`Post-processing result ${data.resultId}`);

    await this.personalBest.process(data);
    await this.ranking.process(data);
    await this.recordEvaluator.process(data);
    await this.athleteStats.process(data);
    await this.achievement.process(data);

    this.logger.log(`Post-processing complete for result ${data.resultId}`);
  }
}

export { POST_PROCESS_JOB };
