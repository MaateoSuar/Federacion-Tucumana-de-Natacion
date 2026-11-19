'use client';

import { useId, type ComponentType } from 'react';
import { CheckIcon, ShieldIcon, SwimmerIcon, WhistleIcon } from './login-icons';
import { Reveal } from './reveal';
import { RopeDivider } from './rope-divider';

// ─── Credenciales demo (solo para pruebas; se sacan antes del lanzamiento) ───

export interface DemoAccount {
  role: string;
  email: string;
  password: string;
  description: string;
  /** Color de la boya del andarivel que identifica el rol. */
  buoy: string;
  icon: ComponentType<{ className?: string }>;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: 'Administrador',
    email: 'admin@ftn.ar',
    password: 'Demo1234!',
    description: 'Gestión total de la federación',
    buoy: 'bg-red-500 text-white',
    icon: ShieldIcon,
  },
  {
    role: 'Entrenador',
    email: 'entrenador@cna.ar',
    password: 'Demo1234!',
    description: 'Gestión de nadadores del club CAN',
    buoy: 'bg-white text-pool-800',
    icon: WhistleIcon,
  },
  {
    role: 'Nadador',
    email: 'nadador@ftn.ar',
    password: 'Demo1234!',
    description: 'Perfil atlético personal',
    buoy: 'bg-pool-400 text-white',
    icon: SwimmerIcon,
  },
];

interface DemoAccountCardsProps {
  onPick: (account: DemoAccount) => void;
  /** Email actualmente cargado en el formulario, para marcar la cuenta elegida. */
  selectedEmail: string;
  /** Retraso base (ms) de la animación de entrada. */
  delay?: number;
}

export function DemoAccountCards({ onPick, selectedEmail, delay = 0 }: DemoAccountCardsProps) {
  const titleId = useId();
  const sharedPassword = DEMO_ACCOUNTS[0]?.password ?? '';

  return (
    <section aria-labelledby={titleId}>
      <Reveal delay={delay}>
        <div className="mb-3 flex items-center gap-3">
          <h2 id={titleId} className="shrink-0 text-xs font-bold uppercase tracking-[0.18em] text-aqua-200">
            Cuentas demo
          </h2>
          <RopeDivider count={9} className="min-w-0 flex-1" />
        </div>
        <p className="mb-3 text-sm text-pool-100">Tocá una para completar el formulario y probar la plataforma.</p>
      </Reveal>

      <ul className="flex flex-col gap-2.5">
        {DEMO_ACCOUNTS.map((acc, i) => {
          const Icon = acc.icon;
          const selected = selectedEmail.trim().toLowerCase() === acc.email;
          return (
            <li key={acc.email}>
              <Reveal delay={delay + 100} index={i + 1}>
                <button
                  type="button"
                  onClick={() => onPick(acc)}
                  aria-pressed={selected}
                  className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border px-4 py-2.5 text-left backdrop-blur-md transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300 focus-visible:ring-offset-2 focus-visible:ring-offset-pool-950 ${
                    selected
                      ? 'border-aqua-300/70 bg-pool-700/70 shadow-lg shadow-aqua-400/20'
                      : 'border-pool-500/40 bg-pool-900/60 hover:-translate-y-0.5 hover:border-aqua-400/60 hover:bg-pool-800/80 hover:shadow-lg hover:shadow-aqua-400/10'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-md shadow-pool-950/50 ring-2 ring-pool-950/30 transition-transform duration-300 group-hover:scale-110 ${acc.buoy}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">{acc.role}</span>
                    <span className="block truncate text-xs text-pool-100">
                      {acc.email}
                      <span className="hidden text-pool-300 sm:inline"> · {acc.description}</span>
                    </span>
                  </span>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-xs font-semibold transition-all duration-300 ${
                      selected
                        ? 'text-aqua-200'
                        : 'translate-x-1 text-pool-200 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100'
                    }`}
                  >
                    {selected ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Cargada
                      </>
                    ) : (
                      'Usar'
                    )}
                  </span>
                </button>
              </Reveal>
            </li>
          );
        })}
      </ul>

      <Reveal delay={delay + 500}>
        <p className="mt-3 text-xs text-pool-200">
          Contraseña para todas:{' '}
          <code className="rounded bg-pool-800/80 px-1.5 py-0.5 font-mono text-aqua-100">{sharedPassword}</code>
        </p>
      </Reveal>
    </section>
  );
}
