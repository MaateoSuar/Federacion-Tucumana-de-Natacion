import { IsString, IsNotEmpty, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TournamentDocType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: TournamentDocType, example: TournamentDocType.convocatoria })
  @IsEnum(TournamentDocType)
  type!: TournamentDocType;

  @ApiProperty({ example: 'Convocatoria Campeonato Provincial 2025' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
