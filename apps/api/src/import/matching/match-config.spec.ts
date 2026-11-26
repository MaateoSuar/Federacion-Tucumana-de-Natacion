import { DEFAULT_MATCH_CONFIG, parseMatchConfig } from './match-config';

describe('parseMatchConfig', () => {
  it('sin variable → valores por defecto', () => {
    expect(parseMatchConfig(undefined)).toEqual(DEFAULT_MATCH_CONFIG);
    expect(parseMatchConfig('')).toEqual(DEFAULT_MATCH_CONFIG);
  });

  it('override parcial conserva el resto', () => {
    const cfg = parseMatchConfig('{"swimmer":{"minCandidateScore":0.7},"club":{"genericWords":["club"]}}');
    expect(cfg.swimmer.minCandidateScore).toBe(0.7);
    expect(cfg.swimmer.surnameWeight).toBe(DEFAULT_MATCH_CONFIG.swimmer.surnameWeight);
    expect(cfg.club.genericWords).toEqual(['club']);
    expect(cfg.club.acronymScore).toBe(DEFAULT_MATCH_CONFIG.club.acronymScore);
  });

  it.each([
    ['JSON inválido', '{nope'],
    ['parámetro desconocido', '{"swimmer":{"foo":1}}'],
    ['número negativo', '{"swimmer":{"minCandidateScore":-1}}'],
    ['tipo incorrecto', '{"club":{"genericWords":"club"}}'],
    ['clave heredada del prototipo', '{"swimmer":{"toString":1}}'],
    ['puntaje mayor a 1', '{"swimmer":{"minCandidateScore":1.5}}'],
    ['factor mayor a 1', '{"swimmer":{"birthYearMismatchFactor":5}}'],
    ['división por cero', '{"swimmer":{"charsPerAllowedTypo":0}}'],
    ['cantidad de candidatos en 0', '{"club":{"maxCandidates":0}}'],
    ['cantidad no entera', '{"club":{"maxCandidates":2.5}}'],
  ])('rechaza %s', (_label, raw) => {
    expect(() => parseMatchConfig(raw)).toThrow(/IMPORT_MATCHING_CONFIG/);
  });

  it('normaliza las palabras genéricas (mayúsculas y tildes)', () => {
    expect(parseMatchConfig('{"club":{"genericWords":["Club","Asociación"]}}').club.genericWords).toEqual([
      'club',
      'asociacion',
    ]);
  });
});
