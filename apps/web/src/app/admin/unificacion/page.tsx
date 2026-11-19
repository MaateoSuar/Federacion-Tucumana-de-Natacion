'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  province?: string | null;
  resultCount?: number;
  swimmerCount?: number;
}

interface DuplicatePair {
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  score: number;
  reasons: string[];
}

interface MergePreview {
  canonical: { id: string };
  duplicate: { id: string; hasAccount?: boolean };
  /** Cantidad de datos del duplicado que pasan al principal. */
  willMove: Record<string, number>;
  blockers: string[];
  warnings: string[];
}

interface MergeResponse {
  merged: boolean;
  moved?: Record<string, number>;
}

type Tab = 'swimmers' | 'clubs';

const MOVE_LABELS: Record<string, string> = {
  results: 'resultados',
  registrations: 'inscripciones',
  personalBests: 'mejores marcas',
  records: 'récords',
  rankings: 'rankings',
  rankingHistory: 'historial de rankings',
  clubHistory: 'historial de club',
  achievements: 'logros',
  aliases: 'alias',
  externalIds: 'identificadores externos',
  swimmers: 'nadadores',
  users: 'usuarios',
  coaches: 'entrenadores',
  tournamentsHosted: 'torneos como sede',
  affiliations: 'afiliaciones',
};

const pairKeyOf = (p: DuplicatePair) => `${p.a.id}|${p.b.id}`;

function displayName(c: DuplicateCandidate): string {
  return c.firstName ? `${c.firstName} ${c.lastName}` : (c.name ?? '');
}

function subTitle(c: DuplicateCandidate): string {
  const parts: string[] = [];
  if (c.gender) parts.push(c.gender === 'M' ? 'Masculino' : 'Femenino');
  if (c.birthDate) parts.push(c.birthDate.slice(0, 4));
  if (c.currentClub) parts.push(c.currentClub.shortName);
  if (c.locality) parts.push(c.locality);
  if (c.province) parts.push(c.province);
  if (c.shortName) parts.push(`(${c.shortName})`);
  if (c.resultCount != null) parts.push(`${c.resultCount} resultados`);
  if (c.swimmerCount != null) parts.push(`${c.swimmerCount} nadadores`);
  return parts.join(' · ');
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? 'text-red-600 bg-red-50 border-red-200'
    : pct >= 70 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-blue-600 bg-blue-50 border-blue-200';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}>
      {pct}% coincidencia
    </span>
  );
}

