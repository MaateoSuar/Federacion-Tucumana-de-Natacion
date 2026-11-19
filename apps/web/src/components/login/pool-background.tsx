'use client';

import { useState } from 'react';
import { Swimmer, type SwimStroke } from './swimmer';

/**
 * Ambiente de pileta vista desde arriba para el login: agua con cáusticas,
 * haces de luz, andariveles con boyas, nadadores cruzando, burbujas y olas.
 * Todo CSS/SVG, sin librerías ni imágenes. Decorativo: aria-hidden.
 * El movimiento se desactiva con prefers-reduced-motion (ver globals.css).
 */

/** Ropes (andariveles) en % de alto; entre cada par queda una calle. */
const ROPES = [10, 30, 50, 70, 90] as const;
/** Centros de calle, en %. */
const LANE_CENTERS = [20, 40, 60, 80] as const;

/** Orden en que rota el estilo de cada nadador: un estilo distinto en cada cruce. */
const STROKES: readonly SwimStroke[] = ['fly', 'back', 'breast', 'crawl'];

/** `start` = índice de STROKES con el que arranca cada nadador. El primero (crol) es el que queda quieto con movimiento reducido. */
const SWIMMERS = [
  { lane: 0, duration: 19, delay: -2, start: 3 },
  { lane: 1, duration: 23, delay: -15, start: 0 },
  { lane: 2, duration: 17, delay: -8, start: 2 },
  { lane: 3, duration: 21, delay: -19, start: 1 },
] as const;

const BUBBLES = [
  { left: 6, size: 6, duration: 14, delay: 0 },
  { left: 13, size: 10, duration: 18, delay: 4 },
  { left: 22, size: 5, duration: 12, delay: 8 },
  { left: 31, size: 8, duration: 16, delay: 2 },
  { left: 40, size: 4, duration: 13, delay: 9 },
  { left: 49, size: 12, duration: 20, delay: 6 },
  { left: 58, size: 6, duration: 15, delay: 11 },
  { left: 66, size: 9, duration: 17, delay: 1 },
  { left: 74, size: 5, duration: 12, delay: 7 },
  { left: 82, size: 11, duration: 19, delay: 3 },
  { left: 89, size: 7, duration: 14, delay: 10 },
  { left: 95, size: 4, duration: 11, delay: 5 },
] as const;

const SHAFTS = [
  { left: 8, width: 90, delay: 0 },
  { left: 34, width: 60, delay: -5 },
  { left: 61, width: 110, delay: -9 },
  { left: 86, width: 56, delay: -3 },
] as const;

/** Onda senoidal repetible: 4 períodos de 720 unidades; desplazar -50% cierra el bucle. */
function wavePath(y: number, amp: number): string {
  let d = `M0 ${y} Q180 ${y - amp} 360 ${y}`;
  for (let x = 720; x <= 2880; x += 360) d += ` T${x} ${y}`;
  return `${d} V160 H0 Z`;
}

export function PoolBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gradient-to-b from-pool-950 via-pool-800 to-pool-900"
    >
      <PoolFloor />
      <Caustics />
      <LightShafts />

      {/* Andariveles con boyas */}
      {ROPES.map((top, i) => (
        <LaneRope key={top} top={top} delay={-i * 1.1} />
      ))}

      {/* Cuatro nadadores cruzando casi sin pausa, uno por calle y desfasados; cada cruce con un estilo distinto */}
      {SWIMMERS.map((sw) => (
        <CrossingSwimmer key={sw.lane} {...sw} />
      ))}

      <Bubbles />
      <Waves />

      {/* Reflejo de luz que cruza la superficie */}
      <div className="absolute inset-y-0 left-0 w-1/4 animate-sheen bg-gradient-to-r from-transparent via-aqua-100/[0.07] to-transparent motion-reduce:hidden" />

      {/* Viñeta: oscurece bordes para dar contraste al contenido */}
      <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-pool-950/70 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-pool-950/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-pool-950/80 to-transparent" />
    </div>
  );
}

// ─── Nadador que cruza y cambia de estilo al terminar cada cruce ─────────────

interface CrossingSwimmerProps {
  lane: 0 | 1 | 2 | 3;
  duration: number;
  delay: number;
  start: number;
}

function CrossingSwimmer({ lane, duration, delay, start }: CrossingSwimmerProps) {
  const [index, setIndex] = useState(start);
  const stroke = STROKES[index % STROKES.length] ?? 'crawl';

  return (
    <div
      className={`absolute left-0 animate-swim-across motion-reduce:left-[5%] ${lane === 0 ? '' : 'motion-reduce:hidden'}`}
      style={{
        top: `${LANE_CENTERS[lane]}%`,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
      }}
      // Al cerrar cada vuelta el nadador está fuera de pantalla: ahí se cambia de estilo.
      // Las animaciones de las partes del cuerpo también burbujean este evento, por eso se filtra.
      onAnimationIteration={(e) => {
        if (e.target === e.currentTarget) setIndex((i) => (i + 1) % STROKES.length);
      }}
    >
      <div className="-translate-y-1/2">
        <Swimmer uid={String(lane)} stroke={stroke} />
      </div>
    </div>
  );
}

// ─── Piso de la pileta: línea central de cada calle con su "T" de pared ───────

