import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RecordBadge } from '@/components/ui/RecordBadge';
import { formatTime } from '@/lib/formatTime';
import {
  fetchSwimmer,
  fetchSwimmerPersonalBests,
  fetchSwimmerResults,
  fetchSwimmerClubHistory,
} from '@/lib/api';

export const revalidate = 300;

const STROKE_ES: Record<string, string> = {
  libre: 'L', espalda: 'E', pecho: 'P', mariposa: 'M', combinado: 'C',
};

export default async function NadadorPage({ params }: { params: { id: string } }) {
  try {
    const [swimmer, pbs, resultsPage, clubHistory] = await Promise.all([
      fetchSwimmer(params.id),
      fetchSwimmerPersonalBests(params.id),
      fetchSwimmerResults(params.id),
      fetchSwimmerClubHistory(params.id),
    ]);

    const gender = swimmer.gender === 'M' ? 'Masculino' : 'Femenino';
    const age = swimmer.birthDate
      ? new Date().getFullYear() - new Date(swimmer.birthDate).getFullYear()
      : null;

    const pbs25 = pbs.filter((pb) => pb.poolLength === 'P25');
    const pbs50 = pbs.filter((pb) => pb.poolLength === 'P50');

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
                {swimmer.currentClub && <span>· {swimmer.currentClub.name}</span>}
                {!swimmer.isActive && <span className="text-red-400">· Inactivo</span>}
              </div>
            </div>
          </div>

          {/* Mejores marcas personales */}
          {pbs.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-white mb-4">Mejores marcas personales</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {[{ label: 'Piscina 25 m', list: pbs25 }, { label: 'Piscina 50 m', list: pbs50 }].map(({ label, list }) =>
                  list.length === 0 ? null : (
                    <div key={label}>
                      <p className="text-xs font-semibold text-pool-400 uppercase tracking-wider mb-2">{label}</p>
                      <div className="overflow-x-auto rounded-xl border border-pool-700/40">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                              <th className="text-left px-4 py-2">Prueba</th>
                              <th className="text-right px-4 py-2">Tiempo</th>
                              <th className="text-right px-4 py-2 hidden sm:table-cell">Fecha</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-pool-700/20">
                            {list.map((pb) => {
                              const stroke = STROKE_ES[pb.eventDefinition.stroke] ?? pb.eventDefinition.stroke;
                              return (
                                <tr key={pb.id} className="hover:bg-pool-800/30 transition-colors">
                                  <td className="px-4 py-2.5 text-white font-medium">
                                    {pb.eventDefinition.distance} m {stroke}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold text-aqua-300">
                                    {formatTime(pb.bestTime)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-pool-400 text-xs hidden sm:table-cell">
                                    {new Date(pb.achievedAt).toLocaleDateString('es-AR')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {/* Historial de resultados */}
          {resultsPage.results.length > 0 && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-white mb-4">
                Historial de resultados ({resultsPage.total})
              </h2>
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
