import { describe, expect, it } from 'vitest';
import { matchesFuzzySearch, normalizeSearchText, searchPrueba } from './search';

describe('normalizeSearchText', () => {
  it('quita acentos, mayúsculas y puntuación', () => {
    expect(normalizeSearchText('  PÉREZ,  José-María ')).toBe('perez jose maria');
  });
});

describe('matchesFuzzySearch', () => {
  it('no distingue acentos', () => {
    expect(matchesFuzzySearch('Pérez Núñez, Martín', 'perez nunez')).toBe(true);
    expect(matchesFuzzySearch('Perez Martin', 'Pérez')).toBe(true);
  });

  it('acepta "Apellido Nombre" y "Nombre Apellido"', () => {
    expect(matchesFuzzySearch('LA MARCA, Emiliano', 'emiliano la marca')).toBe(true);
    expect(matchesFuzzySearch('LA MARCA, Emiliano', 'la marca emiliano')).toBe(true);
  });

  it('todas las palabras tienen que estar', () => {
    expect(matchesFuzzySearch('LA MARCA, Emiliano', 'la marca pedro')).toBe(false);
  });

  it('texto vacío coincide con todo', () => {
    expect(matchesFuzzySearch('cualquier cosa', '   ')).toBe(true);
  });
});

describe('searchPrueba', () => {
  const prueba = 'Prueba 12 100m Estilo Libre FEDERADOS';
  const rows = ['GOMEZ, Ana SLTC', 'RUIZ, Bea GYT', 'DIAZ, Caro SLTC', 'LA MARCA, Emiliano CCCT'];

  it('sin texto: visible y sin resaltar', () => {
    expect(searchPrueba(prueba, rows, '')).toEqual({ visible: true, highlighted: [false, false, false, false] });
  });

  it('por nadador: la prueba queda visible con todas las filas y resalta solo la suya', () => {
    const res = searchPrueba(prueba, rows, 'Emiliano La Marca');
    expect(res.visible).toBe(true);
    // Sigue habiendo una entrada por cada fila: no se recorta la tabla
    expect(res.highlighted).toEqual([false, false, false, true]);
  });

  it('nadador que no nada la prueba: no se muestra', () => {
    expect(searchPrueba(prueba, rows, 'fernandez').visible).toBe(false);
  });

  it('por club: resalta todas las filas del club', () => {
    expect(searchPrueba(prueba, rows, 'sltc').highlighted).toEqual([true, false, true, false]);
  });

  it('por nombre de prueba: visible y sin resaltar a nadie', () => {
    expect(searchPrueba(prueba, rows, '100 libre')).toEqual({ visible: true, highlighted: [false, false, false, false] });
  });

  it('nadador + prueba en el mismo texto', () => {
    expect(searchPrueba(prueba, rows, 'ruiz 100 libre').highlighted).toEqual([false, true, false, false]);
    expect(searchPrueba('Prueba 3 50m Pecho', rows, 'ruiz 100 libre').visible).toBe(false);
  });

  it('sin acentos', () => {
    expect(searchPrueba(prueba, ['GÓMEZ, Ána SLTC'], 'gomez ana').highlighted).toEqual([true]);
  });
});
