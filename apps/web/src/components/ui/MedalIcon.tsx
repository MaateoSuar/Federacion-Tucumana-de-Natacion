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

export function positionClass(position: number): string {
  if (position === 1) return 'bg-yellow-400/10 border-l-2 border-yellow-400';
  if (position === 2) return 'bg-zinc-400/10 border-l-2 border-zinc-400';
  if (position === 3) return 'bg-amber-600/10 border-l-2 border-amber-600';
  return '';
}
