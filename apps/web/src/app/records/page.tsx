'use client';

import { useEffect, useMemo, useState } from 'react';
import { NavBar } from '@/components/NavBar';
import { formatTime } from '@/lib/formatTime';
import { fetchRecords, fetchNationalRecords } from '@/lib/api';
import type { RecordEntry } from '@/lib/api';
import Link from 'next/link';

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo Libre', relevo_combinado: 'Relevo Combinado',
};

const GENDER_LABEL: Record<string, string> = { M: 'Hombres', F: 'Mujeres', MIX: 'Mixto' };

// Orden de categorías tal como aparece en la Tabla Oficial de Récords Tucumanos
const CATEGORY_ORDER = ['INF', 'MEN', 'CAD', 'JUV', 'MAY', 'ABS'];

// Orden de estilos: agrupa todas las distancias de un estilo (50, 100, 200...) antes de pasar al siguiente
const STROKE_ORDER = ['libre', 'espalda', 'pecho', 'mariposa', 'combinado', 'relevo_libre', 'relevo_combinado'];

function strokeOrderIndex(stroke: string): number {
  const idx = STROKE_ORDER.indexOf(stroke);
  return idx === -1 ? STROKE_ORDER.length : idx;
}

// Compara pruebas agrupando por estilo primero y por distancia ascendente dentro del estilo
function compareEvents(a: { distance: number; stroke: string }, b: { distance: number; stroke: string }): number {
  const strokeDiff = strokeOrderIndex(a.stroke) - strokeOrderIndex(b.stroke);
  if (strokeDiff !== 0) return strokeDiff;
  return a.distance - b.distance;
}

// Clave de "prueba" independiente de género — así "50 m Libre" agrupa M/F/Mixto
function eventBaseKey(e: { distance: number; stroke: string }): string {
  return `${e.distance}-${e.stroke}`;
}

function eventLabel(e: { distance: number; stroke: string }): string {
  return `${e.distance} m ${STROKE_ES[e.stroke] ?? e.stroke}`;
}

