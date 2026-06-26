import { IsString, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignClubDto {
  @ApiProperty({ description: 'ID del club al que se asigna el nadador' })
  @IsString()
  @IsNotEmpty()
  clubId!: string;

  @ApiProperty({ description: 'ID de la temporada en curso' })
  @IsString()
  @IsNotEmpty()
  seasonId!: string;

  @ApiProperty({ example: '2025-01-01', description: 'Fecha de inicio de la pertenencia' })
  @IsDateString()
  startDate!: string;
}
