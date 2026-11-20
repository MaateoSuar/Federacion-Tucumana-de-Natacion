import { IsInt, IsISO8601, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

// Edición manual de un récord vigente — usada cuando el récord es superado por
// un resultado que no fue cargado al sistema (ej. torneos fuera de la FTN o
// marcas históricas). El récord anterior NUNCA se borra: pasa a "superseded" y
// su entrada en el ranking se conserva (solo se recalcula su posición).
export class UpdateRecordDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  clubId!: string;

  @IsInt()
  @IsPositive()
  timeMs!: number;

  @IsISO8601()
  recordDate!: string;

  @IsOptional()
  @IsString()
  tournamentName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
