import type { EventResultsResponse } from '@/lib/api';
import { buildPodium, rankPodium } from '@/lib/podium';
import { groupKeyOf, groupResultsByCategory } from '@/lib/category-groups';
import { parsePodiumFormat, renderPodiumImage } from '@/lib/podium-image';

// Imagen del podio de una prueba y categoría, para ver y compartir.
//   GET /torneos/:id/prueba/:eventId/podio?categoryId=…|group=…&format=square|story[&download=1]
//   categoryId: una subcategoría (Cadete 1) · group: la categoría global con todas sus subcategorías (CAD).

export const dynamic = 'force-dynamic';
// Edge: es el runtime recomendado para next/og (trae la fuente empaquetada).
export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho', mariposa: 'Mariposa', combinado: 'Combinado',
};
const GENDER_ES: Record<string, string> = { M: 'Hombres', F: 'Mujeres', MIX: 'Mixto' };

export async function GET(request: Request, { params }: { params: { id: string; eventId: string } }) {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get('categoryId') ?? '';
  const group = url.searchParams.get('group') ?? '';
  const format = parsePodiumFormat(url.searchParams.get('format'));
  const download = url.searchParams.get('download') === '1';

  const res = await fetch(
    `${API_BASE}/tournaments/${encodeURIComponent(params.id)}/events/${encodeURIComponent(params.eventId)}/results`,
    { cache: 'no-store' },
  );
  if (!res.ok) return new Response('No se encontró la prueba.', { status: 404 });
  const data = (await res.json()) as EventResultsResponse;

  const inGroup = group ? data.results.filter((r) => groupKeyOf(r.category) === group) : [];
  const podium = group
    ? rankPodium(
        inGroup
          .filter((r) => r.status === 'OK' && r.finalTime !== null)
          .map((r) => ({ swimmerName: `${r.swimmer.firstName} ${r.swimmer.lastName}`.trim(), clubName: r.club.name, timeMs: r.finalTime })),
      )
    : buildPodium(data.results, categoryId);
  if (podium.length === 0) {
    return new Response('Esta categoría todavía no tiene resultados con tiempo para armar el podio.', { status: 404 });
  }

  const { event } = data;
  const categoryName = group
    ? groupResultsByCategory(inGroup)[0]?.name ?? ''
    : data.results.find((r) => r.category.id === categoryId)?.category.name ?? '';
  const stroke = STROKE_ES[event.eventDefinition.stroke] ?? event.eventDefinition.stroke;
  const eventTitle = `${event.eventDefinition.distance} m ${stroke}`;
  const gender = GENDER_ES[event.eventDefinition.gender] ?? '';
  const pool = event.tournament.poolLength === 'P25' ? 'Pileta 25 m' : 'Pileta 50 m';
  const date = new Date(event.tournament.startDate).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return renderPodiumImage({
    podium,
    format,
    eventTitle,
    subtitle: [categoryName, gender, pool].filter(Boolean).join(' · '),
    tournamentName: event.tournament.name,
    date,
    logoUrl: new URL('/logo-ftn.png', url.origin).toString(),
    downloadName: download ? `podio ${eventTitle} ${categoryName} ${gender}` : undefined,
  });
}
