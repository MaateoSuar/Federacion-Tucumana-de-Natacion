import { matchSwims, swimKey, type StoredSwim, type SwimKeyParts } from './match-existing-swims';

const swim = (over: Partial<SwimKeyParts> = {}): SwimKeyParts => ({
  stroke: 'libre', distance: 100, gender: 'F', heatNo: 1, lane: 3, finalTimeMs: 60_000, ...over,
});
const stored = (id: string, over: Partial<SwimKeyParts> = {}): StoredSwim => ({ resultId: id, ...swim(over) });

describe('matchSwims', () => {
  it('empareja un nado del PDF con el único resultado equivalente de la base', () => {
    const out = matchSwims([swim()], [stored('r1'), stored('r2', { lane: 4 })]);
    expect(out).toEqual({ matchedResultIds: ['r1'], unmatched: 0, ambiguous: 0 });
  });

  it('un nado sin equivalente se cuenta como no emparejado y no se mueve nada', () => {
    const out = matchSwims([swim({ finalTimeMs: 59_000 })], [stored('r1')]);
    expect(out).toEqual({ matchedResultIds: [], unmatched: 1, ambiguous: 0 });
  });

  it('si dos resultados de la base coinciden, es ambiguo y no se toca ninguno', () => {
    const out = matchSwims([swim()], [stored('r1'), stored('r2')]);
    expect(out).toEqual({ matchedResultIds: [], unmatched: 0, ambiguous: 1 });
  });

  it('género, estilo y distancia distinguen nados con la misma serie, carril y tiempo', () => {
    const out = matchSwims(
      [swim({ gender: 'M' })],
      [stored('f', { gender: 'F' }), stored('m', { gender: 'M' }), stored('e', { gender: 'M', stroke: 'espalda' })],
    );
    expect(out.matchedResultIds).toEqual(['m']);
  });

  it('descalificados (sin tiempo) se identifican por serie y carril', () => {
    const out = matchSwims([swim({ finalTimeMs: null })], [stored('r1', { finalTimeMs: null }), stored('r2')]);
    expect(out.matchedResultIds).toEqual(['r1']);
  });

  it('el mismo nado pedido dos veces con una sola fila en la base: se mueve esa y la otra queda sin pareja', () => {
    const out = matchSwims([swim(), swim()], [stored('r1')]);
    expect(out).toEqual({ matchedResultIds: ['r1'], unmatched: 1, ambiguous: 0 });
  });

  it('dos nadadores empatados (misma serie, carril y tiempo): el PDF pide 2 y la base tiene 2, se emparejan los dos', () => {
    const out = matchSwims([swim(), swim()], [stored('r1'), stored('r2')]);
    expect(out).toEqual({ matchedResultIds: ['r1', 'r2'], unmatched: 0, ambiguous: 0 });
  });

  it('el PDF pide 2 y la base tiene 3 (hay una copia vieja): es ambiguo y no se mueve ninguna', () => {
    const out = matchSwims([swim(), swim()], [stored('r1'), stored('r2'), stored('r3')]);
    expect(out).toEqual({ matchedResultIds: [], unmatched: 0, ambiguous: 2 });
  });

  it('la clave no depende del orden de los campos de entrada', () => {
    expect(swimKey({ ...swim(), lane: null })).toBe(swimKey({ finalTimeMs: 60_000, lane: null, heatNo: 1, gender: 'F', distance: 100, stroke: 'libre' }));
  });
});
