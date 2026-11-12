import { ImageResponse } from 'next/og';
import type { EventResultsResponse } from '@/lib/api';
import { formatTime } from '@/lib/formatTime';
import { buildPodium, isClassicPodium, type PodiumEntry } from '@/lib/podium';

// Imagen del podio de una prueba y categoría, para descargar y compartir.
//   GET /torneos/:id/prueba/:eventId/podio?categoryId=…&format=square|story[&download=1]

export const dynamic = 'force-dynamic';
// Edge: es el runtime recomendado para next/og (trae la fuente empaquetada).
export const runtime = 'edge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho', mariposa: 'Mariposa', combinado: 'Combinado',
};
const GENDER_ES: Record<string, string> = { M: 'Hombres', F: 'Mujeres', MIX: 'Mixto' };

// Paleta "piscina" de la plataforma (tailwind.config.ts)
const C = {
  bgTop: '#020d1a', bgBottom: '#0a2540', panel: '#0d3460', line: '#0e4482',
  aqua: '#48cae4', text: '#ffffff', muted: '#85c7f8',
};
const MEDAL: Record<1 | 2 | 3, { color: string; label: string; height: number }> = {
  1: { color: '#facc15', label: '1°', height: 300 },
  2: { color: '#d4d4d8', label: '2°', height: 220 },
  3: { color: '#d97706', label: '3°', height: 160 },
};

const SIZES = { square: { width: 1080, height: 1080 }, story: { width: 1080, height: 1920 } } as const;

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function Medal({ place, size }: { place: 1 | 2 | 3; size: number }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size,
        borderRadius: size, background: MEDAL[place].color, color: '#1c1917', fontSize: size * 0.45, fontWeight: 800,
      }}
    >
      {MEDAL[place].label}
    </div>
  );
}

/** Podio clásico de tres escalones (formato vertical): 2° a la izquierda, 1° al centro, 3° a la derecha. */
function Steps({ podium }: { podium: PodiumEntry[] }) {
  const order = [podium[1], podium[0], podium[2]].filter((p): p is PodiumEntry => p !== undefined);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 20, width: '100%' }}>
      {order.map((p) => (
        <div key={`${p.place}-${p.swimmerName}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 320 }}>
          <Medal place={p.place} size={p.place === 1 ? 110 : 90} />
          <div style={{ display: 'flex', textAlign: 'center', justifyContent: 'center', marginTop: 14, fontSize: p.place === 1 ? 40 : 34, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>
            {p.swimmerName}
          </div>
          <div style={{ display: 'flex', textAlign: 'center', justifyContent: 'center', marginTop: 6, fontSize: 24, color: C.muted }}>
            {p.clubName}
          </div>
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', marginTop: 14, paddingTop: 24,
              width: '100%', height: MEDAL[p.place].height, background: C.panel,
              borderTop: `6px solid ${MEDAL[p.place].color}`, borderRadius: '16px 16px 0 0',
            }}
          >
            <div style={{ display: 'flex', fontSize: p.place === 1 ? 54 : 46, fontWeight: 800, color: C.text }}>
              {formatTime(p.timeMs)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Formato cuadrado, empates o menos de tres nadadores: una fila por nadador, con su puesto. */
function Rows({ podium }: { podium: PodiumEntry[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      {podium.map((p) => (
        <div
          key={`${p.place}-${p.swimmerName}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 24, padding: '22px 28px', background: C.panel,
            borderLeft: `8px solid ${MEDAL[p.place].color}`, borderRadius: 18,
          }}
        >
          <Medal place={p.place} size={84} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>{p.swimmerName}</div>
            <div style={{ display: 'flex', fontSize: 24, color: C.muted, marginTop: 4 }}>{p.clubName}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 46, fontWeight: 800, color: C.text }}>{formatTime(p.timeMs)}</div>
        </div>
      ))}
    </div>
  );
}

export async function GET(request: Request, { params }: { params: { id: string; eventId: string } }) {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get('categoryId') ?? '';
  const format = url.searchParams.get('format') === 'story' ? 'story' : 'square';
  const download = url.searchParams.get('download') === '1';

  const res = await fetch(
    `${API_BASE}/tournaments/${encodeURIComponent(params.id)}/events/${encodeURIComponent(params.eventId)}/results`,
    { cache: 'no-store' },
  );
  if (!res.ok) return new Response('No se encontró la prueba.', { status: 404 });
  const data = (await res.json()) as EventResultsResponse;

  const podium = buildPodium(data.results, categoryId);
  if (podium.length === 0) {
    return new Response('Esta categoría todavía no tiene resultados homologados para armar el podio.', { status: 404 });
  }

  const { event } = data;
  const categoryName = data.results.find((r) => r.category.id === categoryId)?.category.name ?? '';
  const stroke = STROKE_ES[event.eventDefinition.stroke] ?? event.eventDefinition.stroke;
  const eventTitle = `${event.eventDefinition.distance} m ${stroke}`;
  const gender = GENDER_ES[event.eventDefinition.gender] ?? '';
  const pool = event.tournament.poolLength === 'P25' ? 'Pileta 25 m' : 'Pileta 50 m';
  const date = new Date(event.tournament.startDate).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const logoUrl = new URL('/logo-ftn.png', url.origin).toString();
  const size = SIZES[format];

  const image = new ImageResponse(
    (
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', height: '100%', padding: format === 'story' ? '120px 60px' : '56px 60px',
          background: `linear-gradient(180deg, ${C.bgTop} 0%, ${C.bgBottom} 100%)`, fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: 20, padding: '12px 22px' }}>
            <img src={logoUrl} alt="" height={72} />
          </div>
          <div style={{ display: 'flex', marginTop: 26, fontSize: 26, letterSpacing: 8, fontWeight: 800, color: C.aqua }}>PODIO</div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 68, fontWeight: 800, color: C.text, textAlign: 'center' }}>{eventTitle}</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 32, color: C.muted, textAlign: 'center' }}>
            {[categoryName, gender, pool].filter(Boolean).join(' · ')}
          </div>
        </div>

        {/* Escalones solo en la vertical: en la cuadrada no hay alto para nombres largos. */}
        {format === 'story' && isClassicPodium(podium) ? <Steps podium={podium} /> : <Rows podium={podium} />}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: `2px solid ${C.line}`, paddingTop: 22, width: '100%' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: C.text, textAlign: 'center' }}>{event.tournament.name}</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 24, color: C.muted }}>{date} · Federación Tucumana de Natación</div>
        </div>
      </div>
    ),
    size,
  );

  if (download) {
    const name = slug(`podio ${eventTitle} ${categoryName} ${gender}`);
    image.headers.set('Content-Disposition', `attachment; filename="${name}-${format}.png"`);
  }
  image.headers.set('Cache-Control', 'no-store');
  return image;
}
