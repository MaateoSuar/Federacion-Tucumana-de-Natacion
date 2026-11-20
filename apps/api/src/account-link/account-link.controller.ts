import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AccountLinkStatus } from '@prisma/client';
import { AccountLinkService } from './account-link.service';
import { CreateLinkRequestDto } from './dto/create-link-request.dto';
import { ReviewLinkRequestDto } from './dto/review-link-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { SystemRole } from '@ftn/shared';

@ApiTags('account-link')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account-link')
export class AccountLinkController {
  constructor(private readonly service: AccountLinkService) {}

  // ── Nadador — solicita vinculación ────────────────────────────────────────

  @Post('requests')
  @ApiOperation({ summary: 'Solicitar vinculación con un nadador' })
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLinkRequestDto,
  ) {
    return this.service.createRequest(user.id, dto);
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Ver mis solicitudes de vinculación' })
  getMyRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMyRequests(user.id);
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar mi solicitud de vinculación' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.cancel(id, user.id);
  }

  @Get('me/swimmer')
  @ApiOperation({ summary: 'Nadador vinculado al usuario autenticado' })
  getLinkedSwimmer(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getLinkedSwimmer(user.id);
  }

  // ── Admin — revisión de solicitudes ───────────────────────────────────────

  @Get('requests')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN, SystemRole.COACH)
  @ApiOperation({ summary: '[Admin / Entrenador] Listar solicitudes de vinculación (el entrenador, solo las de su club)' })
  @ApiQuery({ name: 'status', required: false, enum: AccountLinkStatus })
  listRequests(@CurrentUser() actor: AuthenticatedUser, @Query('status') status?: AccountLinkStatus) {
    return this.service.listRequests(actor, status);
  }

  @Get('requests/:id')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN, SystemRole.COACH)
  @ApiOperation({ summary: '[Admin / Entrenador] Ver detalle de una solicitud' })
  getRequest(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.getRequest(id, actor);
  }

  @Patch('requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN, SystemRole.COACH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin / Entrenador de su club] Aprobar solicitud de vinculación' })
  approve(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ReviewLinkRequestDto,
  ) {
    return this.service.approve(id, actor, dto);
  }

  @Patch('requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN, SystemRole.COACH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin / Entrenador de su club] Rechazar solicitud (motivo requerido)' })
  reject(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ReviewLinkRequestDto,
  ) {
    return this.service.reject(id, actor, dto);
  }
}
