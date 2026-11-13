import Link from 'next/link';
import { fetchTournaments } from '@/lib/api';
import { PHASE_LABEL, tournamentPhase, type TournamentPhase } from '@/lib/tournament-phase';

export const revalidate = 60;

// Etiqueta por fecha del torneo (no por el estado interno, que se carga a mano)
const PHASE_COLOR: Record<TournamentPhase, string> = {
  proximo: 'bg-aqua-500/20 text-aqua-300 border-aqua-500/30',
  en_curso: 'bg-green-500/20 text-green-300 border-green-500/30',
  finalizado: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function HomePage() {
  let recentTournaments: { id: string; name: string; startDate: string; endDate?: string; poolLength: string; status: string; hostClub?: { shortName: string }; _count?: { events: number } }[] = [];

  try {
    const data = await fetchTournaments({ limit: '6', page: '1' });
    recentTournaments = data.items;
  } catch {
    // API no disponible — se muestra la home igual
  }

  return (
    <div className="min-h-screen bg-pool-950 text-white overflow-hidden">
      {/* NAV */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center">
          <div className="bg-white rounded-md px-2 py-0.5">
            <img src="/LogoPNGSinLetras.png" alt="FTN - Federación Tucumana de Natación" className="h-9 w-auto" />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-pool-200">
          <Link href="/torneos" className="hover:text-white transition-colors">Torneos</Link>
          <Link href="/rankings" className="hover:text-white transition-colors">Rankings</Link>
          <Link href="/records" className="hover:text-white transition-colors">Récords</Link>
          <Link
            href="/login"
            className="bg-aqua-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-aqua-400 transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>
        {/* Mobile */}
        <Link href="/login" className="md:hidden bg-aqua-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold">
          Acceder
        </Link>
      </nav>

      {/* HERO */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center px-6 overflow-hidden">
        <Bubble size={320} top="10%" left="5%"  delay="0s" />
        <Bubble size={200} top="60%" left="80%" delay="1.5s" />
        <Bubble size={140} top="30%" left="70%" delay="3s" />
        <Bubble size={80}  top="75%" left="20%" delay="2s" />

        <div className="relative z-10 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 bg-aqua-500/20 border border-aqua-400/30 text-aqua-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-aqua-400 animate-pulse" />
            Plataforma oficial — Tucumán, Argentina
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6">
            <span className="block text-white">Natación</span>
            <span className="block bg-gradient-to-r from-aqua-400 to-pool-300 bg-clip-text text-transparent">
              Tucumana
            </span>
          </h1>

          <p className="text-pool-200 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Resultados, rankings y récords de la natación federada de Tucumán.
            Seguí el desempeño de los nadadores y clubes en tiempo real.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/torneos"
              className="group relative overflow-hidden bg-gradient-to-r from-aqua-500 to-pool-400 px-8 py-3.5 rounded-full font-bold text-white shadow-lg shadow-aqua-500/30 hover:shadow-aqua-500/50 transition-all hover:scale-105"
            >
              <span className="relative z-10">Ver torneos</span>
              <div className="absolute inset-0 water-shimmer" />
            </Link>
            <Link
              href="/rankings"
              className="border border-pool-500 text-pool-200 hover:text-white hover:border-pool-400 px-8 py-3.5 rounded-full font-semibold transition-all"
            >
              Rankings →
            </Link>
          </div>
        </div>

        {/* Olas */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-32 pointer-events-none">
          <svg viewBox="0 0 1440 128" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 wave-svg" style={{ width: '130%', marginLeft: '-15%' }}>
            <path fill="#0096c7" fillOpacity="0.15" d="M0,64L80,58.7C160,53,320,43,480,53.3C640,64,800,96,960,96C1120,96,1280,64,1360,48L1440,32L1440,128L0,128Z" />
          </svg>
        </div>
      </section>

      {/* TORNEOS RECIENTES */}
      <section className="bg-gradient-to-b from-pool-900 to-pool-950 px-6 md:px-12 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest mb-1">Actividad reciente</p>
              <h2 className="text-2xl font-black text-white">Torneos</h2>
            </div>
            <Link href="/torneos" className="text-aqua-400 hover:text-aqua-300 text-sm font-semibold transition-colors">
              Ver todos →
            </Link>
          </div>

          {recentTournaments.length === 0 ? (
            <div className="bg-pool-800/30 border border-pool-700/30 rounded-2xl p-10 text-center">
              <p className="text-pool-400 text-sm">No hay torneos disponibles.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentTournaments.map((t) => {
                const phase = tournamentPhase(t.startDate, t.endDate);
                const st = { label: PHASE_LABEL[phase], color: PHASE_COLOR[phase] };
                return (
                  <Link
                    key={t.id}
                    href={`/torneos/${t.id}`}
                    className="group bg-pool-800/40 border border-pool-700/40 rounded-2xl p-5 hover:border-aqua-500/40 hover:bg-pool-800/70 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${st.color}`}>
                        {st.label}
                      </span>
                      <span className="text-pool-500 text-[10px]">
                        {t.poolLength === 'P25' ? '25 m' : '50 m'}
                      </span>
                    </div>
                    <h3 className="font-bold text-white text-sm leading-snug mb-1 group-hover:text-aqua-200 transition-colors">
                      {t.name}
                    </h3>
                    <p className="text-pool-400 text-xs">{formatDate(t.startDate)}</p>
                    {t.hostClub && (
                      <p className="text-pool-500 text-[10px] mt-1">{t.hostClub.shortName}</p>
                    )}
                    {t._count && (
                      <p className="text-pool-500 text-[10px] mt-2">
                        {t._count.events} prueba{t._count.events !== 1 ? 's' : ''}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-pool-950 px-6 md:px-12 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-black text-white text-center mb-3">Todo lo que necesitás</h2>
          <p className="text-pool-300 text-center mb-10 max-w-xl mx-auto text-sm">
            Una plataforma moderna que reemplaza planillas, PDFs y Excel por datos en tiempo real.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                href: '/rankings',
                title: 'Rankings en tiempo real',
                desc: 'Rankings históricos y por temporada, con filtros por categoría, piscina y prueba.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                href: '/records',
                title: 'Tiempos y récords',
                desc: 'Cada resultado guardado en milisegundos. Detección automática de récords provinciales.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ),
                href: '/torneos',
                title: 'Perfil del nadador',
                desc: 'Historial completo de competencias, evolución de tiempos y mejores marcas personales.',
              },
            ].map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="group bg-pool-800/40 border border-pool-700/40 rounded-2xl p-6 hover:border-aqua-500/40 hover:bg-pool-800/70 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-aqua-500/20 flex items-center justify-center text-aqua-400 mb-4 group-hover:bg-aqua-500/30 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-bold text-white mb-1 text-sm">{f.title}</h3>
                <p className="text-pool-300 text-xs leading-relaxed">{f.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-pool-950 border-t border-pool-800 px-6 md:px-12 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-white rounded px-1.5 py-0.5">
              <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-4 w-auto" />
            </div>
            <span className="text-xs text-pool-400">Federación Tucumana de Natación · Tucumán, Argentina</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-pool-600">
            <Link href="/torneos" className="hover:text-pool-400 transition-colors">Torneos</Link>
            <Link href="/rankings" className="hover:text-pool-400 transition-colors">Rankings</Link>
            <Link href="/records" className="hover:text-pool-400 transition-colors">Récords</Link>
            <Link href="/login" className="hover:text-aqua-400 transition-colors">Acceso privado</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Bubble({ size, top, left, delay }: { size: number; top: string; left: string; delay: string }) {
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size, height: size, top, left,
        background: 'radial-gradient(circle at 30% 30%, rgba(0,180,216,0.12), rgba(0,119,182,0.04))',
        border: '1px solid rgba(0,180,216,0.08)',
        animation: `float ${6 + (size % 4)}s ease-in-out infinite`,
        animationDelay: delay,
      }}
    />
  );
}
