import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadImportDto {
  @ApiPropertyOptional({ description: 'Torneo al que pertenece el archivo (opcional)' })
  @IsOptional()
  @IsString()
  tournamentId?: string;
}
