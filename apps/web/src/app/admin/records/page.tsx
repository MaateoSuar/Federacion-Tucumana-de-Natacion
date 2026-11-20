'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { RecordEntry } from '@/lib/api';
import { formatTime, parseTimeToMs } from '@/lib/formatTime';
import { DatePicker } from '@/components/DatePicker';

interface Club {
  id: string;
  name: string;
  shortName: string;
}

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo Libre', relevo_combinado: 'Relevo Combinado',
};

const GENDER_LABEL: Record<string, string> = { M: 'Hombres', F: 'Mujeres', MIX: 'Mixto' };
const CATEGORY_ORDER = ['INF', 'MEN', 'CAD', 'JUV', 'MAY', 'ABS'];
const POOL_LABEL: Record<string, string> = { P25: 'Piscina 25 m', P50: 'Piscina 50 m' };

interface EditFormState {
  firstName: string;
  lastName: string;
  clubId: string;
  timeText: string;
  recordDate: string;
  tournamentName: string;
  notes: string;
}

// Fecha del récord homologado más reciente entre los cargados — "última actualización" de la tabla
function lastUpdatedDate(records: RecordEntry[]): Date | null {
  if (records.length === 0) return null;
  const timestamps = records.map((r) => new Date(r.homologatedAt ?? r.createdAt).getTime());
  return new Date(Math.max(...timestamps));
}

function toFormState(clubs: Club[]): EditFormState {
  return {
    firstName: '',
    lastName: '',
    clubId: clubs[0]?.id ?? '',
    timeText: '',
    recordDate: new Date().toISOString().slice(0, 10),
    tournamentName: '',
    notes: '',
  };
}

