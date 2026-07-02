'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';
import { DatePicker } from '@/components/DatePicker';

interface Club { id: string; name: string; shortName: string; }

const initialForm = {
  firstName: '', lastName: '', documentId: '',
  birthDate: '', gender: 'M', nationality: 'ARG',
  currentClubId: '', photoUrl: '',
};

export default function NuevoNadadoresPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: Club[] }>('/clubs?limit=100&status=afiliado')
      .then((r) => setClubs(r.items)).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName, lastName: form.lastName,
        gender: form.gender, nationality: form.nationality || 'ARG',
      };
      if (form.documentId)   payload.documentId   = form.documentId;
      if (form.birthDate)    payload.birthDate    = form.birthDate;
      if (form.currentClubId) payload.currentClubId = form.currentClubId;
      if (form.photoUrl)     payload.photoUrl     = form.photoUrl;
      await apiFetch('/swimmers', { method: 'POST', body: JSON.stringify(payload) });
      router.push('/admin/nadadores');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <nav className="flex items-center gap-2 text-sm mb-6">
        <Link href="/admin/nadadores" className="text-gray-400 hover:text-gray-600 transition-colors">Nadadores</Link>
        <span className="text-gray-200">/</span>
        <span className="text-gray-700 font-medium">Nuevo nadador</span>
      </nav>

      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-pool-800 to-pool-600 px-7 py-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-aqua-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">Nuevo nadador</h1>
            <p className="text-pool-300 text-sm">Alta en el registro oficial de la FTN</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {error && <ErrorBanner message={error} />}

          <div className="grid grid-cols-2 gap-5">
            <Field label="Nombre *" htmlFor="firstName">
              <input id="firstName" name="firstName" required value={form.firstName} onChange={handleChange} className="input" />
            </Field>
            <Field label="Apellido *" htmlFor="lastName">
              <input id="lastName" name="lastName" required value={form.lastName} onChange={handleChange} className="input" />
            </Field>
            <Field label="DNI" htmlFor="documentId">
              <input id="documentId" name="documentId" value={form.documentId} onChange={handleChange} className="input" placeholder="Sin puntos ni espacios" />
            </Field>
            <Field label="Fecha de nacimiento" htmlFor="birthDate">
              <DatePicker value={form.birthDate} onChange={(v) => setForm((p) => ({ ...p, birthDate: v }))} />
            </Field>
            <Field label="Género *" htmlFor="gender">
              <select id="gender" name="gender" value={form.gender} onChange={handleChange} className="input">
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </Field>
            <Field label="Nacionalidad" htmlFor="nationality">
              <input id="nationality" name="nationality" value={form.nationality} onChange={handleChange} className="input" maxLength={3} placeholder="ARG" />
            </Field>
            <Field label="Club actual" htmlFor="currentClubId" span={2}>
              <select id="currentClubId" name="currentClubId" value={form.currentClubId} onChange={handleChange} className="input">
                <option value="">Sin club asignado</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.shortName})</option>
                ))}
              </select>
            </Field>
            <div className="col-span-2">
              <ImageUpload
                label="Foto del nadador"
                value={form.photoUrl}
                onChange={(url) => setForm((p) => ({ ...p, photoUrl: url }))}
                shape="circle"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Link href="/admin/nadadores" className="btn-secondary">Cancelar</Link>
            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
              {loading ? <><SpinIcon /> Guardando...</> : <><SaveIcon /> Crear nadador</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children, span }: { label: string; htmlFor: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="col-span-2 bg-red-50 border border-red-100 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-red-700">
      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      {message}
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
