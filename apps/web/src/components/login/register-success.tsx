import { CheckIcon, MailIcon } from './login-icons';
import { WaveSpinner } from './wave-spinner';

export interface RegisterOutcome {
  /** `verify`: falta verificar el email. `welcome`: cuenta ya verificada, entrando. */
  kind: 'verify' | 'welcome';
  email: string;
  /** Mensaje que devolvió el backend (puede venir vacío). */
  message: string;
  linked: boolean;
  /** Solo en `welcome`: el ingreso automático falló y hay que ingresar a mano. */
  autoLoginFailed: boolean;
}

interface RegisterSuccessProps {
  outcome: RegisterOutcome;
  onGoToLogin: () => void;
}

/** Estado de éxito animado: ondas que se expanden alrededor de un sobre o un tilde que se dibuja. */
export function RegisterSuccess({ outcome, onGoToLogin }: RegisterSuccessProps) {
  const isVerify = outcome.kind === 'verify';
  const entering = !isVerify && !outcome.autoLoginFailed;

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center py-2 text-center">
      <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 animate-ripple rounded-full border-2 border-aqua-300/60" />
        <span
          className="absolute inset-0 animate-ripple rounded-full border-2 border-aqua-300/60"
          style={{ animationDelay: '0.8s' }}
        />
        <span
          className="absolute inset-0 animate-ripple rounded-full border-2 border-aqua-300/60"
          style={{ animationDelay: '1.6s' }}
        />
        <span className="relative flex h-20 w-20 animate-pop-in items-center justify-center rounded-full bg-gradient-to-br from-pool-500 to-aqua-500 text-white shadow-xl shadow-aqua-400/30">
          {isVerify ? (
            <MailIcon className="h-9 w-9" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                className="animate-draw"
              />
            </svg>
          )}
        </span>
      </div>

      <h2 className="animate-fade-up text-2xl font-black text-white" style={{ animationDelay: '150ms' }}>
        {isVerify ? 'Revisá tu email para verificar tu cuenta' : '¡Bienvenido a la FTN!'}
      </h2>

      <p className="mt-2 animate-fade-up text-sm leading-relaxed text-pool-100" style={{ animationDelay: '250ms' }}>
        {isVerify ? (
          <>
            Te mandamos un enlace a <strong className="break-all font-semibold text-white">{outcome.email}</strong>.
            Abrilo para activar tu cuenta y después ingresá.
          </>
        ) : outcome.autoLoginFailed ? (
          'Tu cuenta está lista. Ingresá con tu email y contraseña.'
        ) : (
          'Tu cuenta está lista. Te estamos llevando a tu panel…'
        )}
      </p>

      {outcome.message.length > 0 && (
        <p className="mt-3 animate-fade-up text-sm text-pool-200" style={{ animationDelay: '320ms' }}>
          {outcome.message}
        </p>
      )}

      {outcome.linked && (
        <p
          className="mt-3 flex animate-fade-up items-center gap-1.5 rounded-full border border-aqua-300/40 bg-aqua-500/10 px-3 py-1.5 text-xs font-semibold text-aqua-100"
          style={{ animationDelay: '380ms' }}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          Tu código de perfil fue aceptado
        </p>
      )}

      {entering ? (
        <div className="mt-6 flex animate-fade-in items-center gap-2 text-sm font-medium text-aqua-200" style={{ animationDelay: '450ms' }}>
          <WaveSpinner className="h-5 w-5" />
          Entrando…
        </div>
      ) : (
        <button
          type="button"
          onClick={onGoToLogin}
          className="mt-6 animate-fade-up rounded-xl border border-aqua-300/50 bg-pool-800/60 px-6 py-3 text-sm font-bold text-white transition-all duration-300 hover:border-aqua-300 hover:bg-pool-700/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300"
          style={{ animationDelay: '450ms' }}
        >
          Ir a Ingresar
        </button>
      )}
    </div>
  );
}
