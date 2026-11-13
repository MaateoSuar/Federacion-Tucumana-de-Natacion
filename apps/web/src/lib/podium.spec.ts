import { describe, expect, it } from 'vitest';
import { buildPodium, isClassicPodium, rankPodium, type PodiumSourceResult } from './podium';

const r = (
  lastName: string,
  finalTime: number | null,
  over: Partial<Omit<PodiumSourceResult, 'category'>> & { categoryId?: string } = {},
): PodiumSourceResult => ({
  finalTime,
  status: over.status ?? 'OK',
  homologated: over.homologated ?? true,
  swimmer: { firstName: 'Ana', lastName },
  club: { name: `Club de ${lastName}`, shortName: 'CL' },
  category: { id: over.categoryId ?? 'CAD_1', name: 'Cadete 1' },
});

describe('rankPodium (resultados de archivo)', () => {
  const t = (swimmerName: string, timeMs: number | null) => ({ swimmerName, clubName: 'Club', timeMs });

  it('de una categoría con muchos nadadores, el podio son solo los tres primeros', () => {
    const many = Array.from({ length: 40 }, (_, i) => t(`Nadador ${i}`, 60000 + i * 100));
    const podium = rankPodium(many.reverse());
    expect(podium.map((p) => [p.place, p.swimmerName])).toEqual([[1, 'Nadador 0'], [2, 'Nadador 1'], [3, 'Nadador 2']]);
  });

  it('descalificados o sin tiempo no suben', () => {
    expect(rankPodium([t('A', null), t('B', 31000)]).map((p) => p.swimmerName)).toEqual(['B']);
  });

  it('empates comparten puesto', () => {
    expect(rankPodium([t('A', 30000), t('B', 30000), t('C', 31000)]).map((p) => p.place)).toEqual([1, 1, 3]);
  });

  it('sin tiempos, podio vacío', () => {
    expect(rankPodium([])).toEqual([]);
  });
});

describe('buildPodium', () => {
  it('ordena por tiempo y devuelve los tres primeros con nombre, club y tiempo en ms', () => {
    const podium = buildPodium([r('C', 31000), r('A', 29000), r('D', 32000), r('B', 30000)], 'CAD_1');

    expect(podium).toEqual([
      { place: 1, swimmerName: 'Ana A', clubName: 'Club de A', timeMs: 29000 },
      { place: 2, swimmerName: 'Ana B', clubName: 'Club de B', timeMs: 30000 },
      { place: 3, swimmerName: 'Ana C', clubName: 'Club de C', timeMs: 31000 },
    ]);
    expect(isClassicPodium(podium)).toBe(true);
  });

  it('solo cuenta resultados homologados', () => {
    const podium = buildPodium([r('A', 29000, { homologated: false }), r('B', 30000)], 'CAD_1');
    expect(podium.map((p) => p.swimmerName)).toEqual(['Ana B']);
  });

  it('descalificados, ausentes y resultados sin tiempo no suben al podio', () => {
    const podium = buildPodium(
      [r('A', null, { status: 'DSQ' }), r('B', 28000, { status: 'DSQ' }), r('C', null), r('D', 30000)],
      'CAD_1',
    );
    expect(podium.map((p) => p.swimmerName)).toEqual(['Ana D']);
  });

  it('arma el podio de la categoría pedida, sin mezclar otras', () => {
    const podium = buildPodium([r('A', 25000, { categoryId: 'MAY' }), r('B', 30000), r('C', 31000)], 'CAD_1');
    expect(podium.map((p) => [p.place, p.swimmerName])).toEqual([[1, 'Ana B'], [2, 'Ana C']]);
  });

  it('empate en el primer puesto: comparten el 1° y el siguiente es 3°', () => {
    const podium = buildPodium([r('A', 29000), r('B', 29000), r('C', 30000), r('D', 31000)], 'CAD_1');

    expect(podium.map((p) => [p.place, p.swimmerName])).toEqual([[1, 'Ana A'], [1, 'Ana B'], [3, 'Ana C']]);
    expect(isClassicPodium(podium)).toBe(false);
  });

  it('empate en el tercer puesto: entran los dos', () => {
    const podium = buildPodium([r('A', 29000), r('B', 30000), r('C', 31000), r('D', 31000), r('E', 32000)], 'CAD_1');
    expect(podium.map((p) => p.place)).toEqual([1, 2, 3, 3]);
  });

  it('con menos de tres nadadores muestra solo los que hay', () => {
    const podium = buildPodium([r('A', 29000), r('B', 30000)], 'CAD_1');
    expect(podium).toHaveLength(2);
    expect(isClassicPodium(podium)).toBe(false);
  });

  it('sin resultados válidos devuelve un podio vacío', () => {
    expect(buildPodium([], 'CAD_1')).toEqual([]);
    expect(buildPodium([r('A', 29000, { homologated: false })], 'CAD_1')).toEqual([]);
  });
});
