import { describe, expect, it } from 'vitest';
import { recordMarks, recordsForGroup, type RecordRef } from './record-marks';

const rec = (scope: string, code: string, timeMs: number, id = `${scope}-${code}-${timeMs}`): RecordRef => ({
  id, scope, timeMs, category: { code },
  swimmer: { id: 's', firstName: 'Ana', lastName: 'Perez' }, club: { shortName: 'CAZU' },
});

describe('recordsForGroup', () => {
  const all = [
    rec('provincial', 'JUV', 54000), rec('noa', 'NOA_JUV', 53000), rec('nacional', 'JUV', 51000),
    rec('provincial', 'CAD', 50000), rec('provincial', 'JUV', 55000),
  ];

  it('elige el récord de cada alcance para la categoría global pedida', () => {
    const r = recordsForGroup('JUV', all);
    expect([r.tucumano?.timeMs, r.noa?.timeMs, r.nacional?.timeMs]).toEqual([54000, 53000, 51000]);
  });

  it('una categoría sin récords devuelve vacío', () => {
    expect(recordsForGroup('INF', all)).toEqual({ tucumano: undefined, noa: undefined, nacional: undefined });
  });
});

describe('recordsForGroup — nacional', () => {
  it('compara cada categoría con su par nacional y los Mayores con el Absoluto nacional', () => {
    const nat = [rec('nacional', 'NAC_CAD', 51000), rec('nacional', 'NAC_ABS', 48000), rec('nacional', 'NAC_JUV', 49000)];
    expect(recordsForGroup('CAD', nat).nacional?.timeMs).toBe(51000);
    expect(recordsForGroup('MAY', nat).nacional?.timeMs).toBe(48000);
    expect(recordsForGroup('INF', nat).nacional).toBeUndefined();
  });
});

describe('recordMarks', () => {
  const refs = recordsForGroup('JUV', [rec('provincial', 'JUV', 54000), rec('noa', 'NOA_JUV', 53000)]);

  it('un club de Tucumán que baja los dos récords marca RT y RNOA', () => {
    expect(recordMarks({ id: 'x', finalTime: 52000, clubProvince: 'Tucumán' }, refs)).toEqual(['RT', 'RNOA']);
  });

  it('un club de otra provincia del NOA solo puede romper el récord NOA, nunca el tucumano', () => {
    expect(recordMarks({ id: 'x', finalTime: 52000, clubProvince: 'Salta' }, refs)).toEqual(['RNOA']);
  });

  it('entre los dos récords: solo el tucumano', () => {
    expect(recordMarks({ id: 'x', finalTime: 53500, clubProvince: 'Tucumán' }, refs)).toEqual(['RT']);
  });

  it('igualar el tiempo no es romper el récord', () => {
    expect(recordMarks({ id: 'x', finalTime: 54000, clubProvince: 'Tucumán' }, refs)).toEqual([]);
  });

  it('el resultado que originó el récord queda marcado aunque el tiempo sea el mismo', () => {
    const own = recordsForGroup('JUV', [{ ...rec('provincial', 'JUV', 54000), sourceResult: { id: 'mine' } }]);
    expect(recordMarks({ id: 'mine', finalTime: 54000, clubProvince: 'Tucumán' }, own)).toEqual(['RT']);
  });

  it('el récord nacional (RN) lo puede romper cualquier nadador, aun de fuera del NOA', () => {
    const withNational = recordsForGroup('JUV', [rec('nacional', 'JUV', 51000)]);
    expect(recordMarks({ id: 'x', finalTime: 50000, clubProvince: 'Córdoba' }, withNational)).toEqual(['RN']);
    expect(recordMarks({ id: 'x', finalTime: 52000, clubProvince: 'Córdoba' }, withNational)).toEqual([]);
  });

  it('sin provincia del club, sin tiempo o de fuera del NOA no marca nada', () => {
    expect(recordMarks({ id: 'x', finalTime: 40000, clubProvince: null }, refs)).toEqual([]);
    expect(recordMarks({ id: 'x', finalTime: null, clubProvince: 'Tucumán' }, refs)).toEqual([]);
    expect(recordMarks({ id: 'x', finalTime: 40000, clubProvince: 'Córdoba' }, refs)).toEqual([]);
  });
});
