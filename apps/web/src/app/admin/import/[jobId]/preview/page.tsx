'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ftn_access_token');
}

interface Issue {
  severity: 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';
  stage: string;
  message: string;
  sourceRow?: number;
  suggestion?: string;
}

interface Preview {
  jobId: string;
  status: string;
  summary: {
    totalRows: number;
    okRows: number;
    errorRows: number;
    warningCount: number;
    newSwimmers: number;
    matchedSwimmers: number;
    newClubs: number;
    recordCandidates: number;
  };
  issues: Issue[];
  meetInfo: {
    name: string;
    venue: string;
    course: number;
    startDate: string;
    endDate: string;
    source: string;
  } | null;
}

const POLLING_STATES = new Set(['uploaded', 'parsing', 'validating', 'matching']);

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    uploaded: 'bg-gray-100 text-gray-600',
    parsing: 'bg-blue-100 text-blue-700',
    validating: 'bg-blue-100 text-blue-700',
    matching: 'bg-blue-100 text-blue-700',
    preview: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    rolled_back: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    uploaded: 'Subido',
    parsing: 'Parseando...',
    validating: 'Validando...',
    matching: 'Analizando atletas...',
    preview: 'Listo para revisar',
    confirmed: 'Confirmado',
    failed: 'Falló',
    rolled_back: 'Revertido',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function SeverityBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    FATAL: 'bg-red-100 text-red-700',
    ERROR: 'bg-orange-100 text-orange-700',
    WARNING: 'bg-yellow-100 text-yellow-700',
    INFO: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[sev] ?? ''}`}>{sev}</span>
  );
}

export default function PreviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ status: string; preview: Preview | null }>({
    status: 'loading',
    preview: null,
  });
  const [jobStatus, setJobStatus] = useState<string>('uploaded');
  const [actionState, setActionState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`${API}/import/${jobId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const job = (await res.json()) as { status: string };
    setJobStatus(job.status);
    return job.status;
  }, [jobId]);

  const fetchPreview = useCallback(async () => {
    const res = await fetch(`${API}/import/${jobId}/preview`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setData({ status: 'error', preview: null });
      return;
    }
    const preview = (await res.json()) as Preview;
    setData({ status: 'ready', preview });
    setJobStatus(preview.status);
  }, [jobId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const status = await fetchStatus();
      if (!status) return;
      if (POLLING_STATES.has(status)) {
        timer = setTimeout(poll, 1500);
      } else {
        await fetchPreview();
      }
    };

    poll();
    return () => clearTimeout(timer);
  }, [fetchStatus, fetchPreview]);

  const handleAction = async (action: 'commit' | 'rollback') => {
    setActionState('loading');
    setActionError(null);
    try {
      const res = await fetch(`${API}/import/${jobId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      setActionState('done');
      if (action === 'commit') {
        const { tournamentId } = (await res.json()) as { tournamentId: string };
        router.push(`/admin/torneos/${tournamentId}`);
      } else {
        await fetchPreview();
      }
    } catch (e) {
      setActionState('error');
      setActionError(e instanceof Error ? e.message : 'Error inesperado.');
    }
  };

  const isPolling = POLLING_STATES.has(jobStatus);
  const { preview } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {preview?.meetInfo?.name ?? 'Preview de importación'}
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">Job: {jobId}</p>
        </div>
        <StatusBadge status={jobStatus} />
      </div>

      {/* Polling indicator */}
      {isPolling && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl text-blue-700">
          <svg className="animate-spin w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>
            <p className="font-medium">Procesando el archivo…</p>
            <p className="text-xs text-blue-500 mt-0.5">Esto puede tardar unos segundos. La página se actualiza automáticamente.</p>
          </div>
        </div>
      )}

      {/* Failed */}
      {jobStatus === 'failed' && preview && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700">
          <p className="font-semibold">El procesamiento falló</p>
          {preview.issues.map((i, idx) => (
            <p key={idx} className="text-sm mt-1">{i.message}</p>
          ))}
        </div>
      )}

      {/* Meet info */}
      {preview?.meetInfo && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Información del torneo</h2>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs text-gray-400">Nombre</dt>
              <dd className="font-medium text-gray-800 text-sm mt-0.5">{preview.meetInfo.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Sede</dt>
              <dd className="font-medium text-gray-800 text-sm mt-0.5">{preview.meetInfo.venue}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Piscina</dt>
              <dd className="font-medium text-gray-800 text-sm mt-0.5">{preview.meetInfo.course} m</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Fechas</dt>
              <dd className="font-medium text-gray-800 text-sm mt-0.5">
                {preview.meetInfo.startDate} – {preview.meetInfo.endDate}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Summary cards */}
      {preview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Resultados OK', value: preview.summary.okRows, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Con errores', value: preview.summary.errorRows, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Atletas nuevos', value: preview.summary.newSwimmers, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Clubes nuevos', value: preview.summary.newClubs, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((card) => (
            <div key={card.label} className={`rounded-2xl p-5 ${card.bg}`}>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {preview && preview.issues.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-800">Advertencias y errores</h2>
          </div>
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {preview.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-3 px-6 py-3">
                <SeverityBadge sev={issue.severity} />
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-xs text-gray-400 mt-0.5">{issue.suggestion}</p>
                  )}
                  {issue.sourceRow != null && (
                    <p className="text-xs text-gray-300 mt-0.5">Fila {issue.sourceRow}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {preview && jobStatus === 'preview' && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => handleAction('commit')}
            disabled={actionState === 'loading'}
            className="flex-1 bg-aqua-600 hover:bg-aqua-500 disabled:bg-aqua-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {actionState === 'loading' ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Confirmando…
              </>
            ) : (
              'Confirmar e importar'
            )}
          </button>
          <button
            onClick={() => router.push('/admin/import')}
            disabled={actionState === 'loading'}
            className="px-6 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Rollback for confirmed */}
      {preview && jobStatus === 'confirmed' && (
        <div className="flex items-center justify-between p-4 bg-green-50 border border-green-100 rounded-xl">
          <div>
            <p className="font-semibold text-green-800">Import confirmado</p>
            <p className="text-sm text-green-600">Los resultados están en la base FTN.</p>
          </div>
          <button
            onClick={() => handleAction('rollback')}
            disabled={actionState === 'loading'}
            className="text-sm text-red-600 hover:text-red-700 font-medium underline underline-offset-2"
          >
            Revertir import
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          {actionError}
        </div>
      )}
    </div>
  );
}
