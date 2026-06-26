import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TournamentStatus } from '@prisma/client';

export class TransitionStatusDto {
  @ApiProperty({
    enum: TournamentStatus,
    description: 'Estado destino de la transición',
  })
  @IsEnum(TournamentStatus)
  status!: TournamentStatus;
}
