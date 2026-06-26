import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IngestModule } from '../ingest/ingest.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportRepository } from './import.repository';
import { ImportProcessor } from './processors/import.processor';
import { CommitProcessor } from './processors/commit.processor';
import { StubMatcher } from './matching/stub-matcher';
import { MeetManagerPdfAdapter } from '../ingest/adapters/meet-manager-pdf/meet-manager-pdf-adapter';
import { IMPORT_QUEUE } from './import.queue';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: IMPORT_QUEUE,
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
    IngestModule,
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportRepository,
    ImportProcessor,
    CommitProcessor,
    StubMatcher,
    MeetManagerPdfAdapter,
  ],
  exports: [ImportService],
})
export class ImportModule {}
