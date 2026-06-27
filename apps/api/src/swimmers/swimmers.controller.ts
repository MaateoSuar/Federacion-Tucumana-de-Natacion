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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { SwimmersService } from './swimmers.service';
import { CreateSwimmerDto } from './dto/create-swimmer.dto';
import { UpdateSwimmerDto } from './dto/update-swimmer.dto';
import { AssignClubDto } from './dto/assign-club.dto';
import { UpdateAthleteProfileDto } from './dto/update-athlete-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { SystemRole } from '@ftn/shared';

@ApiTags('swimmers')
@Controller('swimmers')
export class SwimmersController {
  constructor(private readonly swimmersService: SwimmersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nadador' })
  create(@Body() dto: CreateSwimmerDto) {
    return this.swimmersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar nadadores' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'clubId', required: false })
  @ApiQuery({ name: 'gender', required: false, enum: Gender })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('search') search?: string,
    @Query('clubId') clubId?: string,
    @Query('gender') gender?: Gender,
    @Query('isActive') isActive?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    const isActiveParsed =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.swimmersService.findAll({ search, clubId, gender, isActive: isActiveParsed, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de nadador' })
  findOne(@Param('id') id: string) {
    return this.swimmersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar nadador' })
  update(@Param('id') id: string, @Body() dto: UpdateSwimmerDto) {
    return this.swimmersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar nadador (soft delete)' })
  remove(@Param('id') id: string) {
    return this.swimmersService.remove(id);
  }

  @Post(':id/club-assignment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Asignar / transferir nadador a un club' })
  assignClub(@Param('id') id: string, @Body() dto: AssignClubDto) {
    return this.swimmersService.assignClub(id, dto);
  }

  @Get(':id/club-history')
  @ApiOperation({ summary: 'Historial de clubes del nadador por temporada' })
  getClubHistory(@Param('id') id: string) {
    return this.swimmersService.getClubHistory(id);
  }

  @Get(':id/personal-bests')
  @ApiOperation({ summary: 'Mejores marcas personales del nadador' })
  getPersonalBests(@Param('id') id: string) {
    return this.swimmersService.getPersonalBests(id);
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Historial de resultados homologados del nadador' })
  getResults(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.swimmersService.getResults(id, page, limit);
  }

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Estadísticas del nadador (medallas, PBs, logros)' })
  getStatistics(@Param('id') id: string) {
    return this.swimmersService.getStatistics(id);
  }

  @Get(':id/time-evolution')
  @ApiOperation({ summary: 'Evolución de tiempos por prueba/temporada' })
  @ApiQuery({ name: 'poolLength', required: false, enum: ['P25', 'P50'] })
  getTimeEvolution(@Param('id') id: string, @Query('poolLength') poolLength?: string) {
    return this.swimmersService.getTimeEvolution(id, poolLength);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Perfil público del atleta' })
  getProfile(@Param('id') id: string) {
    return this.swimmersService.getProfile(id);
  }

  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar perfil del atleta (nadador vinculado o admin)' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateAthleteProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.swimmersService.updateProfile(id, user.id, dto);
  }
}
