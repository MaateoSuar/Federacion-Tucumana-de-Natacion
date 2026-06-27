import { Module } from '@nestjs/common';
import { AccountLinkService } from './account-link.service';
import { AccountLinkController } from './account-link.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccountLinkController],
  providers: [AccountLinkService],
  exports: [AccountLinkService],
})
export class AccountLinkModule {}
