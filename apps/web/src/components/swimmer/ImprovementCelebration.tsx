'use client';

import { useEffect, useRef, useState } from 'react';
import type { SwimmerProgression } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/formatTime';
import { describeDelta, findNewImprovements, type Improvement } from '@/lib/progression';

/**
 * Cartel "¡Felicitaciones, bajaste tu tiempo!".
 * Solo lo ve el nadador dueño del perfil (cuenta vinculada), y solo por marcas
 * homologadas que todavía no vio. Lo ya visto se recuerda en este navegador.
 */

const seenKey = (swimmerId: string) => `ftn:logros-vistos:${swimmerId}`;

function readSeen(swimmerId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(seenKey(swimmerId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

function markSeen(swimmerId: string, improvements: Improvement[]): void {
  try {
    const seen = readSeen(swimmerId);
    for (const i of improvements) seen.add(i.key);
    window.localStorage.setItem(seenKey(swimmerId), JSON.stringify([...seen]));
  } catch { /* sin almacenamiento: se volverá a mostrar la próxima vez */ }
}

const seconds = (ms: number) => describeDelta(-ms).text.replace('-', '');

export function ImprovementCelebration({
  progression, swimmerId, firstName,
}: { progression: SwimmerProgression; swimmerId: string; firstName: string }) {
  const { user, isLoading } = useAuth();
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const isOwner = !isLoading && user?.swimmerId === swimmerId;

  useEffect(() => {
    if (!isOwner) return;
    setImprovements(findNewImprovements(progression, readSeen(swimmerId)));
  }, [isOwner, progression, swimmerId]);

  const open = improvements.length > 0;
  const close = () => {
    markSeen(swimmerId, improvements);
    setImprovements([]);
  };

  // Al abrir: foco en el cartel y Esc para cerrar
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markSeen(swimmerId, improvements);
        setImprovements([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, improvements, swimmerId]);

  if (!open) return null;

  const total = improvements.reduce((sum, i) => sum + i.improvedByMs, 0);
  const [first] = improvements;
  const headline =
    improvements.length === 1 && first
      ? `Bajaste ${seconds(first.improvedByMs)} en ${first.eventLabel}`
      : `Mejoraste en ${improvements.length} pruebas`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pool-950/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="felicitaciones-titulo"
        className="w-full max-w-md rounded-3xl border border-aqua-400/30 bg-pool-900 p-6 text-center shadow-2xl shadow-aqua-500/20 sm:p-8"
      >
        <div aria-hidden="true" className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/15 text-3xl motion-safe:animate-bounce">
          🏆
        </div>
        <h2 id="felicitaciones-titulo" className="text-2xl font-black text-white">
          ¡Felicitaciones, {firstName}!
        </h2>
        <p aria-live="polite" className="mt-2 text-lg font-bold text-aqua-300">{headline}</p>

        <ul className="mt-5 max-h-64 space-y-2 overflow-y-auto text-left">
          {improvements.map((i) => (
            <li key={i.key} className="rounded-xl border border-pool-700/50 bg-pool-800/40 px-4 py-3">
              <p className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  {i.eventLabel} <span className="text-xs font-normal text-pool-400">· pileta {i.pool === 'P25' ? '25 m' : '50 m'}</span>
                </span>
                <span
                  aria-label={`bajó ${seconds(i.improvedByMs)}`}
                  className="whitespace-nowrap rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-bold tabular-nums text-emerald-400"
                >
                  ▼ -{seconds(i.improvedByMs)}
                </span>
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-pool-300">
                {formatTime(i.previousMs)} <span aria-hidden="true">→</span>{' '}
                <span className="font-bold text-aqua-300">{formatTime(i.newMs)}</span>
              </p>
              <p className="text-xs text-pool-400">{i.tournamentName} · nueva mejor marca</p>
            </li>
          ))}
        </ul>

        {improvements.length > 1 && (
          <p className="mt-4 text-sm text-pool-300">
            En total bajaste <span className="font-bold text-emerald-400">{seconds(total)}</span>.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="rounded-xl bg-aqua-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-aqua-500"
          >
            Ver mi progreso
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-pool-600 px-5 py-2.5 text-sm font-semibold text-pool-200 transition-colors hover:text-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
