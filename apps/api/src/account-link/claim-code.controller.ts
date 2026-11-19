import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SystemRole } from '@ftn/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ClaimCodeService, CLAIM_CODE_MAX_DAYS } from '../claim-codes/claim-code.service';

class CreateClaimCodeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(CLAIM_CODE_MAX_DAYS)
  expiresInDays?: number;
}

class RedeemClaimCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;
}

@ApiTags('claim-codes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ClaimCodeController {
  constructor(private readonly service: ClaimCodeService) {}

  // ── Nadador ya logueado y sin vincular ────────────────────────────────────

  @Post('account-link/claim-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Vincular mi cuenta a mi perfil de nadador con un código' })
  redeem(@CurrentUser() user: AuthenticatedUser, @Body() dto: RedeemClaimCodeDto) {
    return this.service.redeem(user.id, dto.code);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Post('admin/swimmers/:swimmerId/claim-codes')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generar un código de perfil de un solo uso para un nadador (se muestra una vez)' })
  create(@Param('swimmerId') swimmerId: string, @Body() dto: CreateClaimCodeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(swimmerId, user.id, dto.expiresInDays);
  }

  @Get('admin/swimmers/:swimmerId/claim-codes')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Códigos de perfil de un nadador y su estado' })
  list(@Param('swimmerId') swimmerId: string) {
    return this.service.listForSwimmer(swimmerId);
  }

  @Delete('admin/claim-codes/:id')
  @UseGuards(RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Revocar un código de perfil sin usar' })
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.revoke(id, user.id);
  }
}
