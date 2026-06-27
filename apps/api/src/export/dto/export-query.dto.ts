import { IsEnum, IsOptional } from 'class-validator';

export enum ExportDocType {
  ENTRIES = 'entries',
  RESULTS = 'results',
  HEAT_SHEET = 'heat_sheet',
}

export class ExportQueryDto {
  @IsOptional()
  @IsEnum(ExportDocType)
  type: ExportDocType = ExportDocType.RESULTS;
}
