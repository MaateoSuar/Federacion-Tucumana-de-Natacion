/**
 * Nadador visto de lado, al ras del agua y medio sumergido, con cuatro estilos de nado:
 * crol, mariposa, espalda y pecho. Es la misma figura 3D; cada estilo cambia qué animación
 * lleva cada parte del cuerpo (las clases `sw-*` se animan en globals.css según `.sw-<estilo>`).
 * Todo SVG + CSS (sin librerías): volumen con gradientes y luz de borde, sombra en el piso,
 * reflejo en la superficie, estela de espuma, salpicaduras y ondas. Decorativo: aria-hidden.
 *
 * Coordenadas (viewBox -140 0 500 130): la superficie del agua está en y = 58 y el nadador
 * avanza hacia +x. Los gradientes usan currentColor para tomar la paleta pool/aqua de Tailwind.
 */

const SURFACE_Y = 58;
const VIEW_X = -140;
const VIEW_W = 500;
const VIEW_H = 130;

/** Onda de período 90 (dos períodos = 180 = desplazamiento del ciclo `surface-drift`). */
function surfacePath(closed: boolean): string {
  const amp = 2.4;
  const start = VIEW_X;
  let d = `M${start} ${SURFACE_Y} Q${start + 22.5} ${SURFACE_Y - amp * 2} ${start + 45} ${SURFACE_Y}`;
  for (let x = start + 90; x <= 580; x += 45) d += ` T${x} ${SURFACE_Y}`;
  return closed ? `${d} V${VIEW_H + 20} H${start} Z` : d;
}

function Stop({ offset, tone, opacity }: { offset: number; tone: string; opacity?: number }) {
  return <stop offset={offset} className={tone} stopColor="currentColor" stopOpacity={opacity} />;
}

export type SwimStroke = 'crawl' | 'fly' | 'back' | 'breast';

