import type { ReactNode } from 'react';
import { ArrowRightIcon } from './login-icons';
import { WaveSpinner } from './wave-spinner';

interface WaveButtonProps {
  loading: boolean;
  loadingLabel: string;
  children: ReactNode;
  disabled?: boolean;
}

/** Botón principal: gradiente azul→aqua con una ola que sube al pasar el mouse. */
export function WaveButton({ loading, loadingLabel, children, disabled }: WaveButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      aria-busy={loading}
      className="group relative isolate w-full overflow-hidden rounded-xl bg-gradient-to-r from-pool-500 via-aqua-600 to-aqua-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-aqua-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-aqua-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-100 focus-visible:ring-offset-2 focus-visible:ring-offset-pool-900 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {/* Ola de relleno */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-full translate-y-[110%] group-disabled:hidden transition-transform duration-500 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0"
      >
        <span className="absolute -top-3 left-0 block h-4 w-[200%] animate-wave-drift" style={{ animationDuration: '3.5s' }}>
          <svg viewBox="0 0 80 16" preserveAspectRatio="none" className="h-full w-full">
            <path d="M0 8Q10 0 20 8T40 8T60 8T80 8V16H0Z" className="fill-pool-400" />
          </svg>
        </span>
        <span className="absolute inset-0 bg-pool-400" />
      </span>

      <span className="flex items-center justify-center gap-2">
        {loading ? (
          <>
            <WaveSpinner className="h-5 w-5" />
            <span>{loadingLabel}</span>
          </>
        ) : (
          <>
            <span>{children}</span>
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </>
        )}
      </span>
    </button>
  );
}
