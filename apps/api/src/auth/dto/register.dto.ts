import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
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

  @ApiProperty({ example: 'FTN-7K3M-9PQX', description: 'Código de perfil (obligatorio) que entrega la federación o el club: vincula la cuenta al nadador y la deja verificada.' })
  @IsString()
  @IsNotEmpty({ message: 'Para crear tu cuenta necesitás el código de perfil que te da tu club o la federación.' })
  @MaxLength(40)
  declare claimCode: string;
}
