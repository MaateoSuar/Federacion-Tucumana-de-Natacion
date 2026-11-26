const BUOY_COLORS = ['bg-red-500', 'bg-white', 'bg-pool-400'] as const;

/** Cuerda de andarivel decorativa: boyas rojas, blancas y azules sobre una línea. */
export function RopeDivider({ count = 18, className = '' }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`relative flex items-center justify-between ${className}`}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-pool-200/30" />
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`relative h-2 w-3.5 rounded-full shadow-sm shadow-pool-950/60 ${BUOY_COLORS[i % BUOY_COLORS.length]} ${
            i % 2 === 0 ? 'animate-bob' : 'animate-bob [animation-delay:-2.5s]'
          }`}
        />
      ))}
    </div>
  );
}
