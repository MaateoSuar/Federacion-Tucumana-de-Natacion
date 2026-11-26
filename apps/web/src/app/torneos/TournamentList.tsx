'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Tournament } from '@/lib/api';
import { PHASE_LABEL, tournamentPhase, type TournamentPhase } from '@/lib/tournament-phase';

// Etiqueta por fecha del torneo (no por el estado interno, que se carga a mano)
const PHASE_CLASS: Record<TournamentPhase, string> = {
  proximo: 'bg-blue-500/20 text-blue-300',
  en_curso: 'bg-emerald-500/20 text-emerald-300 motion-safe:animate-pulse',
  finalizado: 'bg-pool-600/40 text-pool-300',
};

const SCOPE_ES: Record<string, string> = { provincial: 'Tucumano', noa: 'NOA', nacional: 'Nacional' };
const SELECT_CLASS =
  'bg-pool-800/60 border border-pool-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-500';

/** Minúsculas y sin tildes, para que "tucuman" encuentre "Tucumán". */
const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function TournamentList({ tournaments }: { tournaments: Tournament[] }) {
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [scope, setScope] = useState('');
  const [pool, setPool] = useState('');

  const sorted = useMemo(
    () => [...tournaments].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    [tournaments],
  );
  const years = useMemo(
    () => Array.from(new Set(sorted.map((t) => new Date(t.startDate).getFullYear()))).sort((a, b) => b - a),
    [sorted],
  );
  const scopes = useMemo(() => Array.from(new Set(sorted.map((t) => t.scope))), [sorted]);

  const words = plain(search).split(/\s+/).filter(Boolean);
  const filtered = sorted.filter((t) => {
    if (year && String(new Date(t.startDate).getFullYear()) !== year) return false;
    if (scope && t.scope !== scope) return false;
    if (pool && t.poolLength !== pool) return false;
    const haystack = plain(`${t.name} ${t.venue ?? ''} ${t.hostClub?.name ?? ''}`);
    return words.every((w) => haystack.includes(w));
  });
  const filtersActive = search !== '' || year !== '' || scope !== '' || pool !== '';

  return (
    <div>
      <div className="relative mb-3">
        <input
          type="text"
          aria-label="Buscar torneo"
          placeholder="Buscar torneo (ej: Salta, Copa Sierras, Jujuy 2025)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-pool-800/60 border border-pool-700/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-pool-500 focus:outline-none focus:border-aqua-500 transition-colors"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Año" value={year} onChange={(e) => setYear(e.target.value)} className={SELECT_CLASS}>
          <option value="">Todos los años</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {scopes.length > 1 && (
          <select aria-label="Ámbito" value={scope} onChange={(e) => setScope(e.target.value)} className={SELECT_CLASS}>
            <option value="">Todos los ámbitos</option>
            {scopes.map((s) => <option key={s} value={s}>{SCOPE_ES[s] ?? s}</option>)}
          </select>
        )}
        <select aria-label="Pileta" value={pool} onChange={(e) => setPool(e.target.value)} className={SELECT_CLASS}>
          <option value="">Todas las piletas</option>
          <option value="P25">25 m</option>
          <option value="P50">50 m</option>
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => { setSearch(''); setYear(''); setScope(''); setPool(''); }}
            className="text-xs font-semibold text-aqua-400 hover:text-aqua-300"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-xs text-pool-400">
          {filtered.length} de {sorted.length} torneos
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-pool-400 text-center py-16">Ningún torneo coincide con la búsqueda.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const phase = tournamentPhase(t.startDate, t.endDate);
            const st = { label: PHASE_LABEL[phase], className: PHASE_CLASS[phase] };
            const date = new Date(t.startDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
            return (
              <Link
                key={t.id}
                href={`/torneos/${t.id}`}
                className="flex items-center justify-between gap-4 bg-pool-800/40 hover:bg-pool-800/70 border border-pool-700/40 hover:border-aqua-500/40 rounded-xl px-5 py-4 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-aqua-300 transition-colors truncate">{t.name}</p>
                  <p className="text-pool-400 text-sm mt-0.5">
                    {date} · {t.venue ?? 'Sin sede'} · Piscina {t.poolLength === 'P25' ? '25 m' : '50 m'}
                    {SCOPE_ES[t.scope] ? ` · ${SCOPE_ES[t.scope]}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.className}`}>{st.label}</span>
                  <span className="text-pool-500 group-hover:text-aqua-400 transition-colors">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
