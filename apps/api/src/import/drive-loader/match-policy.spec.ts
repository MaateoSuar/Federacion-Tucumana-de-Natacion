import { applyConservativePolicy } from './match-policy';
import type { MatchResultsPayload } from '../matching/types';

const payload = (): MatchResultsPayload => ({
  swimmers: [
    { swimmerRef: 'a', confidence: 'strong', swimmerId: 's1', matchedBy: 'external_id', requiresConfirmation: false, displayName: 'Ana' },
    { swimmerRef: 'b', confidence: 'none', swimmerId: null, matchedBy: 'none', requiresConfirmation: false, displayName: 'Beto' },
    {
      swimmerRef: 'c',
      confidence: 'medium',
      swimmerId: null,
      matchedBy: 'fuzzy',
      requiresConfirmation: true,
      candidates: [{ swimmerId: 's9', displayName: 'Carla Paz', birthYear: 2010, clubName: 'Club A', score: 0.9, reasons: ['nombre'] }],
      displayName: 'Carla Paz.',
    },
  ],
  clubs: [
    {
      clubRef: 'k',
      confidence: 'low',
      clubId: null,
      matchedBy: 'fuzzy',
      requiresConfirmation: true,
      candidates: [{ clubId: 'c1', displayName: 'Club Atlético', score: 0.7, reasons: [] }],
      displayName: 'C.A.',
    },
  ],
});

describe('applyConservativePolicy', () => {
  it('no toca los seguros ni los nuevos; marca como nuevos los dudosos y los lista con candidatos', () => {
    const p = payload();
    const pending = applyConservativePolicy(p, 'x.pdf', 'sys', '2026-11-17T00:00:00Z');

    expect(p.swimmers[0]?.resolution).toBeUndefined();
    expect(p.swimmers[1]?.resolution).toBeUndefined();
    expect(p.swimmers[2]?.resolution).toEqual({ decision: 'new', decidedBy: 'sys', decidedAt: '2026-11-17T00:00:00Z' });
    expect(p.clubs[0]?.resolution?.decision).toBe('new');

    expect(pending).toHaveLength(2);
    expect(pending[0]).toMatchObject({ file: 'x.pdf', kind: 'nadador', name: 'Carla Paz.', appliedDecision: 'new' });
    expect(pending[0]?.candidates[0]).toMatchObject({ id: 's9', score: 0.9 });
    expect(pending[1]).toMatchObject({ kind: 'club', name: 'C.A.' });
  });

  it('nunca vincula a un candidato', () => {
    const p = payload();
    applyConservativePolicy(p, 'x.pdf', 'sys', 'now');
    const decisions = [...p.swimmers, ...p.clubs].map((m) => m.resolution?.decision).filter(Boolean);
    expect(decisions.every((d) => d === 'new')).toBe(true);
  });

  it('respeta una decisión ya tomada por una persona', () => {
    const p = payload();
    const c = p.swimmers[2];
    if (c) c.resolution = { decision: 'link', targetId: 's9', decidedBy: 'admin', decidedAt: 'x' };
    const pending = applyConservativePolicy(p, 'x.pdf', 'sys', 'now');
    expect(c?.resolution?.decision).toBe('link');
    expect(pending.filter((e) => e.kind === 'nadador')).toHaveLength(0);
  });
});
