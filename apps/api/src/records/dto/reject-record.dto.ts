import { IsOptional, IsString, MaxLength } from 'class-validator';

// Rechazo de un candidato a récord. El motivo queda en audit_logs.
export class RejectRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
