'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';

const initialForm = {
  name: '', shortName: '', locality: '',
  logoUrl: '', foundedYear: '', contactEmail: '', status: 'afiliado',
};

export default function NuevoClubPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name, shortName: form.shortName,
        locality: form.locality, status: form.status,
      };
      if (form.logoUrl) payload.logoUrl = form.logoUrl;
      if (form.foundedYear) payload.foundedYear = parseInt(form.foundedYear, 10);
      if (form.contactEmail) payload.contactEmail = form.contactEmail;
      await apiFetch('/clubs', { method: 'POST', body: JSON.stringify(payload) });
      router.push('/admin/clubes');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6">
        <Link href="/admin/clubes" className="text-gray-400 hover:text-gray-600 transition-colors">Clubes</Link>
        <span className="text-gray-200">/</span>
        <span className="text-gray-700 font-medium">Nuevo club</span>
      </nav>

      <div className="card overflow-hidden">
        {/* Header card */}
        <div className="bg-gradient-to-r from-pool-800 to-pool-700 px-7 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-aqua-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Nuevo club</h1>
              <p className="text-pool-300 text-sm">Completá los datos del club a afiliar</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {error && <ErrorBanner message={error} />}

          <div className="grid grid-cols-2 gap-5">
            <Field label="Nombre del club *" htmlFor="name" span={2}>
              <input id="name" name="name" required maxLength={100}
                value={form.name} onChange={handleChange} className="input" placeholder="Ej: Club Atlético Tucumán" />
            </Field>

            <Field label="Sigla *" htmlFor="shortName">
              <input id="shortName" name="shortName" required maxLength={10}
                value={form.shortName} onChange={handleChange} className="input" placeholder="CAT" />
            </Field>

            <Field label="Localidad *" htmlFor="locality">
              <input id="locality" name="locality" required maxLength={100}
                value={form.locality} onChange={handleChange} className="input" placeholder="San Miguel de Tucumán" />
            </Field>

            <div className="col-span-2">
              <ImageUpload
                label="Logo del club"
                value={form.logoUrl}
                onChange={(url) => setForm((p) => ({ ...p, logoUrl: url }))}
                shape="square"
              />
            </div>

            <Field label="Año de fundación" htmlFor="foundedYear">
              <input id="foundedYear" name="foundedYear" type="number"
                min={1900} max={new Date().getFullYear()}
                value={form.foundedYear} onChange={handleChange} className="input" />
            </Field>

            <Field label="Email de contacto" htmlFor="contactEmail">
              <input id="contactEmail" name="contactEmail" type="email"
                value={form.contactEmail} onChange={handleChange} className="input" />
            </Field>

            <Field label="Estado de afiliación" htmlFor="status">
              <select id="status" name="status" value={form.status} onChange={handleChange} className="input">
                <option value="afiliado">Afiliado</option>
                <option value="suspendido">Suspendido</option>
                <option value="baja">Baja</option>
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-6">
            <Link href="/admin/clubes" className="btn-secondary">Cancelar</Link>
            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
              {loading ? (
                <><SpinIcon /> Guardando...</>
              ) : (
                <><SaveIcon /> Crear club</>
              )}
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
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
