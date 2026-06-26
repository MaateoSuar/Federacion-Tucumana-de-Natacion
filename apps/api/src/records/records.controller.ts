import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { SystemRole } from '@ftn/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RecordsService } from './records.service';
import { RecordQueryDto } from './dto/record-query.dto';

@Controller('records')
export class RecordsController {
  constructor(private readonly service: RecordsService) {}

  /** Récords vigentes provinciales — público */
  @Get()
  findCurrent(@Query() query: RecordQueryDto) {
    return this.service.findCurrent(query);
  }

  /** Récords nacionales como benchmark — público, read-only */
  @Get('national')
  findNational(@Query() query: RecordQueryDto) {
    return this.service.findNational(query);
  }

  /** Candidatos pendientes de homologación — solo Admin */
  @Get('candidates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  findCandidates(@Query() query: RecordQueryDto) {
    return this.service.findCandidates(query);
  }

  /** Homologar un candidato — solo Admin */
  @Patch(':id/homologate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  homologate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.service.homologateRecord(id, req.user.id);
  }
}