export default function UnificacionPage() {
  const [tab, setTab] = useState<Tab>('swimmers');
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Confirmación: qué par y cuál es el que queda; la vista previa se pide al abrir
  const [confirm, setConfirm] = useState<{ pair: DuplicatePair; canonicalId: string } | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Evita que una respuesta lenta de otra pestaña pise la lista actual
  const loadSeq = useRef(0);

  const load = useCallback(async (t: Tab) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setSlow(false);
    setListError(null);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const endpoint = t === 'swimmers' ? '/admin/merge/swimmers/duplicates' : '/admin/merge/clubs/duplicates';
      const data = await apiFetch<DuplicatePair[]>(`${endpoint}?limit=100`);
      if (seq !== loadSeq.current) return;
      setPairs(data);
      setLoaded(true);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setListError((e as Error).message);
    } finally {
      clearTimeout(slowTimer);
      if (seq === loadSeq.current) {
        setLoading(false);
        setSlow(false);
      }
    }
  }, []);

  useEffect(() => { void load('swimmers'); }, [load]);

  const handleTabChange = (t: Tab) => {
    if (t === tab) return;
    setTab(t);
    setPairs([]);
    setLoaded(false);
    setNotice(null);
    void load(t);
  };

  const entity = tab === 'swimmers' ? 'swimmers' : 'clubs';
  const mergeUrl = (canonicalId: string, duplicateId: string) => `/admin/merge/${entity}/${canonicalId}/merge/${duplicateId}`;

  const openConfirm = async (pair: DuplicatePair, canonicalId: string) => {
    const duplicateId = pair.a.id === canonicalId ? pair.b.id : pair.a.id;
    setConfirm({ pair, canonicalId });
    setPreview(null);
    setModalError(null);
    setPreviewLoading(true);
    try {
      setPreview(await apiFetch<MergePreview>(`${mergeUrl(canonicalId, duplicateId)}/preview`));
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeConfirm = () => {
    if (merging) return;
    setConfirm(null);
    setPreview(null);
    setModalError(null);
  };

  const handleMerge = async () => {
    if (!confirm || merging) return;
    const { pair, canonicalId } = confirm;
    const canonical = pair.a.id === canonicalId ? pair.a : pair.b;
    const duplicate = pair.a.id === canonicalId ? pair.b : pair.a;
    setMerging(true);
    setModalError(null);
    try {
      // Las advertencias ya se le mostraron al administrador en esta pantalla: se envía la confirmación
      await apiFetch<MergeResponse>(mergeUrl(canonicalId, duplicate.id), {
        method: 'POST',
        body: JSON.stringify({ acknowledgeWarnings: true }),
      });
      // El duplicado ya no existe: se sacan TODOS los pares donde aparece (un mismo registro
      // puede estar en varios pares; clicar en uno viejo daba error "no encontrado").
      setPairs((prev) => prev.filter((p) => p.a.id !== duplicate.id && p.b.id !== duplicate.id));
      setNotice(`Listo: "${displayName(duplicate)}" se unificó dentro de "${displayName(canonical)}".`);
      setConfirm(null);
      setPreview(null);
    } catch (e) {
      const message = (e as Error).message;
      setModalError(message);
      // Si alguno ya no existe, la lista quedó vieja: se refresca para no mostrar pares fantasma.
      if (/ya no existe|no encontrado/i.test(message)) void load(tab);
    } finally {
      setMerging(false);
    }
  };

  const blocked = (preview?.blockers.length ?? 0) > 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Unificación de duplicados</h1>
        <p className="text-gray-500 text-sm mt-1">
          Fusioná registros repetidos. Elegí cuál es el principal (el que queda): el otro se absorbe y todo lo suyo pasa al principal.
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {(['swimmers', 'clubs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'swimmers' ? '🏊 Nadadores' : '🏟 Clubes'}
          </button>
        ))}
        <button
          onClick={() => void load(tab)}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-all"
        >
          {loading ? 'Buscando…' : 'Buscar de nuevo'}
        </button>
      </div>

      {notice && (
        <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar aviso" className="text-green-700 hover:text-green-900">×</button>
        </div>
      )}

      {listError && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-3">
          <span>No se pudo cargar la lista: {listError}</span>
          <button onClick={() => void load(tab)} className="shrink-0 px-3 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700">
            Reintentar
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="font-medium">Buscando duplicados…</p>
          {slow && <p className="text-xs mt-2">El servidor estaba dormido o la base es grande; puede tardar hasta un minuto la primera vez.</p>}
        </div>
      )}

      {!loading && loaded && pairs.length === 0 && !listError && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">✅</div>
          <p className="font-medium">No hay posibles duplicados pendientes.</p>
        </div>
      )}

      <div className="space-y-3">
        {pairs.map((pair) => (
          <div key={pairKeyOf(pair)} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
              <ScoreBadge score={pair.score} />
              <span className="text-xs text-gray-500">{pair.reasons.join(', ')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-y sm:divide-y-0 divide-gray-100">
              {[pair.a, pair.b].map((candidate) => {
                const other = candidate.id === pair.a.id ? pair.b : pair.a;
                return (
                  <div key={candidate.id} className="p-4">
                    <p className="font-semibold text-gray-900 text-sm">{displayName(candidate)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{subTitle(candidate)}</p>
                    <button
                      disabled={merging}
                      onClick={() => void openConfirm(pair, candidate.id)}
                      className="mt-3 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all"
                      title={`Dejar este como principal y absorber a ${displayName(other)}`}
                    >
                      ✓ Dejar este y absorber al otro
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {confirm && (() => {
        const { pair, canonicalId } = confirm;
        const canonical = pair.a.id === canonicalId ? pair.a : pair.b;
        const duplicate = pair.a.id === canonicalId ? pair.b : pair.a;
        const moves = preview ? Object.entries(preview.willMove).filter(([, n]) => n > 0) : [];
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Confirmar unificación">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Confirmar unificación</h2>
              <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer desde la interfaz.</p>

              <div className="space-y-3 mb-4">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-0.5">Se mantiene (principal)</p>
                  <p className="font-semibold text-gray-900 text-sm">{displayName(canonical)}</p>
                  <p className="text-xs text-gray-500">{subTitle(canonical)}</p>
                </div>
                <div className="text-center text-gray-400 text-xs">↓ absorbe a ↓</div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-0.5">Se elimina (duplicado)</p>
                  <p className="font-semibold text-gray-900 text-sm">{displayName(duplicate)}</p>
                  <p className="text-xs text-gray-500">{subTitle(duplicate)}</p>
                </div>
              </div>

              {previewLoading && <p className="text-sm text-gray-400 mb-4">Calculando qué se va a mover…</p>}

              {preview && moves.length > 0 && (
                <p className="text-xs text-gray-600 mb-3">
                  Pasan al principal: {moves.map(([key, n]) => `${n} ${MOVE_LABELS[key] ?? key}`).join(', ')}.
                </p>
              )}

              {preview?.blockers.map((b) => (
                <div key={b} role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">⛔ {b}</div>
              ))}
              {preview?.warnings.map((w) => (
                <div key={w} className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">⚠️ {w}</div>
              ))}

              {modalError && (
                <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{modalError}</div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={closeConfirm}
                  disabled={merging}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleMerge()}
                  disabled={merging || previewLoading || blocked || !preview}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all"
                >
                  {merging ? 'Unificando…' : 'Sí, unificar'}
                </button>
              </div>
              {merging && <p className="text-xs text-gray-400 text-center mt-3">Puede tardar unos segundos si tiene muchos resultados. No cierres la página.</p>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
