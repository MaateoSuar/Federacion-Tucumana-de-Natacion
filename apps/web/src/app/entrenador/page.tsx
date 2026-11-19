'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import type { Category } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PAGE_SIZE = 25;

interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
  locality: string;
}

interface SwimmerCard {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate?: string;
}

function sportAge(birthDate: string, year = new Date().getFullYear()): number {
  return year - new Date(birthDate).getFullYear();
}

function resolveCategory(categories: Category[], birthDate: string): string {
  const age = sportAge(birthDate);
  const cat = categories.find((c) => {
    const minOk = c.minAge == null || age >= c.minAge;
    const maxOk = c.maxAge == null || age <= c.maxAge;
    return minOk && maxOk;
  });
  return cat?.name ?? '–';
}

export default function EntrenadorPage() {
  const { user, logout, isLoading, accessToken } = useAuth();
  const router = useRouter();
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [swimmers, setSwimmers] = useState<SwimmerCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) void router.replace('/login');
    if (!isLoading && user && user.primaryRole !== 'COACH') {
      void router.replace('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user?.clubId || !accessToken) return;
    void (async () => {
      try {
        const [clubRes, catsRes] = await Promise.all([
          fetch(`${API_BASE}/clubs/${user.clubId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE}/tournaments/categories`),
        ]);
        if (clubRes.ok) setClub(await clubRes.json() as ClubInfo);
        if (catsRes.ok) {
          const cats = await catsRes.json() as Category[];
          setCategories(cats.filter((c) => c.scope === 'provincial').sort((a, b) => (a.orderNo ?? 0) - (b.orderNo ?? 0)));
        }
      } finally {
        setDataLoading(false);
      }
    })();
  }, [user, accessToken]);

  // El buscador espera un instante a que termines de escribir y vuelve a la primera página
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Nadadores del club: de a ${PAGE_SIZE} por página y con búsqueda por nombre en el servidor
  useEffect(() => {
    if (!user?.clubId) return;
    let cancelled = false;
    setListLoading(true);
    const params = new URLSearchParams({ clubId: user.clubId, page: String(page), limit: String(PAGE_SIZE), isActive: 'true' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/swimmers?${params}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { items: SwimmerCard[]; total: number };
        setSwimmers(data.items);
        setTotal(data.total);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.clubId, page, debouncedSearch]);

  if (isLoading || !user) {
    return <LoadingScreen />;
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleLogout = () => {
    logout();
    void router.push('/login');
  };

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      {/* NAV */}
      <nav className="border-b border-pool-800 px-6 md:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-md px-1.5 py-0.5">
            <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-7 w-auto" />
          </div>
          <span className="text-pool-500 text-xs">Entrenador</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/entrenador/solicitudes" className="text-aqua-300 hover:text-aqua-200 text-sm font-medium transition-colors">
            Solicitudes de vinculación
          </Link>
          <div className="hidden sm:flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/30 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-300 text-xs font-semibold">
              {user.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-pool-500 hover:text-white text-sm transition-colors"
          >
            Salir →
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">
              Panel de entrenador
            </p>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              {dataLoading || !club ? 'Mi club' : club.name}
            </h1>
            {club && (
              <p className="text-pool-400 text-sm mt-1">
                {club.shortName} · {club.locality}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              href="/torneos"
              className="bg-pool-800 border border-pool-700 text-pool-200 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              Ver torneos
            </Link>
            <Link
              href="/rankings"
              className="bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
            >
              Rankings
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Nadadores', value: dataLoading && total === 0 ? '–' : String(total), icon: '🏊', color: 'text-aqua-400' },
            { label: 'Temporada activa', value: '2026', icon: '📅', color: 'text-pool-300' },
            { label: 'Próximos torneos', value: '–', icon: '🏆', color: 'text-yellow-400' },
            { label: 'Resultados pendientes', value: '–', icon: '⏱', color: 'text-orange-400' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-pool-800/50 border border-pool-700/40 rounded-2xl p-5"
            >
              <div className="text-2xl mb-2">{stat.icon}</div>
              <div className={`text-3xl font-black mb-1 ${stat.color}`}>{stat.value}</div>
              <div className="text-pool-400 text-xs">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Swimmers table */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-white">Nadadores del club</h2>
            <Link
              href="/entrenador/nadadores/nuevo"
              className="text-xs text-aqua-400 hover:text-aqua-300 font-semibold"
            >
              + Agregar nadador
            </Link>
          </div>

          {/* Buscador por nombre */}
          <div className="relative mb-4">
            <label htmlFor="swimmer-search" className="sr-only">Buscar nadador por nombre</label>
            <input
              id="swimmer-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nadador por nombre o apellido…"
              autoComplete="off"
              className="w-full rounded-xl bg-pool-900/70 border border-pool-700/60 px-4 py-3 text-white placeholder-pool-500 focus:outline-none focus:border-aqua-400 focus:ring-2 focus:ring-aqua-400/30"
            />
          </div>

          {dataLoading && swimmers.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-pool-800/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : total === 0 && !listLoading ? (
            <div className="bg-pool-800/30 border border-pool-700/30 rounded-2xl p-10 text-center">
              <p className="text-pool-400 text-sm">
                {debouncedSearch ? `No hay nadadores del club que coincidan con "${debouncedSearch}".` : 'No hay nadadores cargados para este club.'}
              </p>
              {!debouncedSearch && (
                <Link
                  href="/entrenador/nadadores/nuevo"
                  className="inline-block mt-4 bg-aqua-500 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-aqua-400 transition-colors"
                >
                  Cargar primer nadador
                </Link>
              )}
            </div>
          ) : (
            <div className={`bg-pool-800/40 border border-pool-700/40 rounded-2xl overflow-hidden transition-opacity ${listLoading ? 'opacity-60' : ''}`}>
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 border-b border-pool-700/40 text-pool-500 text-xs font-semibold uppercase tracking-wider">
                <span>Nombre</span>
                <span>Género</span>
                <span>Acción</span>
              </div>
              <div className="divide-y divide-pool-700/20">
                {swimmers.map((sw) => (
                  <div
                    key={sw.id}
                    className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-5 py-4 hover:bg-pool-700/20 transition-colors"
                  >
                    <div>
                      <span className="text-white font-semibold">
                        {sw.lastName}, {sw.firstName}
                      </span>
                      {sw.birthDate && (
                        <span className="ml-2 text-pool-500 text-xs">
                          · {resolveCategory(categories, sw.birthDate)} · {sportAge(sw.birthDate)} años
                        </span>
                      )}
                    </div>
                    <span className="text-pool-400 text-sm">
                      {sw.gender === 'M' ? '♂ Masc.' : '♀ Fem.'}
                    </span>
                    <Link
                      href={`/nadadores/${sw.id}`}
                      className="text-aqua-400 text-xs hover:text-aqua-300 font-semibold"
                    >
                      Ver perfil →
                    </Link>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-pool-700/40 text-pool-400 text-xs">
                <span>
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} nadadores
                  {debouncedSearch ? ` que coinciden con "${debouncedSearch}"` : ''}
                </span>
                {lastPage > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || listLoading}
                      className="px-3 py-1.5 rounded-lg bg-pool-800 border border-pool-700 text-pool-200 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      ← Anterior
                    </button>
                    <span>Página {page} de {lastPage}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                      disabled={page >= lastPage || listLoading}
                      className="px-3 py-1.5 rounded-lg bg-pool-800 border border-pool-700 text-pool-200 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Quick links */}
        <section>
          <h2 className="text-lg font-black text-white mb-4">Accesos rápidos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Torneos', href: '/torneos', icon: '🏆' },
              { label: 'Rankings', href: '/rankings', icon: '📊' },
              { label: 'Récords', href: '/records', icon: '⏱' },
              { label: 'Importar resultados', href: '/admin/import', icon: '📥' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="bg-pool-800/40 border border-pool-700/40 rounded-2xl p-5 flex flex-col gap-2 hover:border-aqua-500/30 hover:bg-pool-800/70 transition-all group"
              >
                <span className="text-2xl">{link.icon}</span>
                <span className="text-white text-sm font-semibold group-hover:text-aqua-300 transition-colors">
                  {link.label} →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-pool-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-aqua-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-pool-400 text-sm">Cargando...</p>
      </div>
    </div>
  );
}
