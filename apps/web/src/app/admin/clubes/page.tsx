'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Club {
  id: string;
  name: string;
  shortName: string;
  locality: string;
  status: string;
  logoUrl: string | null;
  foundedYear: number | null;
  _count?: { swimmers: number };
}

interface ClubsResponse {
  items: Club[];
  total: number;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  afiliado:   { label: 'Afiliado',   cls: 'badge-green' },
  suspendido: { label: 'Suspendido', cls: 'badge-yellow' },
  baja:       { label: 'Baja',       cls: 'badge-red' },
};

export default function ClubesPage() {
  const [data, setData] = useState<ClubsResponse | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClubs = async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('search', q);
      setData(await apiFetch<ClubsResponse>(`/clubs?${params}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchClubs(); }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clubes</h1>
          <p className="text-sm text-gray-400 mt-0.5">Administrá los clubes afiliados a la FTN</p>
        </div>
        <Link href="/admin/clubes/nuevo" className="btn-primary">
          <PlusIcon />
          Nuevo club
        </Link>
      </div>

      {/* Stats rápidas */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total clubes"
            value={data.total}
            color="bg-pool-50 text-pool-700"
            icon={<BuildingIcon />}
          />
          <StatCard
            label="Afiliados"
            value={data.items.filter((c) => c.status === 'afiliado').length}
            color="bg-emerald-50 text-emerald-700"
            icon={<CheckIcon />}
          />
          <StatCard
            label="Suspendidos / Baja"
            value={data.items.filter((c) => c.status !== 'afiliado').length}
            color="bg-amber-50 text-amber-700"
            icon={<WarningIcon />}
          />
        </div>
      )}

      {/* Buscador */}
      <form
        onSubmit={(e) => { e.preventDefault(); void fetchClubs(search); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, sigla o localidad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {/* Tabla */}
      {loading && <LoadingRows />}
      {error && <ErrorBanner message={error} />}

      {data && !loading && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {data.total} club{data.total !== 1 ? 'es' : ''}
            </span>
            <div className="lane-divider h-1 w-24 rounded-full" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Club</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Localidad</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Nadadores</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    <PoolEmpty />
                    <p className="mt-3 text-sm">No se encontraron clubes</p>
                  </td>
                </tr>
              )}
              {data.items.map((club) => {
                const s = STATUS[club.status] ?? { label: club.status, cls: 'badge-gray' };
                return (
                  <tr key={club.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <ClubAvatar logo={club.logoUrl} shortName={club.shortName} />
                        <div>
                          <p className="font-semibold text-gray-900">{club.name}</p>
                          <p className="text-xs text-gray-400">{club.shortName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{club.locality}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-pool-700">
                        {club._count?.swimmers ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={s.cls}>{s.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/admin/clubes/${club.id}`}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs font-medium text-pool-600 hover:text-pool-800 transition-all"
                      >
                        Editar
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

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={`card p-5 flex items-center gap-4`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} bg-opacity-20`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-gray-900">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function ClubAvatar({ logo, shortName }: { logo: string | null; shortName: string }) {
  if (logo) {
    return (
      <div className="w-9 h-9 rounded-lg border border-gray-100 flex items-center justify-center overflow-hidden bg-white shadow-sm flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={shortName} className="w-full h-full object-contain p-0.5" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pool-600 to-aqua-500 flex items-center justify-center flex-shrink-0 shadow-sm">
      <span className="text-white text-xs font-bold">{shortName.slice(0, 2)}</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="card overflow-hidden">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
          <div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-100 rounded animate-pulse w-40" />
            <div className="h-2 bg-gray-100 rounded animate-pulse w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-red-700">
      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      {message}
    </div>
  );
}

function PoolEmpty() {
  return (
    <svg className="w-14 h-14 mx-auto text-gray-200" viewBox="0 0 56 56" fill="none">
      <rect x="4" y="4" width="48" height="48" rx="12" fill="currentColor" />
      <path d="M14 32c3-4 6-7 9-7s6 6 9 6 6-6 9-6 4 3 5 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 24c3-4 6-7 9-7s6 6 9 6 6-6 9-6 4 3 5 7" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

/* Icons */
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
const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const WarningIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);
