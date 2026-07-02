'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

/* ─── Tipos ─── */

interface EventDefinition {
  id: string; code: string; stroke: string; distance: number; gender: string; isRelay: boolean;
}
interface Category { id: string; code: string; name: string; orderNo: number; }
interface LaneAssignment {
  id: string; lane: number;
  registration: { swimmer: { firstName: string; lastName: string }; club: { shortName: string }; entryTime: number | null } | null;
}
interface Heat { id: string; heatNumber: number; scheduledAt: string | null; laneAssignments: LaneAssignment[]; }
interface TournamentEvent {
  id: string; orderNo: number; round: string; status: string; dayNumber: number;
  eventDefinition: EventDefinition; category: Category;
  heats: Heat[];
  _count: { registrations: number; results: number };
}
interface TournamentDocument {
  id: string; type: string; title: string; fileUrl: string; mimeType: string; createdAt: string;
}
interface Tournament {
  id: string; name: string; venue: string | null; poolLength: string; startDate: string; endDate: string;
  type: string; scope: string; status: string;
  season: { year: number };
  hostClub: { name: string; shortName: string } | null;
  events: TournamentEvent[];
  documents: TournamentDocument[];
}

/* ─── Constantes ─── */

const STATUS_MAP: Record<string, { label: string; cls: string; next: string | null; nextLabel: string | null }> = {
  programado:             { label: 'Programado',             cls: 'badge-gray',   next: 'inscripciones_abiertas', nextLabel: 'Abrir inscripciones' },
  inscripciones_abiertas: { label: 'Inscripciones abiertas', cls: 'badge-green',  next: 'cerrado',                nextLabel: 'Cerrar inscripciones' },
  cerrado:                { label: 'Cerrado',                cls: 'badge-yellow', next: 'en_curso',               nextLabel: 'Iniciar torneo' },
  en_curso:               { label: 'En curso',               cls: 'bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-medium', next: 'finalizado', nextLabel: 'Finalizar torneo' },
  finalizado:             { label: 'Finalizado',             cls: 'badge-red',    next: null, nextLabel: null },
  homologado:             { label: 'Finalizado',             cls: 'badge-red',    next: null, nextLabel: null },
};
const POOL_LABEL: Record<string, string> = { P25: '25 m', P50: '50 m' };
const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Femenino' };
const ROUND_LABEL: Record<string, string> = { serie_unica: 'Serie única', clasificatorio: 'Clasificatorio', final: 'Final' };
const DOC_TYPE_LABEL: Record<string, string> = {
  convocatoria: 'Convocatoria', reglamento: 'Reglamento', programa: 'Programa', resultados: 'Resultados', otros: 'Otros',
};
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  const cs = Math.floor(ms / 10) % 100;
  const s  = Math.floor(ms / 1000) % 60;
  const m  = Math.floor(ms / 60000);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}` : `${s}.${String(cs).padStart(2, '0')}`;
}

function getToken(): string { return typeof window !== 'undefined' ? (localStorage.getItem('ftn_access_token') ?? '') : ''; }

/** Cantidad de jornadas derivada de las fechas del torneo */
function countDays(startDate: string, endDate: string): number {
  const start = new Date(startDate).setHours(0, 0, 0, 0);
  const end   = new Date(endDate).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

type Tab = 'pruebas' | 'series' | 'importar' | 'documentos';

/* ─── Componente de upload por tipo ─── */

function ImportUploader({
  tournamentId,
  importType,
  title,
  description,
  icon,
}: {
  tournamentId: string;
  importType: 'sembrados' | 'resultados';
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tournamentId', tournamentId);
      fd.append('importType', importType);

      const res = await fetch(`${API}/import/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }

      const { jobId } = (await res.json()) as { jobId: string };
      router.push(`/admin/import/${jobId}/preview`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado al subir el archivo.');
    } finally {
      setUploading(false);
    }
  }, [tournamentId, importType, router]);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-aqua-50 flex items-center justify-center text-aqua-600">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 cursor-pointer transition-all ${
          dragging ? 'border-aqua-400 bg-aqua-50' : 'border-gray-200 bg-white hover:border-aqua-300 hover:bg-slate-50'
        }`}
      >
        {uploading ? (
          <>
            <svg className="animate-spin w-6 h-6 text-aqua-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-500">Procesando...</span>
          </>
        ) : (
          <>
            <svg className={`w-7 h-7 ${dragging ? 'text-aqua-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-sm text-gray-500">
              Arrastrá o <span className="text-aqua-600 font-medium">seleccioná el archivo</span>
            </p>
            <p className="text-xs text-gray-300">PDF · HY3 · CSV · XLSX</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.hy3,.sd3,.csv,.xlsx,.xls"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}

/* ─── Página principal ─── */

export default function TorneoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pruebas');
  const [jornadaFilter, setJornadaFilter] = useState<number | null>(null);

  // Documento upload
  const [docType, setDocType] = useState('convocatoria');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Transición de estado
  const [transLoading, setTransLoading] = useState(false);
  const [transError, setTransError] = useState<string | null>(null);

  const loadTournament = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTournament(await apiFetch<Tournament>(`/tournaments/${id}`)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void loadTournament(); }, [loadTournament]);

  const handleTransition = async () => {
    if (!tournament) return;
    const st = STATUS_MAP[tournament.status];
    if (!st?.next) return;
    if (
      st.next === 'finalizado' &&
      !confirm('¿Finalizar el torneo? Los resultados se homologarán automáticamente y se actualizarán rankings y récords.')
    ) return;
    setTransLoading(true); setTransError(null);
    try {
      await apiFetch(`/tournaments/${id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: st.next }),
      });
      await loadTournament();
    } catch (e) { setTransError((e as Error).message); }
    finally { setTransLoading(false); }
  };

  const handleGenerateHeats = async (eventId: string) => {
    try {
      await apiFetch(`/tournaments/${id}/events/${eventId}/heats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ lanesPerHeat: 8 }),
      });
      await loadTournament();
    } catch (e) { alert((e as Error).message); }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile) { setDocError('Seleccioná un archivo'); return; }
    if (!docTitle) { setDocError('Completá el título'); return; }
    setDocLoading(true); setDocError(null);
    try {
      const fd = new FormData();
      fd.append('file', docFile); fd.append('type', docType); fd.append('title', docTitle);
      const res = await fetch(`${API}/tournaments/${id}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { message?: string }; throw new Error(b.message ?? `Error ${res.status}`); }
      setDocFile(null); setDocTitle(''); setDocType('convocatoria');
      await loadTournament();
    } catch (e) { setDocError((e as Error).message); }
    finally { setDocLoading(false); }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await apiFetch(`/tournaments/${id}/documents/${docId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      await loadTournament();
    } catch (e) { alert((e as Error).message); }
  };

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (error || !tournament) {
    return <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-700">{error ?? 'Torneo no encontrado'}</div>;
  }

  const st = STATUS_MAP[tournament.status] ?? { label: tournament.status, cls: 'badge-gray', next: null, nextLabel: null };
  const startDate = new Date(tournament.startDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  const endDate   = new Date(tournament.endDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

  const totalDays = countDays(tournament.startDate, tournament.endDate);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  const visibleEvents = jornadaFilter === null
    ? tournament.events
    : tournament.events.filter((ev) => ev.dayNumber === jornadaFilter);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pruebas',    label: `Pruebas (${tournament.events.length})` },
    { key: 'series',     label: 'Series' },
    { key: 'importar',   label: 'Importar' },
    { key: 'documentos', label: `Documentos (${tournament.documents.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Link href="/admin/torneos" className="text-gray-400 hover:text-gray-600 transition-colors mt-1">
            <BackIcon />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
              <span className={st.cls}>{st.label}</span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">
              {tournament.season.year} · {POOL_LABEL[tournament.poolLength] ?? tournament.poolLength} · {startDate}
              {tournament.startDate !== tournament.endDate ? ` — ${endDate}` : ''}
              {totalDays > 1 && <span className="ml-1 text-gray-300">· {totalDays} jornadas</span>}
              {tournament.venue ? ` · ${tournament.venue}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {st.next && (
            <div className="flex flex-col items-end gap-1">
              <button onClick={() => void handleTransition()} disabled={transLoading} className="btn-primary text-sm">
                {transLoading ? 'Procesando...' : st.nextLabel}
              </button>
              {transError && <p className="text-xs text-red-600">{transError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t.key ? 'border-aqua-500 text-aqua-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.key === 'importar' ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {t.label}
              </span>
            ) : t.label}
          </button>
        ))}
      </div>

      {/* ─── Filtro Jornadas (pruebas + series) ─── */}
      {(tab === 'pruebas' || tab === 'series') && totalDays > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium mr-1">Jornada:</span>
          <button
            onClick={() => setJornadaFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
              jornadaFilter === null
                ? 'bg-aqua-500 text-white border-aqua-500'
                : 'border-gray-200 text-gray-500 hover:border-aqua-300 hover:text-aqua-600'
            }`}
          >
            Todas
          </button>
          {days.map((d) => (
            <button
              key={d}
              onClick={() => setJornadaFilter(d)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                jornadaFilter === d
                  ? 'bg-aqua-500 text-white border-aqua-500'
                  : 'border-gray-200 text-gray-500 hover:border-aqua-300 hover:text-aqua-600'
              }`}
            >
              Jornada {d}
            </button>
          ))}
        </div>
      )}

      {/* ─── Tab: Pruebas ─── */}
      {tab === 'pruebas' && (
        <div className="space-y-4">
          {visibleEvents.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-gray-400 text-sm mb-3">
                {tournament.events.length === 0
                  ? 'No hay pruebas cargadas aún.'
                  : 'Sin pruebas para esta jornada.'}
              </p>
              {tournament.events.length === 0 && (
                <button
                  onClick={() => setTab('importar')}
                  className="btn-primary text-sm inline-flex"
                >
                  Importar resultados
                </button>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#</th>
                    {totalDays > 1 && (
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Jornada</th>
                    )}
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Prueba</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Categoría</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ronda</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{ev.orderNo}</td>
                      {totalDays > 1 && (
                        <td className="px-5 py-3.5">
                          <span className="text-xs bg-aqua-50 text-aqua-700 font-semibold px-2 py-0.5 rounded-full">
                            J{ev.dayNumber}
                          </span>
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900">
                          {ev.eventDefinition.distance}m {ev.eventDefinition.stroke}
                        </p>
                        <p className="text-xs text-gray-400">{GENDER_LABEL[ev.eventDefinition.gender] ?? ev.eventDefinition.gender}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{ev.category.name}</td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">{ROUND_LABEL[ev.round] ?? ev.round}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium ${ev._count.results > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {ev._count.results} resultado{ev._count.results !== 1 ? 's' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Series ─── */}
      {tab === 'series' && (
        <div className="space-y-5">
          {visibleEvents.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">
              {tournament.events.length === 0
                ? 'No hay pruebas cargadas — importá resultados primero'
                : 'Sin pruebas para esta jornada.'}
            </div>
          ) : (
            visibleEvents.map((ev) => (
              <div key={ev.id} className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    {totalDays > 1 && (
                      <span className="text-xs bg-aqua-50 text-aqua-700 font-semibold px-2 py-0.5 rounded-full">
                        J{ev.dayNumber}
                      </span>
                    )}
                    <span className="font-semibold text-gray-800">
                      {ev.eventDefinition.distance}m {ev.eventDefinition.stroke} — {ev.category.name} · {GENDER_LABEL[ev.eventDefinition.gender] ?? ev.eventDefinition.gender}
                    </span>
                    <span className="text-xs text-gray-400">{ROUND_LABEL[ev.round]}</span>
                  </div>
                  <button onClick={() => void handleGenerateHeats(ev.id)} className="btn-secondary text-xs py-1.5 px-3">
                    {ev.heats.length > 0 ? 'Regenerar series' : 'Generar series'}
                  </button>
                </div>

                {ev.heats.length === 0 ? (
                  <div className="px-5 py-6 text-center text-gray-400 text-sm">
                    Sin series — hacé clic en &quot;Generar series&quot;
                  </div>
                ) : (
                  ev.heats.map((heat) => (
                    <div key={heat.id} className="border-b border-gray-50 last:border-0">
                      <div className="px-5 py-2 bg-pool-50/30 text-xs font-semibold text-pool-700">
                        Serie {heat.heatNumber}
                      </div>
                      {heat.laneAssignments.length === 0 ? (
                        <div className="px-5 py-4 text-xs text-gray-400">Serie vacía</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left px-5 py-2 font-medium">Carril</th>
                              <th className="text-left px-5 py-2 font-medium">Nadador/a</th>
                              <th className="text-left px-5 py-2 font-medium">Club</th>
                              <th className="text-left px-5 py-2 font-medium">Marca inscripción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {heat.laneAssignments.map((la) => (
                              <tr key={la.id} className="border-t border-gray-50">
                                <td className="px-5 py-2 font-bold text-pool-700">{la.lane}</td>
                                <td className="px-5 py-2 text-gray-800">
                                  {la.registration ? `${la.registration.swimmer.lastName}, ${la.registration.swimmer.firstName}` : '—'}
                                </td>
                                <td className="px-5 py-2 text-gray-500">{la.registration?.club.shortName ?? '—'}</td>
                                <td className="px-5 py-2 font-mono text-gray-600">
                                  {la.registration ? formatTime(la.registration.entryTime) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Tab: Importar ─── */}
      {tab === 'importar' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700">
            <p className="font-semibold">Importar archivos Meet Manager</p>
            <p className="text-xs text-blue-500 mt-0.5">
              Los archivos se procesan y quedan asociados a este torneo. Formatos soportados: PDF, HY3, CSV, Excel.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <ImportUploader
              tournamentId={id}
              importType="sembrados"
              title="Importar Sembrados"
              description="Planilla de carreras y series — quiénes nadan en cada carril"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              }
            />
            <ImportUploader
              tournamentId={id}
              importType="resultados"
              title="Importar Resultados"
              description="Tiempos finales de competencia — se homologan al finalizar el torneo"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        </div>
      )}

      {/* ─── Tab: Documentos ─── */}
      {tab === 'documentos' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Subir documento</h2>
            <form onSubmit={(e) => void handleUploadDoc(e)} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                  <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input text-sm">
                    {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex-[2]">
                  <label className="block text-xs text-gray-500 mb-1">Título</label>
                  <input
                    type="text" placeholder="Ej: Convocatoria Apertura 2026"
                    value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                    className="input text-sm" required
                  />
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Archivo (PDF, JPG, PNG — máx. 20 MB)</label>
                  <input
                    type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pool-50 file:text-pool-700 hover:file:bg-pool-100 cursor-pointer"
                    required
                  />
                </div>
                <button type="submit" disabled={docLoading} className="btn-primary text-sm whitespace-nowrap">
                  {docLoading ? 'Subiendo...' : 'Subir documento'}
                </button>
              </div>
              {docError && <p className="text-xs text-red-600">{docError}</p>}
            </form>
          </div>

          {tournament.documents.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">No hay documentos adjuntos aún</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Título</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Fecha</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tournament.documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3.5"><span className="badge-gray">{DOC_TYPE_LABEL[doc.type] ?? doc.type}</span></td>
                      <td className="px-5 py-3.5">
                        <a href={`${API}${doc.fileUrl}`} target="_blank" rel="noopener noreferrer"
                          className="font-medium text-pool-600 hover:text-pool-800 transition-colors flex items-center gap-1">
                          {doc.title} <ExternalLinkIcon />
                        </a>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs">{new Date(doc.createdAt).toLocaleDateString('es-AR')}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => void handleRemoveDoc(doc.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-all">
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const BackIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const ExternalLinkIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);
