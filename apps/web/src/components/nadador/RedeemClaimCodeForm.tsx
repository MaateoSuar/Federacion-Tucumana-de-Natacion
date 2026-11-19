'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

/** Un nadador logueado y sin vincular canjea el código que le dio su club o la federación. */
export function RedeemClaimCodeForm() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/account-link/claim-code', { method: 'POST', body: JSON.stringify({ code }) });
      setDone(true);
      // Recarga para que la sesión traiga el nadador vinculado y la página lleve al perfil
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-5 text-emerald-200 text-sm">
        ¡Listo! Tu cuenta quedó vinculada a tu perfil. Te llevamos a verlo…
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="w-full rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6 text-left">
      <h3 className="text-white font-bold text-sm mb-1">¿Tenés un código de perfil?</h3>
      <p className="text-pool-400 text-sm leading-relaxed mb-4">
        Tu club o la federación te lo da. Al ingresarlo, tu cuenta queda vinculada al instante a tu historial.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <label htmlFor="claim-code" className="sr-only">Código de perfil</label>
        <input
          id="claim-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="FTN-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          className="flex-1 rounded-xl bg-pool-950 border border-pool-700 px-4 py-3 font-mono tracking-widest text-white placeholder-pool-600 focus:outline-none focus:border-aqua-400 focus:ring-2 focus:ring-aqua-400/30"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-xl bg-aqua-500 hover:bg-aqua-400 disabled:opacity-50 text-pool-950 font-bold px-6 py-3 transition-colors"
        >
          {busy ? 'Vinculando…' : 'Vincular mi perfil'}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </form>
  );
}
