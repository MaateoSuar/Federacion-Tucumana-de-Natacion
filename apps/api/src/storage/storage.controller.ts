import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage, Options as MulterOptions } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SystemRole } from '@ftn/shared';

type FileFilter = NonNullable<MulterOptions['fileFilter']>;

// MIME types permitidos — sólo imágenes rasterizadas y SVG
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

// Extensiones permitidas (segunda capa de validación)
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const imageFileFilter: FileFilter = (_req, file, callback) => {
  const ext = extname(file.originalname).toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Tipo no permitido: "${file.mimetype}". Solo JPG, PNG, WebP, GIF o SVG.`,
      ),
    );
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return callback(
      new BadRequestException(
        `Extensión no permitida: "${ext}". Solo .jpg .jpeg .png .webp .gif .svg`,
      ),
    );
  }

  callback(null, true);
};

function buildStorage() {
  const dest = join(process.cwd(), 'uploads', 'images');
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

  return diskStorage({
    destination: dest,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });
}

@ApiTags('upload')
@Controller('upload')
export class StorageController {
  @Post('image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: buildStorage(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fileFilter: imageFileFilter as any,
      limits: { fileSize: MAX_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Subir imagen (JPG, PNG, WebP, GIF, SVG — máx 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    return { url: `/uploads/images/${file.filename}` };
  }
}
