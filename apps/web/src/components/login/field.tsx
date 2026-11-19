'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertIcon } from './login-icons';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  /** Elemento a la derecha dentro del input (p. ej. mostrar/ocultar contraseña). */
  trailing?: ReactNode;
  /** Etiqueta chica junto al label ("Opcional"). */
  tag?: string;
  /** Texto de ayuda bajo el campo. */
  hint?: ReactNode;
  error?: string;
}

/** Campo con label, ícono, foco con brillo aqua y una "línea de agua" que se llena al enfocar. */
export function Field({ label, value, onChange, icon, trailing, tag, hint, error, ...inputProps }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[0.8125rem] font-semibold tracking-wide text-pool-100">
          {label}
        </label>
        {tag && <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-pool-200">{tag}</span>}
      </div>

      <div className="relative rounded-xl">
        <input
          {...inputProps}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`peer w-full rounded-xl border bg-pool-950/60 py-3 pl-11 text-base text-white transition-all duration-300 placeholder:text-pool-300/60 focus:bg-pool-950/80 focus:outline-none sm:text-sm ${
            trailing ? 'pr-12' : 'pr-4'
          } ${
            error
              ? 'border-red-400/70 focus:border-red-300 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.2)]'
              : 'border-pool-600/70 hover:border-pool-500 focus:border-aqua-400 focus:shadow-[0_0_0_3px_rgba(0,180,216,0.2),0_0_18px_rgba(0,180,216,0.22)]'
          }`}
        />
        <span className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-pool-300 transition-colors duration-300 peer-focus:text-aqua-300">
          {icon}
        </span>
        {trailing && <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-aqua-300 via-pool-300 to-aqua-200 transition-transform duration-500 ease-out peer-focus:scale-x-100"
        />
      </div>

      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-pool-200">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-red-300">
          <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
