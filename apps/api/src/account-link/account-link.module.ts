import { Module } from '@nestjs/common';
import { AccountLinkService } from './account-link.service';
import { AccountLinkController } from './account-link.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ClaimCodesModule } from '../claim-codes/claim-codes.module';
import { ClaimCodeController } from './claim-code.controller';

@Module({
  imports: [PrismaModule, AuthModule, ClaimCodesModule],
  controllers: [AccountLinkController, ClaimCodeController],
  providers: [AccountLinkService],
  exports: [AccountLinkService],
})
export class AccountLinkModule {}
