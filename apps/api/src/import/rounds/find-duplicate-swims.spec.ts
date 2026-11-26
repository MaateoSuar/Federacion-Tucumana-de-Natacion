import { findDuplicateSwims, type StoredResultRow } from './find-duplicate-swims';

const row = (id: string, over: Partial<StoredResultRow> = {}): StoredResultRow => ({
  id, swimmerId: 'sw-1', eventId: 'ev-1', eventDefinitionId: 'ed-1', level: null, heatNo: 1, lane: 17, finalTime: 78_720,
  splitCount: 0, protectedRow: false, ...over,
});

describe('findDuplicateSwims', () => {
  it('dos filas con el mismo nadador, prueba, serie, carril y tiempo: se conserva una y se borra la otra', () => {
    const out = findDuplicateSwims([row('b'), row('a')]);
    expect(out).toEqual([{ keep: 'a', remove: ['b'], blocked: [] }]);
  });

  it('dos nadadores empatados (mismo carril y tiempo) no son duplicados entre sí', () => {
    expect(findDuplicateSwims([row('a'), row('b', { swimmerId: 'sw-2' })])).toEqual([]);
  });

  it('dos nadadores empatados, cada uno copiado dos veces: un grupo por nadador', () => {
    const out = findDuplicateSwims([row('a1'), row('a2'), row('b1', { swimmerId: 'sw-2' }), row('b2', { swimmerId: 'sw-2' })]);
    expect(out.map((g) => [g.keep, g.remove])).toEqual([['a1', ['a2']], ['b1', ['b2']]]);
  });

  it('otro tiempo, otra serie, otro carril, otra prueba o otro nivel: no es copia', () => {
    const base = row('a');
    for (const other of [row('b', { finalTime: 78_730 }), row('b', { heatNo: 2 }), row('b', { lane: 3 }), row('b', { eventDefinitionId: 'ed-2' }), row('b', { level: 'PROMOCIONAL' })]) {
      expect(findDuplicateSwims([base, other])).toEqual([]);
    }
  });

  it('las filas sin tiempo (DQ/DNS) no se consideran copias', () => {
    expect(findDuplicateSwims([row('a', { finalTime: null }), row('b', { finalTime: null })])).toEqual([]);
  });

  it('sin serie o sin carril no hay evidencia de copia: no se agrupan', () => {
    expect(findDuplicateSwims([row('a', { heatNo: null }), row('b', { heatNo: null })])).toEqual([]);
    expect(findDuplicateSwims([row('a', { lane: null }), row('b', { lane: null })])).toEqual([]);
  });

  it('una eliminatoria y una final ya separadas en eventos distintos, aunque coincidan serie, carril y tiempo, no son copias', () => {
    expect(findDuplicateSwims([row('a', { eventId: 'ev-clasificatorio' }), row('b', { eventId: 'ev-final' })])).toEqual([]);
  });

  it('se conserva la fila protegida y las protegidas nunca se borran', () => {
    const out = findDuplicateSwims([row('a'), row('b', { protectedRow: true }), row('c', { protectedRow: true })]);
    expect(out).toEqual([{ keep: 'b', remove: ['a'], blocked: ['c'] }]);
  });

  it('entre copias iguales se conserva la que tiene parciales', () => {
    const out = findDuplicateSwims([row('a'), row('b', { splitCount: 4 })]);
    expect(out).toEqual([{ keep: 'b', remove: ['a'], blocked: [] }]);
  });

  it('tres copias: queda una', () => {
    const out = findDuplicateSwims([row('c'), row('a'), row('b')]);
    expect(out).toEqual([{ keep: 'a', remove: ['b', 'c'], blocked: [] }]);
  });
});
