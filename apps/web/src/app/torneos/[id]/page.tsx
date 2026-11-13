import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { fetchTournament, fetchTournamentEvents, fetchTournamentDayFiles } from '@/lib/api';
import type { DayFile } from '@/lib/api';
import { EventList } from './EventList';
import { DayFilesPanel } from './DayFilesPanel';

export const revalidate = 30;

/** Cantidad de jornadas derivada de las fechas del torneo — mismo criterio que el panel admin. */
function countDays(startDate: string, endDate: string): number {
  const start = new Date(startDate).setHours(0, 0, 0, 0);
  const end = new Date(endDate).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export default async function TorneoPage({ params }: { params: { id: string } }) {
  try {
    const [tournament, events] = await Promise.all([
      fetchTournament(params.id),
      fetchTournamentEvents(params.id),
    ]);

    const eventsWithResults = events.filter((e) => e._count.results > 0);
    const totalDays = countDays(tournament.startDate, tournament.endDate);
    const dayFilesByDay = await Promise.all(
      Array.from({ length: totalDays + 1 }, (_, d) => d) // 0 (General) .. totalDays
        .map((d) => fetchTournamentDayFiles(params.id, d).catch(() => [] as DayFile[])),
    );
    const dayFiles = dayFilesByDay.flat();

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

          {/* Sembrados y Resultados por jornada */}
          {dayFiles.length > 0 && (
            <div className="mb-10">
              <DayFilesPanel dayFiles={dayFiles} totalDays={totalDays} />
            </div>
          )}

          {/* Pruebas: solo las que tienen resultados cargados en el sistema. Un torneo que
              solo tiene los archivos de sembrados/resultados no muestra una lista vacía. */}
          {eventsWithResults.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-white mb-4">Pruebas</h2>
              <EventList events={eventsWithResults} tournamentId={params.id} />
            </section>
          )}
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
