import { scoreSwimmerCandidate, type SwimmerScoreCandidate, type SwimmerScoreSource } from './swimmer-scorer';
import { DEFAULT_MATCH_CONFIG } from './match-config';

const cfg = DEFAULT_MATCH_CONFIG.swimmer;

const src = (fullName: [string, string], overrides: Partial<SwimmerScoreSource> = {}): SwimmerScoreSource => ({
  firstName: fullName[0],
  lastName: fullName[1],
  gender: 'M',
  birthYear: null,
  birthYearIsEstimated: false,
  clubId: null,
  ...overrides,
});

const cand = (fullName: [string, string], overrides: Partial<SwimmerScoreCandidate> = {}): SwimmerScoreCandidate => ({
  firstName: fullName[0],
  lastName: fullName[1],
  gender: 'M',
  birthYear: null,
  clubId: null,
  ...overrides,
});

const score = (s: SwimmerScoreSource, c: SwimmerScoreCandidate) => scoreSwimmerCandidate(s, c, cfg)?.score ?? -1;

describe('scoreSwimmerCandidate — deben ser candidatos', () => {
  const canonical = cand(['Mateo', 'Rodriguez Suar']);

  it.each<[string, [string, string]]>([
    ['falta el segundo apellido', ['Mateo', 'Rodriguez']],
    ['falta el primer apellido', ['Mateo', 'Suar']],
    ['apellidos en otro orden', ['Mateo', 'Suar Rodriguez']],
    ['tildes y mayúsculas', ['MATEO', 'RODRÍGUEZ SUAR']],
    ['error de tipeo en el nombre', ['Mateeo', 'Rodriguez Suar']],
    ['error de tipeo en el apellido', ['Mateo', 'Rodrigues Suar']],
    ['letra de más en apellido largo — caso real (Solorazano)', ['Mateo', 'Rodriguezz Suar']],
    ['segundo nombre agregado', ['Mateo Ignacio', 'Rodriguez Suar']],
    ['inicial del nombre', ['M.', 'Rodriguez Suar']],
    ['nombre y apellido invertidos', ['Rodriguez Suar', 'Mateo']],
  ])('%s', (_label, fileName) => {
    expect(score(src(fileName), canonical)).toBeGreaterThanOrEqual(cfg.minCandidateScore);
  });

  it('la versión idéntica puntúa más que una parcial', () => {
    expect(score(src(['Mateo', 'Rodriguez Suar']), canonical)).toBeGreaterThan(
      score(src(['Mateo', 'Suar']), canonical),
    );
  });

  it('explica el motivo', () => {
    const result = scoreSwimmerCandidate(
      src(['Mateo', 'Suar'], { clubId: 'club-1', birthYear: 2010 }),
      cand(['Mateo', 'Rodriguez Suar'], { clubId: 'club-1', birthYear: 2010 }),
      cfg,
    );
    expect(result?.reasons).toEqual([
      'mismo nombre (Mateo)',
      'comparte apellido Suar',
      'mismo club',
      'mismo año de nacimiento (2010)',
    ]);
  });
});

describe('scoreSwimmerCandidate — no deben ser candidatos', () => {
  it('hermanos: mismo apellido, mismo club y mismo año, distinto nombre', () => {
    const s = src(['Juan', 'Rodriguez Suar'], { clubId: 'club-1', birthYear: 2010 });
    const c = cand(['Pedro', 'Rodriguez Suar'], { clubId: 'club-1', birthYear: 2010 });
    expect(score(s, c)).toBeLessThan(cfg.minCandidateScore);
  });

  it('nombres parecidos pero distintos (Mateo / Matías)', () => {
    expect(score(src(['Matías', 'Suar']), cand(['Mateo', 'Suar']))).toBeLessThan(cfg.minCandidateScore);
  });

  it('un nombre no es error de tipeo del otro (Martina / María Victoria) — caso real', () => {
    expect(score(src(['Martina', 'Garcia Autino'], { gender: 'F' }), cand(['Maria Victoria', 'Garcia'], { gender: 'F' }))).toBeLessThan(
      cfg.minCandidateScore,
    );
  });

  it('hermanas: Martina / Franca Garcia Autino — caso real', () => {
    expect(score(src(['Martina', 'Garcia Autino'], { gender: 'F' }), cand(['Franca', 'Garcia Autino'], { gender: 'F' }))).toBeLessThan(
      cfg.minCandidateScore,
    );
  });

  it('mismo nombre, otro apellido', () => {
    expect(score(src(['Mateo', 'Gomez']), cand(['Mateo', 'Suar']))).toBeLessThan(cfg.minCandidateScore);
  });

  it('distinto género descarta al candidato', () => {
    expect(scoreSwimmerCandidate(src(['Valentin', 'Garcia']), cand(['Valentina', 'Garcia'], { gender: 'F' }), cfg)).toBeNull();
  });

  it('año de nacimiento incompatible baja el puntaje', () => {
    const s = src(['Mateo', 'Suar'], { birthYear: 2010 });
    expect(score(s, cand(['Mateo', 'Rodriguez Suar'], { birthYear: 2004 }))).toBeLessThan(cfg.minCandidateScore);
  });
});

describe('scoreSwimmerCandidate — año deducido de la edad', () => {
  it('tolera ±1 año cuando el año sale de la edad', () => {
    const s = src(['Mateo', 'Suar'], { birthYear: 2011, birthYearIsEstimated: true });
    const result = scoreSwimmerCandidate(s, cand(['Mateo', 'Suar'], { birthYear: 2010 }), cfg);
    expect(result?.reasons).toContain('año de nacimiento compatible con la edad (2010)');
  });

  it('la tolerancia es solo hacia atrás (edad a la fecha del torneo)', () => {
    const s = src(['Mateo', 'Suar'], { birthYear: 2011, birthYearIsEstimated: true });
    const result = scoreSwimmerCandidate(s, cand(['Mateo', 'Suar'], { birthYear: 2012 }), cfg);
    expect(result?.reasons).toContain('año de nacimiento cercano (2011 / 2012)');
  });
});
