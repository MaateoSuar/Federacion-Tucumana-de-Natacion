import { IsString, IsNotEmpty, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TournamentDayFileType } from '@prisma/client';

export class UploadDayFileDto {
  @ApiProperty({ enum: TournamentDayFileType, example: TournamentDayFileType.sembrados })
  @IsEnum(TournamentDayFileType)
  type!: TournamentDayFileType;

  @ApiProperty({ example: 'Sembrados jornada 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