export function Swimmer({ uid, stroke }: { uid: string; stroke: SwimStroke }) {
  const id = (name: string) => `ftn-sw-${uid}-${name}`;
  const ref = (name: string) => `url(#${id(name)})`;

  const arm = (far: boolean) => {
    const fill = far ? ref('limb-dark') : ref('limb');
    const side = far ? 'f' : 'n';
    return (
      <g className={`sw-arm-${side}`} style={{ transformOrigin: '204px 56px' }}>
        <rect x="198" y="50" width="42" height="12" rx="6" fill={fill} />
        <g className={`sw-fore-${side}`} style={{ transformOrigin: '234px 56px' }}>
          <rect x="228" y="51.5" width="39" height="9" rx="4.5" fill={fill} />
          <ellipse cx="272" cy="56" rx="8.5" ry="4.8" fill={fill} />
          {!far && <rect x="232" y="52.3" width="30" height="1.6" rx="0.8" className="fill-white/50" />}
        </g>
        {!far && <rect x="203" y="51" width="28" height="1.8" rx="0.9" className="fill-white/50" />}
      </g>
    );
  };

  const leg = (far: boolean) => {
    const fill = far ? ref('limb-dark') : ref('limb');
    const side = far ? 'f' : 'n';
    return (
      <g className={`sw-thigh-${side}`} style={{ transformOrigin: '126px 64px' }}>
        <rect x="80" y="57" width="52" height="15" rx="7.5" fill={fill} />
        <g className={`sw-shin-${side}`} style={{ transformOrigin: '86px 64px' }}>
          <rect x="40" y="58.5" width="52" height="11.5" rx="5.75" fill={fill} />
          <ellipse cx="37" cy="64.5" rx="10" ry="4.2" fill={fill} />
        </g>
      </g>
    );
  };

  /** Cuerpo completo con sus animaciones: se dibuja una vez y se reutiliza para el reflejo. */
  const body = (
    <g id={id('body')} className="sw-body" style={{ transformOrigin: '170px 60px' }}>
      {/* Lado lejano (más oscuro, detrás del torso) */}
      {leg(true)}
      {arm(true)}

      {/* Torso (se comprime un poco al rotar sobre su eje) */}
      <g className="sw-torso" style={{ transformOrigin: '170px 62px' }}>
      <path
        d="M118 56C135 49 170 44 200 44C214 44 222 52 220 62C218 72 208 76 195 76C170 78 140 76 122 71C112 68 110 60 118 56Z"
        fill={ref('skin')}
      />
      {/* Malla (zona de cadera) */}
      <path
        d="M114 58C125 52 145 54 153 58L151 74C140 77 126 75 118 70C110 66 110 61 114 58Z"
        fill={ref('suit')}
      />
      {/* Luz de borde en la espalda y el hombro */}
      <path
        d="M122 54C140 47 172 44 200 44.5C212 45 219 50 219 57"
        fill="none"
        className="stroke-white/70"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="190" cy="52" rx="16" ry="4.5" className="fill-white/20" />
      </g>

      {/* Pierna cercana */}
      {leg(false)}

      {/* Brazo cercano: la cabeza lo tapa al pasar, así la cara queda limpia */}
      {arm(false)}

      {/* Cuello y cabeza (gira para respirar) */}
      <path d="M210 53L232 49L234 63L212 67Z" fill={ref('skin')} />
      <g className="sw-head" style={{ transformOrigin: '236px 50px' }}>
        {/* Perfil (solo en espalda): mentón y nariz marcan hacia dónde mira la cara */}
        <g className="sw-profile">
          <ellipse cx="242" cy="59" rx="6.5" ry="4" fill={ref('head')} />
          <path d="M246.500 47.500Q253 51.500 247 54.500Z" fill={ref('head')} />
        </g>
        <circle cx="236" cy="50" r="12" fill={ref('head')} />
        {/* Gorra */}
        <path
          d="M226 57C221 46 227 38 238 38C244 38 247 42 247 45C240 46 232 50 226 57Z"
          fill={ref('cap')}
        />
        <path d="M229 42C233 38.500 240 38.500 244 41" fill="none" className="stroke-white/60" strokeWidth="1.4" strokeLinecap="round" />
        {/* Cara: antiparras con correa y boca (la boca solo se ve al respirar) */}
        <g className="sw-face" style={{ transformOrigin: '240px 50px' }}>
        <path d="M240 48C233 46.500 229 48 227 52" fill="none" className="stroke-pool-950/80" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="243.500" cy="48.500" rx="4.800" ry="3.400" className="fill-pool-900" />
        <ellipse cx="243.500" cy="48.500" rx="4.800" ry="3.400" fill="none" className="stroke-aqua-200" strokeWidth="1" />
        <ellipse cx="242" cy="47.200" rx="1.800" ry="1" className="fill-white/80" />
        <path className="sw-mouth stroke-pool-950/70" style={{ opacity: 0 }} d="M241 55Q244.500 57.500 248 54" fill="none" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        {/* Brillo en la cabeza */}
        <ellipse cx="231" cy="45" rx="3" ry="1.600" className="fill-white/40" />
      </g>
    </g>
  );

  return (
    <svg
      viewBox={`${VIEW_X} 0 ${VIEW_W} ${VIEW_H}`}
      className={`sw sw-${stroke} block h-auto w-[320px] overflow-visible opacity-90 md:w-[440px]`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Piel estilizada en tonos aqua: luz arriba, sombra abajo */}
        <linearGradient id={id('skin')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} tone="text-aqua-100" />
          <Stop offset={0.5} tone="text-aqua-300" />
          <Stop offset={1} tone="text-aqua-600" />
        </linearGradient>
        <linearGradient id={id('limb')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} tone="text-aqua-100" />
          <Stop offset={0.45} tone="text-aqua-300" />
          <Stop offset={1} tone="text-aqua-500" />
        </linearGradient>
        <linearGradient id={id('limb-dark')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} tone="text-aqua-400" />
          <Stop offset={1} tone="text-pool-500" />
        </linearGradient>
        <linearGradient id={id('suit')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} tone="text-pool-300" />
          <Stop offset={1} tone="text-pool-600" />
        </linearGradient>
        <radialGradient id={id('head')} cx="0.35" cy="0.3" r="0.85">
          <Stop offset={0} tone="text-aqua-100" />
          <Stop offset={0.55} tone="text-aqua-300" />
          <Stop offset={1} tone="text-aqua-500" />
        </radialGradient>
        <linearGradient id={id('cap')} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} tone="text-red-300" />
          <Stop offset={0.5} tone="text-red-500" />
          <Stop offset={1} tone="text-red-700" />
        </linearGradient>
        {/* Agua que cubre la parte sumergida */}
        <linearGradient id={id('water')} gradientUnits="userSpaceOnUse" x1="0" y1={SURFACE_Y} x2="0" y2={SURFACE_Y + 58}>
          <Stop offset={0} tone="text-aqua-400" opacity={0.5} />
          <Stop offset={0.5} tone="text-pool-800" opacity={0.6} />
          <Stop offset={1} tone="text-pool-900" opacity={0} />
        </linearGradient>
        <linearGradient id={id('wake')} x1="1" y1="0" x2="0" y2="0">
          <Stop offset={0} tone="text-white" opacity={0.7} />
          <Stop offset={1} tone="text-white" opacity={0} />
        </linearGradient>
        {/* Desvanece los bordes horizontales del agua para que no se vea una franja */}
        <linearGradient id={id('fade')} gradientUnits="userSpaceOnUse" x1={VIEW_X} y1="0" x2={VIEW_X + VIEW_W} y2="0">
          <stop offset="0" stopColor="black" />
          <stop offset="0.14" stopColor="white" />
          <stop offset="0.86" stopColor="white" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
        <mask id={id('mask')} maskUnits="userSpaceOnUse" x={VIEW_X} y="0" width={VIEW_W} height={VIEW_H}>
          <rect x={VIEW_X} y="0" width={VIEW_W} height={VIEW_H} fill={ref('fade')} />
        </mask>
        {/* Zona bajo la superficie: ahí cae el reflejo (lo que viene de abajo del agua se descarta) */}
        <clipPath id={id('below')}>
          <rect x={VIEW_X} y={SURFACE_Y} width={VIEW_W} height={VIEW_H - SURFACE_Y} />
        </clipPath>
        <filter id={id('blur')} x="-20%" y="-100%" width="140%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Sombra proyectada en el piso de la pileta */}
      <ellipse cx="130" cy="118" rx="105" ry="7" className="fill-pool-950/60" filter={`url(#${id('blur')})`} />

      {/* Burbujas de la patada, bajo el agua */}
      <g className="fill-none stroke-aqua-100/60" strokeWidth="1">
        {[
          { x: 20, y: 72, delay: '0s' },
          { x: 4, y: 78, delay: '-0.6s' },
          { x: -22, y: 70, delay: '-1.1s' },
          { x: -46, y: 76, delay: '-0.3s' },
        ].map((b) => (
          <circle key={b.x} cx={b.x} cy={b.y} r="2.4" className="animate-bubble-up" style={{ animationDelay: b.delay }} />
        ))}
      </g>

      {/* Reflejo del cuerpo sobre el agua (solo lo que está por encima de la superficie).
          En espalda se omite: la cabeza va boca arriba y su reflejo espejado parecería una cabeza invertida. */}
      {stroke !== 'back' && (
        <g clipPath={`url(#${id('below')})`}>
          <use href={`#${id('body')}`} transform={`translate(0 ${SURFACE_Y * 2}) scale(1 -1)`} opacity="0.16" />
        </g>
      )}

      {body}

      {/* Agua: cubre y tiñe la parte sumergida, con su borde ondulado y brillante */}
      <g mask={ref('mask')}>
        <g className="animate-surface-drift">
          <path d={surfacePath(true)} fill={ref('water')} />
          <path d={surfacePath(false)} fill="none" className="stroke-aqua-100/70" strokeWidth="1.3" />
        </g>
      </g>

      {/* Estela de espuma sobre la superficie */}
      <path
        d={`M44 ${SURFACE_Y} C10 ${SURFACE_Y - 6} -60 ${SURFACE_Y - 4} -140 ${SURFACE_Y} C-60 ${SURFACE_Y + 6} 10 ${SURFACE_Y + 6} 44 ${SURFACE_Y}Z`}
        fill={ref('wake')}
      />
      <g className="fill-white/70">
        {[
          { x: 22, y: 56.5, r: 3.2, delay: '0s' },
          { x: 2, y: 59, r: 2.4, delay: '-0.4s' },
          { x: -22, y: 56, r: 3, delay: '-0.8s' },
          { x: -48, y: 59.5, r: 2.2, delay: '-0.2s' },
          { x: -76, y: 57, r: 2.8, delay: '-0.6s' },
          { x: -104, y: 58.5, r: 2, delay: '-1s' },
        ].map((f) => (
          <circle
            key={f.x}
            cx={f.x}
            cy={f.y}
            r={f.r}
            className="animate-foam-pulse"
            style={{ transformOrigin: `${f.x}px ${f.y}px`, animationDelay: f.delay }}
          />
        ))}
      </g>

      {/* Ondas que rodean al nadador */}
      <g className="fill-none stroke-aqua-100/60" strokeWidth="1.2">
        <ellipse cx="236" cy={SURFACE_Y} rx="34" ry="4" className="animate-ripple-flat" style={{ transformOrigin: `236px ${SURFACE_Y}px` }} />
        <ellipse cx="236" cy={SURFACE_Y} rx="34" ry="4" className="animate-ripple-flat" style={{ transformOrigin: `236px ${SURFACE_Y}px`, animationDelay: '-1.4s' }} />
        <ellipse cx="40" cy={SURFACE_Y} rx="30" ry="3.500" className="animate-ripple-flat" style={{ transformOrigin: `40px ${SURFACE_Y}px`, animationDelay: '-0.7s' }} />
      </g>

      {/* Ola de proa delante de la cabeza */}
      <path d={`M246 ${SURFACE_Y + 1} C252 ${SURFACE_Y - 5} 260 ${SURFACE_Y - 5} 268 ${SURFACE_Y}`} fill="none" className="stroke-white/70" strokeWidth="1.5" strokeLinecap="round" />

      {/* Salpicaduras donde entra cada mano (el momento depende del estilo, ver globals.css) */}
      {(['a', 'b'] as const).map((which) => (
        <g key={which} className={`sw-splash sw-splash-${which} fill-white/90`}>
          <circle cx="262" cy={SURFACE_Y - 1} r="1.8" />
          <circle cx="268" cy={SURFACE_Y - 2} r="1.3" />
          <circle cx="257" cy={SURFACE_Y - 2} r="1.1" />
        </g>
      ))}

      {/* Destellos de luz sobre la superficie */}
      <g className="fill-white">
        {[
          { x: 150, delay: '0s' },
          { x: 190, delay: '-0.9s' },
          { x: 100, delay: '-1.6s' },
          { x: 280, delay: '-0.5s' },
        ].map((g) => (
          <ellipse key={g.x} cx={g.x} cy={SURFACE_Y + 3} rx="6" ry="0.9" className="animate-glint" style={{ animationDelay: g.delay }} />
        ))}
      </g>
    </svg>
  );
}
