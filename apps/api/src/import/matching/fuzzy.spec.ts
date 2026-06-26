import { normalizeText, levenshtein, similarity } from './fuzzy';

describe('normalizeText', () => {
  it('lowercase y sin tildes', () => {
    expect(normalizeText('Pérez García')).toBe('perez garcia');
  });
  it('colapsa espacios extra', () => {
    expect(normalizeText('  Juan   Pérez  ')).toBe('juan perez');
  });
});

describe('levenshtein', () => {
  it('strings idénticos → 0', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('una sustitución → 1', () => {
    expect(levenshtein('abc', 'axc')).toBe(1);
  });
  it('una inserción → 1', () => {
    expect(levenshtein('ab', 'abc')).toBe(1);
  });
  it('una eliminación → 1', () => {
    expect(levenshtein('abc', 'ab')).toBe(1);
  });
  it('vacío vs string → longitud del string', () => {
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('similarity', () => {
  it('strings iguales → 1', () => {
    expect(similarity('Juan', 'Juan')).toBe(1);
  });
  it('strings con tildes equivalentes → 1', () => {
    expect(similarity('Pérez', 'Perez')).toBe(1);
  });
  it('strings muy distintos → valor bajo', () => {
    expect(similarity('abc', 'xyz')).toBeLessThan(0.5);
  });
});
