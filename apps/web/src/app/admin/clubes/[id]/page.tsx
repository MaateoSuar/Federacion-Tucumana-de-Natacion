'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';

interface Club {
  id: string;
  name: string;
  shortName: string;
  locality: string;
  status: string;
  logoUrl: string | null;
  foundedYear: number | null;
  contactEmail: string | null;
  _count?: { swimmers: number };
}

export default function EditarClubPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetch<Club>(`/clubs/${id}`)
      .then(setClub)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setClub((p) => p ? { ...p, [e.target.name]: e.target.value } : p);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      await apiFetch(`/clubs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: club.name, shortName: club.shortName, locality: club.locality, status: club.status,
          logoUrl: club.logoUrl || undefined,
          foundedYear: club.foundedYear ? Number(club.foundedYear) : undefined,
          contactEmail: club.contactEmail || undefined,
        }),
      });
      setSuccess(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleBaja = async () => {
    if (!confirm('¿Confirmar baja del club?')) return;
    try {
      await apiFetch(`/clubs/${id}`, { method: 'DELETE' });
      router.push('/admin/clubes');
    } catch (e) { setError((e as Error).message); }
  };

  if (loading) return <LoadingSkeleton />;
  if (!club) return (
    <div className="text-center py-20 text-gray-400">
      <p className="mb-2">{error ?? 'Club no encontrado'}</p>
      <Link href="/admin/clubes" className="text-pool-600 hover:underline text-sm">← Volver</Link>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/admin/clubes" className="text-gray-400 hover:text-gray-600 transition-colors">Clubes</Link>
        <span className="text-gray-200">/</span>
        <span className="text-gray-700 font-medium">{club.name}</span>
      </nav>

      <div className="card overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-pool-800 to-pool-700 px-7 py-6 flex items-center gap-4">
          <ClubAvatar logo={club.logoUrl} shortName={club.shortName} big />
          <div>
            <h1 className="text-white font-bold text-xl">{club.name}</h1>
            <p className="text-pool-300 text-sm">{club.locality} · {club._count?.swimmers ?? 0} nadadores</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {error && <ErrorBanner message={error} />}
          {success && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-3.5 flex items-center gap-3 text-sm text-emerald-700">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Club actualizado correctamente.
            </div>
          )}

          <div className="grid grid-cols-2 gap-5">
            <Field label="Nombre del club *" htmlFor="name" span={2}>
              <input id="name" name="name" required value={club.name} onChange={handleChange} className="input" />
            </Field>
            <Field label="Sigla *" htmlFor="shortName">
              <input id="shortName" name="shortName" required maxLength={10} value={club.shortName} onChange={handleChange} className="input" />
            </Field>
            <Field label="Localidad *" htmlFor="locality">
              <input id="locality" name="locality" required value={club.locality} onChange={handleChange} className="input" />
            </Field>
            <div className="col-span-2">
              <ImageUpload
                label="Logo del club"
                value={club.logoUrl ?? ''}
                onChange={(url) => setClub((p) => p ? { ...p, logoUrl: url } : p)}
                shape="square"
              />
            </div>
            <Field label="Año de fundación" htmlFor="foundedYear">
              <input id="foundedYear" name="foundedYear" type="number" min={1900} max={new Date().getFullYear()}
                value={club.foundedYear ?? ''} onChange={handleChange} className="input" />
            </Field>
            <Field label="Email de contacto" htmlFor="contactEmail">
              <input id="contactEmail" name="contactEmail" type="email" value={club.contactEmail ?? ''} onChange={handleChange} className="input" />
            </Field>
            <Field label="Estado" htmlFor="status">
              <select id="status" name="status" value={club.status} onChange={handleChange} className="input">
                <option value="afiliado">Afiliado</option>
                <option value="suspendido">Suspendido</option>
                <option value="baja">Baja</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-6">
            <button type="button" onClick={handleBaja} className="text-sm text-red-500 hover:text-red-700 hover:underline transition-colors">
              Dar de baja
            </button>
            <div className="flex gap-3">
              <Link href="/admin/clubes" className="btn-secondary">Cancelar</Link>
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? <><SpinIcon /> Guardando...</> : <><SaveIcon /> Guardar cambios</>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClubAvatar({ logo, shortName, big }: { logo: string | null; shortName: string; big?: boolean }) {
  const size = big ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  if (logo) return (
    <div className={`${size} rounded-xl border border-white/20 flex items-center justify-center overflow-hidden bg-white/10 flex-shrink-0`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={shortName} className="w-full h-full object-contain p-1" />
    </div>
  );
  return (
    <div className={`${size} rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold">{shortName.slice(0, 2)}</span>
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

function LoadingSkeleton() {
  return (
    <div className="max-w-2xl card overflow-hidden animate-pulse">
      <div className="bg-pool-800 h-24" />
      <div className="p-7 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-red-700 col-span-2">
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
