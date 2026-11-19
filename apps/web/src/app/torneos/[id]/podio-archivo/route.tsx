import type { DayFile, ResultadoRow } from '@/lib/api';
import { groupResultados } from '@/lib/file-results';
import { rankPodium } from '@/lib/podium';
import { parsePodiumFormat, renderPodiumImage } from '@/lib/podium-image';

// Imagen del podio de una prueba de un torneo subido como archivo (General o por jornada).
// Es el podio del archivo: esos resultados todavía no están homologados en el sistema.
//   GET /torneos/:id/podio-archivo?day=…&fileId=…&prueba=…&cat=…&format=square|story[&download=1]

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface TournamentInfo { name: string; startDate: string; poolLength: 'P25' | 'P50' }

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const day = Number.parseInt(url.searchParams.get('day') ?? '', 10);
  const fileId = url.searchParams.get('fileId') ?? '';
  const prueba = url.searchParams.get('prueba') ?? '';
  const cat = url.searchParams.get('cat') ?? '';
  const format = parsePodiumFormat(url.searchParams.get('format'));
  const download = url.searchParams.get('download') === '1';
  if (!Number.isInteger(day) || day < 0 || !fileId) return new Response('Faltan datos de la prueba.', { status: 400 });

  const id = encodeURIComponent(params.id);
  const [filesRes, tournamentRes] = await Promise.all([
    fetch(`${API_BASE}/tournaments/${id}/days/${day}/files`, { cache: 'no-store' }),
    fetch(`${API_BASE}/tournaments/${id}`, { cache: 'no-store' }),
  ]);
  if (!filesRes.ok || !tournamentRes.ok) return new Response('No se encontró el torneo.', { status: 404 });
  const files = (await filesRes.json()) as DayFile[];
  const tournament = (await tournamentRes.json()) as TournamentInfo;

  const file = files.find((f) => f.id === fileId && f.type === 'resultados');
  const group = groupResultados((file?.parsedRows ?? []) as ResultadoRow[]).find((g) => g.key === prueba);
  const category = group?.categories.find((c) => c.category === cat);
  const podium = rankPodium(
    (category?.rows ?? []).map(({ row }) => ({ swimmerName: row.swimmerName, clubName: row.club, timeMs: row.finalTimeMs })),
  );
  if (podium.length === 0) return new Response('Esta prueba no tiene tiempos para armar el podio.', { status: 404 });

  const pool = tournament.poolLength === 'P25' ? 'Pileta 25 m' : 'Pileta 50 m';
  const date = new Date(tournament.startDate).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return renderPodiumImage({
    podium,
    format,
    eventTitle: prueba,
    subtitle: [cat, pool].filter(Boolean).join(' · '),
    tournamentName: tournament.name,
    date,
    logoUrl: new URL('/logo-ftn-podio.png', url.origin).toString(),
    downloadName: download ? `podio ${prueba} ${cat}` : undefined,
  });
}
