import { formatTime } from '@/lib/formatTime';
import { isClassicPodium, type PodiumEntry } from '@/lib/podium';

const MEDAL: Record<1 | 2 | 3, { ring: string; text: string; step: string; label: string }> = {
  1: { ring: 'border-yellow-400 bg-yellow-400/15', text: 'text-yellow-300', step: 'h-16', label: 'Primer puesto' },
  2: { ring: 'border-zinc-300 bg-zinc-300/15', text: 'text-zinc-200', step: 'h-11', label: 'Segundo puesto' },
  3: { ring: 'border-amber-600 bg-amber-600/15', text: 'text-amber-500', step: 'h-8', label: 'Tercer puesto' },
};

function MedalCircle({ place, size }: { place: 1 | 2 | 3; size: string }) {
  const m = MEDAL[place];
  return (
    <span
      aria-label={m.label}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 font-black ${size} ${m.ring} ${m.text}`}
    >
      {place}
    </span>
  );
}

/**
 * Podio de una categoría en la página de la prueba (solo resultados homologados).
 * Con tres puestos distintos se dibuja 2-1-3; con empates o menos de tres, en fila.
 */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length === 0) return null;

  if (!isClassicPodium(entries)) {
    return (
      <ul aria-label="Podio" className="mb-3 flex flex-wrap gap-2">
        {entries.map((e) => (
          <li key={`${e.place}-${e.swimmerName}`} className="flex items-center gap-2.5 rounded-xl border border-pool-700/40 bg-pool-800/30 px-3 py-2">
            <MedalCircle place={e.place} size="h-8 w-8 text-sm" />
            <span>
              <span className="block text-sm font-bold leading-tight text-white">{e.swimmerName}</span>
              <span className="block text-xs text-pool-400">
                {e.clubName} · <span className="font-mono text-pool-200">{formatTime(e.timeMs)}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const order = [entries[1], entries[0], entries[2]].filter((e): e is PodiumEntry => e !== undefined);
  return (
    <ol aria-label="Podio" className="mb-3 grid grid-cols-3 items-end gap-2 rounded-xl border border-pool-700/40 bg-pool-800/20 px-2 pt-4">
      {order.map((e) => (
        <li key={e.place} className="flex min-w-0 flex-col items-center text-center">
          <MedalCircle place={e.place} size={e.place === 1 ? 'h-11 w-11 text-lg' : 'h-9 w-9 text-base'} />
          <span className="mt-1.5 w-full break-words px-1 text-xs font-bold leading-tight text-white sm:text-sm">{e.swimmerName}</span>
          <span className="w-full truncate px-1 text-[11px] text-pool-400">{e.clubName}</span>
          <span className={`mt-1.5 flex w-full items-start justify-center rounded-t-lg bg-pool-700/50 pt-1.5 font-mono text-xs font-bold text-white sm:text-sm ${MEDAL[e.place].step}`}>
            {formatTime(e.timeMs)}
          </span>
        </li>
      ))}
    </ol>
  );
}
