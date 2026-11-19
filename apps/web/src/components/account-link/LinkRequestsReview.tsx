'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Status = 'pending' | 'approved' | 'rejected';

interface LinkRequest {
  id: string;
  status: Status | 'cancelled';
  matchConfidence: number;
  requestedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
  reason: string | null;
  user: { firstName: string; lastName: string; email: string };
  swimmer: { firstName: string; lastName: string; documentId: string | null; currentClub: { name: string } | null; _count: { results: number } };
  reviewer: { firstName: string; lastName: string } | null;
}

const TABS: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
];

const THEMES = {
  light: {
    card: 'bg-white border border-gray-200 rounded-xl shadow-sm',
    title: 'text-gray-900', sub: 'text-gray-500', muted: 'text-gray-400',
    tab: 'bg-gray-100 text-gray-600 hover:bg-gray-200', tabOn: 'bg-blue-600 text-white',
    input: 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-500',
    note: 'bg-gray-50 text-gray-600',
  },
  dark: {
    card: 'bg-pool-900/70 border border-pool-700/60 rounded-xl',
    title: 'text-white', sub: 'text-pool-300', muted: 'text-pool-500',
    tab: 'bg-pool-800 text-pool-300 hover:bg-pool-700', tabOn: 'bg-aqua-500 text-pool-950',
    input: 'border border-pool-700 rounded-lg px-3 py-2 text-sm text-white bg-pool-950 placeholder-pool-600 focus:outline-none focus:border-aqua-400',
    note: 'bg-pool-950/60 text-pool-300',
  },
} as const;

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Revisión de solicitudes de vinculación cuenta ↔ nadador. Lo usan el Admin (ve todas) y el
 * Entrenador (el servidor solo le devuelve y le deja revisar las de nadadores de SU club).
 */
export function LinkRequestsReview({ variant }: { variant: 'light' | 'dark' }) {
  const t = THEMES[variant];
  const [status, setStatus] = useState<Status>('pending');
  const [items, setItems] = useState<LinkRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (s: Status) => {
    setItems(null);
    setError(null);
    try {
      setItems(await apiFetch<LinkRequest[]>(`/account-link/requests?status=${s}`));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, []);

  useEffect(() => { void load(status); }, [load, status]);

  const approve = async (r: LinkRequest) => {
    if (!confirm(`¿Aprobar? ${r.user.firstName} ${r.user.lastName} (${r.user.email}) va a quedar vinculado/a al perfil de ${r.swimmer.firstName} ${r.swimmer.lastName}.`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await apiFetch(`/account-link/requests/${r.id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      setNotice('Solicitud aprobada: la cuenta ya está vinculada.');
      await load(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r: LinkRequest) => {
    if (!reason.trim()) { setError('Escribí el motivo del rechazo: la persona lo va a ver.'); return; }
    setBusyId(r.id);
    setError(null);
    try {
      await apiFetch(`/account-link/requests/${r.id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) });
      setNotice('Solicitud rechazada.');
      setRejecting(null);
      setReason('');
      await load(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado de las solicitudes">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => { setStatus(tab.value); setNotice(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${status === tab.value ? t.tabOn : t.tab}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && <div role="status" className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 text-emerald-600 px-4 py-2.5 text-sm">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-red-300/40 bg-red-500/10 text-red-500 px-4 py-2.5 text-sm">{error}</div>}

      {items === null && <p className={`text-sm ${t.muted}`}>Cargando…</p>}
      {items?.length === 0 && !error && (
        <p className={`text-sm ${t.muted} py-8 text-center`}>
          {status === 'pending' ? 'No hay solicitudes pendientes. 🎉' : 'No hay solicitudes en este estado.'}
        </p>
      )}

      <ul className="space-y-3">
        {items?.map((r) => (
          <li key={r.id} className={`${t.card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`text-xs uppercase tracking-wider ${t.muted}`}>Quiere vincularse al perfil de</p>
                <p className={`text-lg font-bold ${t.title}`}>{r.swimmer.firstName} {r.swimmer.lastName}</p>
                <p className={`text-sm ${t.sub}`}>
                  {r.swimmer.currentClub?.name ?? 'Sin club'} · {r.swimmer._count.results} resultados
                  {r.swimmer.documentId ? ' · con DNI cargado' : ''}
                </p>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  r.matchConfidence >= 85 ? 'text-emerald-600 border-emerald-300/50 bg-emerald-500/10'
                  : r.matchConfidence >= 40 ? 'text-amber-600 border-amber-300/50 bg-amber-500/10'
                  : 'text-red-500 border-red-300/50 bg-red-500/10'
                }`}
                title="Qué tanto coincide el nombre de la cuenta con el del nadador. Es solo una ayuda: decide una persona."
              >
                Coincidencia de nombre {r.matchConfidence}%
              </span>
            </div>

            <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${t.note}`}>
              <p>
                <strong>Cuenta:</strong> {r.user.firstName} {r.user.lastName} · {r.user.email}
              </p>
              {r.reason && <p className="mt-1"><strong>Nota:</strong> {r.reason}</p>}
              <p className={`mt-1 text-xs ${t.muted}`}>Pedida el {fmt(r.requestedAt)}</p>
            </div>

            {r.status === 'pending' ? (
              <div className="mt-4">
                {rejecting === r.id ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Motivo del rechazo (lo ve la persona)"
                      maxLength={300}
                      className={`flex-1 ${t.input}`}
                      aria-label="Motivo del rechazo"
                    />
                    <button onClick={() => void reject(r)} disabled={busyId === r.id} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                      Confirmar rechazo
                    </button>
                    <button onClick={() => { setRejecting(null); setReason(''); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${t.tab}`}>Cancelar</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => void approve(r)} disabled={busyId === r.id} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      {busyId === r.id ? 'Aprobando…' : '✓ Aprobar'}
                    </button>
                    <button onClick={() => { setRejecting(r.id); setError(null); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 border border-red-300/40 hover:bg-red-500/20">
                      ✗ Rechazar
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className={`mt-3 text-xs ${t.muted}`}>
                {r.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                {r.reviewer ? ` por ${r.reviewer.firstName} ${r.reviewer.lastName}` : ''}
                {r.reviewedAt ? ` el ${fmt(r.reviewedAt)}` : ''}
                {r.decisionReason ? ` — ${r.decisionReason}` : ''}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
