'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

/* ─── Tipos ─── */

interface EventDefinition {
  id: string; code: string; stroke: string; distance: number; gender: string; isRelay: boolean;
}
interface Category { id: string; code: string; name: string; orderNo: number; }
interface TournamentEvent {
  id: string; orderNo: number; round: string; status: string; dayNumber: number;
  eventDefinition: EventDefinition; category: Category;
  _count: { registrations: number; results: number };
}
interface TournamentDocument {
  id: string; type: string; title: string; fileUrl: string; mimeType: string; createdAt: string;
}
interface SembradoRow {
  eventNo: number; eventLabel: string; heatNo: number; lane: number;
  swimmerName: string; age: number | null; club: string; seedTimeMs: number | null;
}
interface ResultadoRow {
  eventNo: number; eventLabel: string; place: number | null;
  swimmerName: string; age: number | null; club: string;
  seedTimeMs: number | null; finalTimeMs: number | null;
  status: 'OK' | 'DSQ' | 'DNS' | 'DNF';
}
interface DayFile {
  id: string; dayNumber: number; type: 'sembrados' | 'resultados';
  title: string; fileUrl: string; mimeType: string; createdAt: string;
  parsedRows: SembradoRow[] | ResultadoRow[] | null; parseWarning: string | null;
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

type Tab = 'pruebas' | 'importar' | 'documentos';

/* ─── Uploader de sembrados/resultados por jornada ─── */

function DayFileUploader({
  tournamentId,
  day,
  fileType,
  title,
  description,
  icon,
  onUploaded,
}: {
  tournamentId: string;
  day: number;
  fileType: 'sembrados' | 'resultados';
  title: string;
  description: string;
  icon: React.ReactNode;
  onUploaded: () => void;
}) {
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
      fd.append('type', fileType);
      fd.append('title', `${title} — ${file.name}`);

      const res = await fetch(`${API}/tournaments/${tournamentId}/days/${day}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }

      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado al subir el archivo.');
    } finally {
      setUploading(false);
    }
  }, [tournamentId, day, fileType, title, onUploaded]);

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
            <span className="text-sm text-gray-500">Subiendo...</span>
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

/** Tabla de sembrados agrupada por Evento → Serie */
function SembradosTable({ rows }: { rows: SembradoRow[] }) {
  const events = Array.from(new Set(rows.map((r) => r.eventNo))).sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      {events.map((eventNo) => {
        const eventRows = rows.filter((r) => r.eventNo === eventNo);
        const eventLabel = eventRows[0]?.eventLabel ?? '';
        const heats = Array.from(new Set(eventRows.map((r) => r.heatNo))).sort((a, b) => a - b);
        return (
          <div key={eventNo} className="card overflow-hidden">
            <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
              <span className="font-semibold text-gray-800 text-sm">Prueba {eventNo}</span>
              <span className="text-xs text-gray-500 ml-2">{eventLabel}</span>
            </div>
            {heats.map((heatNo) => (
              <div key={heatNo} className="border-b border-gray-50 last:border-0">
                <div className="px-5 py-2 bg-pool-50/30 text-xs font-semibold text-pool-700">
                  Serie {heatNo}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left px-5 py-2 font-medium">Carril</th>
                      <th className="text-left px-5 py-2 font-medium">Nadador/a</th>
                      <th className="text-left px-5 py-2 font-medium">Edad</th>
                      <th className="text-left px-5 py-2 font-medium">Club</th>
                      <th className="text-left px-5 py-2 font-medium">Tiempo sembrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventRows.filter((r) => r.heatNo === heatNo).sort((a, b) => a.lane - b.lane).map((r, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-5 py-2 font-bold text-pool-700">{r.lane}</td>
                        <td className="px-5 py-2 text-gray-800">{r.swimmerName}</td>
                        <td className="px-5 py-2 text-gray-500">{r.age ?? '—'}</td>
                        <td className="px-5 py-2 text-gray-500">{r.club}</td>
                        <td className="px-5 py-2 font-mono text-gray-600">{formatTime(r.seedTimeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const PLACE_LABEL: Record<string, string> = { DSQ: 'DSC', DNS: 'NP', DNF: 'NF' };

/** Tabla de resultados agrupada por Evento, ordenada por puesto */
function ResultadosTable({ rows }: { rows: ResultadoRow[] }) {
  const events = Array.from(new Set(rows.map((r) => r.eventNo))).sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      {events.map((eventNo) => {
        const eventRows = rows
          .filter((r) => r.eventNo === eventNo)
          .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
        const eventLabel = eventRows[0]?.eventLabel ?? '';
        return (
          <div key={eventNo} className="card overflow-hidden">
            <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
              <span className="font-semibold text-gray-800 text-sm">Prueba {eventNo}</span>
              <span className="text-xs text-gray-500 ml-2">{eventLabel}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left px-5 py-2 font-medium">Puesto</th>
                  <th className="text-left px-5 py-2 font-medium">Nadador/a</th>
                  <th className="text-left px-5 py-2 font-medium">Edad</th>
                  <th className="text-left px-5 py-2 font-medium">Club</th>
                  <th className="text-left px-5 py-2 font-medium">Tiempo sembrado</th>
                  <th className="text-left px-5 py-2 font-medium">Tiempo final</th>
                </tr>
              </thead>
              <tbody>
                {eventRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-5 py-2 font-bold text-pool-700">{r.place ?? PLACE_LABEL[r.status] ?? '—'}</td>
                    <td className="px-5 py-2 text-gray-800">{r.swimmerName}</td>
                    <td className="px-5 py-2 text-gray-500">{r.age ?? '—'}</td>
                    <td className="px-5 py-2 text-gray-500">{r.club}</td>
                    <td className="px-5 py-2 font-mono text-gray-600">{formatTime(r.seedTimeMs)}</td>
                    <td className="px-5 py-2 font-mono text-gray-700">
                      {r.finalTimeMs === null ? (PLACE_LABEL[r.status] ?? '—') : formatTime(r.finalTimeMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Lista de archivos subidos para una jornada + tipo — tabla si hay parsedRows, si no, link de descarga */
function DayFileList({ files, onRemove }: { files: DayFile[]; onRemove: (id: string) => void }) {
  if (files.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">Sin archivos subidos para esta jornada todavía.</p>;
  }
  return (
    <div className="space-y-4">
      {files.map((f) => (
        <div key={f.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <a href={`${API}${f.fileUrl}`} target="_blank" rel="noopener noreferrer"
                className="font-medium text-pool-600 hover:text-pool-800 transition-colors flex items-center gap-1 text-sm">
                {f.title} <ExternalLinkIcon />
              </a>
              <p className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleDateString('es-AR')}</p>
              {f.parseWarning && (
                <p className="text-xs text-amber-600 mt-0.5">{f.parseWarning}</p>
              )}
            </div>
            <button onClick={() => onRemove(f.id)} className="text-xs text-red-500 hover:text-red-700 transition-all">
              Eliminar
            </button>
          </div>
          {f.parsedRows && f.parsedRows.length > 0 && (
            f.type === 'sembrados'
              ? <SembradosTable rows={f.parsedRows as SembradoRow[]} />
              : <ResultadosTable rows={f.parsedRows as ResultadoRow[]} />
          )}
        </div>
      ))}
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

  // Sembrados/Resultados por jornada
  const [importDay, setImportDay] = useState(1);
  const [dayFiles, setDayFiles] = useState<DayFile[]>([]);
  const [dayFilesLoading, setDayFilesLoading] = useState(false);
  const [dayFilesError, setDayFilesError] = useState<string | null>(null);

  // Confirmación de corte de jornada
  const [splitConfirm, setSplitConfirm] = useState<TournamentEvent | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  const loadTournament = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTournament(await apiFetch<Tournament>(`/tournaments/${id}`)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void loadTournament(); }, [loadTournament]);

  const loadDayFiles = useCallback(async () => {
    setDayFilesLoading(true); setDayFilesError(null);
    try { setDayFiles(await apiFetch<DayFile[]>(`/tournaments/${id}/days/${importDay}/files`)); }
    catch (e) { setDayFilesError((e as Error).message); }
    finally { setDayFilesLoading(false); }
  }, [id, importDay]);

  useEffect(() => { if (tab === 'importar') void loadDayFiles(); }, [tab, loadDayFiles]);

  const handleRemoveDayFile = async (fileId: string) => {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
      await apiFetch(`/tournaments/${id}/days/${importDay}/files/${fileId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      await loadDayFiles();
    } catch (e) { alert((e as Error).message); }
  };

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

  const confirmSplitDay = async () => {
    if (!splitConfirm) return;
    setSplitLoading(true); setSplitError(null);
    try {
      await apiFetch(`/tournaments/${id}/events/${splitConfirm.id}/split-day`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setSplitConfirm(null);
      await loadTournament();
    } catch (e) { setSplitError((e as Error).message); }
    finally { setSplitLoading(false); }
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

      {/* ─── Filtro Jornadas (pruebas) ─── */}
      {tab === 'pruebas' && totalDays > 1 && (
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
                    {totalDays > 1 && jornadaFilter === null && (
                      <th className="px-2 py-3" />
                    )}
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
                    <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{ev.orderNo}</td>
                      {totalDays > 1 && jornadaFilter === null && (
                        <td className="px-2 py-3.5">
                          {ev.dayNumber < totalDays && (
                            <button
                              onClick={() => setSplitConfirm(ev)}
                              title={`Mover esta prueba y las siguientes a Jornada ${ev.dayNumber + 1}`}
                              className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg bg-aqua-50 text-aqua-600 hover:bg-aqua-100 hover:text-aqua-800 transition-all"
                            >
                              <SplitDayIcon />
                            </button>
                          )}
                        </td>
                      )}
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

      {/* ─── Tab: Importar (sembrados/resultados por jornada) ─── */}
      {tab === 'importar' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-700">
            <p className="font-semibold">Sembrados y resultados por jornada</p>
            <p className="text-xs text-blue-500 mt-0.5">
              Subí acá el sembrado y los resultados de cada jornada a medida que los recibís. Quedan guardados en este torneo — no se crea un torneo nuevo.
            </p>
          </div>

          {totalDays > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium mr-1">Jornada:</span>
              <button
                onClick={() => setImportDay(0)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                  importDay === 0
                    ? 'bg-pool-700 text-white border-pool-700'
                    : 'border-gray-200 text-gray-500 hover:border-pool-300 hover:text-pool-700'
                }`}
              >
                General
              </button>
              {days.map((d) => (
                <button
                  key={d}
                  onClick={() => setImportDay(d)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                    importDay === d
                      ? 'bg-aqua-500 text-white border-aqua-500'
                      : 'border-gray-200 text-gray-500 hover:border-aqua-300 hover:text-aqua-600'
                  }`}
                >
                  Jornada {d}
                </button>
              ))}
            </div>
          )}
          {totalDays > 1 && importDay === 0 && (
            <p className="text-xs text-gray-400 -mt-3">
              Archivo general del torneo completo — se sube al finalizar, con todas las jornadas juntas.
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <DayFileUploader
              tournamentId={id}
              day={importDay}
              fileType="sembrados"
              title="Sembrados"
              description="Programa de series antes de nadar — quiénes nadan en cada carril"
              onUploaded={() => void loadDayFiles()}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              }
            />
            <DayFileUploader
              tournamentId={id}
              day={importDay}
              fileType="resultados"
              title="Resultados"
              description="Tiempos finales de esa jornada"
              onUploaded={() => void loadDayFiles()}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>

          {dayFilesLoading && <p className="text-sm text-gray-400">Cargando...</p>}
          {dayFilesError && <p className="text-sm text-red-600">{dayFilesError}</p>}
          {!dayFilesLoading && !dayFilesError && (
            <DayFileList files={dayFiles} onRemove={(fileId) => void handleRemoveDayFile(fileId)} />
          )}
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

      {/* ─── Modal: confirmar corte de jornada ─── */}
      {splitConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aqua-50 flex items-center justify-center text-aqua-600 shrink-0">
                <SplitDayIcon />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Cortar jornada acá</h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  Prueba #{splitConfirm.orderNo} — {splitConfirm.eventDefinition.distance}m {splitConfirm.eventDefinition.stroke}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Esta prueba y todas las que siguen (en orden, dentro de la Jornada {splitConfirm.dayNumber}) van a pasar a la{' '}
              <span className="font-semibold text-gray-900">Jornada {splitConfirm.dayNumber + 1}</span>.
            </p>

            {splitError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{splitError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => { setSplitConfirm(null); setSplitError(null); }}
                disabled={splitLoading}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button onClick={() => void confirmSplitDay()} disabled={splitLoading} className="btn-primary">
                {splitLoading ? 'Moviendo...' : `Mover a Jornada ${splitConfirm.dayNumber + 1}`}
              </button>
            </div>
          </div>
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
const SplitDayIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10m-4 6l4-4-4-4" />
  </svg>
);
