const MEDALS: Record<number, { color: string; label: string }> = {
  1: { color: '#FFD700', label: 'Oro' },
  2: { color: '#C0C0C0', label: 'Plata' },
  3: { color: '#CD7F32', label: 'Bronce' },
};

export function MedalIcon({ position }: { position: number }) {
  const medal = MEDALS[position];
  if (!medal) return <span className="text-pool-400 text-sm font-mono">{position}</span>;
  return (
    <span title={medal.label} aria-label={medal.label}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill={medal.color} fillOpacity="0.2" stroke={medal.color} strokeWidth="1.5" />
        <text x="10" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill={medal.color}>
          {position}
        </text>
      </svg>
    </span>
  );
}

/**
 * Ícono de galardón sin número — para vistas donde se listan varios nadadores
 * que NO compiten entre sí (ej. el mejor de cada categoría mezclados en "Todas
 * las categorías"). A diferencia de MedalIcon, no implica un puesto 1º/2º/3º.
 */
export function AwardIcon() {
  return (
    <span title="Mejor marca de su categoría" aria-label="Mejor marca de su categoría">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="5.5" fill="#48CAE4" fillOpacity="0.15" stroke="#48CAE4" strokeWidth="1.5" />
        <path d="M7.2 5.5L10 7.2l2.8-1.7M10 4v6" stroke="#48CAE4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 11.5L5 17l5-2 5 2-1.5-5.5" stroke="#48CAE4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function positionClass(position: number): string {
  if (position === 1) return 'bg-yellow-400/10 border-l-2 border-yellow-400';
  if (position === 2) return 'bg-zinc-400/10 border-l-2 border-zinc-400';
  if (position === 3) return 'bg-amber-600/10 border-l-2 border-amber-600';
  return '';
}
