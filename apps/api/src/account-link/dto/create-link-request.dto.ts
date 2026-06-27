import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLinkRequestDto {
  @ApiProperty({ description: 'ID del swimmer a vincular' })
  @IsString()
  @IsNotEmpty()
  swimmerId!: string;

  @ApiPropertyOptional({ description: 'Motivo o nota del solicitante' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
