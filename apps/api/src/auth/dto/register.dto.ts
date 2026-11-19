import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  declare email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  declare password: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  declare firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  declare lastName: string;

  @ApiProperty({ required: false, example: 'FTN-7K3M-9PQX', description: 'Código de perfil que entrega la federación o el club: vincula la cuenta al nadador y la deja verificada.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  declare claimCode?: string;
}
