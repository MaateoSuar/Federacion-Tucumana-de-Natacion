import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PoolLength, TournamentType, Scope } from '@prisma/client';

export class CreateTournamentDto {
  @ApiProperty({ example: 'Campeonato Provincial de Verano 2025' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'ID del club sede' })
  @IsOptional()
  @IsString()
  hostClubId?: string;

  @ApiPropertyOptional({ example: 'Polideportivo Municipal — San Miguel de Tucumán' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  venue?: string;

  @ApiProperty({ enum: PoolLength, example: PoolLength.P50 })
  @IsEnum(PoolLength)
  poolLength!: PoolLength;

  @ApiProperty({ example: '2025-03-15T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2025-03-16T00:00:00.000Z' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ enum: TournamentType, example: TournamentType.provincial })
  @IsEnum(TournamentType)
  type!: TournamentType;

  @ApiPropertyOptional({ enum: Scope, default: Scope.provincial })
  @IsOptional()
  @IsEnum(Scope)
  scope?: Scope;

  @ApiProperty({ description: 'ID de la temporada (Season)' })
  @IsString()
  @IsNotEmpty()
  seasonId!: string;
}
