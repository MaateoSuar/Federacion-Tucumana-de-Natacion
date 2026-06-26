'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

/* ─── Tipos ─── */

interface EventDefinition {
  id: string;
  code: string;
  stroke: string;
  distance: number;
  gender: string;
  isRelay: boolean;
  description: string | null;
}

interface Category {
  id: string;
  code: string;
  name: string;
  orderNo: number;
}

interface LaneAssignment {
  id: string;
  lane: number;
  registration: {
    swimmer: { firstName: string; lastName: string };
    club: { shortName: string };
    entryTime: number | null;
  } | null;
}

interface Heat {
  id: string;
  heatNumber: number;
  scheduledAt: string | null;
  laneAssignments: LaneAssignment[];
}

interface TournamentEvent {
  id: string;
  orderNo: number;
  round: string;
  status: string;
  eventDefinition: EventDefinition;
  category: Category;
  heats: Heat[];
  _count: { registrations: number; results: number };
}

interface TournamentDocument {
  id: string;
  type: string;
  title: string;
  fileUrl: string;
  mimeType: string;
  createdAt: string;
}

interface Tournament {
  id: string;
  name: string;
  venue: string | null;
  poolLength: string;
  startDate: string;
  endDate: string;
  type: string;
  scope: string;
  status: string;
  season: { year: number };
  hostClub: { name: string; shortName: string } | null;
  events: TournamentEvent[];
  documents: TournamentDocument[];
}

/* ─── Constantes de presentación ─── */

const STATUS_MAP: Record<string, { label: string; cls: string; next: string | null; nextLabel: string | null }> = {
  programado:             { label: 'Programado',             cls: 'badge-gray',   next: 'inscripciones_abiertas', nextLabel: 'Abrir inscripciones' },
  inscripciones_abiertas: { label: 'Inscripciones abiertas', cls: 'badge-green',  next: 'cerrado',                nextLabel: 'Cerrar inscripciones' },
  cerrado:                { label: 'Cerrado',                cls: 'badge-yellow', next: 'en_curso',               nextLabel: 'Iniciar torneo' },
  en_curso:               { label: 'En curso',               cls: 'bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-medium', next: 'finalizado', nextLabel: 'Finalizar torneo' },
  finalizado:             { label: 'Finalizado',             cls: 'badge-red',    next: 'homologado',             nextLabel: 'Homologar' },
  homologado:             { label: 'Homologado',             cls: 'bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md text-xs font-medium', next: null, nextLabel: null },
};

const POOL_LABEL: Record<string, string> = { P25: '25 m', P50: '50 m' };
const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Femenino' };
const ROUND_LABEL: Record<string, string> = { serie_unica: 'Serie única', clasificatorio: 'Clasificatorio', final: 'Final' };
const DOC_TYPE_LABEL: Record<string, string> = {
  convocatoria: 'Convocatoria',
  reglamento: 'Reglamento',
  programa: 'Programa',
  resultados: 'Resultados',
  otros: 'Otros',
};

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/* ─── Helpers ─── */

function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  const centiseconds = Math.floor(ms / 10) % 100;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000);
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }
  return `${seconds}.${String(centiseconds).padStart(2, '0')}`;
}

function getToken(): string {
  return localStorage.getItem('ftn_token') ?? '';
}

/* ─── Página principal ─── */

type Tab = 'pruebas' | 'series' | 'documentos';

