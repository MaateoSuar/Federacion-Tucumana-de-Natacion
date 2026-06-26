import { IsString, IsNotEmpty, IsEnum, IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventRound } from '@prisma/client';
import { Type } from 'class-transformer';

export class AddEventDto {
  @ApiProperty({ description: 'ID del EventDefinition (catálogo de pruebas)' })
  @IsString()
  @IsNotEmpty()
  eventDefinitionId!: string;

  @ApiProperty({ description: 'ID de la categoría para esta prueba' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiPropertyOptional({ enum: EventRound, default: EventRound.serie_unica })
  @IsOptional()
  @IsEnum(EventRound)
  round?: EventRound;

  @ApiPropertyOptional({ description: 'Orden de la prueba dentro del torneo', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  orderNo?: number;
}
