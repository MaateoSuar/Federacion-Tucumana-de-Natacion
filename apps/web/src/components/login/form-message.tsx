import { AlertIcon } from './login-icons';

export interface FormError {
  message: string;
  /** Cambia en cada error para volver a disparar la animación y el aviso al lector de pantalla. */
  id: number;
}

/** Zona viva (aria-live) para errores del envío; siempre montada para que se anuncie. */
export function FormMessage({ error }: { error: FormError | null }) {
  return (
    <div aria-live="assertive" aria-atomic="true">
      {error && (
        <div
          key={error.id}
          role="alert"
          className="flex animate-shake items-start gap-2.5 rounded-xl border border-red-400/40 bg-red-950/70 px-4 py-3 text-sm leading-snug text-red-200"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}
