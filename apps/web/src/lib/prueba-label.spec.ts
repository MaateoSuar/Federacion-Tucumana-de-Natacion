import { describe, expect, it } from 'vitest';
import { matchesPruebaFilter, parsePruebaLabel, pruebaFilterOptions } from './prueba-label';

// Nombres reales del archivo "Tucumán NOA y Prov Urueña 06-2026" (Meet Manager).
describe('parsePruebaLabel', () => {
  it.each([
    ['50m Estilo Libre FEDERADOS', 50, 'libre', 'FEDERADOS'],
    ['100m Estilo Libre PROMOCIONAL', 100, 'libre', 'PROMOCIONAL'],
    ['50m Estilo Libre PROMOCIONALES', 50, 'libre', 'PROMOCIONAL'],
    ['200m CI FEDERADOS', 200, 'combinado', 'FEDERADOS'],
    ['100m CI PROMOCIONAL', 100, 'combinado', 'PROMOCIONAL'],
    ['50m Estilo de Mariposa FEDERADOS', 50, 'mariposa', 'FEDERADOS'],
    ['25m Estilo de Pecho ESCUELA', 25, 'pecho', 'ESCUELA'],
    ['200m Estilo de Espalda PROMOCIONALES', 200, 'espalda', 'PROMOCIONAL'],
  ] as const)('%s', (label, distance, stroke, level) => {
    expect(parsePruebaLabel(label)).toEqual({ distance, stroke, level });
  });

  it('ignora la categoría que viene después del guion largo', () => {
    expect(parsePruebaLabel('50m Estilo Libre FEDERADOS — Niñas 12-13')).toEqual({
      distance: 50, stroke: 'libre', level: 'FEDERADOS',
    });
  });

  it('un nombre que no entiende no rompe: deja los datos en null', () => {
    expect(parsePruebaLabel('Relevo especial')).toEqual({ distance: null, stroke: null, level: null });
  });

  it('"Estilo Libre" es libre aunque el nombre tenga otras palabras', () => {
    expect(parsePruebaLabel('400m Estilo Libre').stroke).toBe('libre');
  });
});

describe('matchesPruebaFilter', () => {
  const label = '100m Estilo de Espalda FEDERADOS — Niños 14-15';

  it('sin filtros, entra todo', () => {
    expect(matchesPruebaFilter(label, { stroke: '', distance: '' })).toBe(true);
    expect(matchesPruebaFilter('Relevo especial', { stroke: '', distance: '' })).toBe(true);
  });

  it('filtra por estilo, por distancia o por los dos', () => {
    expect(matchesPruebaFilter(label, { stroke: 'espalda', distance: '' })).toBe(true);
    expect(matchesPruebaFilter(label, { stroke: 'pecho', distance: '' })).toBe(false);
    expect(matchesPruebaFilter(label, { stroke: '', distance: 100 })).toBe(true);
    expect(matchesPruebaFilter(label, { stroke: '', distance: 50 })).toBe(false);
    expect(matchesPruebaFilter(label, { stroke: 'espalda', distance: 100 })).toBe(true);
    expect(matchesPruebaFilter(label, { stroke: 'espalda', distance: 200 })).toBe(false);
  });

  it('con un filtro activo, lo que no se pudo leer queda afuera', () => {
    expect(matchesPruebaFilter('Relevo especial', { stroke: 'libre', distance: '' })).toBe(false);
  });
});

describe('pruebaFilterOptions', () => {
  it('ofrece solo los estilos y distancias que existen, en orden', () => {
    const options = pruebaFilterOptions([
      '200m CI FEDERADOS — Niñas 12-13',
      '50m Estilo de Mariposa FEDERADOS — Niñas 12-13',
      '50m Estilo Libre FEDERADOS — Niños 12-13',
      '100m Estilo Libre PROMOCIONAL — Niños 10-11',
      '50m Estilo Libre FEDERADOS — Niñas 14-15',
    ]);
    expect(options).toEqual({ strokes: ['libre', 'mariposa', 'combinado'], distances: [50, 100, 200] });
  });
});
