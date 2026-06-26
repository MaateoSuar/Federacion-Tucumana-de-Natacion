'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Swimmer {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  gender: string;
  birthDate: string | null;
  isActive: boolean;
  currentClub: { id: string; name: string; shortName: string } | null;
}

interface SwimmersResponse {
  items: Swimmer[];
  total: number;
}

export default function NadadoresPage() {
  const [data, setData] = useState<SwimmersResponse | null>(null);
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState('');
  const [isActive, setIsActive] = useState('true');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSwimmers = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', isActive });
      if (search) params.set('search', search);
      if (gender) params.set('gender', gender);
      setData(await apiFetch<SwimmersResponse>(`/swimmers?${params}`));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchSwimmers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nadadores</h1>
          <p className="text-sm text-gray-400 mt-0.5">Registro de atletas de la FTN</p>
        </div>
        <Link href="/admin/nadadores/nuevo" className="btn-primary">
          <PlusIcon /> Nuevo nadador
        </Link>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total" value={data.total} color="pool" />
          <StatCard label="Masculino" value={data.items.filter((s) => s.gender === 'M').length} color="aqua" />
          <StatCard label="Femenino" value={data.items.filter((s) => s.gender === 'F').length} color="emerald" />
        </div>
      )}

      {/* Filtros */}
      <form
        onSubmit={(e) => { e.preventDefault(); void fetchSwimmers(); }}
        className="flex flex-wrap gap-2"
      >
        <div className="relative flex-1 min-w-48">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o DNI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={gender} onChange={(e) => setGender(e.target.value)} className="input w-auto min-w-36">
          <option value="">Todos los géneros</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
        <select value={isActive} onChange={(e) => setIsActive(e.target.value)} className="input w-auto min-w-32">
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
          <option value="">Todos</option>
        </select>
        <button type="submit" className="btn-secondary">Buscar</button>
      </form>

      {loading && <LoadingRows />}
      {error && <ErrorBanner message={error} />}

      {data && !loading && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {data.total} nadador{data.total !== 1 ? 'es' : ''}
            </span>
            <div className="lane-divider h-1 w-24 rounded-full" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80">
                {['Nadador', 'DNI', 'Género', 'Club actual', 'Estado', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                    <PoolEmptyIcon />
                    <p className="mt-3 text-sm">No se encontraron nadadores</p>
                  </td>
                </tr>
              )}
              {data.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <SwimmerAvatar name={`${s.firstName} ${s.lastName}`} gender={s.gender} />
                      <div>
                        <p className="font-semibold text-gray-900">{s.lastName}, {s.firstName}</p>
                        {s.birthDate && (
                          <p className="text-xs text-gray-400">
                            {calcAge(s.birthDate)} años
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{s.documentId ?? '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      s.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                    }`}>
                      {s.gender}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 text-sm">
                    {s.currentClub ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded bg-gradient-to-br from-pool-500 to-aqua-400 flex items-center justify-center text-white text-[10px] font-bold">
                          {s.currentClub.shortName.slice(0, 2)}
                        </span>
                        {s.currentClub.name}
                      </span>
                    ) : (
                      <span className="text-gray-300">Sin club</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={s.isActive ? 'badge-green' : 'badge-gray'}>
                      {s.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/admin/nadadores/${s.id}`}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs font-medium text-pool-600 hover:text-pool-800 transition-all"
                    >
                      Ver / Editar <ArrowIcon />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function calcAge(birthDate: string) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function SwimmerAvatar({ name, gender }: { name: string; gender: string }) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const color = gender === 'M'
    ? 'from-pool-600 to-pool-400'
    : 'from-pink-500 to-rose-400';
  return (
    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white text-xs font-bold">{initials}</span>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    pool:    'bg-pool-50 border-pool-100 text-pool-700',
    aqua:    'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-pink-50 border-pink-100 text-pink-700',
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[color] ?? ''}`}>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-70">{label}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="card overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
          <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
            <div className="h-2 bg-gray-100 rounded animate-pulse w-24" />
          </div>
          <div className="h-5 bg-gray-100 rounded-full animate-pulse w-16" />
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

function PoolEmptyIcon() {
  return (
    <svg className="w-14 h-14 mx-auto text-gray-200" viewBox="0 0 56 56" fill="none">
      <rect x="4" y="4" width="48" height="48" rx="12" fill="currentColor" />
      <circle cx="28" cy="20" r="7" stroke="white" strokeWidth="2" />
      <path d="M14 42c0-7.7 6.3-14 14-14s14 6.3 14 14" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
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
