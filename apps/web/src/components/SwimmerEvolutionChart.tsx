'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatTime } from '@/lib/formatTime';

interface SeasonPoint {
  year: number;
  bestTime: number;
}

interface EvolutionEntry {
  eventDef: { id: string; stroke: string; distance: number; gender: string };
  pool: string;
  seasons: SeasonPoint[];
  bestTime: number | null;
  improvementMs: number | null;
}

const STROKE_ES: Record<string, string> = {
  libre: 'L', espalda: 'E', pecho: 'P', mariposa: 'M', combinado: 'C',
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-pool-800 border border-pool-600 rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="text-pool-400 mb-1">{label}</p>
      <p className="font-mono font-bold text-aqua-300">{formatTime(payload[0]!.value)}</p>
    </div>
  );
}

export function SwimmerEvolutionChart({ data }: { data: EvolutionEntry[] }) {
  if (!data.length) return null;

  // Only show entries with at least 2 seasons (otherwise a chart makes no sense)
  const chartable = data.filter((e) => e.seasons.length >= 2);
  const singleSeason = data.filter((e) => e.seasons.length === 1);

  return (
    <div className="space-y-8">
      {chartable.map((entry) => {
        const stroke = STROKE_ES[entry.eventDef.stroke] ?? entry.eventDef.stroke;
        const pool = entry.pool === 'P25' ? '25 m' : '50 m';
        const label = `${entry.eventDef.distance} m ${stroke} · ${pool}`;
        const improvS = entry.improvementMs != null ? (entry.improvementMs / 1000).toFixed(2) : null;

        const chartData = entry.seasons.map((s) => ({ year: s.year, tiempo: s.bestTime }));
        // Invert Y axis: lower time = better, so min is "higher" on screen
        const times = entry.seasons.map((s) => s.bestTime);
        const minT = Math.min(...times);
        const maxT = Math.max(...times);
        const pad = Math.max((maxT - minT) * 0.15, 500);

        return (
          <div key={`${entry.eventDef.id}_${entry.pool}`} className="bg-pool-800/30 rounded-xl p-5 border border-pool-700/40">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold text-white">{label}</h4>
              {entry.bestTime != null && (
                <span className="font-mono text-sm font-bold text-aqua-300">{formatTime(entry.bestTime)}</span>
              )}
            </div>
            {improvS && (
              <p className="text-xs text-emerald-400 mb-4">
                Mejora total: −{improvS} s desde {entry.seasons[0]!.year}
              </p>
            )}
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#5a8ab0' }} />
                <YAxis
                  domain={[minT - pad, maxT + pad]}
                  reversed={false}
                  tickFormatter={(v) => formatTime(v as number)}
                  tick={{ fontSize: 10, fill: '#5a8ab0' }}
                  width={70}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="tiempo"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={{ fill: '#22d3ee', r: 4 }}
                  activeDot={{ r: 6, fill: '#06b6d4' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}

      {/* Single-season PBs without chart — just show as cards */}
      {singleSeason.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-pool-500 uppercase tracking-wider mb-3">Primera marca registrada</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {singleSeason.map((entry) => {
              const stroke = STROKE_ES[entry.eventDef.stroke] ?? entry.eventDef.stroke;
              const pool = entry.pool === 'P25' ? '25 m' : '50 m';
              return (
                <div key={`${entry.eventDef.id}_${entry.pool}`} className="bg-pool-800/30 rounded-xl p-3 border border-pool-700/40 text-center">
                  <p className="text-xs text-pool-400 mb-1">{entry.eventDef.distance} m {stroke} · {pool}</p>
                  <p className="font-mono font-bold text-white text-sm">
                    {entry.bestTime != null ? formatTime(entry.bestTime) : '—'}
                  </p>
                  <p className="text-xs text-pool-500 mt-0.5">{entry.seasons[0]?.year}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
