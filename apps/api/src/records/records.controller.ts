import { Controller, Get, Patch, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { SystemRole } from '@ftn/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RecordsService } from './records.service';
import { RecordQueryDto } from './dto/record-query.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { RejectRecordDto } from './dto/reject-record.dto';

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

  /** Rechazar un candidato pendiente (se elimina y queda auditado) — solo Admin */
  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRecordDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.service.rejectCandidate(id, req.user.id, dto.reason);
  }

  /** Editar manualmente el récord vigente (nuevo holder/tiempo/club/fecha/torneo) — solo Admin */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.service.updateManualRecord(id, dto, req.user.id);
  }
}
