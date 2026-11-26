/**
 * Código de perfil: FTN-XXXX-XXXX (letras y números).
 * Se acepta en mayúsculas/minúsculas, con espacios o guiones, y se normaliza.
 */

const PREFIX = 'FTN';
const BODY_LENGTH = 8;
const CLAIM_CODE_REGEX = /^FTN-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Normaliza lo que escribe o pega la persona al formato FTN-XXXX-XXXX (progresivo). */
export function formatClaimCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 0) return '';
  // Mientras escribe el prefijo ("F", "FT") se lo respeta tal cual.
  if (clean.length < PREFIX.length && PREFIX.startsWith(clean)) return clean;

  const body = (clean.startsWith(PREFIX) ? clean.slice(PREFIX.length) : clean).slice(0, BODY_LENGTH);
  if (body.length === 0) return PREFIX;
  return body.length > 4 ? `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}` : `${PREFIX}-${body}`;
}

/** true si el código está completo y bien formado. */
export function isValidClaimCode(code: string): boolean {
  return CLAIM_CODE_REGEX.test(code);
}
