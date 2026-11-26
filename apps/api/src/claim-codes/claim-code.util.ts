import * as crypto from 'crypto';

// Sin 0/O, 1/I/L ni U: se dictan por teléfono y se tipean a mano sin confundirse.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const BODY_LENGTH = 8;
const PREFIX = 'FTN';

/** Código nuevo con formato FTN-XXXX-XXXX (8 caracteres al azar criptográfico). */
export function generateClaimCode(): string {
  let body = '';
  for (let i = 0; i < BODY_LENGTH; i++) body += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * Lleva lo que escribió la persona (minúsculas, espacios, guiones, con o sin "FTN") al cuerpo de
 * 8 caracteres. Devuelve null si no tiene la forma de un código.
 */
export function normalizeClaimCode(input: string): string | null {
  let cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.startsWith(PREFIX) && cleaned.length === PREFIX.length + BODY_LENGTH) cleaned = cleaned.slice(PREFIX.length);
  if (cleaned.length !== BODY_LENGTH) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** Lo que se guarda en la base: el código en claro nunca se persiste. */
export function hashClaimCodeBody(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function formatClaimCodeBody(body: string): string {
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}
