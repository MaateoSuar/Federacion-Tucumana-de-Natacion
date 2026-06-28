'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function NadadorPage() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) void router.replace('/login');
    if (!isLoading && user && user.primaryRole !== 'SWIMMER') {
      void router.replace('/login');
    }
    // If swimmer has a linked swimmer profile, redirect to their public profile
    if (!isLoading && user?.swimmerId) {
      void router.replace(`/nadadores/${user.swimmerId}`);
    }
  }, [user, isLoading, router]);

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
            <span className="text-pool-500 text-xs ml-2">Mi perfil</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-pool-800/60 border border-aqua-500/30 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-aqua-400" />
            <span className="text-aqua-300 text-xs font-semibold">{user.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-pool-500 hover:text-white text-sm transition-colors"
          >
            Salir →
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-8">
        {/* Avatar placeholder */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-aqua-500 to-pool-400 flex items-center justify-center shadow-xl shadow-aqua-500/20">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-aqua-500 flex items-center justify-center text-xs shadow-md">
            🏊
          </div>
        </div>

        <div>
          <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest mb-2">
            Nadador / Atleta
          </p>
          <h1 className="text-3xl font-black text-white mb-2">
            Hola, {user.firstName || user.email.split('@')[0]}
          </h1>
          <p className="text-pool-400 text-sm">{user.email}</p>
        </div>

        {/* Pending link notice */}
        <div className="w-full bg-aqua-950/40 border border-aqua-500/25 rounded-2xl p-6 text-left">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-aqua-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-aqua-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-sm mb-1">Vinculá tu perfil atlético</h3>
              <p className="text-pool-400 text-sm leading-relaxed">
                Tu cuenta aún no está vinculada a un registro de nadador. Solicitá la vinculación
                y el administrador de la FTN la aprobará para que puedas ver tu historial completo,
                marcas personales y evolución de tiempos.
              </p>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="w-full grid grid-cols-2 gap-4">
          {[
            { label: 'Torneos', href: '/torneos', desc: 'Resultados y calendarios', icon: '🏆' },
            { label: 'Rankings', href: '/rankings', desc: 'Posiciones por prueba', icon: '📊' },
            { label: 'Récords', href: '/records', desc: 'Marcas provinciales', icon: '⏱' },
            { label: 'Perfiles', href: '/nadadores', desc: 'Buscar nadadores', icon: '🏊' },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-pool-800/40 border border-pool-700/40 rounded-2xl p-5 text-left hover:border-aqua-500/30 hover:bg-pool-800/70 transition-all group"
            >
              <div className="text-2xl mb-2">{link.icon}</div>
              <div className="text-white text-sm font-bold group-hover:text-aqua-300 transition-colors">
                {link.label}
              </div>
              <div className="text-pool-500 text-xs mt-1">{link.desc}</div>
            </Link>
          ))}
        </div>

        <p className="text-pool-600 text-xs">
          ¿Problemas? Contactá al administrador en{' '}
          <span className="text-pool-400">admin@ftn.ar</span>
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-pool-950 flex items-center justify-center">
      <WaveIcon className="w-12 h-12 text-aqua-400 animate-pulse" />
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
