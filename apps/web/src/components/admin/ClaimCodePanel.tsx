'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ClaimCodeRow {
  id: string;
  codeHint: string;
  status: 'activo' | 'usado' | 'vencido' | 'revocado';
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  creator: { firstName: string; lastName: string };
  redeemer: { firstName: string; lastName: string; email: string } | null;
}

interface CreatedCode {
  id: string;
  code: string;
  expiresAt: string;
}

const STATUS_STYLE: Record<ClaimCodeRow['status'], string> = {
  activo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  usado: 'bg-blue-50 text-blue-700 border-blue-200',
  vencido: 'bg-gray-100 text-gray-500 border-gray-200',
  revocado: 'bg-red-50 text-red-600 border-red-200',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Código de perfil de un nadador (panel Admin): se genera uno de un solo uso y con vencimiento;
 * quien lo canjea al crear su cuenta queda vinculado a este nadador. El código en claro se
 * muestra UNA vez (en la base solo queda el hash).
 */
export function ClaimCodePanel({ swimmerId, swimmerName }: { swimmerId: string; swimmerName: string }) {
  const [rows, setRows] = useState<ClaimCodeRow[] | null>(null);
  const [created, setCreated] = useState<CreatedCode | null>(null);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await apiFetch<ClaimCodeRow[]>(`/admin/swimmers/${swimmerId}/claim-codes`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [swimmerId]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<CreatedCode>(`/admin/swimmers/${swimmerId}/claim-codes`, {
        method: 'POST',
        body: JSON.stringify({ expiresInDays: days }),
      });
      setCreated(res);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('¿Revocar este código? Ya no se va a poder usar.')) return;
    try {
      await apiFetch(`/admin/claim-codes/${id}`, { method: 'DELETE' });
      setCreated((c) => (c?.id === id ? null : c));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copy = async (text: string, what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError('No se pudo copiar: seleccioná el texto y copialo a mano.');
    }
  };

  const link = created && typeof window !== 'undefined' ? `${window.location.origin}/login?codigo=${created.code}` : '';
  const hasActive = rows?.some((r) => r.status === 'activo') ?? false;
  const hasAccount = rows?.some((r) => r.status === 'usado') ?? false;

  return (
    <div className="card overflow-hidden">
      <div className="px-7 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Código de perfil</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Para que {swimmerName} cree su cuenta y quede vinculado a este perfil. Un solo uso, con vencimiento.
          </p>
        </div>
        {!hasAccount && (
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input !w-auto !py-1.5 text-sm"
              aria-label="Duración del código"
            >
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
            </select>
            <button type="button" onClick={() => void generate()} disabled={busy} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
              {busy ? 'Generando…' : hasActive ? 'Generar uno nuevo' : 'Generar código'}
            </button>
          </div>
        )}
      </div>

      <div className="px-7 py-5 space-y-4">
        {error && <div role="alert" className="text-sm bg-red-50 border border-red-100 text-red-700 rounded-lg px-4 py-2.5">{error}</div>}

        {created && (
          <div className="rounded-xl border-2 border-aqua-300 bg-aqua-50/60 p-5" role="status">
            <p className="text-xs font-semibold uppercase tracking-wider text-aqua-700">Código generado — se muestra una sola vez</p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-pool-900 select-all">{created.code}</p>
            <p className="mt-1 text-xs text-gray-500">Vence el {fmtDate(created.expiresAt)}. Al generar uno nuevo, este deja de servir.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void copy(created.code, 'code')} className="btn-secondary text-sm">
                {copied === 'code' ? '¡Copiado!' : 'Copiar código'}
              </button>
              <button type="button" onClick={() => void copy(link, 'link')} className="btn-secondary text-sm">
                {copied === 'link' ? '¡Copiado!' : 'Copiar enlace de registro'}
              </button>
            </div>
          </div>
        )}

        {rows === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no se generó ningún código para este nadador.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-gray-700">FTN-····-{r.codeHint}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-xs text-gray-400">
                  {r.status === 'usado' && r.redeemer
                    ? `Lo usó ${r.redeemer.firstName} ${r.redeemer.lastName} (${r.redeemer.email}) el ${fmtDate(r.usedAt as string)}`
                    : `Creado el ${fmtDate(r.createdAt)} por ${r.creator.firstName} ${r.creator.lastName} · vence el ${fmtDate(r.expiresAt)}`}
                </span>
                {r.status === 'activo' && (
                  <button type="button" onClick={() => void revoke(r.id)} className="ml-auto text-xs text-red-600 hover:underline">
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
