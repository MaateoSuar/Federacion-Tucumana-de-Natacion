import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImportService } from './import.service';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.hy3', '.sd3', '.csv', '.xlsx', '.xls']);
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

@ApiTags('import')
@Controller('import')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = '.' + (file.originalname.split('.').pop() ?? '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return cb(
            new BadRequestException(
              `Extensión no permitida: "${ext}". Permitidos: PDF, HY3, CSV, XLSX.`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Subir archivo de Meet Manager para importar resultados' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    return this.importService.upload(file, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Estado del import job' })
  getJob(@Param('id') id: string) {
    return this.importService.getJob(id);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Preview del meet antes de confirmar' })
  getPreview(@Param('id') id: string) {
    return this.importService.getPreview(id);
  }

  @Post(':id/commit')
  @ApiOperation({ summary: 'Confirmar el import — persiste en tablas oficiales' })
  commit(@Param('id') id: string) {
    return this.importService.commit(id);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: 'Revertir un import ya confirmado' })
  rollback(@Param('id') id: string) {
    return this.importService.rollback(id);
  }
}
