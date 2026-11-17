import { describe, expect, it } from 'vitest';
import { categoryPlacings } from './event-placings';

const r = (name: string, categoryId: string, status = 'OK') => ({ name, status, category: { id: categoryId } });

describe('categoryPlacings', () => {
  it('numera dentro de cada categoría, en el orden recibido', () => {
    const out = categoryPlacings([r('a', 'CAD'), r('b', 'JUV'), r('c', 'CAD'), r('d', 'CAD'), r('e', 'JUV')]);
    expect(out.map((x) => `${x.result.name}:${x.place}`)).toEqual(['a:1', 'b:1', 'c:2', 'd:3', 'e:2']);
  });

  it('descalificados y ausentes no tienen puesto ni corren a los demás', () => {
    const out = categoryPlacings([r('a', 'CAD'), r('b', 'CAD', 'DSQ'), r('c', 'CAD'), r('d', 'CAD', 'DNS')]);
    expect(out.map((x) => x.place)).toEqual([1, null, 2, null]);
  });
});
