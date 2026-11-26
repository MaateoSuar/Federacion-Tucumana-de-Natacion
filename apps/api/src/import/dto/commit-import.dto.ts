import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CommitImportDto {
  @ApiPropertyOptional({
    description:
      'Torneo existente donde cargar los resultados (jornadas de un mismo torneo). ' +
      'Si se omite, se crea un torneo nuevo. La pileta del archivo tiene que coincidir con la del torneo.',
  })
  @IsOptional()
  @IsString()
  tournamentId?: string;
}
