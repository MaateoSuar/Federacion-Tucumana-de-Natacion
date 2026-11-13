import { describe, expect, it } from 'vitest';
import { genderFromCategoryLabel, standardsMetByFileResult, type StandardsTable } from './standards-match';

const NAC = { setId: 'nac', code: 'NACIONAL', name: 'Básica Nacional', shortLabel: 'NAC', color: 'sky', purpose: 'nacional' };
const FED = { setId: 'fed', code: 'FEDERARSE', name: 'Básica para federarse', shortLabel: 'FED', color: 'emerald', purpose: 'federacion' };
const std = (setId: string, gender: 'M' | 'F', minAge: number | null, maxAge: number | null, timeMs: number, stroke = 'libre', distance = 50) => ({
  setId, stroke, distance, gender, minAge, maxAge, timeMs,
});

// 50 m libre mujeres: Menor 1 (12) NAC 34.00 / FED 37.50 · Menor 2 (13) NAC 31.44 / FED 35.50 · Mayores (19+) NAC 29.00
const table: StandardsTable = {
  poolLength: 'P25',
  sets: [NAC, FED],
  standards: [
    std('nac', 'F', 12, 12, 34000), std('fed', 'F', 12, 12, 37500),
    std('nac', 'F', 13, 13, 31440), std('fed', 'F', 13, 13, 35500),
    std('nac', 'F', 19, null, 29000),
    std('nac', 'M', 12, 12, 33670),
    std('nac', 'F', 12, 12, 73000, 'libre', 100),
  ],
};
const labels = (r: { eventLabel: string; age: number | null; finalTimeMs: number | null }) =>
  standardsMetByFileResult(r, table).map((s) => s.shortLabel);

describe('genderFromCategoryLabel', () => {
  it.each([
    ['Niñas 12-13', 'F'], ['Ninas 10-11', 'F'], ['Mujeres 19 & Mayores', 'F'],
    ['Niños 14-15', 'M'], ['Ninos 3-11', 'M'], ['Hombres 19-108', 'M'],
  ] as const)('%s → %s', (label, expected) => {
    expect(genderFromCategoryLabel(label)).toBe(expected);
  });

  it('si no se entiende, null', () => {
    expect(genderFromCategoryLabel('Mixto 12-13')).toBeNull();
    expect(genderFromCategoryLabel('')).toBeNull();
  });
});

describe('standardsMetByFileResult', () => {
  it('prueba PROMOCIONAL: marca FED y también NAC si el tiempo alcanza', () => {
    expect(labels({ eventLabel: '50m Estilo Libre PROMOCIONALES — Niñas 12-13', age: 12, finalTimeMs: 36000 })).toEqual(['FED']);
    expect(labels({ eventLabel: '50m Estilo Libre PROMOCIONALES — Niñas 12-13', age: 12, finalTimeMs: 33500 })).toEqual(['NAC', 'FED']);
  });

  it('prueba FEDERADOS: ya es federado, solo se marca NAC', () => {
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 33500 })).toEqual(['NAC']);
    // Cumple la de federarse pero no la nacional: no se marca nada
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 36000 })).toEqual([]);
  });

  it('cumple con tiempo menor o igual a la marca', () => {
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 34000 })).toEqual(['NAC']);
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 34010 })).toEqual([]);
  });

  it('usa la marca de la EDAD del nadador, no la del grupo de la prueba', () => {
    // Mismo grupo "12-13": con 33.00 cumple la nacional de 12 años (34.00) pero no la de 13 (31.44)
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 33000 })).toEqual(['NAC']);
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 12-13', age: 13, finalTimeMs: 33000 })).toEqual([]);
  });

  it('mayores: sin tope de edad', () => {
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niñas 19-108', age: 34, finalTimeMs: 28900 })).toEqual(['NAC']);
  });

  it('no cruza géneros, pruebas ni distancias', () => {
    // Varones 12 años: su marca es 33.67, no la de mujeres (34.00)
    expect(labels({ eventLabel: '50m Estilo Libre FEDERADOS — Niños 12-13', age: 12, finalTimeMs: 33900 })).toEqual([]);
    // 100 m: 36.00 sería imposible, pero se compara contra la marca de 100 m
    expect(labels({ eventLabel: '100m Estilo Libre FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 72000 })).toEqual(['NAC']);
    // Otro estilo sin marca cargada
    expect(labels({ eventLabel: '50m Estilo de Pecho FEDERADOS — Niñas 12-13', age: 12, finalTimeMs: 20000 })).toEqual([]);
  });

  it('sin edad, sin tiempo, sin categoría o sin tabla no marca nada', () => {
    const base = { eventLabel: '50m Estilo Libre PROMOCIONALES — Niñas 12-13', age: 12, finalTimeMs: 33000 };
    expect(labels({ ...base, age: null })).toEqual([]);
    expect(labels({ ...base, finalTimeMs: null })).toEqual([]);
    expect(labels({ ...base, eventLabel: '50m Estilo Libre PROMOCIONALES' })).toEqual([]);
    expect(standardsMetByFileResult(base, null)).toEqual([]);
  });

  it('una edad fuera de todas las categorías con marca no marca nada', () => {
    expect(labels({ eventLabel: '50m Estilo Libre PROMOCIONALES — Niñas 3-11', age: 9, finalTimeMs: 20000 })).toEqual([]);
  });
});
