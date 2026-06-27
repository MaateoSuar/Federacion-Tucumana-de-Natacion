'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MedalIcon, positionClass } from '@/components/ui/MedalIcon';
import { RecordBadge } from '@/components/ui/RecordBadge';
import { formatTime } from '@/lib/formatTime';
import { useResultsSocket } from '@/hooks/useResultsSocket';
import type { EventResultsResponse } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function PruebaPage({ params }: { params: { id: string; eventId: string } }) {
  const [data, setData] = useState<EventResultsResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [liveUpdate, setLiveUpdate] = useState(false);

  const fetchResults = useCallback(() => {
    fetch(`${API_BASE}/tournaments/${params.id}/events/${params.eventId}/results`)
      .then((r) => r.json())
      .then((d) => {
        setData(d as EventResultsResponse);
        setLiveUpdate(true);
        setTimeout(() => setLiveUpdate(false), 2000);
      })
      .catch(() => setError(true));
  }, [params.id, params.eventId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useResultsSocket({
    tournamentId: params.id,
    eventId: params.eventId,
    onResultsUpdated: fetchResults,
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (error) return (
    <div className="min-h-screen bg-pool-950 text-white flex items-center justify-center">
      <p className="text-pool-400">No se pudo cargar la prueba.</p>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-pool-950 text-white flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-aqua-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { event, results } = data;
  const stroke = STROKE_ES[event.eventDefinition.stroke] ?? event.eventDefinition.stroke;
  const gender = event.eventDefinition.gender === 'M' ? 'Hombres' : 'Mujeres';
  const pool = event.tournament.poolLength === 'P25' ? '25 m' : '50 m';

  const okResults = results.filter((r) => r.status === 'OK');
  const dnsResults = results.filter((r) => r.status !== 'OK');

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-pool-400 mb-6">
          <Link href="/torneos" className="hover:text-aqua-300 transition-colors">Torneos</Link>
          <span>/</span>
          <Link href={`/torneos/${params.id}`} className="hover:text-aqua-300 transition-colors truncate max-w-xs">
            {event.tournament.name}
          </Link>
          <span>/</span>
          <span className="text-pool-200">{event.eventDefinition.distance} m {stroke}</span>
        </div>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">
              {event.eventDefinition.distance} m {stroke}
            </h1>
            <p className="text-pool-300 text-sm mt-1">
              {event.category.name} · {gender} · Piscina {pool}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aqua-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-aqua-500" />
            </span>
            <span className={`text-xs transition-colors duration-300 ${liveUpdate ? 'text-aqua-300 font-semibold' : 'text-pool-500'}`}>
              {liveUpdate ? 'Actualizado' : 'En vivo'}
            </span>
          </div>
        </div>

        {/* Tabla de resultados */}
        {okResults.length === 0 ? (
          <p className="text-pool-400 text-center py-10">Sin resultados disponibles.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-pool-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pool-800/60 text-pool-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 w-10">#</th>
                  <th className="text-left px-4 py-3">Nadador/a</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Club</th>
                  <th className="text-right px-4 py-3">Tiempo</th>
                  <th className="text-center px-4 py-3">Flags</th>
                  <th className="w-8 px-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-pool-700/20">
                {okResults.map((r, idx) => {
                  const pos = idx + 1;
                  const isOpen = expanded.has(r.id);
                  return (
                    <>
                      <tr
                        key={r.id}
                        className={`group hover:bg-pool-800/40 transition-colors cursor-pointer ${positionClass(pos)}`}
                        onClick={() => r.splits.length > 0 && toggle(r.id)}
                      >
                        <td className="px-4 py-3">
                          <MedalIcon position={pos} />
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          <Link
                            href={`/nadadores/${r.swimmer.id}`}
                            className="hover:text-aqua-300 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.swimmer.lastName}, {r.swimmer.firstName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-pool-300 hidden sm:table-cell">{r.club.shortName}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-white">
                          {r.finalTime != null ? formatTime(r.finalTime) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {r.isPb && <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">PB</span>}
                            {r.isRecord && <RecordBadge />}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-pool-500 text-xs">
                          {r.splits.length > 0 && (isOpen ? '▲' : '▼')}
                        </td>
                      </tr>
                      {isOpen && r.splits.length > 0 && (
                        <tr key={`${r.id}-splits`} className="bg-pool-900/60">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="flex flex-wrap gap-3">
                              {r.splits.map((s) => (
                                <div key={s.distance} className="text-xs">
                                  <span className="text-pool-400">{s.distance} m</span>
                                  <span className="ml-1.5 font-mono text-aqua-300">{formatTime(s.cumulativeTime)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* DNS/DSQ/DNF */}
        {dnsResults.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-pool-500 uppercase tracking-wider mb-2">Otros</h3>
            <div className="space-y-1">
              {dnsResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-pool-800/20 rounded-lg px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} dsqCode={r.dsqCode} />
                    <span className="text-pool-300">
                      {r.swimmer.lastName}, {r.swimmer.firstName}
                    </span>
                  </div>
                  <span className="text-pool-500 text-xs">{r.club.shortName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STROKE_ES: Record<string, string> = {
  libre: 'Libre', espalda: 'Espalda', pecho: 'Pecho',
  mariposa: 'Mariposa', combinado: 'Combinado',
  relevo_libre: 'Relevo L.', relevo_combinado: 'Relevo C.',
};
