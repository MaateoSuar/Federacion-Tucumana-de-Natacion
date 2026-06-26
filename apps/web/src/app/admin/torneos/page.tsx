'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Tournament {
  id: string;
  name: string;
  venue: string | null;
  poolLength: 'P25' | 'P50';
  startDate: string;
  endDate: string;
  type: string;
  scope: string;
  status: string;
  hostClub: { id: string; name: string; shortName: string } | null;
  season: { id: string; year: number };
  _count: { events: number; documents: number };
}

interface TournamentsResponse {
  items: Tournament[];
  total: number;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  programado:              { label: 'Programado',            cls: 'badge-gray' },
  inscripciones_abiertas:  { label: 'Inscripciones abiertas', cls: 'badge-green' },
  cerrado:                 { label: 'Cerrado',               cls: 'badge-yellow' },
  en_curso:                { label: 'En curso',              cls: 'bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-medium' },
  finalizado:              { label: 'Finalizado',            cls: 'badge-red' },
  homologado:              { label: 'Homologado',            cls: 'bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md text-xs font-medium' },
};

const POOL_LABEL: Record<string, string> = { P25: '25 m', P50: '50 m' };
const TYPE_LABEL: Record<string, string> = { provincial: 'Provincial', nacional: 'Nacional', promocional: 'Promocional' };

export default function TorneosPage() {
  const [data, setData] = useState<TournamentsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTournaments = async (q = '', st = '') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('search', q);
      if (st) params.set('status', st);
      setData(await apiFetch<TournamentsResponse>(`/tournaments?${params}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchTournaments(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchTournaments(search, statusFilter);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Torneos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestioná los torneos de la FTN</p>
        </div>
        <Link href="/admin/torneos/nuevo" className="btn-primary">
          <PlusIcon />
          Nuevo torneo
        </Link>
      </div>

      {/* Stats rápidas */}
      {data && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total torneos" value={data.total} />
          <StatCard label="Programados" value={data.items.filter(t => t.status === 'programado').length} />
          <StatCard label="En curso" value={data.items.filter(t => t.status === 'en_curso').length} />
          <StatCard label="Homologados" value={data.items.filter(t => t.status === 'homologado').length} />
        </div>
      )}

      {/* Filtros */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o sede..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); void fetchTournaments(search, e.target.value); }}
          className="input w-52"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {loading && <LoadingRows />}
      {error && <ErrorBanner message={error} />}

      {data && !loading && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {data.total} torneo{data.total !== 1 ? 's' : ''}
            </span>
            <div className="lane-divider h-1 w-24 rounded-full" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Torneo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Temporada</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Piscina</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Pruebas</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    <PoolEmpty />
                    <p className="mt-3 text-sm">No se encontraron torneos</p>
                  </td>
                </tr>
              )}
              {data.items.map((t) => {
                const st = STATUS_MAP[t.status] ?? { label: t.status, cls: 'badge-gray' };
                const start = new Date(t.startDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
                return (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.venue ?? '—'} · {start}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{t.season.year}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs bg-pool-50 text-pool-700 px-1.5 py-0.5 rounded">
                        {POOL_LABEL[t.poolLength] ?? t.poolLength}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{TYPE_LABEL[t.type] ?? t.type}</td>
                    <td className="px-5 py-3.5">
                      <span className={st.cls}>{st.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {t._count.events} prueba{t._count.events !== 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/admin/torneos/${t.id}`}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs font-medium text-pool-600 hover:text-pool-800 transition-all"
                      >
                        Gestionar
                        <ArrowIcon />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-componentes ─── */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="card overflow-hidden">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-100 rounded animate-pulse w-60" />
            <div className="h-2 bg-gray-100 rounded animate-pulse w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-700">
      {message}
    </div>
  );
}

function PoolEmpty() {
  return (
    <Image
      src="/logo-ftn.png"
      alt="Sin torneos"
      width={90}
      height={60}
      className="mx-auto grayscale opacity-25"
    />
  );
}

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);
const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const ArrowIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
