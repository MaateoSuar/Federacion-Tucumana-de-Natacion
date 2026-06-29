import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { fetchTournament, fetchTournamentEvents } from '@/lib/api';
import { EventList } from './EventList';

export const revalidate = 30;

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
            <h2 className="text-lg font-bold text-white mb-4">Pruebas</h2>
            <EventList events={events} tournamentId={params.id} />
          </section>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
