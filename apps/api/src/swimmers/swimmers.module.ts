import { Module } from '@nestjs/common';
import { SwimmersController } from './swimmers.controller';
import { SwimmersService } from './swimmers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SwimmersController],
  providers: [SwimmersService],
  exports: [SwimmersService],
})
export class SwimmersModule {}
