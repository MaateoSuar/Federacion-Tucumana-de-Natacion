import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Foto de perfil como imagen embebida (JPG/PNG/WebP en base64, ya recortada y comprimida por la web). */
export const PROFILE_PHOTO_MAX_CHARS = 450_000;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * La foto puede ser: vacía/null (quitarla), una imagen embebida (data URL de JPG/PNG/WebP de hasta
 * ~330 KB) o un enlace https. Nada más: sin javascript:, sin SVG (puede traer scripts), sin http.
 */
export function IsProfilePhoto(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isProfilePhoto',
      target: object.constructor,
      propertyName,
      options: { message: 'La foto debe ser una imagen JPG, PNG o WebP de hasta ~330 KB (o un enlace https).', ...options },
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined || value === '') return true;
          if (typeof value !== 'string') return false;
          if (value.startsWith('data:')) return value.length <= PROFILE_PHOTO_MAX_CHARS && DATA_URL.test(value);
          return value.length <= 500 && /^https:\/\/[^\s]+$/i.test(value);
        },
      },
    });
  };
}

/** Usuarios de redes sociales: solo el nombre de usuario (sin @ ni enlaces); la web arma el enlace. */
const HANDLE = /^[A-Za-z0-9._]{1,40}$/;
const HANDLE_MESSAGE = 'Escribí solo el nombre de usuario (letras, números, punto o guion bajo), sin @ ni enlaces.';

export class SocialLinksDto {
  @ApiPropertyOptional() @IsOptional() @Matches(HANDLE, { message: HANDLE_MESSAGE }) instagram?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HANDLE, { message: HANDLE_MESSAGE }) tiktok?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HANDLE, { message: HANDLE_MESSAGE }) facebook?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HANDLE, { message: HANDLE_MESSAGE }) x?: string;
}

export class UpdateAthleteProfileDto {
  @ApiPropertyOptional({ description: 'Presentación pública del nadador (vacía para borrarla)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string | null;

  @ApiPropertyOptional({ description: 'Foto de perfil (imagen embebida o enlace https; vacía para quitarla)' })
  @IsOptional()
  @IsProfilePhoto()
  photoUrl?: string | null;

  @ApiPropertyOptional({ description: 'Si es false, foto, presentación y redes no se muestran en el perfil público' })
  @IsOptional()
  @IsBoolean()
  publicVisibility?: boolean;

  @ApiPropertyOptional({ type: SocialLinksDto, description: 'Redes sociales (solo nombres de usuario)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;
}
