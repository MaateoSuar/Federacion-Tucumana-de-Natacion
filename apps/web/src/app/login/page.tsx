'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, roleRedirect } from '@/lib/auth';

// ─── Credenciales demo ────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  {
    role: 'Administrador',
    email: 'admin@ftn.ar',
    password: 'Demo1234!',
    color: 'from-violet-500 to-purple-600',
    glow: 'shadow-purple-500/30',
    bg: 'bg-purple-950/60',
    border: 'border-purple-500/40',
    icon: ShieldIcon,
    description: 'Gestión total de la federación',
  },
  {
    role: 'Entrenador',
    email: 'entrenador@cna.ar',
    password: 'Demo1234!',
    color: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/30',
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-500/40',
    icon: WhistleIcon,
    description: 'Gestión de nadadores del club CAN',
  },
  {
    role: 'Nadador',
    email: 'nadador@ftn.ar',
    password: 'Demo1234!',
    color: 'from-aqua-500 to-blue-600',
    glow: 'shadow-aqua-500/30',
    bg: 'bg-pool-800/60',
    border: 'border-aqua-500/40',
    icon: SwimmerSmallIcon,
    description: 'Perfil atlético personal',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      void router.replace(roleRedirect(user.primaryRole));
    }
  }, [user, isLoading, router]);

  const fillDemo = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      // redirect handled by useEffect above
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-pool-950 overflow-hidden flex">
      {/* ── BUBBLES ─────────────────────────────────────────────────────── */}
      <Bubbles />

      {/* ── LIGHT RAYS ──────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/4 w-96 h-[120vh] opacity-[0.04]"
          style={{
            background: 'linear-gradient(180deg, #00b4d8 0%, transparent 100%)',
            transform: 'rotate(-15deg)',
            filter: 'blur(40px)',
          }}
        />
        <div
          className="absolute -top-40 left-1/3 w-64 h-[100vh] opacity-[0.06]"
          style={{
            background: 'linear-gradient(180deg, #48cae4 0%, transparent 100%)',
            transform: 'rotate(8deg)',
            filter: 'blur(30px)',
          }}
        />
        <div
          className="absolute -top-20 right-1/4 w-80 h-[90vh] opacity-[0.03]"
          style={{
            background: 'linear-gradient(180deg, #0096c7 0%, transparent 100%)',
            transform: 'rotate(-5deg)',
            filter: 'blur(50px)',
          }}
        />
      </div>

      {/* ── LANE LINES ──────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent calc(12.5% - 1px), rgba(0,180,216,1) calc(12.5% - 1px), rgba(0,180,216,1) 12.5%)',
        }}
      />

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] px-14 py-12 relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <WaveIcon className="w-10 h-10 text-aqua-400" />
          <div>
            <div className="text-white font-black text-xl tracking-tight">FTN</div>
            <div className="text-aqua-400 text-xs font-light tracking-widest uppercase">
              Federación Tucumana de Natación
            </div>
          </div>
        </div>

        {/* Hero text + swimmer */}
        <div className="flex flex-col items-start gap-10">
          <div>
            <div className="inline-flex items-center gap-2 bg-aqua-500/10 border border-aqua-400/20 text-aqua-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-aqua-400 animate-pulse" />
              Plataforma oficial · Tucumán, Argentina
            </div>
            <h1 className="text-6xl font-black text-white leading-none mb-4">
              Natación<br />
              <span className="bg-gradient-to-r from-aqua-400 to-pool-300 bg-clip-text text-transparent">
                de élite.
              </span>
            </h1>
            <p className="text-pool-300 text-lg leading-relaxed max-w-md">
              Resultados, rankings y récords de la natación federada de Tucumán en tiempo real.
            </p>
          </div>

          {/* Swimmer SVG */}
          <div className="relative w-full flex justify-center">
            <SwimmerSilhouette />
          </div>
        </div>

        {/* Demo accounts */}
        <div>
          <p className="text-pool-400 text-xs font-semibold uppercase tracking-widest mb-4">
            Cuentas demo — hacé clic para completar el formulario
          </p>
          <div className="flex flex-col gap-3">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              return (
                <button
                  key={acc.email}
                  onClick={() => fillDemo(acc)}
                  className={`group flex items-center gap-4 ${acc.bg} border ${acc.border} rounded-2xl px-5 py-3.5 text-left hover:scale-[1.01] transition-all duration-200 hover:shadow-lg ${acc.glow}`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${acc.color} flex items-center justify-center shrink-0 shadow-md`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-white text-sm font-bold">{acc.role}</div>
                    <div className="text-pool-400 text-xs truncate">{acc.email}</div>
                  </div>
                  <div className="ml-auto text-pool-500 text-xs hidden group-hover:block">
                    → usar
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-pool-600 text-xs mt-3">Contraseña para todos: <code className="text-pool-400">Demo1234!</code></p>
        </div>
      </div>

      {/* ── RIGHT PANEL (FORM) ───────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10 justify-center">
            <WaveIcon className="w-9 h-9 text-aqua-400" />
            <div>
              <div className="text-white font-black text-lg">FTN</div>
              <div className="text-aqua-400 text-xs font-light tracking-wide">Federación Tucumana de Natación</div>
            </div>
          </div>

          {/* Card */}
          <div
            className="rounded-3xl border border-pool-700/60 p-8 md:p-10"
            style={{
              background: 'rgba(10, 37, 64, 0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-black text-white mb-1">Iniciá sesión</h2>
              <p className="text-pool-400 text-sm">Accedé a tu cuenta de la FTN</p>
            </div>

            {/* Form */}
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-pool-300 text-xs font-semibold uppercase tracking-wider mb-2">
                  Email
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pool-500">
                    <MailIcon className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="tu@email.com"
                    className="w-full bg-pool-900/80 border border-pool-700/60 rounded-xl pl-10 pr-4 py-3.5 text-white placeholder-pool-600 text-sm focus:outline-none focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-pool-300 text-xs font-semibold uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pool-500">
                    <LockIcon className="w-4 h-4" />
                  </span>
                  <input
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-pool-900/80 border border-pool-700/60 rounded-xl pl-10 pr-12 py-3.5 text-white placeholder-pool-600 text-sm focus:outline-none focus:border-aqua-500 focus:ring-1 focus:ring-aqua-500/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-pool-500 hover:text-pool-300 transition-colors"
                  >
                    {showPass ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-950/60 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  <span className="text-red-400">⚠</span>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="group relative w-full overflow-hidden bg-gradient-to-r from-aqua-500 to-pool-400 rounded-xl py-3.5 font-bold text-white text-sm shadow-lg shadow-aqua-500/25 hover:shadow-aqua-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Ingresando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Iniciar sesión
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </button>
            </form>

            {/* Mobile demo section */}
            <div className="lg:hidden mt-8 pt-6 border-t border-pool-700/40">
              <p className="text-pool-500 text-xs text-center mb-3 uppercase tracking-wider">Cuentas demo</p>
              <div className="flex flex-col gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const Icon = acc.icon;
                  return (
                    <button
                      key={acc.email}
                      onClick={() => fillDemo(acc)}
                      className={`flex items-center gap-3 ${acc.bg} border ${acc.border} rounded-xl px-4 py-3 text-left hover:opacity-90 transition-opacity`}
                    >
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${acc.color} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-xs font-bold">{acc.role}</div>
                        <div className="text-pool-500 text-xs">{acc.email}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Back to public site */}
          <div className="text-center mt-6">
            <a href="/" className="text-pool-500 text-sm hover:text-pool-300 transition-colors">
              ← Volver al sitio público
            </a>
          </div>
        </div>
      </div>

      {/* ── WAVE BOTTOM ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 overflow-hidden">
        <svg viewBox="0 0 1440 128" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full opacity-30" preserveAspectRatio="none">
          <path fill="#0096c7" d="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,48C672,43,768,53,864,64C960,75,1056,85,1152,80C1248,75,1344,53,1392,42.7L1440,32L1440,128L0,128Z" />
        </svg>
        <svg viewBox="0 0 1440 128" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full opacity-15" preserveAspectRatio="none">
          <path fill="#00b4d8" d="M0,96L60,90.7C120,85,240,75,360,80C480,85,600,107,720,106.7C840,107,960,85,1080,74.7C1200,64,1320,64,1380,64L1440,64L1440,128L0,128Z" />
        </svg>
      </div>

    </div>
  );
}

// ─── Swimmer SVG ──────────────────────────────────────────────────────────────

function SwimmerSilhouette() {
  return (
    <div className="relative w-full h-48 flex items-center justify-center">
      {/* Water surface */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-aqua-400/30 to-transparent" />
      {/* Glow behind swimmer */}
      <div
        className="absolute w-72 h-32 rounded-full opacity-10"
        style={{ background: 'radial-gradient(ellipse, #00b4d8 0%, transparent 70%)' }}
      />
      <svg
        viewBox="0 0 480 100"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-md"
        style={{ filter: 'drop-shadow(0 0 20px rgba(0,180,216,0.3))' }}
      >
        {/* Water ripples */}
        <ellipse cx="240" cy="55" rx="200" ry="4" fill="none" stroke="rgba(0,180,216,0.2)" strokeWidth="1.5" />
        <ellipse cx="240" cy="60" rx="160" ry="3" fill="none" stroke="rgba(0,180,216,0.12)" strokeWidth="1" />

        {/* Swim cap */}
        <ellipse cx="80" cy="44" rx="17" ry="15" fill="#48cae4" opacity="0.9" transform="rotate(-10 80 44)" />
        {/* Goggle strap */}
        <path d="M68 38 Q80 34 92 38" stroke="#0077b6" strokeWidth="2.5" fill="none" />
        {/* Goggle lens */}
        <ellipse cx="75" cy="46" rx="5" ry="4" fill="none" stroke="#0096c7" strokeWidth="1.5" />
        <ellipse cx="86" cy="46" rx="5" ry="4" fill="none" stroke="#0096c7" strokeWidth="1.5" />
        <path d="M80 46 h2" stroke="#0096c7" strokeWidth="1" />
        {/* Face */}
        <path d="M63 50 Q70 56 78 54" stroke="#90e0ef" strokeWidth="1.5" fill="none" opacity="0.6" />

        {/* Body / torso */}
        <path
          d="M94 50 Q160 42 260 48 Q320 51 380 56"
          stroke="#0096c7"
          strokeWidth="22"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        {/* Body highlight */}
        <path
          d="M94 46 Q160 38 260 44 Q320 47 380 52"
          stroke="#48cae4"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          opacity="0.3"
        />

        {/* Lead arm (extended forward, underwater) */}
        <path d="M76 48 Q45 46 16 42" stroke="#0096c7" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d="M76 46 Q45 44 16 40" stroke="#48cae4" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.35" />
        {/* Hand (lead) */}
        <ellipse cx="13" cy="41" rx="6" ry="4" fill="#48cae4" opacity="0.8" transform="rotate(-10 13 41)" />

        {/* Recovery arm (above water) */}
        <path d="M200 42 Q230 18 260 20 Q285 22 305 32" stroke="#0096c7" strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.7" />
        <path d="M200 40 Q230 16 260 18 Q285 20 305 30" stroke="#48cae4" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.25" />
        {/* Hand (recovery) */}
        <ellipse cx="308" cy="33" rx="6" ry="4" fill="#48cae4" opacity="0.65" transform="rotate(15 308 33)" />

        {/* Legs */}
        <path d="M370 58 Q400 70 430 62" stroke="#0077b6" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M375 52 Q405 64 435 56" stroke="#0077b6" strokeWidth="10" fill="none" strokeLinecap="round" />
        {/* Feet / kick */}
        <ellipse cx="432" cy="61" rx="10" ry="5" fill="#0096c7" opacity="0.7" transform="rotate(-5 432 61)" />
        <ellipse cx="437" cy="55" rx="8" ry="4" fill="#0096c7" opacity="0.55" transform="rotate(10 437 55)" />

        {/* Water splash (entry point of lead arm) */}
        <path d="M16 42 Q10 38 4 35 M16 42 Q8 46 2 48 M16 42 Q14 35 18 30" stroke="#48cae4" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round" />

        {/* Bubbles from kick */}
        <circle cx="450" cy="65" r="3" fill="none" stroke="#48cae4" strokeWidth="1" opacity="0.5" />
        <circle cx="460" cy="58" r="2" fill="none" stroke="#48cae4" strokeWidth="1" opacity="0.35" />
        <circle cx="456" cy="70" r="1.5" fill="none" stroke="#48cae4" strokeWidth="1" opacity="0.3" />
      </svg>

      {/* Labels */}
      <div className="absolute bottom-1 right-4 text-aqua-400/40 text-xs font-mono tracking-widest uppercase">
        freestyle
      </div>
    </div>
  );
}

// ─── Bubbles animation ────────────────────────────────────────────────────────

function Bubbles() {
  const bubbles = [
    { size: 6, left: '8%', delay: '0s', dur: '8s' },
    { size: 10, left: '15%', delay: '2s', dur: '11s' },
    { size: 4, left: '25%', delay: '4s', dur: '9s' },
    { size: 8, left: '40%', delay: '1s', dur: '13s' },
    { size: 5, left: '55%', delay: '6s', dur: '10s' },
    { size: 12, left: '65%', delay: '3s', dur: '14s' },
    { size: 7, left: '75%', delay: '0.5s', dur: '9s' },
    { size: 3, left: '85%', delay: '5s', dur: '12s' },
    { size: 9, left: '92%', delay: '2.5s', dur: '11s' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bubbles.map((b, i) => (
        <div
          key={i}
          className="bubble"
          style={{
            width: b.size,
            height: b.size,
            left: b.left,
            bottom: '-20px',
            animationDuration: b.dur,
            animationDelay: b.delay,
            border: `1px solid rgba(0,180,216,${0.15 + (b.size / 12) * 0.2})`,
            background: `radial-gradient(circle at 30% 30%, rgba(0,180,216,0.08), transparent)`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function WaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="currentColor" fillOpacity="0.15" />
      <path d="M8 22c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M8 17c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function WhistleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SwimmerSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}
