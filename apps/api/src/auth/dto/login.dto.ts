import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  declare email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare password: string;
}
