'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { MedalIcon } from '@/components/ui/MedalIcon';
import { formatTime } from '@/lib/formatTime';
import type {
  RankingEntry, ClubRankingEntry,
  EventDefinition, Category, Season,
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
type Mode = 'best_per_swimmer' | 'all_performances';

// Key to identify a "base event" (distance + stroke), without gender
function baseKey(e: EventDefinition) { return `${e.distance}-${e.stroke}`; }

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>('prueba');
  const [mode, setMode] = useState<Mode>('all_performances');

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
        mode,
        ...(seasonId ? { seasonId } : {}),
      });
      const data = await fetchJson<RankingEntry[]>(`${API_BASE}/rankings/event?${params}`);
      setEventRankings(data);
    } catch {
      setError('No se pudieron cargar los rankings.');
    } finally {
      setLoading(false);
    }
  }, [eventDefId, poolLength, gender, categoryId, mode, seasonId]); // categoryId puede ser ''

  const loadClubRankings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ scope: 'provincial', ...(clubScope ? { seasonId: clubScope } : {}) });
      const data = await fetchJson<ClubRankingEntry[]>(`${API_BASE}/rankings/club?${params}`);
      setClubRankings(data);
    } catch {
      setError('No se pudieron cargar los rankings de clubes.');
    } finally {
      setLoading(false);
    }
  }, [clubScope]);

  useEffect(() => {
    if (tab === 'prueba' && eventDefId) void loadEventRankings();
  }, [tab, eventDefId, categoryId, poolLength, gender, mode, seasonId, loadEventRankings]);

  useEffect(() => {
    if (tab === 'club') loadClubRankings();
  }, [tab, clubScope, loadClubRankings]);

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
            <div className="flex items-center gap-1 bg-pool-800/40 border border-pool-600/40 rounded-lg p-0.5">
              {(['best_per_swimmer', 'all_performances'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all ${mode === m ? 'bg-pool-600 text-white' : 'text-pool-400 hover:text-white'}`}
                >
                  {m === 'best_per_swimmer' ? 'Mejor marca' : 'Todas'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtros — club */}
        {tab === 'club' && (
          <div className="mb-6">
            <select value={clubScope} onChange={(e) => setClubScope(e.target.value)} className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Histórico global</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.year}</option>
              ))}
            </select>
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
              <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3 w-10">#</th>
                      <th className="text-left px-4 py-3">Nadador/a</th>
                      <th className="text-left px-4 py-3 hidden sm:table-cell">Club</th>
                      <th className="text-right px-4 py-3">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pool-700/20">
                    {eventRankings.map((r) => (
                      <tr key={`${r.swimmerId}-${r.sourceResultId}`} className="hover:bg-pool-800/30 transition-colors">
                        <td className="px-4 py-3"><MedalIcon position={r.position} /></td>
                        <td className="px-4 py-3 font-medium text-white">
                          <Link href={`/nadadores/${r.swimmerId}`} className="hover:text-aqua-300 transition-colors">
                            {r.swimmerName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-pool-300 hidden sm:table-cell">{r.clubName}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-white">{formatTime(r.finalTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
