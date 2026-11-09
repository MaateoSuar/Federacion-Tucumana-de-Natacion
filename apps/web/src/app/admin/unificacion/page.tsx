'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface DuplicateCandidate {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  shortName?: string;
  gender?: string;
  birthDate?: string | null;
  currentClub?: { id: string; name: string; shortName: string } | null;
  locality?: string;
  resultCount?: number;
  swimmerCount?: number;
}

interface DuplicatePair {
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  score: number;
  reasons: string[];
}

type Tab = 'swimmers' | 'clubs';

function displayName(c: DuplicateCandidate): string {
  return c.firstName ? `${c.firstName} ${c.lastName}` : (c.name ?? '');
}

function SubTitle(c: DuplicateCandidate) {
  const parts: string[] = [];
  if (c.gender) parts.push(c.gender === 'M' ? 'Masculino' : 'Femenino');
  if (c.birthDate) parts.push(c.birthDate.slice(0, 4));
  if (c.currentClub) parts.push(c.currentClub.shortName);
  if (c.locality) parts.push(c.locality);
  if (c.shortName) parts.push(`(${c.shortName})`);
  if (c.resultCount != null) parts.push(`${c.resultCount} resultados`);
  if (c.swimmerCount != null) parts.push(`${c.swimmerCount} nadadores`);
  return parts.join(' · ');
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? 'text-red-400 bg-red-500/10 border-red-500/30'
    : pct >= 70 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    : 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}>
      {pct}% coincidencia
    </span>
  );
}

export default function UnificacionPage() {
  const [tab, setTab] = useState<Tab>('swimmers');
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [confirmPair, setConfirmPair] = useState<{ pair: DuplicatePair; canonicalId: string } | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = t === 'swimmers' ? '/admin/merge/swimmers/duplicates' : '/admin/merge/clubs/duplicates';
      const data = await apiFetch<DuplicatePair[]>(endpoint);
      setPairs(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setPairs([]);
    setError(null);
    void load(t);
  };

  const handleMerge = async () => {
    if (!confirmPair) return;
    const { pair, canonicalId } = confirmPair;
    const duplicateId = pair.a.id === canonicalId ? pair.b.id : pair.a.id;
    const pairKey = `${pair.a.id}|${pair.b.id}`;
    setMerging(pairKey);
    setConfirmPair(null);
    try {
      const endpoint = tab === 'swimmers'
        ? `/admin/merge/swimmers/${canonicalId}/merge/${duplicateId}`
        : `/admin/merge/clubs/${canonicalId}/merge/${duplicateId}`;
      await apiFetch(endpoint, { method: 'POST' });
      setMerged((prev) => new Set([...prev, pairKey]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMerging(null);
    }
  };

  const visiblePairs = pairs.filter((p) => !merged.has(`${p.a.id}|${p.b.id}`));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Unificación de duplicados</h1>
        <p className="text-gray-500 text-sm mt-1">
          Fusioná registros repetidos. Elegí cuál es el canónico (el que queda) y el duplicado se absorbe.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['swimmers', 'clubs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'swimmers' ? '🏊 Nadadores' : '🏟 Clubes'}
          </button>
        ))}
        <button
          onClick={() => load(tab)}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-all"
        >
          {loading ? 'Buscando…' : 'Buscar duplicados'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && pairs.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">✅</div>
          <p className="font-medium">Presioná &quot;Buscar duplicados&quot; para analizar la base.</p>
        </div>
      )}

      {/* Lista de pares */}
      <div className="space-y-3">
        {visiblePairs.map((pair) => {
          const pairKey = `${pair.a.id}|${pair.b.id}`;
          const isMerging = merging === pairKey;

          return (
            <div key={pairKey} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <ScoreBadge score={pair.score} />
                  <span className="text-xs text-gray-500">{pair.reasons.join(', ')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-gray-100">
                {[pair.a, pair.b].map((candidate, idx) => {
                  const otherCanonicalId = idx === 0 ? pair.b.id : pair.a.id;
                  const thisCanonicalId = candidate.id;
                  return (
                    <div key={candidate.id} className="p-4">
                      <p className="font-semibold text-gray-900 text-sm">{displayName(candidate)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{SubTitle(candidate)}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={isMerging}
                          onClick={() => setConfirmPair({ pair, canonicalId: thisCanonicalId })}
                          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all"
                          title={`Mantener este y absorber ${displayName(idx === 0 ? pair.b : pair.a)}`}
                        >
                          ✓ Mantener este
                        </button>
                        <button
                          disabled={isMerging}
                          onClick={() => setConfirmPair({ pair, canonicalId: otherCanonicalId })}
                          className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-all"
                          title="Marcar este como duplicado (se elimina)"
                        >
                          ✗ Es duplicado
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isMerging && (
                <div className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-medium text-center">
                  Fusionando…
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de confirmación */}
      {confirmPair && (() => {
        const { pair, canonicalId } = confirmPair;
        const canonical = pair.a.id === canonicalId ? pair.a : pair.b;
        const duplicate = pair.a.id === canonicalId ? pair.b : pair.a;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmar fusión</h2>
              <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer desde la interfaz.</p>

              <div className="space-y-3 mb-6">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-0.5">Se mantiene (canónico)</p>
                  <p className="font-semibold text-gray-900 text-sm">{displayName(canonical)}</p>
                  <p className="text-xs text-gray-500">{SubTitle(canonical)}</p>
                </div>
                <div className="text-center text-gray-400 text-xs">↓ absorbe a ↓</div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">Se elimina (duplicado)</p>
                  <p className="font-semibold text-gray-900 text-sm">{displayName(duplicate)}</p>
                  <p className="text-xs text-gray-500">{SubTitle(duplicate)}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmPair(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleMerge()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-all"
                >
                  Sí, fusionar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