function PoolFloor() {
  return (
    <>
      {LANE_CENTERS.map((top) => (
        <div key={top} className="absolute inset-x-0" style={{ top: `${top}%` }}>
          <div className="absolute inset-x-[3%] h-2 -translate-y-1/2 rounded-full bg-pool-950/35" />
          <div className="absolute left-[3%] h-9 w-2 -translate-y-1/2 rounded-sm bg-pool-950/35" />
          <div className="absolute right-[3%] h-9 w-2 -translate-y-1/2 rounded-sm bg-pool-950/35" />
        </div>
      ))}
    </>
  );
}

// ─── Cáusticas: dos capas de red de luz que se deslizan en sentidos opuestos ──

function Caustics() {
  return (
    <>
      <CausticLayer id="ftn-caustic-a" seed={4} freq="0.006 0.010" className="animate-caustic-a opacity-[0.16]" />
      <CausticLayer id="ftn-caustic-b" seed={11} freq="0.009 0.006" className="animate-caustic-b opacity-[0.12]" />
    </>
  );
}

function CausticLayer({
  id,
  seed,
  freq,
  className,
}: {
  id: string;
  seed: number;
  freq: string;
  className: string;
}) {
  return (
    <div className={`absolute -inset-[12%] text-aqua-200 mix-blend-screen ${className}`}>
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="turbulence" baseFrequency={freq} numOctaves={2} seed={seed} result="noise" />
          {/* Se queda solo con las "vetas" (valores bajos del ruido) como transparencia */}
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -7 0 0 0 1.05"
            result="veins"
          />
          <feGaussianBlur in="veins" stdDeviation="1.6" result="soft" />
          <feFlood floodColor="currentColor" result="tint" />
          <feComposite in="tint" in2="soft" operator="in" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </div>
  );
}

// ─── Haces de luz que bajan desde la superficie ──────────────────────────────

function LightShafts() {
  return (
    <div className="absolute inset-0">
      {SHAFTS.map((s) => (
        <div
          key={s.left}
          className="absolute -top-[10%] h-[130%] origin-top animate-shaft-sway bg-gradient-to-b from-aqua-200/25 via-aqua-300/5 to-transparent blur-2xl motion-reduce:opacity-60"
          style={{ left: `${s.left}%`, width: s.width, animationDelay: `${s.delay}s` }}
        />
      ))}
    </div>
  );
}

// ─── Andarivel: cuerda con boyas rojas, blancas y azules que flotan ──────────

function LaneRope({ top, delay }: { top: number; delay: number }) {
  const patternId = `ftn-buoys-${top}`;
  return (
    <div className="absolute inset-x-0" style={{ top: `${top}%` }}>
      <div className="-translate-y-1/2 animate-bob opacity-45" style={{ animationDelay: `${delay}s` }}>
        <svg className="block h-5 w-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id={patternId} width="96" height="20" patternUnits="userSpaceOnUse">
              <rect x="0" y="9" width="96" height="2" className="fill-pool-200/40" />
              <rect x="2" y="3" width="28" height="14" rx="7" className="fill-red-500" />
              <rect x="6" y="5" width="20" height="3" rx="1.5" className="fill-white/40" />
              <rect x="34" y="3" width="28" height="14" rx="7" className="fill-white" />
              <rect x="38" y="5" width="20" height="3" rx="1.5" className="fill-white" />
              <rect x="66" y="3" width="28" height="14" rx="7" className="fill-pool-400" />
              <rect x="70" y="5" width="20" height="3" rx="1.5" className="fill-white/40" />
            </pattern>
          </defs>
          <rect width="100%" height="20" fill={`url(#${patternId})`} />
        </svg>
      </div>
    </div>
  );
}

// ─── Burbujas que suben ──────────────────────────────────────────────────────

function Bubbles() {
  return (
    <div className="absolute inset-0 motion-reduce:hidden">
      {BUBBLES.map((b) => (
        <span
          key={b.left}
          className="absolute -bottom-6 animate-bubble-rise"
          style={{
            left: `${b.left}%`,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        >
          <span
            className="block animate-bubble-sway rounded-full border border-aqua-200/40 bg-aqua-200/10 shadow-[inset_-1px_-1px_2px_rgba(255,255,255,0.35)]"
            style={{ width: b.size, height: b.size, animationDuration: `${3 + (b.size % 4)}s` }}
          />
        </span>
      ))}
    </div>
  );
}

// ─── Olas del borde inferior (3 capas con velocidades distintas) ────────────

function Waves() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[16vh] min-h-[96px] overflow-hidden">
      <div className="absolute bottom-0 left-0 h-full w-[200%] animate-wave-drift-rev">
        <svg viewBox="0 0 2880 160" preserveAspectRatio="none" className="h-full w-full">
          <path d={wavePath(70, 26)} className="fill-aqua-500/20" />
        </svg>
      </div>
      <div className="absolute bottom-0 left-0 h-[82%] w-[200%] animate-wave-drift">
        <svg viewBox="0 0 2880 160" preserveAspectRatio="none" className="h-full w-full">
          <path d={wavePath(60, 20)} className="fill-pool-500/30" />
          <path d={wavePath(60, 20).replace(/ V160 H0 Z$/, '')} className="fill-none stroke-aqua-200/30" strokeWidth="2" />
        </svg>
      </div>
      <div className="absolute bottom-0 left-0 h-[58%] w-[200%] animate-wave-drift-rev" style={{ animationDuration: '18s' }}>
        <svg viewBox="0 0 2880 160" preserveAspectRatio="none" className="h-full w-full">
          <path d={wavePath(56, 16)} className="fill-pool-950/70" />
        </svg>
      </div>
    </div>
  );
}
