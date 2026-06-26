import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ClubRankingQueryDto {
  @IsOptional()
  @IsString()
  seasonId?: string;

  @IsOptional()
  @IsEnum(['provincial', 'nacional'])
  scope?: 'provincial' | 'nacional' = 'provincial';
}
