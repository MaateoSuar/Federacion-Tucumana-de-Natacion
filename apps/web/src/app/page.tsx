import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-pool-950 text-white overflow-hidden">
      {/* NAV */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-12 py-5">
        <div className="flex items-center gap-3">
          <WaveIcon className="w-9 h-9 text-aqua-400" />
          <span className="text-lg font-bold tracking-tight">
            <span className="text-white">FTN</span>
            <span className="text-aqua-400 ml-1 font-light text-sm">Federación Tucumana de Natación</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-pool-200">
          <Link href="/torneos" className="hover:text-white transition-colors">Torneos</Link>
          <Link href="/rankings" className="hover:text-white transition-colors">Rankings</Link>
          <Link href="/records" className="hover:text-white transition-colors">Récords</Link>
          <Link
            href="/admin"
            className="bg-aqua-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-aqua-400 transition-colors"
          >
            Panel Admin
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Burbujas de fondo */}
        <Bubble size={320} top="10%" left="5%"  delay="0s" />
        <Bubble size={200} top="60%" left="80%" delay="1.5s" />
        <Bubble size={140} top="30%" left="70%" delay="3s" />
        <Bubble size={80}  top="75%" left="20%" delay="2s" />

        {/* Contenido */}
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

        {/* Olas animadas en el fondo */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden h-40 pointer-events-none">
          <svg
            viewBox="0 0 1440 160"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute bottom-0 left-0 right-0 wave-svg"
            style={{ width: '130%', marginLeft: '-15%' }}
          >
            <path
              fill="#0096c7"
              fillOpacity="0.2"
              d="M0,64L80,58.7C160,53,320,43,480,53.3C640,64,800,96,960,96C1120,96,1280,64,1360,48L1440,32L1440,160L0,160Z"
            />
          </svg>
          <svg
            viewBox="0 0 1440 160"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute bottom-0 left-0 right-0 wave-svg-2"
            style={{ width: '130%', marginLeft: '-15%' }}
          >
            <path
              fill="#00b4d8"
              fillOpacity="0.15"
              d="M0,96L80,106.7C160,117,320,139,480,128C640,117,800,75,960,64C1120,53,1280,75,1360,85.3L1440,96L1440,160L0,160Z"
            />
          </svg>
        </div>
      </section>

      {/* STATS */}
      <section className="bg-gradient-to-b from-pool-900 to-pool-950 px-6 md:px-12 py-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest text-center mb-12">
            La federación en números
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: '32', label: 'Clubes afiliados', icon: '🏊' },
              { value: '800+', label: 'Nadadores activos', icon: '🥇' },
              { value: '120+', label: 'Récords provinciales', icon: '⏱️' },
              { value: '18', label: 'Torneos por año', icon: '🏆' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-pool-800/60 border border-pool-700/50 rounded-2xl p-6 text-center hover:border-aqua-500/40 transition-all hover:-translate-y-1 duration-300"
              >
                <div className="text-3xl mb-2">{stat.icon}</div>
                <div className="text-3xl font-black text-white mb-1">{stat.value}</div>
                <div className="text-pool-300 text-xs font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-pool-950 px-6 md:px-12 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-white text-center mb-4">
            Todo lo que necesitás
          </h2>
          <p className="text-pool-300 text-center mb-14 max-w-xl mx-auto">
            Una plataforma moderna que reemplaza planillas, PDFs y Excel por datos en tiempo real.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                title: 'Rankings en tiempo real',
                desc: 'Rankings históricos y por temporada, con filtros por categoría, piscina y prueba. Actualizados al instante al homologar resultados.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: 'Tiempos y récords',
                desc: 'Cada resultado guardado en milisegundos. Detección automática de récords provinciales con homologación humana requerida.',
              },
              {
                icon: (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ),
                title: 'Perfil del nadador',
                desc: 'Historial completo de competencias, evolución de tiempos, mejores marcas personales y pasaporte digital compartible.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group bg-pool-800/40 border border-pool-700/40 rounded-2xl p-7 hover:border-aqua-500/40 hover:bg-pool-800/70 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-aqua-500/20 flex items-center justify-center text-aqua-400 mb-5 group-hover:bg-aqua-500/30 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-pool-300 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-pool-950 border-t border-pool-800 px-6 md:px-12 py-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WaveIcon className="w-6 h-6 text-aqua-500" />
            <span className="text-sm text-pool-400">
              Federación Tucumana de Natación · Tucumán, Argentina
            </span>
          </div>
          <p className="text-xs text-pool-600">
            Plataforma digital en desarrollo — 2025
          </p>
        </div>
      </footer>
    </div>
  );
}

function WaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="currentColor" fillOpacity="0.15" />
      <path
        d="M8 22c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M8 17c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

function Bubble({
  size,
  top,
  left,
  delay,
}: {
  size: number;
  top: string;
  left: string;
  delay: string;
}) {
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size,
        height: size,
        top,
        left,
        background:
          'radial-gradient(circle at 30% 30%, rgba(0,180,216,0.12), rgba(0,119,182,0.04))',
        border: '1px solid rgba(0,180,216,0.08)',
        animation: `float ${6 + Math.random() * 4}s ease-in-out infinite`,
        animationDelay: delay,
      }}
    />
  );
}
