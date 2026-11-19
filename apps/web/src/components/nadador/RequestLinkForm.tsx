'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface SwimmerHit {
  id: string;
  firstName: string;
  lastName: string;
  currentClub?: { name: string } | null;
}

interface MyRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decisionReason: string | null;
  swimmer: { firstName: string; lastName: string; currentClub?: { name: string } | null };
}

const STATUS_TEXT: Record<MyRequest['status'], string> = {
  pending: 'Esperando aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

/** El nadador busca su nombre y pide vincularse; lo aprueba su entrenador (o la federación). */
export function RequestLinkForm() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SwimmerHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyRequest[]>([]);

  const loadMine = useCallback(async () => {
    try {
      setMine(await apiFetch<MyRequest[]>('/account-link/requests/mine'));
    } catch {
      /* si falla, simplemente no se muestran */
    }
  }, []);

  useEffect(() => { void loadMine(); }, [loadMine]);

  // Búsqueda con pausa para no consultar en cada tecla
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setHits(null); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      apiFetch<{ items: SwimmerHit[] }>(`/swimmers?search=${encodeURIComponent(q)}&limit=8&linkable=true`)
        .then((r) => setHits(r.items))
        .catch((e: Error) => setError(e.message))
        .finally(() => setSearching(false));
    }, 350);
    return () => { clearTimeout(timer); setSearching(false); };
  }, [query]);

  const pending = mine.find((m) => m.status === 'pending');

  const send = async (swimmer: SwimmerHit) => {
    setSendingId(swimmer.id);
    setError(null);
    try {
      await apiFetch('/account-link/requests', { method: 'POST', body: JSON.stringify({ swimmerId: swimmer.id, reason: note.trim() || undefined }) });
      setQuery('');
      setHits(null);
      setNote('');
      await loadMine();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingId(null);
    }
  };

  const cancel = async (id: string) => {
    try {
      await apiFetch(`/account-link/requests/${id}`, { method: 'DELETE' });
      await loadMine();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="w-full rounded-2xl border border-pool-700/60 bg-pool-900/60 p-6 text-left">
      <h3 className="text-white font-bold text-sm mb-1">¿No tenés código? Pedí que te vinculen</h3>
      <p className="text-pool-400 text-sm leading-relaxed mb-4">
        Buscá tu nombre y elegí tu perfil. Tu entrenador (o la federación) revisa el pedido y te avisa acá cuando lo aprueba. Las cuentas con seguimiento son para nadadores de clubes de Tucumán.
      </p>

      {mine.length > 0 && (
        <ul className="mb-4 space-y-2">
          {mine.map((m) => (
            <li key={m.id} className="rounded-xl bg-pool-950/60 border border-pool-800 px-4 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white font-medium">{m.swimmer.firstName} {m.swimmer.lastName}</span>
              <span className="text-pool-500">{m.swimmer.currentClub?.name ?? ''}</span>
              <span className={m.status === 'rejected' ? 'text-red-300' : m.status === 'approved' ? 'text-emerald-300' : 'text-aqua-300'}>
                {STATUS_TEXT[m.status]}
              </span>
              {m.status === 'rejected' && m.decisionReason && <span className="text-pool-400">Motivo: {m.decisionReason}</span>}
              {m.status === 'pending' && (
                <button onClick={() => void cancel(m.id)} className="ml-auto text-xs text-pool-400 hover:text-white underline">Cancelar pedido</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pending ? (
        <p className="text-pool-400 text-sm">Ya tenés un pedido en revisión. Cuando se resuelva podés pedir otro si hace falta.</p>
      ) : (
        <>
          <label htmlFor="link-search" className="sr-only">Buscar tu nombre</label>
          <input
            id="link-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribí tu nombre o apellido…"
            autoComplete="off"
            className="w-full rounded-xl bg-pool-950 border border-pool-700 px-4 py-3 text-white placeholder-pool-600 focus:outline-none focus:border-aqua-400 focus:ring-2 focus:ring-aqua-400/30"
          />
          {searching && <p className="mt-2 text-xs text-pool-500">Buscando…</p>}
          {hits && hits.length === 0 && !searching && <p className="mt-3 text-sm text-pool-400">No encontramos a nadie con ese nombre entre los nadadores de clubes de Tucumán sin cuenta. Probá con solo el apellido; si tu club todavía no tiene provincia cargada, avisale a la federación.</p>}
          {hits && hits.length > 0 && (
            <>
              <label htmlFor="link-note" className="sr-only">Nota para quien revisa</label>
              <input
                id="link-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota opcional (ej: soy el papá/mamá, año de nacimiento…)"
                maxLength={300}
                className="mt-3 w-full rounded-xl bg-pool-950 border border-pool-800 px-4 py-2.5 text-sm text-white placeholder-pool-600 focus:outline-none focus:border-aqua-400"
              />
              <ul className="mt-3 divide-y divide-pool-800 rounded-xl border border-pool-800 overflow-hidden">
                {hits.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 bg-pool-950/50 px-4 py-3">
                    <span className="text-white text-sm">
                      {h.firstName} {h.lastName}
                      <span className="block text-xs text-pool-500">{h.currentClub?.name ?? 'Sin club'}</span>
                    </span>
                    <button
                      onClick={() => void send(h)}
                      disabled={sendingId !== null}
                      className="shrink-0 rounded-lg bg-aqua-500 hover:bg-aqua-400 disabled:opacity-50 text-pool-950 font-bold text-sm px-4 py-2 transition-colors"
                    >
                      {sendingId === h.id ? 'Enviando…' : 'Soy yo'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </section>
  );
}
