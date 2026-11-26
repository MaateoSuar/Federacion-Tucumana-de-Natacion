import { normalizeText, levenshtein, similarity, tokenize, jaroWinkler } from './fuzzy';

describe('tokenize', () => {
  it('separa palabras normalizadas', () => {
    expect(tokenize('  Rodríguez-Suár, Mateo ')).toEqual(['rodriguez', 'suar', 'mateo']);
  });
  it('compacta siglas con puntos', () => {
    expect(tokenize('C.A.T.')).toEqual(['cat']);
    expect(tokenize('C.N. Monteros')).toEqual(['cn', 'monteros']);
  });
  it('no pega una inicial con la palabra siguiente', () => {
    expect(tokenize('M. Rodriguez')).toEqual(['m', 'rodriguez']);
    expect(tokenize('Club Atl. Tucumán')).toEqual(['club', 'atl', 'tucuman']);
  });
});

describe('jaroWinkler', () => {
  it('idénticos → 1', () => {
    expect(jaroWinkler('mateo', 'mateo')).toBe(1);
  });
  it('error de tipeo → alto', () => {
    expect(jaroWinkler('mateeo', 'mateo')).toBeGreaterThan(0.9);
    expect(jaroWinkler('rodrigues', 'rodriguez')).toBeGreaterThan(0.9);
  });
  it('nombres distintos → bajo', () => {
    expect(jaroWinkler('mateo', 'matias')).toBeLessThan(0.85);
    expect(jaroWinkler('juan', 'pedro')).toBeLessThan(0.6);
  });
});

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
