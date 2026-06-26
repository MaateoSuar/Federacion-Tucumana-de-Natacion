import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ClubsModule,
    SwimmersModule,
    TournamentsModule,
    StorageModule,
    IngestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
