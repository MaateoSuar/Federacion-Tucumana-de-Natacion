import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { fetchTournaments } from '@/lib/api';

export const revalidate = 30;

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  programado:             { label: 'Programado',  className: 'bg-zinc-700/50 text-zinc-300' },
  inscripciones_abiertas: { label: 'Inscripciones', className: 'bg-blue-500/20 text-blue-300' },
  cerrado:                { label: 'Cerrado',     className: 'bg-amber-500/20 text-amber-300' },
  en_curso:               { label: 'En curso',    className: 'bg-emerald-500/20 text-emerald-300 animate-pulse' },
  finalizado:             { label: 'Finalizado',  className: 'bg-pool-600/40 text-pool-300' },
  homologado:             { label: 'Finalizado',  className: 'bg-pool-600/40 text-pool-300' },
};

export default async function TorneosPage() {
  let tournaments: Awaited<ReturnType<typeof fetchTournaments>>['items'] = [];

  try {
    const data = await fetchTournaments({ limit: '50' });
    tournaments = data.items ?? [];
  } catch {
    // muestra vacío si la API no está disponible
  }

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
        <header className="mb-8">
          <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest mb-1">FTN</p>
          <h1 className="text-3xl font-black text-white">Torneos</h1>
        </header>

        {tournaments.length === 0 ? (
          <p className="text-pool-400 text-center py-20">No hay torneos disponibles aún.</p>
        ) : (
          <div className="space-y-3">
            {tournaments.map((t) => {
              const st = STATUS_LABEL[t.status] ?? { label: t.status, className: 'bg-zinc-700/50 text-zinc-300' };
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
    </div>
  );
}
