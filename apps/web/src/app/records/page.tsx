import { NavBar } from '@/components/NavBar';
import { formatTime } from '@/lib/formatTime';
import { fetchRecords, fetchNationalRecords } from '@/lib/api';
import type { RecordEntry } from '@/lib/api';
import Link from 'next/link';

export const revalidate = 300;

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
};

function RecordRow({ record, national }: { record: RecordEntry; national?: RecordEntry }) {
  const date = new Date(record.recordDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <tr className="border-b border-pool-700/20 hover:bg-pool-800/30 transition-colors">
      <td className="px-4 py-3 text-white font-semibold text-sm">
        {record.eventDefinition.distance} m {STROKE_ES[record.eventDefinition.stroke] ?? record.eventDefinition.stroke}
      </td>
      <td className="px-4 py-3 font-mono font-bold text-aqua-300">{formatTime(record.timeMs)}</td>
      <td className="px-4 py-3 text-pool-200 text-sm">
        <Link href={`/nadadores/${record.swimmer.id}`} className="hover:text-aqua-300 transition-colors">
          {record.swimmer.lastName}, {record.swimmer.firstName}
        </Link>
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

function RecordsTable({ records, nationals, gender }: { records: RecordEntry[]; nationals: RecordEntry[]; gender: 'M' | 'F' }) {
  const filtered = records.filter((r) => r.gender === gender);
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

export default async function RecordsPage() {
  let records: RecordEntry[] = [];
  let nationals: RecordEntry[] = [];

  try {
    [records, nationals] = await Promise.all([
      fetchRecords({ scope: 'provincial' }),
      fetchNationalRecords(),
    ]);
  } catch {
    // muestra vacío si la API no está disponible
  }

  const pools: Array<{ key: 'P25' | 'P50'; label: string }> = [
    { key: 'P25', label: 'Piscina 25 m' },
    { key: 'P50', label: 'Piscina 50 m' },
  ];

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
        <header className="mb-8">
          <p className="text-aqua-400 text-xs font-bold uppercase tracking-widest mb-1">FTN</p>
          <h1 className="text-3xl font-black text-white">Récords provinciales</h1>
          {nationals.length > 0 && (
            <p className="text-pool-400 text-sm mt-1">Los récords nacionales se muestran como referencia.</p>
          )}
        </header>

        {records.length === 0 ? (
          <p className="text-pool-400 text-center py-20">Sin récords registrados aún.</p>
        ) : (
          <div className="space-y-10">
            {pools.map(({ key, label }) => {
              const poolRecords = records.filter((r) => r.poolLength === key);
              if (poolRecords.length === 0) return null;
              return (
                <section key={key}>
                  <h2 className="text-xl font-bold text-white mb-2">{label}</h2>
                  <div className="space-y-6">
                    {(['M', 'F'] as const).map((g) => {
                      const gLabel = g === 'M' ? 'Hombres' : 'Mujeres';
                      const gRecords = poolRecords.filter((r) => r.gender === g);
                      if (gRecords.length === 0) return null;
                      return (
                        <div key={g}>
                          <p className="text-sm font-semibold text-pool-300 mb-2">{gLabel}</p>
                          <RecordsTable records={gRecords} nationals={nationals.filter((n) => n.poolLength === key)} gender={g} />
                        </div>
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