export default function AdminRecordsPage() {
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordEntry | null>(null);
  const [form, setForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecordEntry[]>([]);
  const [candidateBusy, setCandidateBusy] = useState<string | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recordsData, clubsData, candidatesData] = await Promise.all([
        apiFetch<RecordEntry[]>('/records?scope=provincial'),
        apiFetch<{ items: Club[]; total: number }>('/clubs?limit=200'),
        apiFetch<RecordEntry[]>('/records/candidates?scope=provincial'),
      ]);
      setRecords(recordsData);
      setClubs(clubsData.items);
      setCandidates(candidatesData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const lastUpdated = useMemo(() => lastUpdatedDate(records), [records]);

  const grouped = useMemo(() => {
    const pools: Array<{ key: 'P25' | 'P50' }> = [{ key: 'P25' }, { key: 'P50' }];
    return pools.map(({ key }) => ({
      pool: key,
      categories: CATEGORY_ORDER.map((code) => {
        const catRecords = records.filter((r) => r.poolLength === key && r.category.code === code);
        return { code, name: catRecords[0]?.category.name ?? code, records: catRecords };
      }).filter((c) => c.records.length > 0),
    })).filter((p) => p.categories.length > 0);
  }, [records]);

  const resolveCandidate = async (candidate: RecordEntry, action: 'homologate' | 'reject') => {
    const who = `${candidate.swimmer.lastName}, ${candidate.swimmer.firstName} (${formatTime(candidate.timeMs)})`;
    const question = action === 'homologate'
      ? `¿Homologar el récord de ${who}? Pasa a ser el récord vigente y se publica.`
      : `¿Rechazar el candidato de ${who}? Se elimina y queda registrado en la auditoría.`;
    if (!window.confirm(question)) return;

    setCandidateBusy(candidate.id);
    setCandidateError(null);
    try {
      await apiFetch(`/records/${candidate.id}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setCandidateError((e as Error).message);
    } finally {
      setCandidateBusy(null);
    }
  };

  // Volver al récord anterior: para cuando un récord se actualizó solo con un resultado erróneo.
  const [revertBusy, setRevertBusy] = useState<string | null>(null);
  const revertRecord = async (record: RecordEntry) => {
    const who = `${record.swimmer.lastName}, ${record.swimmer.firstName} (${formatTime(record.timeMs)})`;
    const reason = window.prompt(
      `Vas a volver al récord anterior y eliminar el de ${who}.\n\nEscribí el motivo (queda registrado en la auditoría):`,
    );
    if (reason === null) return; // canceló
    setRevertBusy(record.id);
    setError(null);
    try {
      await apiFetch(`/records/${record.id}/revert`, {
        method: 'PATCH',
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevertBusy(null);
    }
  };

  const openEdit = (record: RecordEntry) => {
    setEditing(record);
    setForm(toFormState(clubs));
    setFormError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setForm(null);
    setFormError(null);
  };

  const submitEdit = async () => {
    if (!editing || !form) return;
    setFormError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError('Nombre y apellido del nuevo holder son obligatorios.');
      return;
    }
    if (!form.clubId) {
      setFormError('Seleccioná un club.');
      return;
    }
    const timeMs = parseTimeToMs(form.timeText);
    if (timeMs == null) {
      setFormError('Tiempo inválido. Formato esperado: mm:ss.cc (ej. 1:05.89 o 55.24).');
      return;
    }
    if (timeMs >= editing.timeMs) {
      setFormError(`El nuevo tiempo debe ser mejor que el vigente (${formatTime(editing.timeMs)}).`);
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/records/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          clubId: form.clubId,
          timeMs,
          recordDate: form.recordDate,
          tournamentName: form.tournamentName.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      closeEdit();
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Récords</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Los récords se actualizan solos cuando un resultado homologado supera al vigente. Si alguno
          se actualizó por error, usá &ldquo;Volver al anterior&rdquo;. Con &ldquo;Editar&rdquo; cargás una marca
          que no pasó por el sistema; el récord anterior no se borra, queda en el historial.
        </p>
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-1">
            Última actualización: {lastUpdated.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {loading && <p className="text-gray-400 text-sm">Cargando...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && candidates.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-lg font-bold text-gray-800">
            Candidatos pendientes de homologación ({candidates.length})
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 mb-3">
            Marcas detectadas automáticamente que superan al récord vigente. No se publican hasta que las homologues.
          </p>
          {candidateError && <p className="text-red-500 text-sm mb-2">{candidateError}</p>}
          <div className="overflow-x-auto rounded-lg border border-amber-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-3 py-2">Prueba</th>
                  <th className="text-left px-3 py-2">Categoría</th>
                  <th className="text-left px-3 py-2">Tiempo</th>
                  <th className="text-left px-3 py-2">Vigente</th>
                  <th className="text-left px-3 py-2">Atleta</th>
                  <th className="text-left px-3 py-2">Torneo</th>
                  <th className="text-right px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {c.eventDefinition.distance} m {STROKE_ES[c.eventDefinition.stroke] ?? c.eventDefinition.stroke}
                      <span className="block text-xs font-normal text-gray-400">
                        {POOL_LABEL[c.poolLength]} · {GENDER_LABEL[c.gender] ?? c.gender}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{c.category.name}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-gray-700">{formatTime(c.timeMs)}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">
                      {c.previousRecord ? formatTime(c.previousRecord.timeMs) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {c.swimmer.lastName}, {c.swimmer.firstName}
                      <span className="block text-xs text-gray-400">{c.club.shortName}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      {c.sourceResult?.event.tournament.name ?? '—'}
                      <span className="block">{new Date(c.recordDate).toLocaleDateString('es-AR')}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => void resolveCandidate(c, 'homologate')}
                        disabled={candidateBusy !== null}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                      >
                        Homologar
                      </button>
                      <button
                        onClick={() => void resolveCandidate(c, 'reject')}
                        disabled={candidateBusy !== null}
                        className="ml-3 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {grouped.map(({ pool, categories }) => (
            <section key={pool}>
              <h2 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">
                {POOL_LABEL[pool]}
              </h2>
              <div className="space-y-6">
                {categories.map(({ code, name, records: catRecords }) => (
                  <div key={code} className="rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">{name}</h3>
                    <div className="space-y-4">
                      {(['M', 'F', 'MIX'] as const).map((g) => {
                        const gRecords = catRecords.filter((r) => r.gender === g);
                        if (gRecords.length === 0) return null;
                        return (
                          <div key={g}>
                            <p className="text-xs font-semibold text-gray-400 mb-1.5">{GENDER_LABEL[g]}</p>
                            <div className="overflow-x-auto rounded-lg border border-gray-100">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                                    <th className="text-left px-3 py-2">Prueba</th>
                                    <th className="text-left px-3 py-2">Tiempo</th>
                                    <th className="text-left px-3 py-2">Atleta</th>
                                    <th className="text-left px-3 py-2">Fecha</th>
                                    <th className="text-right px-3 py-2">Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {gRecords.map((r) => (
                                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                                      <td className="px-3 py-2 font-medium text-gray-800">
                                        {r.eventDefinition.distance} m {STROKE_ES[r.eventDefinition.stroke] ?? r.eventDefinition.stroke}
                                      </td>
                                      <td className="px-3 py-2 font-mono font-semibold text-gray-700">{formatTime(r.timeMs)}</td>
                                      <td className="px-3 py-2 text-gray-600">
                                        {r.swimmer.lastName ? `${r.swimmer.lastName}, ${r.swimmer.firstName}` : r.swimmer.firstName}
                                      </td>
                                      <td className="px-3 py-2 text-gray-400 text-xs">
                                        {new Date(r.recordDate).toLocaleDateString('es-AR')}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <button
                                          onClick={() => openEdit(r)}
                                          className="text-xs font-semibold text-aqua-600 hover:text-aqua-700"
                                        >
                                          Editar
                                        </button>
                                        {(r.previousRecordId || r.sourceResult) && (
                                          <button
                                            onClick={() => void revertRecord(r)}
                                            disabled={revertBusy !== null}
                                            title="Elimina este récord y vuelve a dejar vigente el anterior"
                                            className="ml-3 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                                          >
                                            {revertBusy === r.id ? 'Volviendo…' : 'Volver al anterior'}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Nuevo holder del récord</h3>
              <p className="text-sm text-gray-400 mt-1">
                {editing.eventDefinition.distance} m {STROKE_ES[editing.eventDefinition.stroke] ?? editing.eventDefinition.stroke} —
                Vigente: <strong>{formatTime(editing.timeMs)}</strong> ({editing.swimmer.lastName ? `${editing.swimmer.lastName}, ${editing.swimmer.firstName}` : editing.swimmer.firstName})
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Apellido</label>
                <input
                  className="input"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
                <input
                  className="input"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Club</label>
              <select
                className="input"
                value={form.clubId}
                onChange={(e) => setForm({ ...form, clubId: e.target.value })}
              >
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Tiempo (mm:ss.cc)</label>
                <input
                  className="input font-mono"
                  placeholder="1:05.89"
                  value={form.timeText}
                  onChange={(e) => setForm({ ...form, timeText: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha</label>
                <DatePicker
                  value={form.recordDate}
                  onChange={(v) => setForm({ ...form, recordDate: v })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Torneo (opcional)</label>
              <input
                className="input"
                value={form.tournamentName}
                onChange={(e) => setForm({ ...form, tournamentName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notas (opcional)</label>
              <input
                className="input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {formError && <p className="text-red-500 text-sm">{formError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeEdit} className="btn-secondary" disabled={saving}>
                Cancelar
              </button>
              <button onClick={() => void submitEdit()} className="btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
