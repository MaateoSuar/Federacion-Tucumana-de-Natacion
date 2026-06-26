import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { fetchTournament, fetchTournamentEvents } from '@/lib/api';

export const revalidate = 30;

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo L.', relevo_combinado: 'Relevo C.',
};

export default async function TorneoPage({ params }: { params: { id: string } }) {
  try {
    const [tournament, events] = await Promise.all([
      fetchTournament(params.id),
      fetchTournamentEvents(params.id),
    ]);

    const startDate = new Date(tournament.startDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const endDate = new Date(tournament.endDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

    return (
      <div className="min-h-screen bg-pool-950 text-white">
        <NavBar />

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link href="/torneos" className="text-pool-400 hover:text-aqua-300 text-sm transition-colors">
              ← Torneos
            </Link>
            <h1 className="text-3xl font-black text-white mt-3 mb-2">{tournament.name}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-pool-300">
              <span>{startDate} — {endDate}</span>
              {tournament.venue && <span>· {tournament.venue}</span>}
              <span>· Piscina {tournament.poolLength === 'P25' ? '25 m' : '50 m'}</span>
              <span>· {tournament.season?.year ?? ''}</span>
            </div>
          </div>

          {/* Pruebas */}
          <section>
            <h2 className="text-lg font-bold text-white mb-4">Pruebas ({events.length})</h2>
            {events.length === 0 ? (
              <p className="text-pool-400">Sin pruebas registradas.</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => {
                  const hasResults = ev._count.results > 0;
                  const stroke = STROKE_ES[ev.eventDefinition.stroke] ?? ev.eventDefinition.stroke;
                  const gender = ev.eventDefinition.gender === 'M' ? 'Hombres' : 'Mujeres';
                  return (
                    <div key={ev.id} className="flex items-center justify-between gap-4 bg-pool-800/40 border border-pool-700/30 rounded-xl px-5 py-3.5">
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {ev.eventDefinition.distance} m {stroke} — {ev.category.name} {gender}
                        </p>
                        <p className="text-pool-400 text-xs mt-0.5">
                          {ev._count.results} resultado{ev._count.results !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {hasResults ? (
                        <Link
                          href={`/torneos/${params.id}/prueba/${ev.id}`}
                          className="text-aqua-400 hover:text-aqua-300 text-sm font-semibold transition-colors shrink-0"
                        >
                          Ver resultados →
                        </Link>
                      ) : (
                        <span className="text-pool-600 text-sm shrink-0">Sin resultados</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
