'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ProgressionEvent, SwimmerProgression } from '@/lib/api';
import { formatTime } from '@/lib/formatTime';
import {
  chartSeries, describeDelta, eventLabel, eventsForPool, initialPool, summarizePool,
  type ChartPoint,
} from '@/lib/progression';

type Pool = 'P25' | 'P50';
const POOL_KEY = 'ftn:perfil:pileta';
const POOL_LABEL: Record<Pool, string> = { P25: '25 m', P50: '50 m' };

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });

// ─── Delta: flecha + signo + color (nunca solo color) ────────────────────────

const DELTA_STYLE = {
  better: 'text-emerald-400 bg-emerald-500/10',
  worse: 'text-rose-400 bg-rose-500/10',
  same: 'text-pool-300 bg-pool-700/40',
} as const;

function Delta({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  const d = describeDelta(ms);
  return (
    <span
      aria-label={d.label}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${DELTA_STYLE[d.tone]}`}
    >
      <span aria-hidden="true">{d.arrow}</span>
      <span aria-hidden="true">{d.text}</span>
    </span>
  );
}

function PbBadge() {
  return (
    <span title="Mejor marca personal" className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-amber-300">
      ★ MP
    </span>
  );
}

// ─── Mini gráfico de tendencia por fila ──────────────────────────────────────

function Sparkline({ points }: { points: ChartPoint[] }) {
  if (points.length < 2) return <span className="text-xs text-pool-500">—</span>;
  return (
    <div className="h-8 w-28" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          {/* Eje normal: un tiempo menor queda más abajo, así que bajar la línea = mejorar */}
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line type="linear" dataKey="timeMs" stroke="#48cae4" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Detalle de una prueba: gráfico + tabla torneo a torneo ──────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-pool-600 bg-pool-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white">{p.tournamentName}</p>
      <p className="text-pool-400">{shortDate(p.date)}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="font-mono text-sm font-bold text-aqua-300">{formatTime(p.timeMs)}</span>
        {p.isPb && <PbBadge />}
        <Delta ms={p.deltaVsPreviousMs} />
      </p>
    </div>
  );
}

function PbDot(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  return payload?.isPb
    ? <circle cx={cx} cy={cy} r={6} fill="#fbbf24" stroke="#020d1a" strokeWidth={2} />
    : <circle cx={cx} cy={cy} r={4} fill="#48cae4" stroke="#020d1a" strokeWidth={2} />;
}

function EventDetail({ event }: { event: ProgressionEvent }) {
  const points = useMemo(() => chartSeries(event), [event]);
  const rows = [...event.history].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="border-t border-pool-700/40 bg-pool-900/40 px-4 py-4">
      {points.length >= 2 ? (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#0e4482" strokeOpacity={0.35} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: '#85c7f8', fontSize: 11 }} stroke="#0e4482" />
              <YAxis
                domain={['dataMin - 500', 'dataMax + 500']}
                tickFormatter={(v: number) => formatTime(v)}
                tick={{ fill: '#85c7f8', fontSize: 11 }}
                stroke="#0e4482"
                width={58}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line type="stepAfter" dataKey="bestSoFarMs" stroke="#fbbf24" strokeOpacity={0.6} strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="linear" dataKey="timeMs" stroke="#48cae4" strokeWidth={2.5} dot={<PbDot />} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-center text-[11px] text-pool-400">
            Más abajo = más rápido · <span className="text-amber-300">● mejor marca</span> · línea punteada: mejor marca vigente
          </p>
        </div>
      ) : (
        <p className="text-sm text-pool-400">
          Nadó esta prueba en un solo torneo. El gráfico de evolución aparece a partir del segundo.
        </p>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-pool-400">
              <th className="py-1.5 pr-3">Torneo</th>
              <th className="py-1.5 pr-3 text-right">Tiempo</th>
              <th className="py-1.5 pr-3 text-right">vs. anterior</th>
              <th className="hidden py-1.5 pr-3 text-right sm:table-cell">vs. mejor marca</th>
              <th className="hidden py-1.5 md:table-cell">Categoría · Club</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pool-700/20">
            {rows.map((h) => (
              <tr key={`${h.tournamentId}-${h.date}`}>
                <td className="py-2 pr-3">
                  <Link href={`/torneos/${h.tournamentId}`} className="text-white hover:text-aqua-300 transition-colors">
                    {h.tournamentName}
                  </Link>
                  <span className="block text-xs text-pool-400">
                    {shortDate(h.date)}
                    {h.place !== null && ` · ${h.place}°`}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right">
                  <span className="font-mono font-bold tabular-nums text-white">{formatTime(h.timeMs)}</span>
                  {h.isPb && <span className="ml-1.5"><PbBadge /></span>}
                </td>
                <td className="py-2 pr-3 text-right"><Delta ms={h.deltaVsPreviousMs} /></td>
                <td className="hidden py-2 pr-3 text-right sm:table-cell"><Delta ms={h.deltaVsPbMs} /></td>
                <td className="hidden py-2 text-xs text-pool-300 md:table-cell">{h.categoryName} · {h.clubName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fila de una prueba ──────────────────────────────────────────────────────

function EventRow({ event, open, onToggle }: { event: ProgressionEvent; open: boolean; onToggle: () => void }) {
  const points = useMemo(() => chartSeries(event), [event]);
  const { personalBest: pb, last } = event;
  return (
    <li className="overflow-hidden rounded-xl border border-pool-700/40 bg-pool-800/30">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-pool-800/50 md:grid-cols-[1.3fr_1fr_1.4fr_auto_auto]"
      >
        <span className="font-semibold text-white">{eventLabel(event)}</span>

        <span className="text-right md:text-left">
          <span className="block text-[10px] uppercase tracking-wider text-pool-400 md:hidden">Mejor marca</span>
          {pb ? (
            <>
              <span className="font-mono text-lg font-black tabular-nums text-aqua-300">{formatTime(pb.timeMs)}</span>
              <span className="block truncate text-[11px] text-pool-400">{pb.tournamentName}</span>
            </>
          ) : <span className="text-pool-500">—</span>}
        </span>

        <span className="col-span-2 md:col-span-1">
          <span className="block text-[10px] uppercase tracking-wider text-pool-400 md:hidden">Último torneo</span>
          {last ? (
            <>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold tabular-nums text-white">{formatTime(last.timeMs)}</span>
                <Delta ms={last.deltaVsPreviousMs} />
                {last.isPb && last.deltaVsPreviousMs !== null && (
                  <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 motion-safe:animate-pulse">
                    ¡Nueva mejor marca!
                  </span>
                )}
              </span>
              <span className="block truncate text-[11px] text-pool-400">{last.tournamentName} · {shortDate(last.date)}</span>
            </>
          ) : <span className="text-pool-500">—</span>}
        </span>

        <span className="hidden md:block"><Sparkline points={points} /></span>
        <span className="col-span-2 flex items-center justify-between md:col-span-1 md:justify-end">
          <span className="md:hidden"><Sparkline points={points} /></span>
          <span aria-hidden="true" className={`text-pool-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>
      {open && <EventDetail event={event} />}
    </li>
  );
}

// ─── Vista completa ──────────────────────────────────────────────────────────

export function SwimmerProgressionView({ progression }: { progression: SwimmerProgression }) {
  const [pool, setPool] = useState<Pool>(() => initialPool(progression, null));
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  // Recordar la pileta elegida (si el navegador lo permite)
  useEffect(() => {
    try {
      setPool(initialPool(progression, window.localStorage.getItem(POOL_KEY)));
    } catch { /* sin almacenamiento: queda la pileta por defecto */ }
  }, [progression]);
  const choosePool = (next: Pool) => {
    setPool(next);
    setOpenEvent(null);
    try { window.localStorage.setItem(POOL_KEY, next); } catch { /* idem */ }
  };

  const events = useMemo(() => eventsForPool(progression, pool), [progression, pool]);
  const summary = useMemo(() => summarizePool(progression, pool), [progression, pool]);
  const tournaments = progression.tournaments
    .filter((t) => t.pool === pool)
    .sort((a, b) => b.date.localeCompare(a.date));
  const improvement = summary.totalImprovementMs > 0 ? describeDelta(-summary.totalImprovementMs).text : '—';

  return (
    <div>
      {/* Pileta: 25 m y 50 m son universos separados */}
      <div role="tablist" aria-label="Pileta" className="mb-6 inline-flex gap-1 rounded-xl bg-pool-800/40 p-1">
        {(['P25', 'P50'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            type="button"
            aria-selected={pool === p}
            onClick={() => choosePool(p)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-all ${pool === p ? 'bg-aqua-600 text-white' : 'text-pool-300 hover:text-white'}`}
          >
            Pileta {POOL_LABEL[p]}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-pool-700/40 bg-pool-800/20 px-4 py-12 text-center text-pool-400">
          Todavía no tiene resultados homologados en pileta de {POOL_LABEL[pool]}.
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Torneos', value: summary.tournaments },
              { label: 'Pruebas', value: summary.events },
              { label: summary.latestYear ? `Mejores marcas ${summary.latestYear}` : 'Mejores marcas', value: summary.pbsThisYear },
              { label: 'Mejora acumulada', value: improvement },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-pool-700/40 bg-pool-800/30 p-4 text-center">
                <p className="text-2xl font-black tabular-nums text-white">{value}</p>
                <p className="mt-1 text-xs text-pool-400">{label}</p>
              </div>
            ))}
          </div>

          <section className="mb-10">
            <h2 className="mb-1 text-lg font-bold text-white">Mejores marcas · Pileta {POOL_LABEL[pool]}</h2>
            <p className="mb-4 text-xs text-pool-400">
              <span className="text-emerald-400">▼ bajó el tiempo</span> · <span className="text-rose-400">▲ subió</span> ·{' '}
              <span className="text-amber-300">★ MP</span> mejor marca personal · tocá una prueba para ver su evolución
            </p>
            <div className="mb-2 hidden grid-cols-[1.3fr_1fr_1.4fr_auto_auto] gap-x-4 px-4 text-[11px] uppercase tracking-wider text-pool-400 md:grid">
              <span>Prueba</span><span>Mejor marca</span><span>Último torneo</span><span className="w-28">Tendencia</span><span className="w-3" />
            </div>
            <ul className="space-y-2">
              {events.map((e) => (
                <EventRow
                  key={e.eventDefinitionId}
                  event={e}
                  open={openEvent === e.eventDefinitionId}
                  onToggle={() => setOpenEvent(openEvent === e.eventDefinitionId ? null : e.eventDefinitionId)}
                />
              ))}
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="mb-4 text-lg font-bold text-white">Torneos</h2>
            <ol className="relative space-y-3 border-l border-pool-700/60 pl-5">
              {tournaments.map((t) => (
                <li key={t.tournamentId} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-pool-950 bg-aqua-400" aria-hidden="true" />
                  <Link href={`/torneos/${t.tournamentId}`} className="font-semibold text-white hover:text-aqua-300 transition-colors">
                    {t.name}
                  </Link>
                  <p className="text-xs text-pool-400">
                    {shortDate(t.date)} · {t.events} {t.events === 1 ? 'prueba' : 'pruebas'}
                    {t.pbs > 0 && <span className="text-amber-300"> · {t.pbs} ★ MP</span>}
                    {t.medals.gold > 0 && <span className="text-yellow-400"> · {t.medals.gold} oro</span>}
                    {t.medals.silver > 0 && <span className="text-slate-300"> · {t.medals.silver} plata</span>}
                    {t.medals.bronze > 0 && <span className="text-amber-600"> · {t.medals.bronze} bronce</span>}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
