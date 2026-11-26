const DROP = 'M12 2.5C12 2.5 5 10 5 15a7 7 0 0014 0c0-5-7-12.5-7-12.5z';

/** Gota de agua que se llena y se vacía con una ola dentro (indicador de carga). */
export function WaveSpinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <clipPath id="ftn-drop-clip">
          <path d={DROP} />
        </clipPath>
      </defs>
      <path d={DROP} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <g clipPath="url(#ftn-drop-clip)">
        <g className="animate-drop-fill">
          {/* Ola de período 12: desplazar -50% del viewBox (12 u) cierra el bucle */}
          <g className="animate-wave-drift-fast">
            <path d="M0 12Q3 9 6 12T12 12T18 12T24 12T30 12T36 12V30H0Z" fill="currentColor" />
          </g>
        </g>
      </g>
    </svg>
  );
}
