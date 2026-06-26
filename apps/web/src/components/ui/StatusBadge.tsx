const CONFIG = {
  OK:  { label: 'OK',  className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  DSQ: { label: 'DESC', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  DNS: { label: 'DNS', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  DNF: { label: 'DNF', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
} as const;

type Status = keyof typeof CONFIG;

export function StatusBadge({ status, dsqCode }: { status: string; dsqCode?: string | null }) {
  const cfg = CONFIG[status as Status] ?? CONFIG.OK;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border ${cfg.className}`}
      title={dsqCode ?? undefined}
    >
      {cfg.label}
    </span>
  );
}
