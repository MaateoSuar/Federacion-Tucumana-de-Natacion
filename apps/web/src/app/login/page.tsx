'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, roleRedirect } from '@/lib/auth';
import { AnimatedHeight } from '@/components/login/animated-height';
import { Brand } from '@/components/login/brand';
import { formatClaimCode } from '@/components/login/claim-code';
import { DEMO_ACCOUNTS, DemoAccountCards, type DemoAccount } from '@/components/login/demo-account-cards';
import type { FormError } from '@/components/login/form-message';
import { LoginForm } from '@/components/login/login-form';
import { ModeTabs, panelId, tabId, type AuthMode } from '@/components/login/mode-tabs';
import { PoolBackground } from '@/components/login/pool-background';
import { RegisterForm, type RegisterValues } from '@/components/login/register-form';
import { RegisterSuccess, type RegisterOutcome } from '@/components/login/register-success';
import type { RevealVariant } from '@/components/login/reveal';
import { Reveal } from '@/components/login/reveal';

const HERO_CHIPS = ['Resultados', 'Rankings', 'Récords', 'Perfil de nadador'] as const;

const COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  login: {
    title: 'Iniciá sesión',
    subtitle: 'Tus marcas, tus récords y tu historial te están esperando.',
  },
  register: {
    title: 'Creá tu cuenta',
    subtitle: 'En un minuto tenés tu lugar en la pileta.',
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  // useSearchParams requiere Suspense en el App Router.
  return (
    <Suspense
      fallback={
        <div className="ftn-login min-h-screen bg-pool-950">
          <PoolBackground />
        </div>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const { login, register, user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Código de perfil por enlace: /login?codigo=FTN-XXXX-XXXX → abre "Crear cuenta" con el código cargado.
  const codeFromUrl = formatClaimCode(searchParams.get('codigo') ?? '');
  const hasCodeFromUrl = codeFromUrl.length > 0;

  const [mode, setMode] = useState<AuthMode>(hasCodeFromUrl ? 'register' : 'login');
  const [variant, setVariant] = useState<RevealVariant>('initial');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerValues, setRegisterValues] = useState<RegisterValues>({
    firstName: '',
    lastName: '',
    claimCode: codeFromUrl,
  });
  const [error, setError] = useState<FormError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<RegisterOutcome | null>(null);
  const errorCounter = useRef(0);

  const showError = useCallback((message: string) => {
    errorCounter.current += 1;
    setError({ message, id: errorCounter.current });
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      void router.replace(roleRedirect(user.primaryRole));
    }
  }, [user, isLoading, router]);

  const changeMode = useCallback(
    (next: AuthMode) => {
      if (next === mode) return;
      setVariant(next === 'register' ? 'forward' : 'back');
      setMode(next);
      setError(null);
      setOutcome(null);
    },
    [mode],
  );

  const fillDemo = (acc: DemoAccount) => {
    if (mode !== 'login') {
      setVariant('back');
      setMode('login');
      setOutcome(null);
    }
    setEmail(acc.email);
    setPassword(acc.password);
    setError(null);
  };

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      // redirect handled by useEffect above
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setSubmitting(true);
    const cleanEmail = email.trim();
    try {
      const result = await register({
        firstName: registerValues.firstName.trim(),
        lastName: registerValues.lastName.trim(),
        email: cleanEmail,
        password,
        claimCode: registerValues.claimCode,
      });

      const base = { email: cleanEmail, message: result.message, linked: result.linked === true };
      if (result.verified) {
        setOutcome({ ...base, kind: 'welcome', autoLoginFailed: false });
        try {
          await login(cleanEmail, password);
          // redirect handled by useEffect above
        } catch {
          setOutcome({ ...base, kind: 'welcome', autoLoginFailed: true });
        }
      } else {
        setOutcome({ ...base, kind: 'verify', autoLoginFailed: false });
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'No pudimos crear tu cuenta. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const goToLoginFromSuccess = () => {
    setEmail((prev) => prev.trim());
    setVariant('back');
    setMode('login');
    setOutcome(null);
    setError(null);
  };

  const copy = COPY[mode];

  return (
    <div className="ftn-login relative min-h-screen overflow-x-hidden bg-pool-950 text-white">
      <PoolBackground />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-8 lg:flex-row lg:items-center lg:gap-14 lg:px-12">
        {/* ── Columna izquierda: marca, mensaje y cuentas demo (escritorio) ── */}
        <div className="hidden min-h-[600px] flex-1 flex-col justify-between gap-8 py-2 lg:flex">
          <Reveal>
            <Brand />
          </Reveal>

          <div>
            <Reveal delay={150}>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-aqua-300/30 bg-pool-900/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-aqua-100 backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aqua-300" />
                Plataforma oficial · Tucumán, Argentina
              </p>
            </Reveal>
            <Reveal delay={250}>
              <p className="text-6xl font-black leading-[1.02] tracking-tight text-white xl:text-7xl">
                Cada centésima
                <br />
                <span className="bg-gradient-to-r from-aqua-200 via-aqua-300 to-pool-300 bg-clip-text text-transparent">
                  cuenta.
                </span>
              </p>
            </Reveal>
            <Reveal delay={350}>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-pool-100">
                Resultados, rankings y récords de la natación federada de Tucumán, en un solo lugar.
              </p>
            </Reveal>
            <Reveal delay={450}>
              <ul className="mt-6 flex flex-wrap gap-2">
                {HERO_CHIPS.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full border border-pool-500/50 bg-pool-900/50 px-3.5 py-1.5 text-sm font-medium text-pool-100 backdrop-blur"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <div className="max-w-md">
            <DemoAccountCards onPick={fillDemo} selectedEmail={email} delay={500} />
          </div>
        </div>

        {/* ── Columna derecha: tarjeta de acceso ── */}
        <div className="mx-auto flex w-full max-w-md flex-col gap-6 lg:mx-0 lg:w-[460px] lg:max-w-none lg:shrink-0">
          <Reveal className="lg:hidden">
            <Brand />
          </Reveal>

          <Reveal delay={120}>
            <main
              className="relative rounded-3xl border border-aqua-200/15 bg-pool-900/80 p-5 shadow-2xl shadow-pool-950/70 backdrop-blur-xl sm:p-8"
              aria-labelledby="auth-title"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-aqua-300/70 to-transparent"
              />

              {outcome === null ? (
                <>
                  <div key={mode} className={`mb-6 ${variant === 'initial' ? '' : variant === 'forward' ? 'animate-panel-in' : 'animate-panel-in-rev'}`}>
                    <h1 id="auth-title" className="text-3xl font-black leading-tight text-white">
                      {copy.title}
                    </h1>
                    <p className="mt-1.5 text-sm leading-relaxed text-pool-100">{copy.subtitle}</p>
                  </div>

                  <div className="mb-6">
                    <ModeTabs mode={mode} onChange={changeMode} />
                  </div>

                  <AnimatedHeight>
                    <div
                      key={mode}
                      role="tabpanel"
                      id={panelId(mode)}
                      aria-labelledby={tabId(mode)}
                    >
                      {mode === 'login' ? (
                        <LoginForm
                          email={email}
                          password={password}
                          onEmailChange={setEmail}
                          onPasswordChange={setPassword}
                          onSubmit={() => void handleLogin()}
                          submitting={submitting}
                          error={error}
                          variant={variant}
                          onSwitchToRegister={() => changeMode('register')}
                        />
                      ) : (
                        <RegisterForm
                          values={registerValues}
                          onValuesChange={setRegisterValues}
                          email={email}
                          password={password}
                          onEmailChange={setEmail}
                          onPasswordChange={setPassword}
                          onSubmit={() => void handleRegister()}
                          submitting={submitting}
                          error={error}
                          variant={variant}
                          codeFromLink={hasCodeFromUrl}
                          onSwitchToLogin={() => changeMode('login')}
                        />
                      )}
                    </div>
                  </AnimatedHeight>
                </>
              ) : (
                <>
                  <h1 id="auth-title" className="sr-only">
                    Cuenta creada
                  </h1>
                  <RegisterSuccess outcome={outcome} onGoToLogin={goToLoginFromSuccess} />
                </>
              )}
            </main>
          </Reveal>

          {/* Cuentas demo en móvil / tablet */}
          <div className="lg:hidden">
            <DemoAccountCards onPick={fillDemo} selectedEmail={email} delay={400} />
          </div>

          <Reveal delay={DEMO_ACCOUNTS.length * 100 + 300}>
            <p className="text-center">
              <Link
                href="/"
                className="rounded text-sm text-pool-200 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300"
              >
                ← Volver al sitio público
              </Link>
            </p>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
