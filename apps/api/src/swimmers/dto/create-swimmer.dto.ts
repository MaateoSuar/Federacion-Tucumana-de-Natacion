import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsUrl,
  MaxLength,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class CreateSwimmerDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: '30123456' })
  @IsOptional()
  @IsString()
  @Length(6, 15)
  documentId?: string;

  @ApiPropertyOptional({ example: '2005-03-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiPropertyOptional({ example: 'ARG' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  nationality?: string;

  @ApiPropertyOptional({ description: 'ID del club actual' })
  @IsOptional()
  @IsString()
  currentClubId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/juan.jpg' })
  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
