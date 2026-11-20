import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { fetchSwimmers } from '@/lib/api';

export const revalidate = 30;

export default async function NadoresPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  // Meet Manager exporta "APELLIDO, Nombre" — normalizamos quitando comas para que el
  // tokenizado del backend encuentre firstName/lastName por separado.
  const search = (searchParams.search ?? '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const page = Number(searchParams.page ?? '1');
  const limit = 20;

  const data = await fetchSwimmers({ search: search || undefined, page, limit }).catch(() => ({
    items: [],
    total: 0,
    page: 1,
    limit,
  }));

  const totalPages = Math.ceil(data.total / limit);

  function buildHref(p: number, s?: string): string {
    const params = new URLSearchParams();
    const q = s ?? search;
    if (q) params.set('search', q);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/nadadores${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">
        <h1 className="text-2xl font-black text-white mb-6">Nadadores</h1>

        {/* Búsqueda */}
        <form method="get" action="/nadadores" className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Buscar por nombre o DNI…"
              className="flex-1 bg-pool-800/50 border border-pool-700/50 rounded-xl px-4 py-2.5 text-white placeholder-pool-500 focus:outline-none focus:border-aqua-500 transition-colors"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-aqua-600 hover:bg-aqua-500 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Buscar
            </button>
          </div>
        </form>

        {/* Resultados */}
        {data.items.length === 0 ? (
          <div className="text-center py-16 text-pool-400">
            <p className="text-5xl mb-4">🏊</p>
            {search ? (
              <>
                <p className="font-semibold text-white">Sin resultados para &ldquo;{search}&rdquo;</p>
                <p className="text-sm mt-1">
                  Intentá con otro nombre.{' '}
                  <Link href="/nadadores" className="text-aqua-400 hover:underline">Ver todos</Link>
                </p>
              </>
            ) : (
              <p className="font-semibold text-white">No hay nadadores registrados</p>
            )}
          </div>
        ) : (
          <>
            {search && (
              <p className="text-sm text-pool-400 mb-4">
                {data.total} resultado{data.total !== 1 ? 's' : ''} para &ldquo;{search}&rdquo;
              </p>
            )}
            <div className="space-y-2">
              {data.items.map((swimmer) => {
                const age = swimmer.birthDate
                  ? new Date().getFullYear() - new Date(swimmer.birthDate).getFullYear()
                  : null;
                const initials = `${swimmer.firstName[0] ?? ''}${swimmer.lastName[0] ?? ''}`.toUpperCase();
                return (
                  <Link
                    key={swimmer.id}
                    href={`/nadadores/${swimmer.id}`}
                    className="flex items-center gap-4 bg-pool-800/30 hover:bg-pool-800/60 border border-pool-700/30 hover:border-pool-600/50 rounded-xl px-4 py-3 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-pool-700/60 flex items-center justify-center text-sm font-black text-aqua-300 shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white group-hover:text-aqua-200 transition-colors truncate">
                        {swimmer.firstName} {swimmer.lastName}
                      </p>
                      <p className="text-xs text-pool-400 truncate">
                        {swimmer.gender === 'M' ? 'Masculino' : 'Femenino'}
                        {age != null && ` · ${age} años`}
                        {swimmer.currentClub && ` · ${swimmer.currentClub.name}`}
                      </p>
                    </div>
                    {!swimmer.isActive && (
                      <span className="text-xs text-red-400 shrink-0">Inactivo</span>
                    )}
                    <svg className="w-4 h-4 text-pool-500 group-hover:text-aqua-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                );
              })}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                {page > 1 && (
                  <Link href={buildHref(page - 1)} className="px-3 py-1.5 text-sm bg-pool-800/50 hover:bg-pool-700/60 border border-pool-700/40 rounded-lg text-pool-200 transition-colors">
                    ← Anterior
                  </Link>
                )}
                <span className="text-sm text-pool-400">
                  Página {page} de {totalPages}
                </span>
                {page < totalPages && (
                  <Link href={buildHref(page + 1)} className="px-3 py-1.5 text-sm bg-pool-800/50 hover:bg-pool-700/60 border border-pool-700/40 rounded-lg text-pool-200 transition-colors">
                    Siguiente →
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
