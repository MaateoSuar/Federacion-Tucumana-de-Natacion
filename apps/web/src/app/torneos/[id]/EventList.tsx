'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { EventResultsResponse, ResultEntry, TournamentEvent } from '@/lib/api';
import { searchPrueba } from '@/lib/search';
import { categoryPlacings } from '@/lib/event-placings';
import { buildPodium } from '@/lib/podium';
import { PodiumButton, PodiumModal, type PodiumOption } from '@/components/ui/PodiumModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo L.', relevo_combinado: 'Relevo C.',
};

interface EventGroup {
  eventDefId: string;
  ev: TournamentEvent;
  eventIds: string[];
  totalResults: number;
  label: string;
  categories: string[];
  level: string;
}

/** Un nadador (o club) que coincide con la búsqueda, con su puesto real en la prueba. */
interface SwimmerHit {
  resultId: string;
  eventId: string;
  name: string;
  club: string;
  category: string;
  place: number | null;
}

const LEVEL_ES: Record<string, string> = { FEDERADOS: 'Federados', PROMOCIONAL: 'Promocional', ESCUELA: 'Escuela' };

const SELECT_CLASS =
  'bg-pool-800/60 border border-pool-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-aqua-500 transition-colors';

const FETCH_BATCH = 6;

export function EventList({ events, tournamentId }: { events: TournamentEvent[]; tournamentId: string }) {
  const [search, setSearch] = useState('');
  const [stroke, setStroke] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  // Resultados de cada prueba, para poder buscar por nadador o club. Se piden una sola
  // vez, recién cuando alguien escribe en el buscador o abre un podio.
  const [resultsByEvent, setResultsByEvent] = useState<Record<string, ResultEntry[]>>({});
  const [resultsReady, setResultsReady] = useState(false);
  const requested = useRef(new Set<string>());
  const [podiumFor, setPodiumFor] = useState<EventGroup | null>(null);

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
        seen.set(key, { eventDefId: key, ev, eventIds: [ev.id], totalResults: ev._count.results, label, categories: [ev.category.name], level: ev.level ?? '' });
      } else {
        existing.totalResults += ev._count.results;
        existing.eventIds.push(ev.id);
        if (!existing.categories.includes(ev.category.name)) existing.categories.push(ev.category.name);
      }
    }
    return [...seen.values()];
  }, [events]);

  const loadResults = useCallback(async (eventIds: string[]) => {
    const pending = eventIds.filter((id) => !requested.current.has(id));
    pending.forEach((id) => requested.current.add(id));
    for (let i = 0; i < pending.length; i += FETCH_BATCH) {
      const batch = await Promise.all(
        pending.slice(i, i + FETCH_BATCH).map(async (eventId) => {
          try {
            const res = await fetch(`${API_BASE}/tournaments/${tournamentId}/events/${eventId}/results`);
            if (!res.ok) return [eventId, []] as const;
            return [eventId, ((await res.json()) as EventResultsResponse).results] as const;
          } catch {
            return [eventId, []] as const;
          }
        }),
      );
      setResultsByEvent((prev) => ({ ...prev, ...Object.fromEntries(batch) }));
    }
  }, [tournamentId]);

  const searching = search.trim() !== '';
  useEffect(() => {
    if (!searching || resultsReady) return;
    void loadResults(events.map((e) => e.id)).then(() => setResultsReady(true));
  }, [searching, resultsReady, events, loadResults]);

  useEffect(() => {
    if (podiumFor) void loadResults(podiumFor.eventIds);
  }, [podiumFor, loadResults]);

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

  // El buscador elige QUÉ pruebas se muestran: las que coinciden por nombre y las pruebas
  // donde nada el nadador (o club) buscado. La prueba completa se ve al entrar.
  const filtered = useMemo(() => {
    return groups.flatMap((g) => {
      if (stroke && g.ev.eventDefinition.stroke !== stroke) return [];
      if (category && !g.categories.includes(category)) return [];
      if (level && g.level !== level) return [];
      const placed = g.eventIds.flatMap((eventId) =>
        categoryPlacings(resultsByEvent[eventId] ?? []).map((p) => ({ ...p, eventId })),
      );
      const hit = searchPrueba(
        g.label,
        placed.map(({ result }) => `${result.swimmer.lastName} ${result.swimmer.firstName} ${result.club.shortName} ${result.club.name}`),
        search,
      );
      if (!hit.visible) return [];
      const hits: SwimmerHit[] = placed
        .filter((_, i) => hit.highlighted[i])
        .map(({ result, place, eventId }) => ({
          resultId: result.id,
          eventId,
          name: `${result.swimmer.lastName}, ${result.swimmer.firstName}`,
          club: result.club.shortName,
          category: result.category.name,
          place,
        }));
      return [{ group: g, hits }];
    });
  }, [groups, search, stroke, category, level, resultsByEvent]);

  const filtersActive = search !== '' || stroke !== '' || category !== '' || level !== '';
  const loadingSwimmers = searching && !resultsReady;

  const podiumOptions = useMemo<PodiumOption[] | null>(() => {
    if (!podiumFor) return null;
    if (podiumFor.eventIds.some((id) => resultsByEvent[id] === undefined)) return null;
    return podiumFor.eventIds.flatMap((eventId) => {
      const results = resultsByEvent[eventId] ?? [];
      const cats = new Map<string, { name: string; orderNo: number }>();
      for (const r of results) cats.set(r.category.id, { name: r.category.name, orderNo: r.category.orderNo });
      return [...cats.entries()]
        .filter(([categoryId]) => buildPodium(results, categoryId).length > 0)
        .sort((a, b) => a[1].orderNo - b[1].orderNo)
        .map(([categoryId, c]) => ({
          id: `${eventId}:${categoryId}`,
          label: c.name,
          imageUrl: `/torneos/${tournamentId}/prueba/${eventId}/podio?categoryId=${encodeURIComponent(categoryId)}`,
        }));
    });
  }, [podiumFor, resultsByEvent, tournamentId]);

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pool-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          aria-label="Buscar por prueba, nadador/a o club"
          placeholder="Buscar nadador/a, club o prueba (ej: Perez, 100 libre)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-pool-800/60 border border-pool-700/50 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-pool-500 focus:outline-none focus:border-aqua-500 transition-colors"
        />
        {search && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
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
        <p className="text-pool-500 text-xs mb-3" aria-live="polite">
          {filtered.length} de {groups.length} pruebas{loadingSwimmers ? ' · buscando nadadores…' : ''}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-pool-400">Sin pruebas registradas.</p>
      ) : filtered.length === 0 ? (
        <p className="text-pool-400 text-sm py-6 text-center">
          {loadingSwimmers ? 'Buscando nadadores…' : <>Sin resultados para &ldquo;{search}&rdquo;</>}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ group, hits }) => {
            const { eventDefId, ev, totalResults, label } = group;
            const hasResults = totalResults > 0;
            const query = hits.length > 0 ? `?buscar=${encodeURIComponent(search.trim())}` : '';
            return (
              <div key={eventDefId} className="bg-pool-800/40 border border-pool-700/30 rounded-xl px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm">{label}</p>
                    <p className="text-pool-400 text-xs mt-0.5">
                      {totalResults} resultado{totalResults !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {hasResults ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <PodiumButton onClick={() => setPodiumFor(group)} />
                      <Link
                        href={`/torneos/${tournamentId}/prueba/${hits[0]?.eventId ?? ev.id}${query}`}
                        className="text-aqua-400 hover:text-aqua-300 text-sm font-semibold transition-colors"
                      >
                        Ver resultados →
                      </Link>
                    </div>
                  ) : (
                    <span className="text-pool-600 text-sm shrink-0">Sin resultados</span>
                  )}
                </div>
                {/* Nadadores que coinciden, con su puesto real: la prueba completa se ve al entrar */}
                {hits.length > 0 && (
                  <ul className="mt-2.5 space-y-1 border-t border-pool-700/30 pt-2.5">
                    {hits.slice(0, 8).map((h) => (
                      <li key={h.resultId}>
                        <Link
                          href={`/torneos/${tournamentId}/prueba/${h.eventId}${query}`}
                          className="flex items-baseline gap-2 rounded-lg bg-aqua-500/10 px-2.5 py-1.5 text-xs hover:bg-aqua-500/20 transition-colors"
                        >
                          <span className="w-8 shrink-0 font-bold tabular-nums text-aqua-300">{h.place != null ? `${h.place}.º` : '—'}</span>
                          <span className="min-w-0 truncate font-semibold text-white">{h.name}</span>
                          <span className="shrink-0 text-pool-400">{h.club} · {h.category}</span>
                        </Link>
                      </li>
                    ))}
                    {hits.length > 8 && <li className="px-2.5 text-xs text-pool-400">y {hits.length - 8} más en esta prueba</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {podiumFor && (
        <PodiumModal title={podiumFor.label} options={podiumOptions} onClose={() => setPodiumFor(null)} />
      )}
    </div>
  );
}
