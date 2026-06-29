import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum RankingMode {
  BEST_PER_SWIMMER = 'best_per_swimmer',
  ALL_PERFORMANCES = 'all_performances',
}

export class EventRankingQueryDto {
  @IsString()
  eventDefinitionId!: string;

  @IsEnum(['P25', 'P50'])
  poolLength!: 'P25' | 'P50';

  @IsEnum(['M', 'F'])
  gender!: 'M' | 'F';

  @IsOptional()
  @IsEnum(['provincial', 'nacional'])
  scope?: 'provincial' | 'nacional' = 'provincial';

  @IsOptional()
  @IsString()
  seasonId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(RankingMode)
  mode?: RankingMode = RankingMode.ALL_PERFORMANCES;
}
