import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, StorageEngine } from 'multer';
import type { Request as ExpressRequest } from 'express';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { TournamentStatus, TournamentType, Scope } from '@prisma/client';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { AddEventDto } from './dto/add-event.dto';
import { GenerateHeatsDto } from './dto/generate-heats.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SystemRole } from '@ftn/shared';


@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly service: TournamentsService) {}

  // ─── Catálogos ─────────────────────────────────────────────────────────────

  @Get('event-definitions')
  @ApiOperation({ summary: 'Catálogo maestro de pruebas' })
  getEventDefinitions() {
    return this.service.getEventDefinitions();
  }

  @Get('categories')
  @ApiOperation({ summary: 'Categorías activas' })
  getCategories() {
    return this.service.getCategories();
  }

  @Get('seasons')
  @ApiOperation({ summary: 'Temporadas disponibles' })
  getSeasons() {
    return this.service.getSeasons();
  }

  // ─── CRUD de torneos ───────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear torneo' })
  create(@Body() dto: CreateTournamentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar torneos' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: TournamentStatus })
  @ApiQuery({ name: 'type', required: false, enum: TournamentType })
  @ApiQuery({ name: 'scope', required: false, enum: Scope })
  @ApiQuery({ name: 'seasonId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: TournamentStatus,
    @Query('type') type?: TournamentType,
    @Query('scope') scope?: Scope,
    @Query('seasonId') seasonId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.service.findAll({ search, status, type, scope, seasonId, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de torneo con pruebas y documentos' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar datos del torneo' })
  update(@Param('id') id: string, @Body() dto: UpdateTournamentDto) {
    return this.service.update(id, dto);
  }

  // ─── Máquina de estados ───────────────────────────────────────────────────

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Transicionar estado del torneo' })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.service.transition(id, dto.status, user.sub);
  }

  // ─── Pruebas (Events) ──────────────────────────────────────────────────────

  @Get(':id/events')
  @ApiOperation({ summary: 'Listar pruebas del torneo' })
  getEvents(@Param('id') id: string) {
    return this.service.getEvents(id);
  }

  @Post(':id/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agregar prueba al torneo' })
  addEvent(@Param('id') id: string, @Body() dto: AddEventDto) {
    return this.service.addEvent(id, dto);
  }

  @Delete(':id/events/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quitar prueba del torneo (solo si sin inscripciones ni resultados)' })
  removeEvent(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.removeEvent(id, eventId);
  }

  // ─── Series (Heats) ────────────────────────────────────────────────────────

  @Get(':id/events/:eventId/results')
  @ApiOperation({ summary: 'Resultados públicos de una prueba con parciales' })
  getEventResults(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.getEventResults(id, eventId);
  }

  @Get(':id/events/:eventId/heats')
  @ApiOperation({ summary: 'Listar series de una prueba con carriles' })
  getHeats(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.service.getHeats(id, eventId);
  }

  @Post(':id/events/:eventId/heats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generar (o regenerar) series para una prueba' })
  generateHeats(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() dto: GenerateHeatsDto,
  ) {
    return this.service.generateHeats(id, eventId, dto);
  }

  // ─── Documentos ────────────────────────────────────────────────────────────

  @Get(':id/documents')
  @ApiOperation({ summary: 'Listar documentos del torneo' })
  listDocuments(@Param('id') id: string) {
    return this.service.listDocuments(id);
  }

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string' },
        title: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (
          req: ExpressRequest,
          _file: Express.Multer.File,
          cb: (error: Error | null, destination: string) => void,
        ) => {
          const tournamentId = (req.params as { id: string }).id;
          const uploadDir = join(process.cwd(), 'uploads', 'tournaments', tournamentId);
          mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (
          _req: ExpressRequest,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }) as StorageEngine,
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Solo se permiten archivos PDF, JPG o PNG'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Subir documento al torneo (PDF/imagen)' })
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: { sub: string },
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo');
    const fileUrl = `/uploads/tournaments/${id}/${file.filename}`;
    return this.service.addDocument(id, fileUrl, file.mimetype, dto, user.sub);
  }

  @Delete(':id/documents/:docId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar documento del torneo' })
  removeDocument(@Param('id') id: string, @Param('docId') docId: string) {
    return this.service.removeDocument(id, docId);
  }
}
