'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { TournamentEvent } from '@/lib/api';
import { matchesFuzzySearch } from '@/lib/search';

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo L.', relevo_combinado: 'Relevo C.',
};

interface EventGroup {
  eventDefId: string;
  ev: TournamentEvent;
  totalResults: number;
  label: string;
  categories: string[];
  level: string;
}

const LEVEL_ES: Record<string, string> = { FEDERADOS: 'Federados', PROMOCIONAL: 'Promocional', ESCUELA: 'Escuela' };

const SELECT_CLASS =
  'bg-pool-800/60 border border-pool-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-aqua-500 transition-colors';

export function EventList({ events, tournamentId }: { events: TournamentEvent[]; tournamentId: string }) {
  const [search, setSearch] = useState('');
  const [stroke, setStroke] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');

  // Collapse events with the same eventDefinition into one row
  const groups = useMemo<EventGroup[]>(() => {
    const seen = new Map<string, EventGroup>();
    for (const ev of events) {
      const key = `${ev.eventDefinition.id}|${ev.level ?? ''}`;
      const stroke = STROKE_ES[ev.eventDefinition.stroke] ?? ev.eventDefinition.stroke;
      const gender = ev.eventDefinition.gender === 'M' ? 'Hombres' : 'Mujeres';
      const levelName = ev.level ? ` · ${LEVEL_ES[ev.level] ?? ev.level}` : '';
      const label = `${ev.eventDefinition.distance} m ${stroke} — ${gender}${levelName}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { eventDefId: key, ev, totalResults: ev._count.results, label, categories: [ev.category.name], level: ev.level ?? '' });
      } else {
        existing.totalResults += ev._count.results;
        if (!existing.categories.includes(ev.category.name)) existing.categories.push(ev.category.name);
      }
    }
    return [...seen.values()];
  }, [events]);

  const strokes = useMemo(
    () => Array.from(new Set(groups.map((g) => g.ev.eventDefinition.stroke))),
    [groups],
  );
  const levels = useMemo(
    () => Array.from(new Set(groups.map((g) => g.level).filter((l) => l !== ''))),
    [groups],
  );
  const categories = useMemo(
    () => Array.from(new Set(groups.flatMap((g) => g.categories))),
    [groups],
  );

  const filtered = useMemo(() => {
    return groups.filter((g) =>
      (!stroke || g.ev.eventDefinition.stroke === stroke) &&
      (!category || g.categories.includes(category)) &&
      (!level || g.level === level) &&
      (!search.trim() || matchesFuzzySearch(g.label, search)),
    );
  }, [groups, search, stroke, category, level]);

  const filtersActive = search !== '' || stroke !== '' || category !== '' || level !== '';

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pool-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar prueba... (ej: Libre, Espalda, Hombres)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-pool-800/60 border border-pool-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-pool-500 focus:outline-none focus:border-aqua-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-pool-500 hover:text-white transition-colors"
          >
            ×
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {strokes.length > 1 && (
          <select aria-label="Estilo" value={stroke} onChange={(e) => setStroke(e.target.value)} className={SELECT_CLASS}>
            <option value="">Todos los estilos</option>
            {strokes.map((st) => <option key={st} value={st}>{STROKE_ES[st] ?? st}</option>)}
          </select>
        )}
        {levels.length > 1 && (
          <select aria-label="Nivel" value={level} onChange={(e) => setLevel(e.target.value)} className={SELECT_CLASS}>
            <option value="">Todos los niveles</option>
            {levels.map((l) => <option key={l} value={l}>{LEVEL_ES[l] ?? l}</option>)}
          </select>
        )}
        {categories.length > 1 && (
          <select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLASS}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(stroke || category || level) && (
          <button type="button" onClick={() => { setStroke(''); setCategory(''); setLevel(''); }} className="text-xs font-semibold text-pool-400 hover:text-white transition-colors">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Count */}
      {filtersActive && (
        <p className="text-pool-500 text-xs mb-3">
          {filtered.length} de {groups.length} pruebas
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-pool-400">Sin pruebas registradas.</p>
      ) : filtered.length === 0 ? (
        <p className="text-pool-400 text-sm py-6 text-center">Sin resultados para &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ eventDefId, ev, totalResults, label }) => {
            const hasResults = totalResults > 0;
            return (
              <div key={eventDefId} className="flex items-center justify-between gap-4 bg-pool-800/40 border border-pool-700/30 rounded-xl px-5 py-3.5">
                <div>
                  <p className="font-semibold text-white text-sm">{label}</p>
                  <p className="text-pool-400 text-xs mt-0.5">
                    {totalResults} resultado{totalResults !== 1 ? 's' : ''}
                  </p>
                </div>
                {hasResults ? (
                  <Link
                    href={`/torneos/${tournamentId}/prueba/${ev.id}`}
                    className="text-aqua-400 hover:text-aqua-300 text-sm font-semibold transition-colors shrink-0"
                  >
                    Ver resultados →
                  </Link>
                ) : (
                  <span className="text-pool-600 text-sm shrink-0">Sin resultados</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
