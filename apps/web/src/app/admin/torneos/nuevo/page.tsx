'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { DatePicker } from '@/components/DatePicker';

interface Season {
  id: string;
  year: number;
  isActive: boolean;
}

interface Club {
  id: string;
  name: string;
  shortName: string;
}

export default function NuevoTorneoPage() {
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    hostClubId: '',
    venue: '',
    poolLength: 'P25',
    startDate: '',
    endDate: '',
    numberOfDays: '1',
    type: 'provincial',
    scope: 'provincial',
    seasonId: '',
  });

  useEffect(() => {
    void Promise.all([
      apiFetch<Season[]>('/tournaments/seasons').then(setSeasons),
      apiFetch<{ items: Club[] }>('/clubs?limit=100').then((r) => setClubs(r.items)),
    ]);
  }, []);

  // Pre-seleccionar temporada activa
  useEffect(() => {
    const active = seasons.find((s) => s.isActive);
    if (active && !form.seasonId) {
      setForm((f) => ({ ...f, seasonId: active.id }));
    }
  }, [seasons]);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Cuando cambia startDate o numberOfDays, recalcular endDate
      if (k === 'startDate' || k === 'numberOfDays') {
        const base = k === 'startDate' ? v : next.startDate;
        const days = parseInt(k === 'numberOfDays' ? v : next.numberOfDays, 10);
        if (base && days >= 1) {
          const d = new Date(base);
          d.setDate(d.getDate() + days - 1);
          next.endDate = d.toISOString().split('T')[0] ?? '';
        }
      }
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.startDate) { setError('Seleccioná la fecha de inicio.'); return; }
    if (!form.endDate) { setError('Seleccioná la fecha de fin.'); return; }
    setLoading(true);
    try {
      await apiFetch('/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          hostClubId: form.hostClubId || undefined,
          venue: form.venue || undefined,
          poolLength: form.poolLength,
          type: form.type,
          scope: form.scope,
          seasonId: form.seasonId,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
        }),
      });
      router.push('/admin/torneos');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/torneos" className="text-gray-400 hover:text-gray-600 transition-colors">
          <BackIcon />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo torneo</h1>
          <p className="text-sm text-gray-400 mt-0.5">Completá los datos del torneo</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del torneo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="Campeonato Provincial de Verano 2025"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="input"
          />
        </div>

        {/* Temporada + Tipo */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temporada <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.seasonId}
              onChange={(e) => set('seasonId', e.target.value)}
              className="input"
            >
              <option value="">Seleccioná una temporada</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.year}{s.isActive ? ' (activa)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de torneo <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              className="input"
            >
              <option value="provincial">Provincial</option>
              <option value="nacional">Nacional</option>
              <option value="promocional">Promocional</option>
            </select>
          </div>
        </div>

        {/* Piscina + Ámbito */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Piscina <span className="text-red-500">*</span>
            </label>
            <select
              value={form.poolLength}
              onChange={(e) => set('poolLength', e.target.value)}
              className="input"
            >
              <option value="P25">25 metros (piscina corta)</option>
              <option value="P50">50 metros (piscina larga)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ámbito</label>
            <select
              value={form.scope}
              onChange={(e) => set('scope', e.target.value)}
              className="input"
            >
              <option value="provincial">Provincial</option>
              <option value="nacional">Nacional</option>
            </select>
          </div>
        </div>

        {/* Fechas + Jornadas */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha inicio <span className="text-red-500">*</span>
            </label>
            <DatePicker
              value={form.startDate}
              onChange={(v) => set('startDate', v)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Jornadas <span className="text-red-500">*</span>
            </label>
            <select
              value={form.numberOfDays}
              onChange={(e) => set('numberOfDays', e.target.value)}
              className="input"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n} {n === 1 ? 'jornada' : 'jornadas'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha fin
              <span className="ml-1 text-gray-400 font-normal text-xs">(calculada)</span>
            </label>
            <DatePicker
              value={form.endDate}
              onChange={(v) => set('endDate', v)}
            />
          </div>
        </div>

        {/* Sede */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sede</label>
          <input
            type="text"
            placeholder="Polideportivo Municipal — San Miguel de Tucumán"
            value={form.venue}
            onChange={(e) => set('venue', e.target.value)}
            className="input"
          />
        </div>

        {/* Club sede */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Club organizador</label>
          <select
            value={form.hostClubId}
            onChange={(e) => set('hostClubId', e.target.value)}
            className="input"
          >
            <option value="">Sin club organizador específico</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.shortName})
              </option>
            ))}
          </select>
        </div>

        {/* Botones */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/admin/torneos" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Creando...' : 'Crear torneo'}
          </button>
        </div>
      </form>
    </div>
  );
}

const BackIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
