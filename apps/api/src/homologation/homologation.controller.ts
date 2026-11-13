import { Controller, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { SystemRole } from '@ftn/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { HomologationService } from './homologation.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class HomologationController {
  constructor(private readonly service: HomologationService) {}

  @Patch('results/:id/homologate')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  homologateResult(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.service.homologateResult(id, req.user.id);
  }
}
