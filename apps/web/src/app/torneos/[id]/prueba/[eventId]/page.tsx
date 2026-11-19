'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MedalIcon, positionClass } from '@/components/ui/MedalIcon';
import { formatTime } from '@/lib/formatTime';
import { useResultsSocket } from '@/hooks/useResultsSocket';
import { matchesFuzzySearch } from '@/lib/search';
import { rankPodium } from '@/lib/podium';
import { Podium } from '@/components/ui/Podium';
import { PodiumButton, PodiumModal } from '@/components/ui/PodiumModal';
import { groupResultsByCategory } from '@/lib/category-groups';
import { recordMarks, recordsForGroup, type GroupRecords, type RecordMark } from '@/lib/record-marks';
import { standardsMet, type StandardsTable } from '@/lib/standards-match';
import type { EventResultsResponse, RecordEntry } from '@/lib/api';

// Línea fina que corta la tabla: de ahí para arriba lograron la marca básica del set.
// Discreta a propósito: el nombre aparece solo al pasar el mouse o al enfocarla.
const STANDARD_CUT: Record<string, string> = {
  sky: 'text-sky-300',
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
};
const STANDARD_CUT_DEFAULT = 'text-aqua-300';

// Cada alcance tiene su color, igual en el recuadro de récords y en la marca de cada resultado:
// tucumano = celeste, NOA = verde, nacional = ámbar.
const SCOPE_STYLE: Record<RecordMark, { text: string; title: string; label: string; badge: string; dashed: string; ink: string }> = {
  RT: {
    text: 'RT', label: 'Récord Tucumano', title: 'Récord tucumano: rompió el récord vigente de su categoría',
    badge: 'border-sky-400/50 bg-sky-500/20 text-sky-300', dashed: 'border-dashed border-sky-400/50 bg-sky-500/5 text-sky-300/80', ink: 'text-sky-300',
  },
  RNOA: {
    text: 'RNOA', label: 'Récord NOA', title: 'Récord NOA: rompió el récord vigente de su categoría',
    badge: 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300', dashed: 'border-dashed border-emerald-400/50 bg-emerald-500/5 text-emerald-300/80', ink: 'text-emerald-300',
  },
  RN: {
    text: 'RN', label: 'Récord Nacional', title: 'Récord nacional: rompió el récord vigente de su categoría',
    badge: 'border-amber-400/50 bg-amber-500/20 text-amber-300', dashed: 'border-dashed border-amber-400/50 bg-amber-500/5 text-amber-300/80', ink: 'text-amber-300',
  },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const POINTS = [9, 7, 6, 5, 4, 3, 2, 1];
function getPoints(position: number): number | null {
  return POINTS[position - 1] ?? null;
}

function matchesSearch(
  r: { swimmer: { lastName: string; firstName: string }; club: { shortName: string; name: string } },
  q: string,
): boolean {
  if (!q) return false;
  return matchesFuzzySearch(`${r.swimmer.lastName} ${r.swimmer.firstName} ${r.club.shortName} ${r.club.name}`, q);
}

export default function PruebaPage({ params }: { params: { id: string; eventId: string } }) {
  const [data, setData] = useState<EventResultsResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  // Récords vigentes de esta prueba (misma pileta y género): tucumanos, NOA y nacionales
  const [records, setRecords] = useState<RecordEntry[]>([]);
  // Marcas básicas (nacional / para federarse) de la pileta del torneo
  const [standards, setStandards] = useState<StandardsTable | null>(null);
  const [liveUpdate, setLiveUpdate] = useState(false);
  const [swimmerSearch, setSwimmerSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [podiumCategoryId, setPodiumCategoryId] = useState<string | null>(null);

  // Si se llega desde el buscador del torneo (?buscar=…), el nadador ya queda resaltado
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('buscar');
    if (fromUrl) setSwimmerSearch(fromUrl);
  }, []);

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

  const eventDefId = data?.event.eventDefinition.id;
  const eventPool = data?.event.tournament.poolLength;
  const eventGender = data?.event.eventDefinition.gender;
  useEffect(() => {
    if (!eventDefId || !eventPool || !eventGender) return;
    const qs = new URLSearchParams({ eventDefinitionId: eventDefId, poolLength: eventPool, gender: eventGender });
    const get = (path: string) =>
      fetch(`${API_BASE}${path}?${qs}`).then((r) => (r.ok ? (r.json() as Promise<RecordEntry[]>) : [])).catch(() => []);
    // Tucumanos + NOA + nacionales (los nacionales son solo referencia)
    void Promise.all([
      get('/records'),
      fetch(`${API_BASE}/records?${qs}&scope=noa`).then((r) => (r.ok ? (r.json() as Promise<RecordEntry[]>) : [])).catch(() => []),
      get('/records/national'),
    ]).then(([prov, noa, nat]) => setRecords([...prov, ...noa, ...nat]));
    void fetch(`${API_BASE}/rankings/standards?poolLength=${eventPool}`)
      .then((r) => (r.ok ? (r.json() as Promise<StandardsTable>) : null))
      .then(setStandards)
      .catch(() => setStandards(null));
  }, [eventDefId, eventPool, eventGender]);

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

  // Primero TODOS juntos por categoría global (todos los Cadetes, todos los Juveniles...) y,
  // si se elige, separados por subcategoría (Cadete 1, Cadete 2...).
  const sortedOk = [...okResults].sort((a, b) => (a.finalTime ?? Infinity) - (b.finalTime ?? Infinity));
  const categoryGroups = groupResultsByCategory<ResultItem>([...sortedOk, ...dqResults]).map((g) => ({
    ...g,
    results: g.results.filter((r) => r.status === 'OK'),
    dqResults: g.results.filter((r) => r.status === 'DSQ'),
  }));
  type CategoryGroup = (typeof categoryGroups)[number];
  const isMultiCategory = categoryGroups.length > 1 || categoryGroups.some((g) => g.categories.length > 1);

  // categoryFilter: '' (todas) · 'g:CAD' (una categoría global) · 'c:<id>' (una subcategoría)
  const filterGroupKey = categoryFilter.startsWith('g:') ? categoryFilter.slice(2) : '';
  const filterCategoryId = categoryFilter.startsWith('c:') ? categoryFilter.slice(2) : '';
  const visibleGroups: CategoryGroup[] = categoryGroups
    .filter((g) => !filterGroupKey || g.key === filterGroupKey)
    .map((g) =>
      filterCategoryId
        ? {
            ...g,
            results: g.results.filter((r) => r.category.id === filterCategoryId),
            dqResults: g.dqResults.filter((r) => r.category.id === filterCategoryId),
          }
        : g,
    )
    .filter((g) => g.results.length + g.dqResults.length > 0);
  // Récords de referencia por categoría global
  const groupRecords = (g: CategoryGroup): GroupRecords => recordsForGroup(g.key, records);
  const eventGenderMF = event.eventDefinition.gender === 'F' ? 'F' : event.eventDefinition.gender === 'M' ? 'M' : null;
  // Marcas básicas que cumple un resultado (según nivel de la prueba y edad deportiva)
  const metSetsOf = (r: ResultItem) =>
    eventGenderMF && r.finalTime != null && (r.swimmer.age != null || r.category.minAge != null)
      ? standardsMet(
          {
            stroke: event.eventDefinition.stroke,
            distance: event.eventDefinition.distance,
            gender: eventGenderMF,
            age: r.swimmer.age ?? r.category.minAge ?? 0,
            timeMs: r.finalTime,
            level: event.level ?? null,
          },
          standards,
        )
      : [];
  // La columna de sembrado aparece solo si el torneo importado trae ese dato
  const hasSeed = results.some((r) => r.seedTime != null);

  // Flatten all items for search navigation
  const allItems = visibleGroups.flatMap((g) => [...g.results, ...g.dqResults]);
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
              {event.level && (
                <span className="ml-3 align-middle rounded-lg border border-aqua-500/40 bg-aqua-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-aqua-300">
                  {LEVEL_ES[event.level] ?? event.level}
                </span>
              )}
            </h1>
            <p className="text-pool-300 text-sm mt-1">
              {categoryGroups.length > 1
                ? `${categoryGroups.length} categorías`
                : categoryGroups[0]?.name ?? event.category.name
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
          {isMultiCategory && (
            <select
              aria-label="Categoría"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="shrink-0 bg-pool-800/60 border border-pool-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-aqua-500 transition-colors"
            >
              <option value="">Todas las categorías</option>
              {categoryGroups.map((g) => (
                <optgroup key={g.key} label={g.name}>
                  <option value={`g:${g.key}`}>{g.name} (todos)</option>
                  {g.categories.length > 1 && g.categories.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
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
            {visibleGroups.map((group) => {
              const refs = groupRecords(group);
              const podium = rankPodium(
                group.results.map((r) => ({
                  swimmerName: `${r.swimmer.firstName} ${r.swimmer.lastName}`.trim(),
                  clubName: r.club.name,
                  timeMs: r.finalTime,
                })),
              );
              const podiumKey = filterCategoryId ? `c:${filterCategoryId}` : `g:${group.key}`;
              // Último puesto de la tabla que logró cada marca básica: la línea va justo debajo
              const lastMet = new Map<string, number>();
              group.results.forEach((r, i) => metSetsOf(r).forEach((set) => lastMet.set(set.setId, i)));
              const subTitle = filterCategoryId ? group.categories.find((c) => c.id === filterCategoryId)?.name : null;
              return (
              <div key={group.key}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                  {isMultiCategory ? (
                    <h2 className="text-xs font-bold text-aqua-400 uppercase tracking-widest">
                      {group.name}{subTitle ? ` · ${subTitle}` : ''}
                      <span className="ml-2 font-normal normal-case tracking-normal text-pool-500">
                        {group.results.length} {group.results.length === 1 ? 'resultado' : 'resultados'}
                      </span>
                    </h2>
                  ) : <span />}
                  {podium.length > 0 && <PodiumButton onClick={() => setPodiumCategoryId(podiumKey)} />}
                </div>

                {/* Récords de referencia de la categoría: tucumano, NOA y nacional */}
                {(refs.tucumano || refs.noa || refs.nacional) && (
                  <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs">
                    {([['RT', refs.tucumano], ['RNOA', refs.noa], ['RN', refs.nacional]] as const).map(
                      ([mark, rec]) =>
                        rec && (
                          <span key={mark} className="flex items-baseline gap-1.5">
                            <span className={`font-semibold ${SCOPE_STYLE[mark].ink}`}>{SCOPE_STYLE[mark].label} · {group.name}</span>
                            <span className="font-mono font-bold tabular-nums text-white">{formatTime(rec.timeMs)}</span>
                            <Link href={`/nadadores/${rec.swimmer.id}`} className="text-pool-300 hover:text-aqua-300 transition-colors">
                              {rec.swimmer.firstName} {rec.swimmer.lastName}
                            </Link>
                          </span>
                        ),
                    )}
                  </div>
                )}

                {/* Podio de la categoría */}
                <Podium entries={podium} />

                {/* OK results table */}
                {group.results.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                          <th className="text-left px-4 py-3 w-10">#</th>
                          <th className="text-left px-4 py-3">Nadador/a</th>
                          <th className="text-left px-4 py-3 hidden sm:table-cell">Club</th>
                          {hasSeed && <th className="text-right px-4 py-3 hidden sm:table-cell">Sembrado</th>}
                          <th className="text-right px-4 py-3">{hasSeed ? 'Final' : 'Tiempo'}</th>
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
                                    {/* Récord que rompió en este torneo: RT (celeste), RNOA (verde), RN (ámbar) */}
                                    {recordMarks({ id: r.id, finalTime: r.finalTime, clubProvince: r.club.province }, refs).map((m) => (
                                      <span
                                        key={m}
                                        title={r.homologated ? SCOPE_STYLE[m].title : `${SCOPE_STYLE[m].title} (tentativo: el resultado todavía no está homologado)`}
                                        className={`rounded border px-1.5 py-0.5 text-xs font-bold ${r.homologated ? SCOPE_STYLE[m].badge : SCOPE_STYLE[m].dashed}`}
                                      >
                                        {SCOPE_STYLE[m].text}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-pool-300 hidden sm:table-cell">{r.club.shortName}</td>
                                {hasSeed && (
                                  <td className="px-4 py-3 text-right font-mono text-pool-400 hidden sm:table-cell">
                                    {r.seedTime != null ? formatTime(r.seedTime) : '—'}
                                  </td>
                                )}
                                <td className="px-4 py-3 text-right font-mono font-bold text-white whitespace-nowrap">
                                  {/* Flecha respecto del sembrado: nunca solo color, lleva título y texto oculto */}
                                  {r.seedTime != null && r.finalTime != null && r.finalTime !== r.seedTime && (
                                    <span
                                      className={`mr-1.5 text-xs ${r.finalTime < r.seedTime ? 'text-green-400' : 'text-red-400'}`}
                                      title={r.finalTime < r.seedTime ? 'Bajó respecto del sembrado' : 'Subió respecto del sembrado'}
                                    >
                                      <span aria-hidden="true">{r.finalTime < r.seedTime ? '▼' : '▲'}</span>
                                      <span className="sr-only">{r.finalTime < r.seedTime ? 'Bajó el tiempo' : 'Subió el tiempo'}</span>
                                    </span>
                                  )}
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
                                  <td colSpan={hasSeed ? 7 : 6} className="px-6 py-3">
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
                              {/* Si hay nadadores debajo, una línea separa a los que lograron la marca básica */}
                              {idx < group.results.length - 1 &&
                                (standards?.sets ?? [])
                                  .filter((set) => lastMet.get(set.setId) === idx)
                                  .map((set) => (
                                    <tr key={`${r.id}-corte-${set.setId}`}>
                                      <td colSpan={hasSeed ? 7 : 6} className="p-0">
                                        <div
                                          tabIndex={0}
                                          title={`${set.name}: de acá para arriba la lograron`}
                                          className={`group/corte relative flex h-2.5 items-center outline-none ${STANDARD_CUT[set.color] ?? STANDARD_CUT_DEFAULT}`}
                                        >
                                          <span className="h-px w-full bg-current opacity-30 transition-opacity group-hover/corte:opacity-90 group-focus/corte:opacity-90" />
                                          <span className="pointer-events-none absolute right-3 rounded bg-pool-950 px-2 text-[10px] font-semibold uppercase tracking-wider opacity-0 transition-opacity group-hover/corte:opacity-100 group-focus/corte:opacity-100">
                                            {set.name} · de acá para arriba la lograron
                                          </span>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
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
              );
            })}
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

      {podiumCategoryId !== null && (
        <PodiumModal
          title={`${event.eventDefinition.distance} m ${stroke} — ${gender}`}
          options={categoryGroups
            .filter((g) => podiumCategoryId === `g:${g.key}` || g.categories.some((c) => podiumCategoryId === `c:${c.id}`))
            .map((g) => {
              const sub = g.categories.find((c) => podiumCategoryId === `c:${c.id}`);
              return {
                id: podiumCategoryId,
                label: sub ? `${g.name} · ${sub.name}` : g.name,
                imageUrl: sub
                  ? `/torneos/${params.id}/prueba/${params.eventId}/podio?categoryId=${encodeURIComponent(sub.id)}`
                  : `/torneos/${params.id}/prueba/${params.eventId}/podio?group=${encodeURIComponent(g.key)}`,
              };
            })}
          onClose={() => setPodiumCategoryId(null)}
        />
      )}
    </div>
  );
}

const LEVEL_ES: Record<string, string> = { FEDERADOS: 'Federados', PROMOCIONAL: 'Promocional', ESCUELA: 'Escuela' };

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo L.', relevo_combinado: 'Relevo C.',
};
