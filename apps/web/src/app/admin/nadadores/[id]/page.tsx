'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';

interface ClubRef { id: string; name: string; shortName: string; }

interface ClubHistoryEntry {
  id: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  club: ClubRef & { logoUrl: string | null };
  season: { id: string; year: number };
}

interface Swimmer {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  birthDate: string | null;
  gender: string;
  nationality: string;
  photoUrl: string | null;
  isActive: boolean;
  currentClub: ClubRef | null;
  clubHistory: ClubHistoryEntry[];
}

interface Season { id: string; year: number; }
interface Club { id: string; name: string; shortName: string; }

export default function NadadoresDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [swimmer, setSwimmer] = useState<Swimmer | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [assignClubId, setAssignClubId] = useState('');
  const [assignSeasonId, setAssignSeasonId] = useState('');
  const [assignStartDate, setAssignStartDate] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);

  const reload = () => {
    setLoading(true);
    apiFetch<Swimmer>(`/swimmers/${id}`)
      .then(setSwimmer)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    apiFetch<{ items: Club[] }>('/clubs?limit=100&status=afiliado').then((r) => setClubs(r.items)).catch(() => {});
    apiFetch<{ items: Season[] }>('/seasons?limit=20').then((r) => setSeasons(r.items)).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setSwimmer((p) => p ? { ...p, [e.target.name]: e.target.value } : p);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!swimmer) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      await apiFetch(`/swimmers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: swimmer.firstName, lastName: swimmer.lastName,
          documentId: swimmer.documentId || undefined,
          birthDate: swimmer.birthDate || undefined,
          gender: swimmer.gender, nationality: swimmer.nationality,
          photoUrl: swimmer.photoUrl || undefined,
          isActive: swimmer.isActive,
        }),
      });
      setSuccess(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!confirm('¿Desactivar este nadador?')) return;
    try {
      await apiFetch(`/swimmers/${id}`, { method: 'DELETE' });
      reload();
    } catch (e) { setError((e as Error).message); }
  };

  const handleAssignClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true); setAssignError(null); setAssignSuccess(false);
    try {
      const updated = await apiFetch<Swimmer>(`/swimmers/${id}/club-assignment`, {
        method: 'POST',
        body: JSON.stringify({ clubId: assignClubId, seasonId: assignSeasonId, startDate: assignStartDate }),
      });
      setSwimmer(updated);
      setAssignClubId(''); setAssignSeasonId(''); setAssignStartDate('');
      setAssignSuccess(true);
    } catch (e) { setAssignError((e as Error).message); }
    finally { setAssigning(false); }
  };

  if (loading) return <LoadingSkeleton />;
  if (!swimmer) return (
    <div className="text-center py-20 text-gray-400">
      <p>{error ?? 'Nadador no encontrado'}</p>
      <Link href="/admin/nadadores" className="text-pool-600 hover:underline text-sm mt-2 inline-block">← Volver</Link>
    </div>
  );

  const fullName = `${swimmer.lastName}, ${swimmer.firstName}`;
  const initials = `${swimmer.firstName[0] ?? ''}${swimmer.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="max-w-2xl space-y-5">
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/admin/nadadores" className="text-gray-400 hover:text-gray-600 transition-colors">Nadadores</Link>
        <span className="text-gray-200">/</span>
        <span className="text-gray-700 font-medium">{fullName}</span>
      </nav>

      {/* Datos personales */}
      <div className="card overflow-hidden">
        <div className={`bg-gradient-to-r px-7 py-6 flex items-center gap-4 ${
          swimmer.gender === 'M' ? 'from-pool-800 to-pool-600' : 'from-pink-800 to-rose-600'
        }`}>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            swimmer.gender === 'M' ? 'bg-white/15' : 'bg-white/15'
          }`}>
            {swimmer.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={swimmer.photoUrl} alt={fullName} className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <span className="text-white text-xl font-black">{initials}</span>
            )}
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">{fullName}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-white/70">
                {swimmer.gender === 'M' ? 'Masculino' : 'Femenino'}
              </span>
              {swimmer.birthDate && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="text-xs text-white/70">{calcAge(swimmer.birthDate)} años</span>
                </>
              )}
              <span className="text-white/30">·</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                swimmer.isActive ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50'
              }`}>
                {swimmer.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-7 space-y-5">
          {error   && <Alert type="error"   message={error} />}
          {success && <Alert type="success" message="Datos actualizados correctamente." />}

          <div className="grid grid-cols-2 gap-5">
            <Field label="Nombre *" htmlFor="firstName">
              <input id="firstName" name="firstName" required value={swimmer.firstName} onChange={handleChange} className="input" />
            </Field>
            <Field label="Apellido *" htmlFor="lastName">
              <input id="lastName" name="lastName" required value={swimmer.lastName} onChange={handleChange} className="input" />
            </Field>
            <Field label="DNI" htmlFor="documentId">
              <input id="documentId" name="documentId" value={swimmer.documentId ?? ''} onChange={handleChange} className="input" />
            </Field>
            <Field label="Fecha de nacimiento" htmlFor="birthDate">
              <input id="birthDate" name="birthDate" type="date"
                value={swimmer.birthDate ? swimmer.birthDate.slice(0, 10) : ''}
                onChange={handleChange} className="input" />
            </Field>
            <Field label="Género *" htmlFor="gender">
              <select id="gender" name="gender" value={swimmer.gender} onChange={handleChange} className="input">
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </Field>
            <Field label="Nacionalidad" htmlFor="nationality">
              <input id="nationality" name="nationality" value={swimmer.nationality} onChange={handleChange} className="input" maxLength={3} />
            </Field>
            <div className="col-span-2">
              <ImageUpload
                label="Foto del nadador"
                value={swimmer.photoUrl ?? ''}
                onChange={(url) => setSwimmer((p) => p ? { ...p, photoUrl: url } : p)}
                shape="circle"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            {swimmer.isActive ? (
              <button type="button" onClick={handleDeactivate} className="text-sm text-red-500 hover:text-red-700 transition-colors">
                Desactivar nadador
              </button>
            ) : (
              <span className="text-sm text-gray-300">Nadador inactivo</span>
            )}
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? <><SpinIcon /> Guardando...</> : <><SaveIcon /> Guardar cambios</>}
            </button>
          </div>
        </form>
      </div>

      {/* Asignación de club */}
      <div className="card p-7">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-900">Club actual</h2>
            {swimmer.currentClub ? (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-pool-600 to-aqua-400 flex items-center justify-center text-white text-[11px] font-bold">
                  {swimmer.currentClub.shortName.slice(0, 2)}
                </span>
                <span className="text-gray-700 font-medium">{swimmer.currentClub.name}</span>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-1">Sin club asignado</p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {swimmer.currentClub ? 'Transferir a otro club' : 'Asignar a un club'}
          </h3>
          <form onSubmit={handleAssignClub} className="space-y-4">
            {assignError   && <Alert type="error"   message={assignError} />}
            {assignSuccess && <Alert type="success" message="Club asignado correctamente." />}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Club" htmlFor="aClub">
                <select id="aClub" value={assignClubId} onChange={(e) => setAssignClubId(e.target.value)} required className="input">
                  <option value="">Seleccionar...</option>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>)}
                </select>
              </Field>
              <Field label="Temporada" htmlFor="aSeason">
                <select id="aSeason" value={assignSeasonId} onChange={(e) => setAssignSeasonId(e.target.value)} required className="input">
                  <option value="">Seleccionar...</option>
                  {seasons.map((s) => <option key={s.id} value={s.id}>{s.year}</option>)}
                </select>
              </Field>
              <Field label="Fecha inicio" htmlFor="aStart">
                <input id="aStart" type="date" value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)} required className="input" />
              </Field>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={assigning} className="btn-primary disabled:opacity-50">
                {assigning ? <><SpinIcon /> Asignando...</> : 'Confirmar asignación'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Historial */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Historial de clubes</h2>
          <span className="text-xs text-gray-400">{swimmer.clubHistory.length} entradas</span>
        </div>
        {swimmer.clubHistory.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">
            <svg className="w-10 h-10 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm">Sin historial registrado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80">
              <tr>
                {['Club', 'Temporada', 'Desde', 'Hasta', 'Estado'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {swimmer.clubHistory.map((h) => (
                <tr key={h.id} className={h.isActive ? 'bg-aqua-50/30' : ''}>
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded bg-gradient-to-br from-pool-600 to-aqua-400 flex items-center justify-center text-white text-[10px] font-bold">
                        {h.club.shortName.slice(0, 2)}
                      </span>
                      {h.club.name}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 font-semibold">{h.season.year}</td>
                  <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{h.startDate.slice(0, 10)}</td>
                  <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{h.endDate ? h.endDate.slice(0, 10) : '—'}</td>
                  <td className="px-5 py-3.5">
                    {h.isActive
                      ? <span className="badge-green">Vigente</span>
                      : <span className="badge-gray">Cerrado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function calcAge(birthDate: string) {
  const today = new Date(); const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function Field({ label, htmlFor, children, span }: { label: string; htmlFor: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  const styles = type === 'error'
    ? 'bg-red-50 border-red-100 text-red-700'
    : 'bg-emerald-50 border-emerald-100 text-emerald-700';
  return (
    <div className={`col-span-2 border rounded-xl px-5 py-3.5 flex items-center gap-3 text-sm ${styles}`}>
      {type === 'success'
        ? <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
        : <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>}
      {message}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-2xl space-y-5 animate-pulse">
      <div className="card overflow-hidden">
        <div className="bg-pool-800 h-24" />
        <div className="p-7 space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
const SpinIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
