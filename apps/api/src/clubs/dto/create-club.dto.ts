import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsEmail,
  IsUrl,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClubStatus } from '@prisma/client';

export class CreateClubDto {
  @ApiProperty({ example: 'Club Atlético Tucumán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'CAT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  shortName!: string;

  @ApiProperty({ example: 'San Miguel de Tucumán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  locality!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logos/cat.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 1985 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  foundedYear?: number;

  @ApiPropertyOptional({ example: 'contacto@cat.org.ar' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ enum: ClubStatus, default: ClubStatus.afiliado })
  @IsOptional()
  @IsEnum(ClubStatus)
  status?: ClubStatus;
}
