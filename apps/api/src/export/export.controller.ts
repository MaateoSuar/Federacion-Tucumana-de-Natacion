import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  StreamableFile,
} from '@nestjs/common';
import { SystemRole } from '@ftn/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExportService } from './export.service';
import { ExportQueryDto, ExportDocType } from './dto/export-query.dto';

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
export class ExportController {
  constructor(private readonly service: ExportService) {}

  /**
   * Descarga un archivo Lenex 3.0 (XML) del torneo.
   * type=entries → seeding para cronometraje.
   * type=results → resultados finales (requiere torneo homologado).
   */
  @Get('tournaments/:id/lenex')
  async downloadLenex(
    @Param('id') id: string,
    @Query() query: ExportQueryDto,
    @Request() req: { user: { id: string } },
  ): Promise<StreamableFile> {
    const type = query.type ?? ExportDocType.RESULTS;
    const buffer = await this.service.exportLenex(id, type, req.user.id);
    const filename = `ftn-${id}-${type}.xml`;
    return new StreamableFile(buffer, {
      type: 'application/xml',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  /**
   * Descarga un reporte HTML print-ready del torneo.
   * type=results → tabla de resultados por prueba.
   * type=heat_sheet → programa de series (heat sheet).
   */
  @Get('tournaments/:id/pdf')
  async downloadHtml(
    @Param('id') id: string,
    @Query() query: ExportQueryDto,
    @Request() req: { user: { id: string } },
  ): Promise<StreamableFile> {
    const type = query.type ?? ExportDocType.RESULTS;
    const buffer = await this.service.exportHtml(id, type, req.user.id);
    const filename = `ftn-${id}-${type}.html`;
    return new StreamableFile(buffer, {
      type: 'text/html; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  /** Lista exportaciones previas de un torneo. */
  @Get('tournaments/:id/history')
  listExports(@Param('id') id: string) {
    return this.service.listExports(id);
  }
}
