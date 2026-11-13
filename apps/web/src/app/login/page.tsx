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
      {/* ── AQUATIC BACKGROUND ──────────────────────────────────────────── */}
      <AquaticBackground />
      <Bubbles />

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] px-14 py-12 relative z-10">
        {/* Logo placeholder — logo shown above form on right panel */}
        <div />

        {/* Hero text */}
        <div className="flex flex-col items-start gap-6">
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
          {/* Logo above form — visible on all screen sizes */}
          <div className="flex justify-center mb-10">
            <div className="bg-white rounded-2xl px-5 py-3">
              <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-20 w-auto" />
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

// ─── Aquatic background — carrera de natación animada ─────────────────────────

function AquaticBackground() {
  const LANES = 6;
  const SURFACE = 11;   // % from top where water starts
  const POOL_BOT = 96;
  const laneH = (POOL_BOT - SURFACE) / LANES;
  const centers = Array.from({ length: LANES }, (_, i) => SURFACE + (i + 0.5) * laneH);
  const ropes   = Array.from({ length: LANES - 1 }, (_, i) => SURFACE + (i + 1) * laneH);

  // [laneIndex, animClass, opacity]
  const swimmers: [number, string, number][] = [
    [0, 'aq-s1', 0.28],
    [1, 'aq-s2', 0.22],
    [3, 'aq-s3', 0.30],
    [4, 'aq-s4', 0.24],
    [5, 'aq-s5', 0.26],
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes aqWA { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes aqWB { from{transform:translateX(-50%)} to{transform:translateX(0)} }
        @keyframes aqSwim { from{transform:translateX(108vw)} to{transform:translateX(-340px)} }
        .aq-wa{animation:aqWA 9s linear infinite}
        .aq-wb{animation:aqWB 14s linear infinite}
        .aq-s1{animation:aqSwim 17s linear infinite}
        .aq-s2{animation:aqSwim 24s linear infinite;animation-delay:-9s}
        .aq-s3{animation:aqSwim 13s linear infinite;animation-delay:-4s}
        .aq-s4{animation:aqSwim 21s linear infinite;animation-delay:-13s}
        .aq-s5{animation:aqSwim 19s linear infinite;animation-delay:-17s}
      ` }} />

      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        {/* Deep pool gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg,#020b14 0%,#082032 15%,#0b3254 40%,#093050 70%,#040f1e 100%)'
        }} />

        {/* Caustic light shafts */}
        <div className="absolute inset-0" style={{ opacity: 0.09 }}>
          {([
            { left:'16%', skew:'skewX(-7deg)', color:'#90e0ef', blur:'blur(22px)', w:40 },
            { left:'42%', skew:'skewX(11deg)',  color:'#48cae4', blur:'blur(15px)', w:28 },
            { left:'68%', skew:'skewX(-4deg)',  color:'#0096c7', blur:'blur(30px)', w:36 },
            { left:'85%', skew:'skewX(6deg)',   color:'#48cae4', blur:'blur(18px)', w:22 },
          ] as const).map((b, i) => (
            <div key={i} className="absolute top-0 h-full" style={{
              left: b.left, width: b.w,
              background: `linear-gradient(180deg,${b.color},transparent)`,
              transform: b.skew, filter: b.blur,
            }} />
          ))}
        </div>

        {/* Lane ropes */}
        {ropes.map((yPct, ri) => (
          <div key={ri} className="absolute left-0 right-0" style={{ top: `${yPct}%` }}>
            <div className="absolute inset-x-0 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <div className="absolute inset-x-0 flex justify-around" style={{ transform: 'translateY(-50%)' }}>
              {Array.from({ length: 24 }, (_, j) => (
                <div key={j} className="rounded-full shrink-0" style={{
                  width: 8, height: 8,
                  background: j % 2 === 0 ? 'rgba(251,191,36,0.5)' : 'rgba(239,68,68,0.5)',
                }} />
              ))}
            </div>
          </div>
        ))}

        {/* Pool end walls */}
        <div className="absolute top-[11%] bottom-[4%] left-0 w-2" style={{ background: 'rgba(72,202,228,0.12)' }} />
        <div className="absolute top-[11%] bottom-[4%] right-0 w-2" style={{ background: 'rgba(72,202,228,0.12)' }} />

        {/* Swimmers */}
        {swimmers.map(([laneIdx, cls, opacity]) => (
          <div key={laneIdx} className="absolute" style={{ top: `${centers[laneIdx]}%`, transform: 'translateY(-50%)' }}>
            <div className={cls}>
              <SwimmerSVG opacity={opacity} />
            </div>
          </div>
        ))}

        {/* Water surface — two scrolling wave layers */}
        <div className="absolute top-0 left-0 right-0 overflow-hidden" style={{ height: `${SURFACE}%` }}>
          <div className="absolute inset-0 aq-wa" style={{ width: '200%' }}>
            <svg className="absolute bottom-0 w-full" viewBox="0 0 2800 88" preserveAspectRatio="none" style={{ height: '100%' }}>
              <path d="M0,44 C140,18 280,68 420,44 C560,18 700,68 840,44 C980,18 1120,68 1260,44 C1400,18 1540,68 1680,44 C1820,18 1960,68 2100,44 C2240,18 2380,68 2520,44 C2660,18 2800,68 2940,44 V88 H0 Z"
                fill="#0b3254" />
              <path d="M0,44 C140,18 280,68 420,44 C560,18 700,68 840,44 C980,18 1120,68 1260,44 C1400,18 1540,68 1680,44 C1820,18 1960,68 2100,44 C2240,18 2380,68 2520,44 C2660,18 2800,68 2940,44"
                stroke="rgba(144,224,239,0.45)" strokeWidth="2.5" fill="none" />
            </svg>
          </div>
          <div className="absolute inset-0 aq-wb" style={{ width: '200%', opacity: 0.7 }}>
            <svg className="absolute bottom-0 w-full" viewBox="0 0 2800 88" preserveAspectRatio="none" style={{ height: '100%' }}>
              <path d="M0,56 C175,34 350,74 525,56 C700,34 875,74 1050,56 C1225,34 1400,74 1575,56 C1750,34 1925,74 2100,56 C2275,34 2450,74 2625,56 C2800,34 2975,74 3150,56 V88 H0 Z"
                fill="#082032" />
            </svg>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'rgba(144,224,239,0.18)' }} />
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24" style={{
          background: 'linear-gradient(0deg,#020b14,transparent)'
        }} />
      </div>
    </>
  );
}

function SwimmerSVG({ opacity }: { opacity: number }) {
  const c = '#90e0ef';
  const cap = '#48cae4';
  return (
    <svg
      width="300" height="80"
      viewBox="0 0 300 80"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g opacity={opacity} stroke={c} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Torso — ancho en hombros, estrecho en caderas */}
        <path d="M 72,32 Q 128,38 178,42" strokeWidth="15" />

        {/* Cabeza */}
        <ellipse cx="48" cy="20" rx="16" ry="18" fill={c} stroke="none" />

        {/* Gorra de natación (parte superior de la cabeza) */}
        <path d="M 34,14 Q 48,2 64,12 L 58,21 Q 48,25 38,23 Z" fill={cap} stroke="none" opacity={0.8} />

        {/* Antiparras */}
        <ellipse cx="37" cy="23" rx="5" ry="4" stroke={cap} strokeWidth="1.8" />
        <ellipse cx="48" cy="22" rx="5" ry="4" stroke={cap} strokeWidth="1.8" />
        <path d="M 42,22 h3" stroke={cap} strokeWidth="1.8" />

        {/* Cuello */}
        <path d="M 60,27 Q 65,29 70,32" strokeWidth="9" />

        {/* Brazo delantero — curva continua desde hombro hasta la entrada al agua */}
        <path d="M 72,32 C 45,36 20,44 5,51" strokeWidth="9" />

        {/* Brazo de recuperación — arco continuo por encima del agua */}
        <path d="M 82,28 C 110,-8 140,2 152,14" strokeWidth="9" />

        {/* Pierna A (kick hacia abajo) — muslo + pantorrilla */}
        <path d="M 178,42 Q 210,51 222,55" strokeWidth="12" />
        <path d="M 222,55 Q 248,61 262,53" strokeWidth="10" />

        {/* Pierna B (kick hacia arriba) — muslo + pantorrilla */}
        <path d="M 178,42 Q 210,31 222,27" strokeWidth="11" />
        <path d="M 222,27 Q 246,18 262,12" strokeWidth="9" />

        {/* Splash en la entrada de la mano */}
        <path d="M 5,51 Q 0,47 -4,42 M 5,51 Q -1,55 -5,59" strokeWidth="2" opacity={0.4} />

        {/* Burbujas de estela */}
        <circle cx="268" cy="48" r="3.5" strokeWidth="1.3" opacity={0.5} />
        <circle cx="276" cy="35" r="2.5" strokeWidth="1.1" opacity={0.4} />
        <circle cx="272" cy="60" r="2"   strokeWidth="1"   opacity={0.35} />
      </g>
    </svg>
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
