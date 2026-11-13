import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RecordBadge } from '@/components/ui/RecordBadge';
import { formatTime } from '@/lib/formatTime';
import {
  fetchSwimmer,
  fetchSwimmerResults,
  fetchSwimmerClubHistory,
  fetchSwimmerStatistics,
  fetchSwimmerProgression,
} from '@/lib/api';
import { SwimmerProgressionView } from '@/components/swimmer/SwimmerProgressionView';
import { ImprovementCelebration } from '@/components/swimmer/ImprovementCelebration';

export const revalidate = 300;

const STROKE_ES: Record<string, string> = {
  libre: 'L', espalda: 'E', pecho: 'P', mariposa: 'M', combinado: 'C',
};

export default async function NadadorPage({ params }: { params: { id: string } }) {
  try {
    const [swimmer, resultsPage, clubHistory, stats, progression] = await Promise.all([
      fetchSwimmer(params.id),
      fetchSwimmerResults(params.id).catch(() => ({ total: 0, page: 1, limit: 20, results: [] }) as Awaited<ReturnType<typeof fetchSwimmerResults>>),
      fetchSwimmerClubHistory(params.id).catch(() => [] as Awaited<ReturnType<typeof fetchSwimmerClubHistory>>),
      fetchSwimmerStatistics(params.id).catch(() => null),
      // Progresión de las dos piletas; la vista las muestra por separado (nunca mezcladas)
      fetchSwimmerProgression(params.id).catch(() => ({ swimmerId: params.id, events: [], tournaments: [] }) as Awaited<ReturnType<typeof fetchSwimmerProgression>>),
    ]);

    const gender = swimmer.gender === 'M' ? 'Masculino' : 'Femenino';
    const age = swimmer.birthDate
      ? new Date().getFullYear() - new Date(swimmer.birthDate).getFullYear()
      : null;

    // Categoría del último torneo nadado: la congelada en ese resultado, no una recalculada hoy
    const lastSwim = progression.events
      .flatMap((e) => e.history)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const medals = stats?.global
      ? [
          { label: 'Oro', count: stats.global.gold, color: 'text-yellow-400' },
          { label: 'Plata', count: stats.global.silver, color: 'text-slate-300' },
          { label: 'Bronce', count: stats.global.bronze, color: 'text-amber-600' },
        ].filter((m) => m.count > 0)
      : [];

    return (
      <div className="min-h-screen bg-pool-950 text-white">
        <NavBar />
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">

          {/* Header del perfil */}
          <div className="flex items-start gap-5 mb-10">
            <div className="w-16 h-16 rounded-2xl bg-pool-700/60 flex items-center justify-center text-2xl font-black text-aqua-300 shrink-0">
              {swimmer.firstName[0]}{swimmer.lastName[0]}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">
                {swimmer.firstName} {swimmer.lastName}
              </h1>
              <div className="flex flex-wrap gap-2 mt-1.5 text-sm text-pool-300">
                <span>{gender}</span>
                {age != null && <span>· {age} años</span>}
                {lastSwim && <span title="Categoría en su último torneo">· {lastSwim.categoryName}</span>}
                {swimmer.currentClub && <span>· {swimmer.currentClub.name}</span>}
                {!swimmer.isActive && <span className="text-red-400">· Inactivo</span>}
              </div>
              {medals.length > 0 && (
                <div className="flex gap-4 mt-2">
                  {medals.map((m) => (
                    <span key={m.label} className="flex items-center gap-1.5 text-sm">
                      <span className={`font-black ${m.color}`}>{m.count}</span>
                      <span className="text-pool-400">{m.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Progresión: mejores marcas, último torneo con flecha, evolución y torneos */}
          {progression.events.length > 0 && <SwimmerProgressionView progression={progression} />}
          {/* Felicitación por mejoras nuevas: solo la ve el nadador dueño del perfil */}
          <ImprovementCelebration progression={progression} swimmerId={swimmer.id} firstName={swimmer.firstName} />

          {/* Historial de resultados */}
          {resultsPage.results.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-white mb-1">
                Todos los resultados ({resultsPage.total})
              </h2>
              <p className="text-xs text-pool-400 mb-4">Incluye descalificaciones y resultados todavía no homologados, que no cuentan para las mejores marcas.</p>
              <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Torneo</th>
                      <th className="text-left px-4 py-3">Prueba</th>
                      <th className="text-right px-4 py-3">Tiempo</th>
                      <th className="text-center px-4 py-3 hidden sm:table-cell">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pool-700/20">
                    {resultsPage.results.map((r) => {
                      const stroke = STROKE_ES[r.event.eventDefinition.stroke] ?? r.event.eventDefinition.stroke;
                      const pool = r.event.tournament.poolLength === 'P25' ? '25 m' : '50 m';
                      return (
                        <tr key={r.id} className="hover:bg-pool-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/torneos/${r.event.tournament.id}`} className="text-white hover:text-aqua-300 transition-colors">
                              {r.event.tournament.name}
                            </Link>
                            <p className="text-pool-400 text-xs mt-0.5">
                              {new Date(r.event.tournament.startDate).toLocaleDateString('es-AR')} · {pool}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-pool-200">
                            {r.event.eventDefinition.distance} m {stroke}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-white">
                            {r.finalTime != null ? formatTime(r.finalTime) : <StatusBadge status={r.status} />}
                          </td>
                          <td className="px-4 py-3 text-center hidden sm:table-cell">
                            <div className="flex items-center justify-center gap-1">
                              {r.isPb && <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">PB</span>}
                              {r.isRecord && <RecordBadge />}
                              {!r.homologated && <span className="text-xs text-pool-500 bg-pool-800/60 px-1.5 py-0.5 rounded">Pendiente</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Estado vacío */}
          {progression.events.length === 0 && resultsPage.results.length === 0 && clubHistory.length === 0 && (
            <div className="text-center py-16 text-pool-400">
              <p className="text-5xl mb-4">🏊</p>
              <p className="font-semibold text-white">Sin resultados registrados</p>
              <p className="text-sm mt-1">Este nadador todavía no tiene resultados importados en la plataforma.</p>
            </div>
          )}

          {/* Historial de clubes */}
          {clubHistory.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-white mb-4">Clubes</h2>
              <div className="space-y-2">
                {clubHistory.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-pool-800/30 rounded-xl px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      {h.isActive && <span className="w-2 h-2 rounded-full bg-aqua-400 shrink-0" />}
                      <span className="text-white font-medium">{h.club.name}</span>
                    </div>
                    <span className="text-pool-400">{h.season.year}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
