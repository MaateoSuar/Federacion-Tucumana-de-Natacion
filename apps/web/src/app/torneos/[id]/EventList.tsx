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
}

export function EventList({ events, tournamentId }: { events: TournamentEvent[]; tournamentId: string }) {
  const [search, setSearch] = useState('');

  // Collapse events with the same eventDefinition into one row
  const groups = useMemo<EventGroup[]>(() => {
    const seen = new Map<string, EventGroup>();
    for (const ev of events) {
      const key = ev.eventDefinition.id;
      const stroke = STROKE_ES[ev.eventDefinition.stroke] ?? ev.eventDefinition.stroke;
      const gender = ev.eventDefinition.gender === 'M' ? 'Hombres' : 'Mujeres';
      const label = `${ev.eventDefinition.distance} m ${stroke} — ${gender}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { eventDefId: key, ev, totalResults: ev._count.results, label });
      } else {
        existing.totalResults += ev._count.results;
      }
    }
    return [...seen.values()];
  }, [events]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    return groups.filter((g) => matchesFuzzySearch(g.label, search));
  }, [groups, search]);

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

      {/* Count */}
      {search && (
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
