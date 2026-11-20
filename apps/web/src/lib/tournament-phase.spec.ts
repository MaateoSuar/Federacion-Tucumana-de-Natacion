import { describe, expect, it } from 'vitest';
import { PHASE_LABEL, tournamentPhase } from './tournament-phase';

// Mediodía en Tucumán (UTC-3) del día indicado
const at = (day: string) => new Date(`${day}T15:00:00.000Z`);
const START = '2026-06-20T00:00:00.000Z';
const END = '2026-06-21T00:00:00.000Z';

describe('tournamentPhase', () => {
  it('antes de la fecha de inicio: Próximo', () => {
    expect(tournamentPhase(START, END, at('2026-06-19'))).toBe('proximo');
  });

  it('entre el inicio y el fin, inclusive: En curso', () => {
    expect(tournamentPhase(START, END, at('2026-06-20'))).toBe('en_curso');
    expect(tournamentPhase(START, END, at('2026-06-21'))).toBe('en_curso');
  });

  it('después de la fecha de fin: Finalizado, sin depender del estado cargado a mano', () => {
    // Caso real: "NOA y Provincia" se nadó en junio y seguía figurando "Programado"
    expect(tournamentPhase(START, END, at('2026-06-22'))).toBe('finalizado');
    expect(tournamentPhase(START, END, at('2026-11-13'))).toBe('finalizado');
  });

  it('torneo de un solo día', () => {
    expect(tournamentPhase(START, START, at('2026-06-20'))).toBe('en_curso');
    expect(tournamentPhase(START, START, at('2026-06-21'))).toBe('finalizado');
    expect(tournamentPhase(START, null, at('2026-06-20'))).toBe('en_curso');
  });

  it('"hoy" es el día en Tucumán, no en UTC', () => {
    // 23:30 del 19/6 en Tucumán ya es 20/6 en UTC: el torneo todavía no empezó
    expect(tournamentPhase(START, END, new Date('2026-06-20T02:30:00.000Z'))).toBe('proximo');
    // 23:30 del 21/6 en Tucumán ya es 22/6 en UTC: sigue en curso
    expect(tournamentPhase(START, END, new Date('2026-06-22T02:30:00.000Z'))).toBe('en_curso');
  });

  it('si la fecha de fin quedó antes que la de inicio, se toma el inicio', () => {
    expect(tournamentPhase(END, START, at('2026-06-21'))).toBe('en_curso');
    expect(tournamentPhase(END, START, at('2026-06-22'))).toBe('finalizado');
  });

  it('tiene una etiqueta en castellano para cada fase', () => {
    expect(PHASE_LABEL).toEqual({ proximo: 'Próximo', en_curso: 'En curso', finalizado: 'Finalizado' });
  });
});
