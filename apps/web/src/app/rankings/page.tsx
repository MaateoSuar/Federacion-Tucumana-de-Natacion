'use client';

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { MedalIcon } from '@/components/ui/MedalIcon';
import { formatTime } from '@/lib/formatTime';
import type {
  RankingEntry, ClubRankingEntry, EventStandard,
  EventDefinition, Category, Season, Tournament,
} from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

type Tab = 'prueba' | 'club';

// Color de cada set de marcas básicas: token configurable (time_standard_sets.color) → clases.
interface StandardStyle { text: string; line: string; chip: string; dot: string }
const DEFAULT_STANDARD_STYLE: StandardStyle = {
  text: 'text-aqua-300', line: 'border-aqua-400/70', chip: 'bg-aqua-500/15 text-aqua-300 border-aqua-400/40', dot: 'bg-aqua-400',
};
const STANDARD_STYLES: Record<string, StandardStyle> = {
  sky: { text: 'text-sky-300', line: 'border-sky-400/70', chip: 'bg-sky-500/15 text-sky-300 border-sky-400/40', dot: 'bg-sky-400' },
  emerald: { text: 'text-emerald-300', line: 'border-emerald-400/70', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40', dot: 'bg-emerald-400' },
  amber: { text: 'text-amber-300', line: 'border-amber-400/70', chip: 'bg-amber-500/15 text-amber-300 border-amber-400/40', dot: 'bg-amber-400' },
  aqua: DEFAULT_STANDARD_STYLE,
};
const standardStyle = (color: string): StandardStyle => STANDARD_STYLES[color] ?? DEFAULT_STANDARD_STYLE;

/** Línea de corte de una marca básica: quienes están arriba la cumplen. */
function StandardCutRow({ standard }: { standard: EventStandard }) {
  const st = standardStyle(standard.color);
  const count = standard.qualifiedCount;
  return (
    <tr aria-label={`Línea de corte: ${standard.name}`}>
      <td colSpan={5} className="px-4 py-1.5">
        <div className="flex items-center gap-3">
          <span className={`h-0 flex-1 border-t-2 border-dashed ${st.line}`} aria-hidden="true" />
          <span className={`text-center text-[11px] font-bold uppercase tracking-wider ${st.text}`}>
            ▲ {standard.name}
            {standard.timeMs !== null && <> · <span className="font-mono">{formatTime(standard.timeMs)}</span></>}
            <span className="block sm:inline"> · {count} {count === 1 ? 'nadador' : 'nadadores'}</span>
          </span>
          <span className={`h-0 flex-1 border-t-2 border-dashed ${st.line}`} aria-hidden="true" />
        </div>
      </td>
    </tr>
  );
}

// Key to identify a "base event" (distance + stroke), without gender
function baseKey(e: EventDefinition) { return `${e.distance}-${e.stroke}`; }

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>('prueba');

  // Catálogos
  const [eventDefs, setEventDefs] = useState<EventDefinition[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);

  // Filtros
  // selectedBaseKey: "{distance}-{stroke}" — gender-independent selection
  const [selectedBaseKey, setSelectedBaseKey] = useState('');
  const [poolLength, setPoolLength] = useState<'P25' | 'P50'>('P25');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [categoryId, setCategoryId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [clubScope, setClubScope] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentId, setTournamentId] = useState('');

  // Unique base events (distance+stroke), excluding relays and <50m races, sorted
  const uniqueBaseEvents = useMemo<EventDefinition[]>(() => {
    const seen = new Set<string>();
    return eventDefs
      .filter((e) => !e.isRelay && e.distance >= 50)
      .sort((a, b) => a.distance - b.distance || a.stroke.localeCompare(b.stroke))
      .filter((e) => {
        const k = baseKey(e);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [eventDefs]);

  // Resolved eventDefId: find the eventDef matching selectedBaseKey + current gender
  const eventDefId = useMemo(() => {
    if (!selectedBaseKey) return '';
    return eventDefs.find((e) => baseKey(e) === selectedBaseKey && e.gender === gender)?.id ?? '';
  }, [selectedBaseKey, gender, eventDefs]);

  // Resultados
  const [eventRankings, setEventRankings] = useState<RankingEntry[] | null>(null);
  const [standards, setStandards] = useState<EventStandard[]>([]);
  // Sets de marcas básicas que el usuario ocultó desde la leyenda
  const [hiddenSets, setHiddenSets] = useState<Set<string>>(new Set());
  const visibleStandards = useMemo(() => standards.filter((s) => !hiddenSets.has(s.setId)), [standards, hiddenSets]);
  // Con categoría elegida cada set tiene una marca única: la línea de corte va después
  // de la última fila que la cumple (las filas vienen ordenadas por tiempo).
  const cutLines = useMemo(() => {
    const lines = new Map<number, EventStandard[]>();
    if (!eventRankings) return lines;
    for (const s of visibleStandards) {
      if (s.timeMs === null) continue;
      const timeMs = s.timeMs;
      const after = eventRankings.filter((r) => r.finalTime <= timeMs).length;
      lines.set(after, [...(lines.get(after) ?? []), s]);
    }
    return lines;
  }, [eventRankings, visibleStandards]);
  const toggleSet = (setId: string) =>
    setHiddenSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  const [clubRankings, setClubRankings] = useState<ClubRankingEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cargar catálogos al montar
  useEffect(() => {
    Promise.all([
      fetchJson<EventDefinition[]>(`${API_BASE}/tournaments/event-definitions`),
      fetchJson<Category[]>(`${API_BASE}/tournaments/categories`),
      fetchJson<Season[]>(`${API_BASE}/tournaments/seasons`),
    ]).then(([eds, cats, seas]) => {
      setEventDefs(eds);
      setCategories(cats.filter((c) => c.scope === 'provincial'));
      setSeasons(seas);
      // Pick first valid base event (distance >= 50, not relay)
      const first = eds.find((e) => !e.isRelay && e.distance >= 50);
      if (first) setSelectedBaseKey(baseKey(first));
    }).catch(() => {});
  }, []);

  const loadEventRankings = useCallback(async () => {
    if (!eventDefId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        eventDefinitionId: eventDefId,
        poolLength,
        gender,
        categoryId,
        ...(seasonId ? { seasonId } : {}),
      });
      const data = await fetchJson<RankingEntry[]>(`${API_BASE}/rankings/event?${params}`);
      setEventRankings(data);
      // Las marcas básicas son un agregado: si fallan, el ranking se muestra igual.
      const stds = await fetchJson<EventStandard[]>(`${API_BASE}/rankings/event/standards?${params}`).catch(() => []);
      setStandards(stds);
    } catch {
      setError('No se pudieron cargar los rankings.');
    } finally {
      setLoading(false);
    }
  }, [eventDefId, poolLength, gender, categoryId, seasonId]); // categoryId puede ser ''

  const loadClubRankings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        scope: 'provincial',
        ...(clubScope ? { seasonId: clubScope } : {}),
        ...(tournamentId ? { tournamentId } : {}),
      });
      const data = await fetchJson<ClubRankingEntry[]>(`${API_BASE}/rankings/club?${params}`);
      setClubRankings(data);
    } catch {
      setError('No se pudieron cargar los rankings de clubes.');
    } finally {
      setLoading(false);
    }
  }, [clubScope, tournamentId]);

  useEffect(() => {
    if (tab === 'prueba' && eventDefId) void loadEventRankings();
  }, [tab, eventDefId, categoryId, poolLength, gender, seasonId, loadEventRankings]);

  useEffect(() => {
    if (tab === 'club') loadClubRankings();
  }, [tab, clubScope, tournamentId, loadClubRankings]);

  // Al elegir un año, cargar sus torneos para poder acotar el ranking a uno puntual
  useEffect(() => {
    setTournamentId('');
    if (!clubScope) { setTournaments([]); return; }
    fetchJson<{ items: Tournament[] }>(`${API_BASE}/tournaments?seasonId=${clubScope}&limit=200`)
      .then((d) => setTournaments(d.items))
      .catch(() => setTournaments([]));
  }, [clubScope]);

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">

        <header className="mb-8">
          <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest mb-1">FTN</p>
          <h1 className="text-3xl font-black text-white">Rankings</h1>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 bg-pool-800/40 rounded-xl p-1 mb-6 w-fit">
          {(['prueba', 'club'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${tab === t ? 'bg-aqua-600 text-white' : 'text-pool-300 hover:text-white'}`}
            >
              {t === 'prueba' ? 'Por prueba' : 'Por club'}
            </button>
          ))}
        </div>

        {/* Filtros — prueba */}
        {tab === 'prueba' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            <select value={selectedBaseKey} onChange={(e) => setSelectedBaseKey(e.target.value)} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white col-span-2 md:col-span-1">
              {uniqueBaseEvents.map((e) => (
                <option key={baseKey(e)} value={baseKey(e)}>
                  {e.distance} m {STROKE_ES[e.stroke] ?? e.stroke}
                </option>
              ))}
            </select>
            <select value={poolLength} onChange={(e) => setPoolLength(e.target.value as 'P25' | 'P50')} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="P25">25 m</option>
              <option value="P50">50 m</option>
            </select>
            <select value={gender} onChange={(e) => setGender(e.target.value as 'M' | 'F')} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="M">Hombres</option>
              <option value="F">Mujeres</option>
            </select>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Todos</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Histórico global</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.year}</option>
              ))}
            </select>
          </div>
        )}

        {/* Filtros — club */}
        {tab === 'club' && (
          <div className="flex flex-wrap gap-3 mb-6">
            <select value={clubScope} onChange={(e) => setClubScope(e.target.value)} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Histórico global</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.year}</option>
              ))}
            </select>
            {clubScope && (
              <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Acumulado del año</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Estado */}
        {loading && <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-aqua-400 border-t-transparent rounded-full animate-spin" /></div>}
        {error && <p className="text-red-400 text-center py-10">{error}</p>}

        {/* Tabla por prueba */}
        {!loading && tab === 'prueba' && eventRankings && (
          eventRankings.length === 0
            ? <p className="text-pool-400 text-center py-16">Sin resultados para estos filtros.</p>
            : (
              <>
              {standards.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-pool-400 uppercase tracking-wider font-semibold">Marcas básicas</span>
                  {standards.map((s) => {
                    const st = standardStyle(s.color);
                    const hidden = hiddenSets.has(s.setId);
                    return (
                      <button
                        key={s.setId}
                        type="button"
                        onClick={() => toggleSet(s.setId)}
                        aria-pressed={!hidden}
                        title={hidden ? 'Mostrar' : 'Ocultar'}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition-opacity ${st.chip} ${hidden ? 'opacity-40 line-through' : ''}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden="true" />
                        {s.name}
                        {s.timeMs !== null && <span className="font-mono">{formatTime(s.timeMs)}</span>}
                        <span className="font-normal opacity-80">· {s.qualifiedCount} {s.qualifiedCount === 1 ? 'nadador' : 'nadadores'}</span>
                      </button>
                    );
                  })}
                  {!categoryId && (
                    <span className="text-pool-500">Elegí una categoría para ver la línea de corte.</span>
                  )}
                </div>
              )}
              <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 w-10">#</th>
                      <th className="text-left px-4 py-3">Nadador/a</th>
                      <th className="text-left px-4 py-3 hidden sm:table-cell">Club</th>
                      <th className="text-left px-4 py-3">Categoría</th>
                      <th className="text-right px-4 py-3">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pool-700/20">
                    {(cutLines.get(0) ?? []).map((s) => <StandardCutRow key={s.setId} standard={s} />)}
                    {eventRankings.map((r, idx) => (
                      <Fragment key={`${r.swimmerId}-${r.categoryId}-${r.sourceResultId}`}>
                      <tr className="hover:bg-pool-800/30 transition-colors">
                        <td className="px-4 py-3"><MedalIcon position={r.position} /></td>
                        <td className="px-4 py-3 font-medium text-white">
                          <Link href={`/nadadores/${r.swimmerId}`} className="hover:text-aqua-300 transition-colors">
                            {r.swimmerName}
                          </Link>
                          {visibleStandards
                            .filter((s) => r.meets?.includes(s.setId))
                            .map((s) => (
                              <span
                                key={s.setId}
                                title={`Cumple la ${s.name}`}
                                className={`ml-2 inline-block rounded border px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide ${standardStyle(s.color).chip}`}
                              >
                                {s.shortLabel}
                              </span>
                            ))}
                        </td>
                        <td className="px-4 py-3 text-pool-300 hidden sm:table-cell">{r.clubName}</td>
                        <td className="px-4 py-3 text-pool-300 text-xs sm:text-sm">{r.categoryName}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-white">{formatTime(r.finalTime)}</td>
                      </tr>
                      {(cutLines.get(idx + 1) ?? []).map((s) => <StandardCutRow key={s.setId} standard={s} />)}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )
        )}

        {/* Tabla por club */}
        {!loading && tab === 'club' && clubRankings && (
          clubRankings.length === 0
            ? <p className="text-pool-400 text-center py-16">Sin datos de clubes disponibles.</p>
            : (
              <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 w-10">#</th>
                      <th className="text-left px-4 py-3">Club</th>
                      <th className="text-right px-4 py-3">Puntos</th>
                      <th className="text-center px-4 py-3">🥇</th>
                      <th className="text-center px-4 py-3">🥈</th>
                      <th className="text-center px-4 py-3">🥉</th>
                      <th className="text-right px-4 py-3 hidden md:table-cell">Récords</th>
                      <th className="text-right px-4 py-3 hidden md:table-cell">Activos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pool-700/20">
                    {clubRankings.map((c) => (
                      <tr key={c.clubId} className="hover:bg-pool-800/30 transition-colors">
                        <td className="px-4 py-3"><MedalIcon position={c.position} /></td>
                        <td className="px-4 py-3 font-semibold text-white">{c.clubName}</td>
                        <td className="px-4 py-3 text-right font-bold text-aqua-300">{c.points}</td>
                        <td className="px-4 py-3 text-center text-yellow-400 font-mono">{c.gold}</td>
                        <td className="px-4 py-3 text-center text-zinc-300 font-mono">{c.silver}</td>
                        <td className="px-4 py-3 text-center text-amber-600 font-mono">{c.bronze}</td>
                        <td className="px-4 py-3 text-right text-pool-300 hidden md:table-cell">{c.currentRecords}</td>
                        <td className="px-4 py-3 text-right text-pool-300 hidden md:table-cell">{c.activeSwimmers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </div>
    </div>
  );
}
