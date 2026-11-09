import { scoreClubCandidate } from './club-scorer';
import { DEFAULT_MATCH_CONFIG } from './match-config';

const cfg = DEFAULT_MATCH_CONFIG.club;

const score = (srcName: string, srcShort: string, candName: string, candShort: string) =>
  scoreClubCandidate({ name: srcName, shortName: srcShort }, { name: candName, shortName: candShort }, cfg);

describe('scoreClubCandidate — deben ser candidatos', () => {
  it.each<[string, string]>([
    ['Club Azucena', 'AZU'],
    ['Azucena Club', 'AZU'],
    ['Azucena', 'AZU'],
    ['AZUCENA', ''],
    ['Asociación Azucena', ''],
  ])('"%s" ↔ Club Azucena', (srcName, srcShort) => {
    expect(score(srcName, srcShort, 'Club Azucena', 'AZU').score).toBeGreaterThanOrEqual(cfg.minCandidateScore);
  });

  it('sigla con iniciales: CAT ↔ Club Atlético Tucumán', () => {
    const result = score('CAT', 'CAT', 'Club Atlético Tucumán', 'ATL');
    expect(result.score).toBeGreaterThanOrEqual(cfg.minCandidateScore);
    expect(result.reasons[0]).toContain('sigla CAT');
  });

  it('sigla con puntos: C.A.T. ↔ Club Atlético Tucumán', () => {
    expect(score('C.A.T.', '', 'Club Atlético Tucumán', 'ATL').score).toBeGreaterThanOrEqual(cfg.minCandidateScore);
  });

  it('abreviatura: Monteros Nat. ↔ Monteros Natación', () => {
    const result = score('Monteros Nat.', '', 'Monteros Natación', 'MON');
    expect(result.score).toBeGreaterThanOrEqual(cfg.minCandidateScore);
    expect(result.reasons).toContain('nombre abreviado');
  });

  it('error de tipeo: Club Azusena ↔ Club Azucena', () => {
    expect(score('Club Azusena', '', 'Club Azucena', 'AZU').score).toBeGreaterThanOrEqual(cfg.minCandidateScore);
  });

  it('el orden de las palabras no importa', () => {
    expect(score('Tucumán Lawn Tennis', '', 'Lawn Tennis Tucumán', 'LTT').score).toBe(1);
  });
});

describe('scoreClubCandidate — no deben ser candidatos', () => {
  it('comparten solo la ciudad: Club Atlético Tucumán / Club Natación Tucumán', () => {
    expect(score('Club Atlético Tucumán', '', 'Club Natación Tucumán', 'CNT').score).toBeLessThan(cfg.minCandidateScore);
  });

  it('comparten solo la ciudad: Club Atlético Tucumán / Tucumán Lawn Tennis', () => {
    expect(score('Club Atlético Tucumán', '', 'Tucumán Lawn Tennis', 'TLT').score).toBeLessThan(cfg.minCandidateScore);
  });

  it('clubes distintos', () => {
    expect(score('Club Azucena', '', 'Club Atlético San Martín', 'CASM').score).toBeLessThan(cfg.minCandidateScore);
  });
});
