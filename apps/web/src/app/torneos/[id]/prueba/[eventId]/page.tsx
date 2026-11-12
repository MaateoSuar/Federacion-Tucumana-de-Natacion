'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MedalIcon, positionClass } from '@/components/ui/MedalIcon';
import { RecordBadge } from '@/components/ui/RecordBadge';
import { formatTime } from '@/lib/formatTime';
import { useResultsSocket } from '@/hooks/useResultsSocket';
import { matchesFuzzySearch } from '@/lib/search';
import { buildPodium } from '@/lib/podium';
import type { EventResultsResponse } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const POINTS = [9, 7, 6, 5, 4, 3, 2, 1];
function getPoints(position: number): number | null {
  return POINTS[position - 1] ?? null;
}

function matchesSearch(r: { swimmer: { lastName: string; firstName: string } }, q: string): boolean {
  if (!q) return false;
  return matchesFuzzySearch(`${r.swimmer.lastName} ${r.swimmer.firstName}`, q);
}

export default function PruebaPage({ params }: { params: { id: string; eventId: string } }) {
  const [data, setData] = useState<EventResultsResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [liveUpdate, setLiveUpdate] = useState(false);
  const [swimmerSearch, setSwimmerSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  const fetchResults = useCallback(() => {
    fetch(`${API_BASE}/tournaments/${params.id}/events/${params.eventId}/results`)
      .then((r) => r.json())
      .then((d) => {
        setData(d as EventResultsResponse);
        setLiveUpdate(true);
        setTimeout(() => setLiveUpdate(false), 2000);
      })
      .catch(() => setError(true));
  }, [params.id, params.eventId]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  useResultsSocket({
    tournamentId: params.id,
    eventId: params.eventId,
    onResultsUpdated: fetchResults,
  });

  useEffect(() => { setMatchIdx(0); }, [swimmerSearch]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (error) return (
    <div className="min-h-screen bg-pool-950 text-white flex items-center justify-center">
      <p className="text-pool-400">No se pudo cargar la prueba.</p>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-pool-950 text-white flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-aqua-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { event, results } = data;
  const stroke = STROKE_ES[event.eventDefinition.stroke] ?? event.eventDefinition.stroke;
  const gender = event.eventDefinition.gender === 'M' ? 'Hombres' : 'Mujeres';
  const pool = event.tournament.poolLength === 'P25' ? '25 m' : '50 m';

  const okResults = results.filter((r) => r.status === 'OK');
  const dqResults = results.filter((r) => r.status === 'DSQ');
  const othersResults = results.filter((r) => r.status !== 'OK' && r.status !== 'DSQ');

  type ResultItem = (typeof results)[0];
  type CategoryGroup = {
    categoryId: string;
    categoryName: string;
    orderNo: number;
    results: ResultItem[];
    dqResults: ResultItem[];
  };

  const categoryGroups: CategoryGroup[] = [];

  const addToGroup = (r: ResultItem, isDq: boolean) => {
    const catId = r.category?.id ?? 'unknown';
    let group = categoryGroups.find((g) => g.categoryId === catId);
    if (!group) {
      group = {
        categoryId: catId,
        categoryName: r.category?.name ?? event.category.name,
        orderNo: r.category?.orderNo ?? 0,
        results: [],
        dqResults: [],
      };
      categoryGroups.push(group);
    }
    if (isDq) group.dqResults.push(r);
    else group.results.push(r);
  };

  for (const r of okResults) addToGroup(r, false);
  for (const r of dqResults) addToGroup(r, true);
  categoryGroups.sort((a, b) => a.orderNo - b.orderNo);
  const isMultiCategory = categoryGroups.length > 1;

  // Flatten all items for search navigation
  const allItems = categoryGroups.flatMap((g) => [...g.results, ...g.dqResults]);
  const q = swimmerSearch.trim();
  const matches = q ? allItems.filter((r) => matchesSearch(r, q)) : [];
  const safeIdx = matches.length > 0 ? Math.min(matchIdx, matches.length - 1) : 0;
  const currentMatchId = matches[safeIdx]?.id ?? null;

  // Ref helpers
  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  const scrollToMatch = (idx: number) => {
    const target = matches[idx];
    if (target) rowRefs.current.get(target.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const goNext = () => {
    if (matches.length === 0) return;
    const next = (safeIdx + 1) % matches.length;
    setMatchIdx(next);
    scrollToMatch(next);
  };

  const goPrev = () => {
    if (matches.length === 0) return;
    const prev = (safeIdx - 1 + matches.length) % matches.length;
    setMatchIdx(prev);
    scrollToMatch(prev);
  };

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-pool-400 mb-6">
          <Link href="/torneos" className="hover:text-aqua-300 transition-colors">Torneos</Link>
          <span>/</span>
          <Link href={`/torneos/${params.id}`} className="hover:text-aqua-300 transition-colors truncate max-w-xs">
            {event.tournament.name}
          </Link>
          <span>/</span>
          <span className="text-pool-200">{event.eventDefinition.distance} m {stroke}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">
              {event.eventDefinition.distance} m {stroke}
            </h1>
            <p className="text-pool-300 text-sm mt-1">
              {isMultiCategory
                ? `${categoryGroups.length} categorías`
                : categoryGroups[0]?.categoryName ?? event.category.name
              } · {gender} · Piscina {pool}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aqua-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-aqua-500" />
            </span>
            <span className={`text-xs transition-colors duration-300 ${liveUpdate ? 'text-aqua-300 font-semibold' : 'text-pool-500'}`}>
              {liveUpdate ? 'Actualizado' : 'En vivo'}
            </span>
          </div>
        </div>

        {/* Swimmer search — sticky para que la navegación 1/X acompañe el scroll */}
        <div className="sticky top-14 z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-3 mb-6 bg-pool-950/95 backdrop-blur border-b border-pool-800/60 flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pool-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar nadador/a..."
              value={swimmerSearch}
              onChange={(e) => setSwimmerSearch(e.target.value)}
              className="w-full bg-pool-800/60 border border-pool-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-pool-500 focus:outline-none focus:border-aqua-500 transition-colors"
            />
            {swimmerSearch && (
              <button
                onClick={() => setSwimmerSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-pool-500 hover:text-white transition-colors text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
          {/* Match counter + prev/next */}
          {q && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={goPrev}
                disabled={matches.length === 0}
                className="p-1.5 rounded-lg text-pool-400 hover:text-white hover:bg-pool-700/50 disabled:opacity-30 transition-colors text-xs"
              >
                ◀
              </button>
              <span className="text-xs text-pool-300 min-w-[3.5rem] text-center font-mono px-1">
                {matches.length === 0 ? 'Sin resultados' : `${safeIdx + 1}/${matches.length}`}
              </span>
              <button
                onClick={goNext}
                disabled={matches.length === 0}
                className="p-1.5 rounded-lg text-pool-400 hover:text-white hover:bg-pool-700/50 disabled:opacity-30 transition-colors text-xs"
              >
                ▶
              </button>
            </div>
          )}
        </div>

        {/* Resultados por categoría */}
        {okResults.length === 0 && dqResults.length === 0 ? (
          <p className="text-pool-400 text-center py-10">Sin resultados disponibles.</p>
        ) : (
          <div className="space-y-6">
            {categoryGroups.map((group) => (
              <div key={group.categoryId}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                  {isMultiCategory ? (
                    <h2 className="text-xs font-bold text-aqua-400 uppercase tracking-widest">
                      {group.categoryName}
                    </h2>
                  ) : <span />}
                  {/* Imagen del podio para compartir: solo con resultados homologados */}
                  {buildPodium(group.results, group.categoryId).length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-pool-400">Descargar podio:</span>
                      {([['square', 'Cuadrada'], ['story', 'Historia']] as const).map(([format, label]) => (
                        <a
                          key={format}
                          href={`/torneos/${params.id}/prueba/${params.eventId}/podio?categoryId=${encodeURIComponent(group.categoryId)}&format=${format}&download=1`}
                          className="rounded-lg border border-aqua-500/40 bg-aqua-500/10 px-2.5 py-1 font-semibold text-aqua-300 hover:bg-aqua-500/20 transition-colors"
                        >
                          {label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* OK results table */}
                {group.results.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                          <th className="text-left px-4 py-3 w-10">#</th>
                          <th className="text-left px-4 py-3">Nadador/a</th>
                          <th className="text-left px-4 py-3 hidden sm:table-cell">Club</th>
                          <th className="text-right px-4 py-3">Tiempo</th>
                          <th className="text-right px-4 py-3 w-14">Pts</th>
                          <th className="w-8 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-pool-700/20">
                        {group.results.map((r, idx) => {
                          const pos = idx + 1;
                          const isOpen = expanded.has(r.id);
                          const pts = getPoints(pos);
                          const isMatch = matchesSearch(r, q);
                          const isCurrent = r.id === currentMatchId;
                          return (
                            <>
                              <tr
                                key={r.id}
                                ref={setRowRef(r.id) as React.Ref<HTMLTableRowElement>}
                                className={`group transition-colors cursor-pointer ${positionClass(pos)} ${
                                  isCurrent
                                    ? 'bg-yellow-400/20 ring-2 ring-inset ring-yellow-400 shadow-[inset_0_0_16px_rgba(250,204,21,0.25)]'
                                    : isMatch
                                    ? 'bg-aqua-900/20 hover:bg-aqua-900/30'
                                    : 'hover:bg-pool-800/40'
                                }`}
                                onClick={() => r.splits.length > 0 && toggle(r.id)}
                              >
                                <td className="px-4 py-3">
                                  <MedalIcon position={pos} />
                                </td>
                                <td className="px-4 py-3 font-medium text-white">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Link
                                      href={`/nadadores/${r.swimmer.id}`}
                                      className="hover:text-aqua-300 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {r.swimmer.lastName}, {r.swimmer.firstName}
                                    </Link>
                                    {r.isPb && <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">PB</span>}
                                    {r.isRecord && <RecordBadge />}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-pool-300 hidden sm:table-cell">{r.club.shortName}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-white">
                                  {r.finalTime != null ? formatTime(r.finalTime) : '—'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {pts != null ? (
                                    <span className="font-bold text-aqua-300 tabular-nums">{pts}</span>
                                  ) : (
                                    <span className="text-pool-600 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-3 text-pool-500 text-xs">
                                  {r.splits.length > 0 && (isOpen ? '▲' : '▼')}
                                </td>
                              </tr>
                              {isOpen && r.splits.length > 0 && (
                                <tr key={`${r.id}-splits`} className="bg-pool-900/60">
                                  <td colSpan={6} className="px-6 py-3">
                                    <div className="flex flex-wrap gap-3">
                                      {r.splits.map((s) => (
                                        <div key={s.distance} className="text-xs">
                                          <span className="text-pool-400">{s.distance} m</span>
                                          <span className="ml-1.5 font-mono text-aqua-300">{formatTime(s.cumulativeTime)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* DQ entries — dentro de su categoría */}
                {group.dqResults.length > 0 && (
                  <div className={`space-y-1 ${group.results.length > 0 ? 'mt-1' : ''}`}>
                    {group.dqResults.map((r) => {
                      const isMatch = matchesSearch(r, q);
                      const isCurrent = r.id === currentMatchId;
                      return (
                        <div
                          key={r.id}
                          ref={setRowRef(r.id)}
                          className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm transition-colors ${
                            isCurrent
                              ? 'bg-yellow-400/20 ring-2 ring-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.25)]'
                              : isMatch
                              ? 'bg-aqua-900/15'
                              : 'bg-pool-800/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <StatusBadge status="DSQ" dsqCode={r.dsqCode} />
                            <span className="text-pool-300">
                              {r.swimmer.lastName}, {r.swimmer.firstName}
                            </span>
                          </div>
                          <span className="text-pool-500 text-xs">{r.club.shortName}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* DNS / DNF */}
        {othersResults.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-pool-500 uppercase tracking-wider mb-2">Otros</h3>
            <div className="space-y-1">
              {othersResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-pool-800/20 rounded-lg px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} dsqCode={r.dsqCode} />
                    <span className="text-pool-300">
                      {r.swimmer.lastName}, {r.swimmer.firstName}
                    </span>
                  </div>
                  <span className="text-pool-500 text-xs">{r.club.shortName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo L.', relevo_combinado: 'Relevo C.',
};
