import { NavBar } from '@/components/NavBar';
import { fetchTournaments } from '@/lib/api';
import { TournamentList } from './TournamentList';

export const revalidate = 30;

export default async function TorneosPage() {
  let tournaments: Awaited<ReturnType<typeof fetchTournaments>>['items'] = [];

  try {
    // Todos los torneos: el filtrado se hace en pantalla
    const data = await fetchTournaments({ limit: '200' });
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
          <TournamentList tournaments={tournaments} />
        )}
      </div>
    </div>
  );
}
