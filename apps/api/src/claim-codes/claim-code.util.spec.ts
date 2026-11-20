import { formatClaimCodeBody, generateClaimCode, hashClaimCodeBody, normalizeClaimCode } from './claim-code.util';

describe('códigos de perfil — formato', () => {
  it('genera FTN-XXXX-XXXX sin caracteres confusos (0, O, 1, I, L, U)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateClaimCode();
      expect(code).toMatch(/^FTN-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[01OILU]/);
    }
  });

  it('no repite códigos (8 caracteres al azar criptográfico)', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateClaimCode()));
    expect(seen.size).toBe(2000);
  });

  it('acepta lo que escribe la gente: minúsculas, espacios, guiones, sin prefijo', () => {
    const canonical = normalizeClaimCode('FTN-7K3M-9PQX');
    expect(canonical).toBe('7K3M9PQX');
    expect(normalizeClaimCode('ftn 7k3m 9pqx')).toBe(canonical);
    expect(normalizeClaimCode('  ftn7k3m9pqx ')).toBe(canonical);
    expect(normalizeClaimCode('7k3m-9pqx')).toBe(canonical);
  });

  it('rechaza lo que no tiene forma de código', () => {
    expect(normalizeClaimCode('')).toBeNull();
    expect(normalizeClaimCode('FTN-123')).toBeNull();
    expect(normalizeClaimCode('FTN-7K3M-9PQX-EXTRA')).toBeNull();
    expect(normalizeClaimCode('FTN-0OIL-UUUU')).toBeNull(); // caracteres fuera del alfabeto
  });

  it('el hash es estable y distinto del código (nunca se guarda en claro)', () => {
    const body = normalizeClaimCode('FTN-7K3M-9PQX') as string;
    expect(hashClaimCodeBody(body)).toBe(hashClaimCodeBody(body));
    expect(hashClaimCodeBody(body)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClaimCodeBody(body)).not.toContain(body);
    expect(formatClaimCodeBody(body)).toBe('FTN-7K3M-9PQX');
  });
});
