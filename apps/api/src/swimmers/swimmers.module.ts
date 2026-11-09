import { Module } from '@nestjs/common';
import { SwimmersController } from './swimmers.controller';
import { SwimmersService } from './swimmers.service';
import { MergeController } from './merge/merge.controller';
import { SwimmerMergeService } from './merge/swimmer-merge.service';
import { ClubMergeService } from './merge/club-merge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SwimmersController, MergeController],
  providers: [SwimmersService, SwimmerMergeService, ClubMergeService],
  exports: [SwimmersService],
})
export class SwimmersModule {}
