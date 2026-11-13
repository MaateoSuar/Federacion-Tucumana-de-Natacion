import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class EventRankingQueryDto {
  @IsString()
  eventDefinitionId!: string;

  @IsEnum(['P25', 'P50'])
  poolLength!: 'P25' | 'P50';

  @IsEnum(['M', 'F', 'MIX'])
  gender!: 'M' | 'F' | 'MIX';

  @IsOptional()
  @IsEnum(['provincial', 'nacional'])
  scope?: 'provincial' | 'nacional' = 'provincial';

  @IsOptional()
  @IsString()
  seasonId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  // Período elegido (fecha del torneo / del récord), formato AAAA-MM-DD.
  // Si viene alguno de los dos, tiene prioridad sobre seasonId.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener formato AAAA-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener formato AAAA-MM-DD' })
  to?: string;
}