function RecordRow({ record, national }: { record: RecordEntry; national?: RecordEntry }) {
  const date = new Date(record.recordDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  const isTeam = !record.swimmer.lastName || record.swimmer.lastName === 'Equipo de Relevo';
  return (
    <tr className="border-b border-pool-700/20 hover:bg-pool-800/30 transition-colors">
      <td className="px-4 py-3 text-white font-semibold text-sm">{eventLabel(record.eventDefinition)}</td>
      <td className="px-4 py-3 font-mono font-bold text-aqua-300">{formatTime(record.timeMs)}</td>
      <td className="px-4 py-3 text-pool-200 text-sm">
        {isTeam ? (
          record.swimmer.firstName
        ) : (
          <Link href={`/nadadores/${record.swimmer.id}`} className="hover:text-aqua-300 transition-colors">
            {record.swimmer.lastName}, {record.swimmer.firstName}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-pool-400 text-xs">{date}</td>
      {national && (
        <td className="px-4 py-3 text-right">
          <span className="font-mono text-xs text-pool-400">{formatTime(national.timeMs)}</span>
          {record.timeMs <= national.timeMs && (
            <span className="ml-2 text-xs font-bold text-yellow-400">≡ NAC</span>
          )}
        </td>
      )}
    </tr>
  );
}

function RecordsTable({ records, nationals, gender }: { records: RecordEntry[]; nationals: RecordEntry[]; gender: 'M' | 'F' | 'MIX' }) {
  const filtered = records
    .filter((r) => r.gender === gender)
    .sort((a, b) => compareEvents(a.eventDefinition, b.eventDefinition));
  if (filtered.length === 0) return null;

  const getNational = (r: RecordEntry) =>
    nationals.find((n) => n.eventDefinition.id === r.eventDefinition.id && n.gender === r.gender && n.poolLength === r.poolLength);

  return (
    <div className="overflow-x-auto rounded-xl border border-pool-700/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3">Prueba</th>
            <th className="text-left px-4 py-3">Tiempo</th>
            <th className="text-left px-4 py-3">Atleta</th>
            <th className="text-left px-4 py-3">Fecha</th>
            {nationals.length > 0 && <th className="text-right px-4 py-3">Rec. Nacional</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <RecordRow key={r.id} record={r} national={nationals.length > 0 ? getNational(r) : undefined} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategorySection({
  categoryName,
  records,
  nationals,
}: {
  categoryName: string;
  records: RecordEntry[];
  nationals: RecordEntry[];
}) {
  if (records.length === 0) return null;
  const genders: Array<'M' | 'F' | 'MIX'> = ['M', 'F', 'MIX'];

  return (
    <div className="rounded-2xl border border-pool-700/30 bg-pool-900/40 p-5">
      <h3 className="text-lg font-bold text-white mb-4">{categoryName}</h3>
      <div className="space-y-6">
        {genders.map((g) => {
          const gRecords = records.filter((r) => r.gender === g);
          if (gRecords.length === 0) return null;
          return (
            <div key={g}>
              <p className="text-sm font-semibold text-pool-300 mb-2">{GENDER_LABEL[g]}</p>
              <RecordsTable records={gRecords} nationals={nationals} gender={g} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RecordsPage() {
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [nationals, setNationals] = useState<RecordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filtros
  const [poolFilter, setPoolFilter] = useState<'' | 'P25' | 'P50'>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    Promise.all([
      fetchRecords({ scope: 'provincial' }),
      fetchNationalRecords(),
    ])
      .then(([r, n]) => { setRecords(r); setNationals(n); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const categoryOptions = useMemo(() => {
    const names = new Map(records.map((r) => [r.category.code, r.category.name]));
    return CATEGORY_ORDER.filter((code) => names.has(code)).map((code) => ({ code, name: names.get(code)! }));
  }, [records]);

  const eventOptions = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; distance: number; stroke: string }>();
    for (const r of records) {
      const key = eventBaseKey(r.eventDefinition);
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: eventLabel(r.eventDefinition),
          distance: r.eventDefinition.distance,
          stroke: r.eventDefinition.stroke,
        });
      }
    }
    return [...seen.values()].sort((a, b) => compareEvents(a, b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (poolFilter && r.poolLength !== poolFilter) return false;
      if (categoryFilter && r.category.code !== categoryFilter) return false;
      if (eventFilter && eventBaseKey(r.eventDefinition) !== eventFilter) return false;
      return true;
    });
  }, [records, poolFilter, categoryFilter, eventFilter]);

  const pools: Array<{ key: 'P25' | 'P50'; label: string }> = [
    { key: 'P25', label: 'Piscina 25 m' },
    { key: 'P50', label: 'Piscina 50 m' },
  ];

  const categoryNames = new Map(records.map((r) => [r.category.code, r.category.name]));
  const hasAnyMatch = filteredRecords.length > 0;

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
        <header className="mb-8">
          <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest mb-1">FTN</p>
          <h1 className="text-3xl font-black text-white">Tabla Oficial de Récords Tucumanos</h1>
          {nationals.length > 0 && (
            <p className="text-pool-400 text-sm mt-1">Los récords nacionales se muestran como referencia.</p>
          )}
        </header>

        {!loading && records.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            <select
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value as '' | 'P25' | 'P50')}
              className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Todas las piletas</option>
              <option value="P25">Piscina 25 m</option>
              <option value="P50">Piscina 50 m</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Todas las categorías</option>
              {categoryOptions.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm text-white col-span-2 md:col-span-1"
            >
              <option value="">Todas las pruebas</option>
              {eventOptions.map((ev) => (
                <option key={ev.key} value={ev.key}>{ev.label}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-aqua-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error || records.length === 0 ? (
          <p className="text-pool-400 text-center py-20">Sin récords registrados aún.</p>
        ) : !hasAnyMatch ? (
          <p className="text-pool-400 text-center py-20">Sin récords para estos filtros.</p>
        ) : (
          <div className="space-y-12">
            {pools.map(({ key, label }) => {
              if (poolFilter && poolFilter !== key) return null;
              const poolRecords = filteredRecords.filter((r) => r.poolLength === key);
              if (poolRecords.length === 0) return null;
              const poolNationals = nationals.filter((n) => n.poolLength === key);
              return (
                <section key={key}>
                  <h2 className="text-xl font-bold text-white mb-4 pb-2 border-b border-pool-700/40">{label}</h2>
                  <div className="space-y-6">
                    {CATEGORY_ORDER.map((code) => {
                      const catRecords = poolRecords.filter((r) => r.category.code === code);
                      if (catRecords.length === 0) return null;
                      return (
                        <CategorySection
                          key={code}
                          categoryName={categoryNames.get(code) ?? code}
                          records={catRecords}
                          nationals={poolNationals}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
