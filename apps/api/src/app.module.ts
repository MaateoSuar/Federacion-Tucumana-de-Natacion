import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClubsModule } from './clubs/clubs.module';
import { SwimmersModule } from './swimmers/swimmers.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { StorageModule } from './storage/storage.module';
import { IngestModule } from './ingest/ingest.module';
import { ImportModule } from './import/import.module';
import { HomologationModule } from './homologation/homologation.module';
import { RedisModule } from './redis/redis.module';
import { RankingsModule } from './rankings/rankings.module';
import { RecordsModule } from './records/records.module';
import { ResultsGatewayModule } from './results-gateway/results-gateway.module';
import { AccountLinkModule } from './account-link/account-link.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    BullModule.forRootAsync({
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
    RedisModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ClubsModule,
    SwimmersModule,
    TournamentsModule,
    StorageModule,
    IngestModule,
    ImportModule,
    HomologationModule,
    RankingsModule,
    RecordsModule,
    ResultsGatewayModule,
    AccountLinkModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
