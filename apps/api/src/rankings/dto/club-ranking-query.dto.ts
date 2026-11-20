import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ClubRankingQueryDto {
  @IsOptional()
  @IsString()
  seasonId?: string;

  // Si se indica, el ranking se acota a ESE torneo puntual (ignora seasonId).
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsEnum(['provincial', 'nacional'])
  scope?: 'provincial' | 'nacional' = 'provincial';
}
