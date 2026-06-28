'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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

export default function EntrenadorPage() {
  const { user, logout, isLoading, accessToken } = useAuth();
  const router = useRouter();
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [swimmers, setSwimmers] = useState<SwimmerCard[]>([]);
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
        const [clubRes, swimmersRes] = await Promise.all([
          fetch(`${API_BASE}/clubs/${user.clubId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE}/swimmers?clubId=${user.clubId}&limit=50`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);
        if (clubRes.ok) setClub(await clubRes.json() as ClubInfo);
        if (swimmersRes.ok) {
          const data = await swimmersRes.json() as { items?: SwimmerCard[] } | SwimmerCard[];
          setSwimmers(Array.isArray(data) ? data : (data.items ?? []));
        }
      } finally {
        setDataLoading(false);
      }
    })();
  }, [user, accessToken]);

  if (isLoading || !user) {
    return <LoadingScreen />;
  }

  const handleLogout = () => {
    logout();
    void router.push('/login');
  };

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      {/* NAV */}
      <nav className="border-b border-pool-800 px-6 md:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WaveIcon className="w-8 h-8 text-aqua-400" />
          <div>
            <span className="text-white font-black text-base">FTN</span>
            <span className="text-pool-500 text-xs ml-2">Entrenador</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
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
            { label: 'Nadadores activos', value: dataLoading ? '–' : String(swimmers.length), icon: '🏊', color: 'text-aqua-400' },
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
              href="/admin/nadadores/nuevo"
              className="text-xs text-aqua-400 hover:text-aqua-300 font-semibold"
            >
              + Agregar nadador
            </Link>
          </div>

          {dataLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-pool-800/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : swimmers.length === 0 ? (
            <div className="bg-pool-800/30 border border-pool-700/30 rounded-2xl p-10 text-center">
              <p className="text-pool-400 text-sm">No hay nadadores cargados para este club.</p>
              <Link
                href="/admin/nadadores/nuevo"
                className="inline-block mt-4 bg-aqua-500 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-aqua-400 transition-colors"
              >
                Cargar primer nadador
              </Link>
            </div>
          ) : (
            <div className="bg-pool-800/40 border border-pool-700/40 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 border-b border-pool-700/40 text-pool-500 text-xs font-semibold uppercase tracking-wider">
                <span>Nombre</span>
                <span>Género</span>
                <span>Acción</span>
              </div>
              <div className="divide-y divide-pool-700/20">
                {swimmers.slice(0, 20).map((sw) => (
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
                          · {new Date(sw.birthDate).getFullYear()}
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
              {swimmers.length > 20 && (
                <div className="px-5 py-3 text-center text-pool-500 text-xs">
                  Mostrando 20 de {swimmers.length} nadadores.{' '}
                  <Link href="/admin/nadadores" className="text-aqua-400 hover:underline">
                    Ver todos →
                  </Link>
                </div>
              )}
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
        <WaveIcon className="w-12 h-12 text-aqua-400 animate-pulse" />
        <p className="text-pool-400 text-sm">Cargando...</p>
      </div>
    </div>
  );
}

function WaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" fill="currentColor" fillOpacity="0.15" />
      <path d="M8 22c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M8 17c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}
