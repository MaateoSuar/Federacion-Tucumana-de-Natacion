import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAthleteProfileDto {
  @ApiPropertyOptional({ description: 'Biografía pública del nadador' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ description: 'URL de foto de perfil' })
  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Visibilidad pública del perfil' })
  @IsOptional()
  @IsBoolean()
  publicVisibility?: boolean;
}
