import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}
