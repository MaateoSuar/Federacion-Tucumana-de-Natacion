'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FormState {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'M' | 'F';
  dni: string;
  nationality: string;
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  birthDate: '',
  gender: 'M',
  dni: '',
  nationality: 'AR',
};

export default function NuevoNadadorEntrenadorPage() {
  const { user, isLoading, accessToken } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !user) void router.replace('/login');
    if (!isLoading && user && user.primaryRole !== 'COACH') void router.replace('/login');
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-pool-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-aqua-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.birthDate) {
      setError('Nombre, apellido y fecha de nacimiento son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: form.birthDate,
        gender: form.gender,
        ...(form.dni.trim() ? { dni: form.dni.trim() } : {}),
        nationality: form.nationality || 'AR',
        ...(user.clubId ? { clubId: user.clubId } : {}),
      };
      const res = await fetch(`${API_BASE}/swimmers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? `Error ${res.status}`);
      }
      void router.push('/entrenador');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el nadador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      {/* NAV */}
      <nav className="border-b border-pool-800 px-6 md:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-md px-1.5 py-0.5">
            <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-7 w-auto" />
          </div>
          <span className="text-pool-500 text-xs">Entrenador</span>
        </div>
        <Link href="/entrenador" className="text-pool-400 hover:text-white text-sm transition-colors">
          ← Volver
        </Link>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">
            Nuevo nadador
          </p>
          <h1 className="text-2xl font-black text-white">Cargar nadador</h1>
          <p className="text-pool-400 text-sm mt-1">
            El nadador quedará asociado a tu club: <span className="text-white font-semibold">{user.clubId ?? 'sin club'}</span>.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-pool-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Nombre *
              </label>
              <input
                value={form.firstName}
                onChange={set('firstName')}
                placeholder="María"
                className="w-full bg-pool-800 border border-pool-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-pool-600 focus:outline-none focus:border-aqua-500"
              />
            </div>
            <div>
              <label className="block text-pool-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                Apellido *
              </label>
              <input
                value={form.lastName}
                onChange={set('lastName')}
                placeholder="García"
                className="w-full bg-pool-800 border border-pool-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-pool-600 focus:outline-none focus:border-aqua-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-pool-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Fecha de nacimiento *
            </label>
            <input
              type="date"
              value={form.birthDate}
              onChange={set('birthDate')}
              max={new Date().toISOString().split('T')[0]}
              className="w-full bg-pool-800 border border-pool-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-aqua-500"
            />
          </div>

          <div>
            <label className="block text-pool-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Género *
            </label>
            <select
              value={form.gender}
              onChange={set('gender')}
              className="w-full bg-pool-800 border border-pool-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-aqua-500"
            >
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </div>

          <div>
            <label className="block text-pool-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              DNI <span className="text-pool-600 normal-case font-normal">(opcional)</span>
            </label>
            <input
              value={form.dni}
              onChange={set('dni')}
              placeholder="30123456"
              className="w-full bg-pool-800 border border-pool-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-pool-600 focus:outline-none focus:border-aqua-500"
            />
          </div>

          <div>
            <label className="block text-pool-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
              Nacionalidad
            </label>
            <select
              value={form.nationality}
              onChange={set('nationality')}
              className="w-full bg-pool-800 border border-pool-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-aqua-500"
            >
              <option value="AR">Argentina</option>
              <option value="BR">Brasil</option>
              <option value="CL">Chile</option>
              <option value="UY">Uruguay</option>
              <option value="PY">Paraguay</option>
              <option value="BO">Bolivia</option>
              <option value="PE">Perú</option>
              <option value="CO">Colombia</option>
              <option value="VE">Venezuela</option>
              <option value="EC">Ecuador</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/entrenador"
              className="flex-1 text-center bg-pool-800 border border-pool-700 text-pool-200 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
            >
              {saving ? 'Guardando...' : 'Crear nadador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
