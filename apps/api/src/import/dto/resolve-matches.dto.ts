import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, ValidateNested, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatchDecisionDto {
  @ApiProperty({ description: 'swimmerRef o clubRef del match en el preview' })
  @IsString()
  ref!: string;

  @ApiProperty({ enum: ['link', 'new'] })
  @IsIn(['link', 'new'])
  decision!: 'link' | 'new';

  @ApiPropertyOptional({ description: 'ID del candidato elegido (requerido si decision = link)' })
  @ValidateIf((o: MatchDecisionDto) => o.decision === 'link')
  @IsString()
  targetId?: string;
}

export class ResolveMatchesDto {
  @ApiPropertyOptional({ type: [MatchDecisionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MatchDecisionDto)
  swimmers?: MatchDecisionDto[];

  @ApiPropertyOptional({ type: [MatchDecisionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MatchDecisionDto)
  clubs?: MatchDecisionDto[];
}
