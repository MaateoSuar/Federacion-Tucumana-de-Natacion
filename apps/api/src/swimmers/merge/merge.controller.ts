import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { SystemRole } from '@ftn/shared';
import { SwimmerMergeService } from './swimmer-merge.service';
import { ClubMergeService } from './club-merge.service';

@ApiTags('merge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
@Controller('admin/merge')
export class MergeController {
  constructor(
    private readonly swimmerMerge: SwimmerMergeService,
    private readonly clubMerge: ClubMergeService,
  ) {}

  @Get('swimmers/duplicates')
  @ApiOperation({ summary: 'Candidatos a duplicado de nadadores' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findSwimmerDuplicates(@Query('limit') limit?: string) {
    return this.swimmerMerge.findDuplicates(limit ? parseInt(limit, 10) : 50);
  }

  @Post('swimmers/:canonicalId/merge/:duplicateId')
  @ApiOperation({ summary: 'Fusionar nadador duplicado en el canónico' })
  mergeSwimmers(
    @Param('canonicalId') canonicalId: string,
    @Param('duplicateId') duplicateId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.swimmerMerge.merge(canonicalId, duplicateId, user.id);
  }

  @Get('clubs/duplicates')
  @ApiOperation({ summary: 'Candidatos a duplicado de clubes' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findClubDuplicates(@Query('limit') limit?: string) {
    return this.clubMerge.findDuplicates(limit ? parseInt(limit, 10) : 50);
  }

  @Post('clubs/:canonicalId/merge/:duplicateId')
  @ApiOperation({ summary: 'Fusionar club duplicado en el canónico' })
  mergeClubs(
    @Param('canonicalId') canonicalId: string,
    @Param('duplicateId') duplicateId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clubMerge.merge(canonicalId, duplicateId, user.id);
  }
}
