import { describe, expect, it } from 'vitest';
import { formatClaimCode, isValidClaimCode } from './claim-code';

describe('formatClaimCode', () => {
  it('normaliza minúsculas, espacios y guiones', () => {
    expect(formatClaimCode('ftn 1a2b-3c4d')).toBe('FTN-1A2B-3C4D');
    expect(formatClaimCode('  ftn-ab12-cd34  ')).toBe('FTN-AB12-CD34');
  });

  it('acepta el código sin el prefijo', () => {
    expect(formatClaimCode('ab12cd34')).toBe('FTN-AB12-CD34');
  });

  it('formatea de forma progresiva mientras se escribe', () => {
    expect(formatClaimCode('')).toBe('');
    expect(formatClaimCode('f')).toBe('F');
    expect(formatClaimCode('ft')).toBe('FT');
    expect(formatClaimCode('ftn')).toBe('FTN');
    expect(formatClaimCode('ftn1')).toBe('FTN-1');
    expect(formatClaimCode('FTN-1234')).toBe('FTN-1234');
    expect(formatClaimCode('FTN-12345')).toBe('FTN-1234-5');
  });

  it('recorta lo que sobra', () => {
    expect(formatClaimCode('FTN-1234-5678-9999')).toBe('FTN-1234-5678');
  });
});

describe('isValidClaimCode', () => {
  it('solo valida el formato completo', () => {
    expect(isValidClaimCode('FTN-AB12-CD34')).toBe(true);
    expect(isValidClaimCode('FTN-AB12-CD3')).toBe(false);
    expect(isValidClaimCode('ftn-ab12-cd34')).toBe(false);
    expect(isValidClaimCode('')).toBe(false);
  });
});
