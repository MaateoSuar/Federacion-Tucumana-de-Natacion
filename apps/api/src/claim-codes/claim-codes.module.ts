import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClaimCodeService } from './claim-code.service';

// Solo el servicio: lo usan AuthModule (registro con código) y AccountLinkModule (endpoints).
// Sin controladores acá para no crear una dependencia circular con AuthModule.
@Module({
  imports: [PrismaModule],
  providers: [ClaimCodeService],
  exports: [ClaimCodeService],
})
export class ClaimCodesModule {}
