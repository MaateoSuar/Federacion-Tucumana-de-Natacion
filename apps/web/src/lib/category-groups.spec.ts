import { describe, expect, it } from 'vitest';
import { groupKeyOf, groupResultsByCategory } from './category-groups';

const cat = (id: string, code: string | undefined, name: string, orderNo: number) => ({ id, code, name, orderNo });
const r = (id: string, category: ReturnType<typeof cat>) => ({ id, category });

describe('groupKeyOf', () => {
  it('Cadete 1 y Cadete 2 son la categoría global Cadetes', () => {
    expect(groupKeyOf(cat('a', 'CAD_1', 'Cadete 1', 7))).toBe('CAD');
    expect(groupKeyOf(cat('b', 'CAD_2', 'Cadete 2', 8))).toBe('CAD');
    expect(groupKeyOf(cat('c', 'CAD', 'Cadetes', 15))).toBe('CAD');
  });

  it('Pre A, Mayores y Junior son su propio grupo', () => {
    expect(groupKeyOf(cat('a', 'PRE_A', 'Pre A', 1))).toBe('PRE_A');
    expect(groupKeyOf(cat('b', 'MAY', 'Mayores', 11))).toBe('MAY');
    expect(groupKeyOf(cat('c', 'JUN', 'Junior', 12))).toBe('JUN');
  });

  it('si el código no viene, se reconoce por el nombre', () => {
    expect(groupKeyOf(cat('a', undefined, 'Juvenil 2', 10))).toBe('JUV');
  });
});

describe('groupResultsByCategory', () => {
  const cad1 = cat('c1', 'CAD_1', 'Cadete 1', 7);
  const cad2 = cat('c2', 'CAD_2', 'Cadete 2', 8);
  const juv1 = cat('j1', 'JUV_1', 'Juvenil 1', 9);

  it('junta todos los cadetes y todos los juveniles, en el orden en que vienen', () => {
    const groups = groupResultsByCategory([r('1', cad2), r('2', juv1), r('3', cad1), r('4', cad2)]);

    expect(groups.map((g) => [g.key, g.name, g.results.map((x) => x.id)])).toEqual([
      ['CAD', 'Cadetes', ['1', '3', '4']],
      ['JUV', 'Juveniles', ['2']],
    ]);
  });

  it('lista las subcategorías presentes en orden', () => {
    const [cadetes] = groupResultsByCategory([r('1', cad2), r('2', cad1)]);
    expect(cadetes?.categories.map((c) => c.name)).toEqual(['Cadete 1', 'Cadete 2']);
  });

  it('ordena los grupos por categoría de menor a mayor', () => {
    const groups = groupResultsByCategory([r('1', juv1), r('2', cad1), r('3', cat('m', 'MAY', 'Mayores', 11))]);
    expect(groups.map((g) => g.key)).toEqual(['CAD', 'JUV', 'MAY']);
  });
});
