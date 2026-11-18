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

  it('sin provincia del club, sin tiempo o de fuera del NOA no marca nada', () => {
    expect(recordMarks({ id: 'x', finalTime: 40000, clubProvince: null }, refs)).toEqual([]);
    expect(recordMarks({ id: 'x', finalTime: null, clubProvince: 'Tucumán' }, refs)).toEqual([]);
    expect(recordMarks({ id: 'x', finalTime: 40000, clubProvince: 'Córdoba' }, refs)).toEqual([]);
  });
});
