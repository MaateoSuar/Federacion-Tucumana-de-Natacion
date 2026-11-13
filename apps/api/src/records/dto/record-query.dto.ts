import { IsEnum, IsOptional, IsString } from 'class-validator';

export class RecordQueryDto {
  @IsOptional()
  @IsEnum(['provincial', 'nacional'])
  scope?: 'provincial' | 'nacional' = 'provincial';

  @IsOptional()
  @IsString()
  eventDefinitionId?: string;

  @IsOptional()
  @IsEnum(['P25', 'P50'])
  poolLength?: 'P25' | 'P50';

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(['M', 'F', 'MIX'])
  gender?: 'M' | 'F' | 'MIX';
}