export default function TorneoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [eventDefs, setEventDefs] = useState<EventDefinition[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pruebas');

  // Add event form
  const [addEventForm, setAddEventForm] = useState({ eventDefinitionId: '', categoryId: '', round: 'serie_unica' });
  const [addEventLoading, setAddEventLoading] = useState(false);
  const [addEventError, setAddEventError] = useState<string | null>(null);

  // Document upload form
  const [docType, setDocType] = useState('convocatoria');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Status transition
  const [transLoading, setTransLoading] = useState(false);
  const [transError, setTransError] = useState<string | null>(null);

  const fetchTournament = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTournament(await apiFetch<Tournament>(`/tournaments/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchTournament();
    void apiFetch<EventDefinition[]>('/tournaments/event-definitions').then(setEventDefs);
    void apiFetch<Category[]>('/tournaments/categories').then(setCategories);
  }, [fetchTournament]);

  /* ─── Handlers ─── */

  const handleTransition = async () => {
    if (!tournament) return;
    const st = STATUS_MAP[tournament.status];
    if (!st?.next) return;
    setTransLoading(true);
    setTransError(null);
    try {
      await apiFetch(`/tournaments/${id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: st?.next }),
      });
      await fetchTournament();
    } catch (e) {
      setTransError((e as Error).message);
    } finally {
      setTransLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddEventLoading(true);
    setAddEventError(null);
    try {
      await apiFetch(`/tournaments/${id}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(addEventForm),
      });
      setAddEventForm({ eventDefinitionId: '', categoryId: '', round: 'serie_unica' });
      await fetchTournament();
    } catch (e) {
      setAddEventError((e as Error).message);
    } finally {
      setAddEventLoading(false);
    }
  };

  const handleRemoveEvent = async (eventId: string) => {
    if (!confirm('¿Eliminar esta prueba?')) return;
    try {
      await apiFetch(`/tournaments/${id}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await fetchTournament();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleGenerateHeats = async (eventId: string) => {
    try {
      await apiFetch(`/tournaments/${id}/events/${eventId}/heats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ lanesPerHeat: 8 }),
      });
      await fetchTournament();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile) { setDocError('Seleccioná un archivo'); return; }
    if (!docTitle) { setDocError('Completá el título'); return; }
    setDocLoading(true);
    setDocError(null);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('type', docType);
      fd.append('title', docTitle);
      const res = await fetch(`${API}/tournaments/${id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      setDocFile(null);
      setDocTitle('');
      setDocType('convocatoria');
      await fetchTournament();
    } catch (e) {
      setDocError((e as Error).message);
    } finally {
      setDocLoading(false);
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await apiFetch(`/tournaments/${id}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await fetchTournament();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-700">
        {error ?? 'Torneo no encontrado'}
      </div>
    );
  }

  const st = STATUS_MAP[tournament.status] ?? { label: tournament.status, cls: 'badge-gray', next: null, nextLabel: null };
  const startDate = new Date(tournament.startDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  const endDate = new Date(tournament.endDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

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
              {tournament.season.year} · {POOL_LABEL[tournament.poolLength] ?? tournament.poolLength} ·{' '}
              {startDate}{tournament.startDate !== tournament.endDate ? ` — ${endDate}` : ''}
              {tournament.venue ? ` · ${tournament.venue}` : ''}
            </p>
          </div>
        </div>

        {/* Botón de transición de estado */}
        {st.next && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => void handleTransition()}
              disabled={transLoading}
              className="btn-primary text-sm"
            >
              {transLoading ? 'Procesando...' : st.nextLabel}
            </button>
            {transError && <p className="text-xs text-red-600">{transError}</p>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-0">
        {(['pruebas', 'series', 'documentos'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-aqua-500 text-aqua-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pruebas' && `Pruebas (${tournament.events.length})`}
            {t === 'series' && `Series`}
            {t === 'documentos' && `Documentos (${tournament.documents.length})`}
          </button>
        ))}
      </div>

      {/* ─── Tab: Pruebas ─── */}
      {tab === 'pruebas' && (
        <div className="space-y-5">
          {/* Formulario agregar prueba */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Agregar prueba</h2>
            <form onSubmit={handleAddEvent} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-40">
                <label className="block text-xs text-gray-500 mb-1">Prueba</label>
                <select
                  required
                  value={addEventForm.eventDefinitionId}
                  onChange={(e) => setAddEventForm((f) => ({ ...f, eventDefinitionId: e.target.value }))}
                  className="input text-sm"
                >
                  <option value="">Seleccioná una prueba</option>
                  {eventDefs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.distance}m {d.stroke} — {GENDER_LABEL[d.gender] ?? d.gender}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-xs text-gray-500 mb-1">Categoría</label>
                <select
                  required
                  value={addEventForm.categoryId}
                  onChange={(e) => setAddEventForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="input text-sm"
                >
                  <option value="">Seleccioná una categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ronda</label>
                <select
                  value={addEventForm.round}
                  onChange={(e) => setAddEventForm((f) => ({ ...f, round: e.target.value }))}
                  className="input text-sm"
                >
                  <option value="serie_unica">Serie única</option>
                  <option value="clasificatorio">Clasificatorio</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <button type="submit" disabled={addEventLoading} className="btn-primary text-sm">
                {addEventLoading ? 'Agregando...' : 'Agregar'}
              </button>
            </form>
            {addEventError && <p className="text-xs text-red-600 mt-2">{addEventError}</p>}
          </div>

          {/* Lista de pruebas */}
          {tournament.events.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">
              No hay pruebas agregadas aún
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">#</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Prueba</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Categoría</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Ronda</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Series</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tournament.events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{ev.orderNo}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900">
                          {ev.eventDefinition.distance}m {ev.eventDefinition.stroke}
                        </p>
                        <p className="text-xs text-gray-400">{GENDER_LABEL[ev.eventDefinition.gender] ?? ev.eventDefinition.gender}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{ev.category.name}</td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">{ROUND_LABEL[ev.round] ?? ev.round}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-gray-600">{ev.heats.length} serie{ev.heats.length !== 1 ? 's' : ''}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => void handleRemoveEvent(ev.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-all"
                        >
                          Quitar
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

      {/* ─── Tab: Series ─── */}
      {tab === 'series' && (
        <div className="space-y-5">
          {tournament.events.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">
              Primero agregá pruebas en la pestaña Pruebas
            </div>
          ) : (
            tournament.events.map((ev) => (
              <div key={ev.id} className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div>
                    <span className="font-semibold text-gray-800">
                      {ev.eventDefinition.distance}m {ev.eventDefinition.stroke} —{' '}
                      {ev.category.name} · {GENDER_LABEL[ev.eventDefinition.gender] ?? ev.eventDefinition.gender}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">{ROUND_LABEL[ev.round]}</span>
                  </div>
                  <button
                    onClick={() => void handleGenerateHeats(ev.id)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {ev.heats.length > 0 ? 'Regenerar series' : 'Generar series'}
                  </button>
                </div>

                {ev.heats.length === 0 ? (
                  <div className="px-5 py-6 text-center text-gray-400 text-sm">
                    Sin series generadas — hacé clic en &quot;Generar series&quot;
                  </div>
                ) : (
                  ev.heats.map((heat) => (
                    <div key={heat.id} className="border-b border-gray-50 last:border-0">
                      <div className="px-5 py-2 bg-pool-50/30 text-xs font-semibold text-pool-700">
                        Serie {heat.heatNumber}
                      </div>
                      {heat.laneAssignments.length === 0 ? (
                        <div className="px-5 py-4 text-xs text-gray-400">Serie vacía (sin inscripciones)</div>
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
                                  {la.registration
                                    ? `${la.registration.swimmer.lastName}, ${la.registration.swimmer.firstName}`
                                    : '—'}
                                </td>
                                <td className="px-5 py-2 text-gray-500">
                                  {la.registration?.club.shortName ?? '—'}
                                </td>
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

      {/* ─── Tab: Documentos ─── */}
      {tab === 'documentos' && (
        <div className="space-y-5">
          {/* Formulario upload */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Subir documento</h2>
            <form onSubmit={handleUploadDoc} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="input text-sm"
                  >
                    {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[2]">
                  <label className="block text-xs text-gray-500 mb-1">Título</label>
                  <input
                    type="text"
                    placeholder="Ej: Convocatoria Campeonato Provincial 2025"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="input text-sm"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Archivo (PDF, JPG, PNG — máx. 20 MB)</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pool-50 file:text-pool-700 hover:file:bg-pool-100 transition-all cursor-pointer"
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

          {/* Lista de documentos */}
          {tournament.documents.length === 0 ? (
            <div className="card p-10 text-center text-gray-400 text-sm">
              No hay documentos adjuntos aún
            </div>
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
                      <td className="px-5 py-3.5">
                        <span className="badge-gray">{DOC_TYPE_LABEL[doc.type] ?? doc.type}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <a
                          href={`${API}${doc.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-pool-600 hover:text-pool-800 transition-colors flex items-center gap-1"
                        >
                          {doc.title}
                          <ExternalLinkIcon />
                        </a>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs">
                        {new Date(doc.createdAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => void handleRemoveDoc(doc.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-all"
                        >
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

/* ─── Icons ─── */

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
