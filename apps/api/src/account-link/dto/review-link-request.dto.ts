import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewLinkRequestDto {
  @ApiPropertyOptional({ description: 'Motivo de la decisión (requerido al rechazar)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
