import { ImageResponse } from 'next/og';
import { formatTime } from '@/lib/formatTime';
import { isClassicPodium, type PodiumEntry } from '@/lib/podium';

// Dibujo de la imagen del podio (cuadrada y para historia). Lo comparten el podio de los
// torneos importados y el de los torneos subidos como archivo.

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
export type PodiumImageFormat = keyof typeof SIZES;

export function parsePodiumFormat(value: string | null): PodiumImageFormat {
  return value === 'story' ? 'story' : 'square';
}

export function slug(text: string): string {
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

export interface PodiumImageInput {
  podium: PodiumEntry[];
  format: PodiumImageFormat;
  /** "100 m Libre" */
  eventTitle: string;
  /** "Cadetes · Hombres · Pileta 25 m" */
  subtitle: string;
  tournamentName: string;
  /** Fecha ya formateada */
  date: string;
  logoUrl: string;
  /** Si viene, la respuesta se entrega como archivo para guardar con este nombre (sin extensión). */
  downloadName?: string;
}

export function renderPodiumImage(input: PodiumImageInput): ImageResponse {
  const { podium, format, eventTitle, subtitle, tournamentName, date, logoUrl, downloadName } = input;
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
          <div style={{ display: 'flex', marginTop: 8, fontSize: eventTitle.length > 22 ? 48 : 68, fontWeight: 800, color: C.text, textAlign: 'center' }}>{eventTitle}</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 32, color: C.muted, textAlign: 'center' }}>{subtitle}</div>
        </div>

        {/* Escalones solo en la vertical: en la cuadrada no hay alto para nombres largos. */}
        {format === 'story' && isClassicPodium(podium) ? <Steps podium={podium} /> : <Rows podium={podium} />}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: `2px solid ${C.line}`, paddingTop: 22, width: '100%' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: C.text, textAlign: 'center' }}>{tournamentName}</div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 24, color: C.muted }}>{date} · Federación Tucumana de Natación</div>
        </div>
      </div>
    ),
    SIZES[format],
  );

  if (downloadName) {
    image.headers.set('Content-Disposition', `attachment; filename="${slug(downloadName)}-${format}.png"`);
  }
  image.headers.set('Cache-Control', 'no-store');
  return image;
}
