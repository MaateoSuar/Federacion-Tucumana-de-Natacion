'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { SwimmerNameLink } from '@/components/SwimmerNameLink';
import type { DayFile, SembradoRow, ResultadoRow } from '@/lib/api';
import { formatTime } from '@/lib/formatTime';
import { searchPrueba } from '@/lib/search';
import { formatEventNos, groupResultados, type ResultadoPruebaGroup } from '@/lib/file-results';
import { PodiumButton, PodiumModal, type PodiumOption } from '@/components/ui/PodiumModal';
import {
  matchesPruebaFilter, pruebaFilterOptions, STROKE_LABEL, categoryOfLabel, categoryOptions,
  type PruebaFilter, type PruebaStroke,
} from '@/lib/prueba-label';
import { standardsMetByFileResult, type StandardsTable } from '@/lib/standards-match';
import { rankPodium } from '@/lib/podium';
import { Podium } from '@/components/ui/Podium';
import { MedalIcon, positionClass } from '@/components/ui/MedalIcon';

// Mismo esquema de puntos que la página oficial de resultados por prueba — puesto 1º a 8º.
const POINTS = [9, 7, 6, 5, 4, 3, 2, 1];
function getPoints(position: number): number | null {
  return POINTS[position - 1] ?? null;
}

/** Navegación "encontrar nadador/a": cuenta coincidencias de nombre y permite saltar entre ellas con flechas. */
function SwimmerMatchNav({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 mb-3 bg-aqua-500/10 border border-aqua-500/30 rounded-lg px-3 py-1.5">
      <span className="text-xs text-aqua-200">Coincidencias resaltadas</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Coincidencia anterior"
          className="text-aqua-300 hover:text-white transition-colors text-sm leading-none px-1"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-aqua-200 tabular-nums">{index + 1}/{total}</span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Siguiente coincidencia"
          className="text-aqua-300 hover:text-white transition-colors text-sm leading-none px-1"
        >
          ›
        </button>
      </div>
    </div>
  );
}

const PLACE_LABEL: Record<string, string> = { DSQ: 'DSC', DNS: 'NP', DNF: 'NF' };

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Grid fijo (mismas columnas para el header y cada fila) — así las series de una misma
// prueba quedan alineadas entre sí, sin depender del ancho de contenido de cada una.
const SEMBRADO_GRID = 'grid grid-cols-[2.5rem_1.6fr_2.5rem_1fr_5.5rem]';
const RESULTADO_GRID = 'grid grid-cols-[3.25rem_1.6fr_0.9fr_5rem_5.5rem_3rem]';

type FileType = 'sembrados' | 'resultados';

// Fila que coincide con la búsqueda: se resalta sin cambiar su lugar ni su puesto.
const ROW_MATCH = 'bg-aqua-500/15 shadow-[inset_3px_0_0_0_rgb(72,202,228)]';
const ROW_CURRENT = 'bg-yellow-400/20 ring-2 ring-inset ring-yellow-400';

const NO_PRUEBA_FILTER: PruebaFilter = { stroke: '', distance: '' };
const SELECT_CLASS =
  'bg-pool-800/60 border border-pool-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-aqua-500 transition-colors';

/** Buscador + selectores de estilo, distancia y categoría, con las opciones que existen en el archivo. */
function PruebaFilterBar({
  labels, value, onChange, category, onCategory, search, onSearch, placeholder,
}: {
  labels: string[]; value: PruebaFilter; onChange: (next: PruebaFilter) => void;
  category: string; onCategory: (next: string) => void;
  search: string; onSearch: (next: string) => void; placeholder: string;
}) {
  const options = useMemo(() => pruebaFilterOptions(labels), [labels]);
  const categories = useMemo(() => categoryOptions(labels), [labels]);
  const active = value.stroke !== '' || value.distance !== '' || category !== '' || search !== '';
  return (
    <div className="mb-3 rounded-2xl border border-pool-700/50 bg-pool-900/60 p-3 space-y-2.5">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pool-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          aria-label="Buscar por prueba o nadador/a"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-pool-800/60 border border-pool-700/50 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-pool-500 focus:outline-none focus:border-aqua-500 transition-colors"
        />
        {search && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => onSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-pool-500 hover:text-white transition-colors"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {options.strokes.length > 1 && (
          <select
            aria-label="Estilo"
            value={value.stroke}
            onChange={(e) => onChange({ ...value, stroke: e.target.value as PruebaStroke | '' })}
            className={`${SELECT_CLASS} flex-1 min-w-[9rem]`}
          >
            <option value="">Todos los estilos</option>
            {options.strokes.map((st) => <option key={st} value={st}>{STROKE_LABEL[st]}</option>)}
          </select>
        )}
        {options.distances.length > 1 && (
          <select
            aria-label="Distancia"
            value={value.distance}
            onChange={(e) => onChange({ ...value, distance: e.target.value === '' ? '' : Number(e.target.value) })}
            className={`${SELECT_CLASS} flex-1 min-w-[9rem]`}
          >
            <option value="">Todas las distancias</option>
            {options.distances.map((d) => <option key={d} value={d}>{d} m</option>)}
          </select>
        )}
        {categories.length > 1 && (
          <select
            aria-label="Categoría"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
            className={`${SELECT_CLASS} flex-1 min-w-[9rem]`}
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {active && (
          <button
            type="button"
            onClick={() => { onChange(NO_PRUEBA_FILTER); onCategory(''); onSearch(''); }}
            className="text-xs font-semibold text-aqua-300 hover:text-white transition-colors px-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

/** Sembrados y Resultados por jornada — vista pública, sin login. */
export function DayFilesPanel({
  dayFiles, totalDays, standards = null,
}: { dayFiles: DayFile[]; totalDays: number; standards?: StandardsTable | null }) {
  const [fileType, setFileType] = useState<FileType>('sembrados');
  const [day, setDay] = useState<number | null>(null); // null = "Todas"

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  // Si se subió el archivo "General" de este tipo (todo el torneo junto), se muestra solo
  // ese: las Jornadas serían el mismo contenido repetido en partes.
  const generalOnly = dayFiles.some((f) => f.type === fileType && f.dayNumber === 0);

  const filtered = useMemo(() => {
    const ofType = dayFiles.filter((f) => f.type === fileType);
    if (generalOnly) return ofType.filter((f) => f.dayNumber === 0);
    return ofType.filter((f) => day === null || f.dayNumber === day);
  }, [dayFiles, fileType, day, generalOnly]);

  if (dayFiles.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-4">Sembrados y Resultados</h2>

      {/* Tabs Sembrados / Resultados */}
      <div className="flex gap-2 mb-4">
        {(['sembrados', 'resultados'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFileType(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              fileType === t
                ? 'bg-aqua-500 text-white'
                : 'bg-pool-800/40 border border-pool-700/40 text-pool-300 hover:text-white'
            }`}
          >
            {t === 'sembrados' ? 'Sembrados' : 'Resultados'}
          </button>
        ))}
      </div>

      {/* Selector de jornada */}
      {totalDays > 1 && !generalOnly && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-pool-500 text-xs font-semibold mr-1">Jornada:</span>
          <button
            onClick={() => setDay(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
              day === null ? 'bg-aqua-500 text-white border-aqua-500' : 'border-pool-700/50 text-pool-400 hover:text-white'
            }`}
          >
            Todas
          </button>
          {days.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                day === d ? 'bg-aqua-500 text-white border-aqua-500' : 'border-pool-700/50 text-pool-400 hover:text-white'
              }`}
            >
              Jornada {d}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-pool-400 text-sm py-6 text-center bg-pool-800/30 border border-pool-700/30 rounded-2xl">
          Sin {fileType === 'sembrados' ? 'sembrados' : 'resultados'} subidos {day === null ? 'todavía' : 'para esta jornada'}.
        </p>
      ) : (
        <div className="space-y-6">
          {filtered.map((f) => (
            <div key={f.id}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-white text-sm font-semibold">{f.title}</p>
                  <p className="text-pool-500 text-xs">
                    {totalDays > 1 && !generalOnly && `Jornada ${f.dayNumber} · `}
                    {new Date(f.createdAt).toLocaleDateString('es-AR')}
                  </p>
                </div>
                <a
                  href={`${API}${f.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-aqua-400 hover:text-aqua-300 text-xs font-semibold shrink-0"
                >
                  Descargar archivo →
                </a>
              </div>
              {f.parsedRows && f.parsedRows.length > 0 && (
                f.type === 'sembrados'
                  ? <SembradosTablePublic rows={f.parsedRows as SembradoRow[]} />
                  : <ResultadosListPublic rows={f.parsedRows as ResultadoRow[]} standards={standards} fileId={f.id} dayNumber={f.dayNumber} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SembradosTablePublic({ rows }: { rows: SembradoRow[] }) {
  const [search, setSearch] = useState('');
  const [pruebaFilter, setPruebaFilter] = useState<PruebaFilter>(NO_PRUEBA_FILTER);
  const [category, setCategory] = useState('');
  const labels = useMemo(() => Array.from(new Set(rows.map((r) => r.eventLabel))), [rows]);
  const [matchIndex, setMatchIndex] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const totalGroups = useMemo(() => new Set(rows.map((r) => r.eventNo)).size, [rows]);

  // El buscador elige QUÉ pruebas se muestran (las que coinciden por nombre o donde nada
  // el nadador/club buscado). Cada prueba se ve siempre completa; las filas que coinciden
  // se resaltan. La lógica está en lib/search.ts.
  const { filtered, nameMatches } = useMemo(() => {
    const events = Array.from(new Set(rows.map((r) => r.eventNo))).sort((a, b) => a - b);
    const matchKeys: string[] = [];
    const visible = events.flatMap((eventNo) => {
      const allRows = rows.filter((r) => r.eventNo === eventNo);
      const eventLabel = allRows[0]?.eventLabel ?? '';
      if (category && categoryOfLabel(eventLabel) !== category) return [];
      if (!matchesPruebaFilter(eventLabel, pruebaFilter)) return [];
      const hit = searchPrueba(`Prueba ${eventNo} ${eventLabel}`, allRows.map((r) => `${r.swimmerName} ${r.club}`), search);
      if (!hit.visible) return [];
      // Mismo orden en que se dibujan: por serie y carril
      allRows
        .filter((_, i) => hit.highlighted[i] === true)
        .sort((a, b) => a.heatNo - b.heatNo || a.lane - b.lane)
        .forEach((r) => matchKeys.push(`${eventNo}::${r.heatNo}::${r.lane}`));
      return [{ eventNo, eventLabel, rows: allRows }];
    });
    return { filtered: visible, nameMatches: matchKeys };
  }, [rows, category, pruebaFilter, search]);
  const matchSet = useMemo(() => new Set(nameMatches), [nameMatches]);

  useEffect(() => setMatchIndex(0), [search]);

  useEffect(() => {
    if (nameMatches.length === 0) return;
    const key = nameMatches[matchIndex % nameMatches.length];
    const el = key ? rowRefs.current.get(key) : undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchIndex, nameMatches]);

  const currentMatchKey = nameMatches[matchIndex % nameMatches.length];

  return (
    <div>
      <div className="sticky top-14 z-20 bg-pool-950 pt-1 pb-2">
        <PruebaFilterBar
          labels={labels} value={pruebaFilter} onChange={setPruebaFilter}
          category={category} onCategory={setCategory}
          search={search} onSearch={setSearch}
          placeholder="Buscar nadador/a o prueba (ej: Perez, 100 libre)..."
        />

        <SwimmerMatchNav
          index={matchIndex % Math.max(nameMatches.length, 1)}
          total={nameMatches.length}
          onPrev={() => setMatchIndex((i) => (i - 1 + nameMatches.length) % nameMatches.length)}
          onNext={() => setMatchIndex((i) => (i + 1) % nameMatches.length)}
        />

        {(search || pruebaFilter.stroke !== '' || pruebaFilter.distance !== '' || category !== '') && (
          <p className="text-pool-500 text-xs">{filtered.length} de {totalGroups} pruebas</p>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-pool-400 text-sm py-6 text-center">
          {search ? <>Sin resultados para &ldquo;{search}&rdquo;</> : 'No hay pruebas con esos filtros.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ eventNo, eventLabel, rows: eventRows }) => {
            const heats = Array.from(new Set(eventRows.map((r) => r.heatNo))).sort((a, b) => a - b);
            return (
              <div key={eventNo} className="bg-pool-800/40 border border-pool-700/40 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-pool-900/40 border-b border-pool-700/40">
                  <span className="font-semibold text-white text-sm">Prueba {eventNo}</span>
                  <span className="text-xs text-pool-400 ml-2">{eventLabel}</span>
                </div>
                {/* Header de columnas — una sola vez por prueba, mismo grid que las filas para que quede alineado entre series */}
                <div className={`${SEMBRADO_GRID} gap-2 px-4 py-1.5 text-pool-500 text-[11px] font-medium uppercase tracking-wide border-b border-pool-700/40`}>
                  <span className="min-w-0 truncate">Carril</span>
                  <span className="min-w-0 truncate">Nadador/a</span>
                  <span className="min-w-0 truncate">Edad</span>
                  <span className="min-w-0 truncate">Club</span>
                  <span className="min-w-0 truncate text-right">Sembrado</span>
                </div>
                {heats.map((heatNo) => (
                  <div key={heatNo} className="border-b border-pool-700/20 last:border-0">
                    <div className="px-4 py-1.5 bg-aqua-500/5 text-xs font-semibold text-aqua-300">
                      Serie {heatNo}
                    </div>
                    <div className="divide-y divide-pool-700/10">
                      {eventRows.filter((r) => r.heatNo === heatNo).sort((a, b) => a.lane - b.lane).map((r, i) => {
                        const key = `${eventNo}::${r.heatNo}::${r.lane}`;
                        const isCurrent = key === currentMatchKey;
                        return (
                          <div
                            key={i}
                            ref={(el) => {
                              if (el) rowRefs.current.set(key, el);
                              else rowRefs.current.delete(key);
                            }}
                            className={`${SEMBRADO_GRID} gap-2 px-4 py-1.5 text-xs items-center transition-colors ${isCurrent ? ROW_CURRENT : matchSet.has(key) ? ROW_MATCH : ''}`}
                          >
                            <span className="min-w-0 truncate font-bold text-aqua-300">{r.lane}</span>
                            <SwimmerNameLink
                              name={r.swimmerName}
                              className="min-w-0 truncate text-pool-100 hover:text-aqua-300 transition-colors"
                            />
                            <span className="min-w-0 truncate text-pool-400">{r.age ?? '—'}</span>
                            <span className="min-w-0 truncate text-pool-400">{r.club}</span>
                            <span className="min-w-0 truncate font-mono text-pool-300 text-right">
                              {r.seedTimeMs === null ? '—' : formatTime(r.seedTimeMs)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compara el tiempo final contra el sembrado (inscripción) para mostrar si el nadador
// bajó (mejoró) o subió (empeoró) su marca — el archivo de resultados trae ambos tiempos.
function TimeDelta({ seedMs, finalMs }: { seedMs: number | null; finalMs: number | null }) {
  if (seedMs === null || finalMs === null || seedMs === finalMs) return null;
  const improved = finalMs < seedMs;
  return (
    <span className={improved ? 'text-green-400' : 'text-red-400'} title={improved ? 'Bajó el tiempo' : 'Subió el tiempo'}>
      {improved ? '▼' : '▲'}
    </span>
  );
}

/** Resultados divididos por prueba, con buscador (por prueba o por nadador) y detalle por categoría al hacer click. */
// Chip de marca básica cumplida. Color según el token configurado en el set.
const STANDARD_CHIP: Record<string, string> = {
  sky: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
};
const STANDARD_CHIP_DEFAULT = 'bg-aqua-500/15 text-aqua-300 border-aqua-400/40';

function ResultadosListPublic({
  rows, standards, fileId, dayNumber,
}: { rows: ResultadoRow[]; standards: StandardsTable | null; fileId: string; dayNumber: number }) {
  const { id: tournamentId } = useParams<{ id: string }>();
  const [podiumFor, setPodiumFor] = useState<{ title: string; options: PodiumOption[] } | null>(null);
  const [search, setSearch] = useState('');
  const [pruebaFilter, setPruebaFilter] = useState<PruebaFilter>(NO_PRUEBA_FILTER);
  const [category, setCategory] = useState('');
  const labels = useMemo(() => Array.from(new Set(rows.map((r) => r.eventLabel))), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [matchIndex, setMatchIndex] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const groups = useMemo(() => groupResultados(rows), [rows]);

  // El buscador elige QUÉ pruebas se muestran; cada una se ve completa, con todos los
  // nadadores y sus puestos reales, y las filas que coinciden quedan resaltadas.
  // El selector de categoría sí acota las categorías visibles (es un filtro, no una búsqueda).
  const { filtered, nameMatches } = useMemo(() => {
    const matchKeys: string[] = [];
    const visible = groups.flatMap<ResultadoPruebaGroup>((g) => {
      if (!matchesPruebaFilter(g.title, pruebaFilter)) return [];
      const categories = g.categories.filter((c) => !category || c.category === category);
      if (categories.length === 0) return [];
      const flat = categories.flatMap((c, catIdx) => c.rows.map(({ row }, i) => ({ row, key: `${g.key}::${catIdx}::${i}` })));
      const hit = searchPrueba(
        `${formatEventNos(g.eventNos)} ${g.title}`,
        flat.map(({ row }) => `${row.swimmerName} ${row.club}`),
        search,
      );
      if (!hit.visible) return [];
      flat.forEach(({ key }, i) => { if (hit.highlighted[i]) matchKeys.push(key); });
      return [{ ...g, categories, allRows: flat.map(({ row }) => row) }];
    });
    return { filtered: visible, nameMatches: matchKeys };
  }, [groups, category, pruebaFilter, search]);
  const matchSet = useMemo(() => new Set(nameMatches), [nameMatches]);

  const openPodium = (g: ResultadoPruebaGroup) => {
    const base = `/torneos/${encodeURIComponent(tournamentId)}/podio-archivo?day=${dayNumber}&fileId=${encodeURIComponent(fileId)}&prueba=${encodeURIComponent(g.key)}`;
    const options = g.categories
      .filter((c) => c.rows.some(({ row }) => row.finalTimeMs !== null))
      .map((c, i) => ({ id: `${i}-${c.category}`, label: c.category, imageUrl: `${base}&cat=${encodeURIComponent(c.category)}` }));
    setPodiumFor({ title: g.title, options });
  };

  const isSearching = search.trim().length > 0;

  useEffect(() => setMatchIndex(0), [search]);

  useEffect(() => {
    if (nameMatches.length === 0) return;
    const key = nameMatches[matchIndex % nameMatches.length];
    const el = key ? rowRefs.current.get(key) : undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchIndex, nameMatches]);

  const currentMatchKey = nameMatches[matchIndex % nameMatches.length];

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      {/* Sticky mientras se busca — así no hay que volver arriba para cambiar de coincidencia */}
      <div className="sticky top-14 z-20 bg-pool-950 pt-1 pb-2">
        <PruebaFilterBar
          labels={labels} value={pruebaFilter} onChange={setPruebaFilter}
          category={category} onCategory={setCategory}
          search={search} onSearch={setSearch}
          placeholder="Buscar nadador/a o prueba (ej: Perez, 100 libre)..."
        />

        <SwimmerMatchNav
          index={matchIndex % Math.max(nameMatches.length, 1)}
          total={nameMatches.length}
          onPrev={() => setMatchIndex((i) => (i - 1 + nameMatches.length) % nameMatches.length)}
          onNext={() => setMatchIndex((i) => (i + 1) % nameMatches.length)}
        />

        {(search || pruebaFilter.stroke !== '' || pruebaFilter.distance !== '' || category !== '') && (
          <p className="text-pool-500 text-xs">{filtered.length} de {groups.length} pruebas</p>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-pool-400 text-sm py-6 text-center">
          {search ? <>Sin resultados para &ldquo;{search}&rdquo;</> : 'No hay pruebas con esos filtros.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => {
            const { key: groupKey, title, eventNos, categories, allRows } = group;
            const open = isSearching || expanded.has(groupKey);
            return (
              <div key={groupKey} className="bg-pool-800/40 border border-pool-700/40 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 bg-pool-900/40 pr-3">
                <button
                  onClick={() => toggle(groupKey)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-pool-900/60 text-left transition-colors"
                >
                  <span className="min-w-0">
                    <span className="font-semibold text-white text-sm">{title}</span>
                    <span className="text-xs text-pool-400 ml-2">{formatEventNos(eventNos)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-pool-500 text-xs shrink-0">
                    {allRows.length} nadador{allRows.length !== 1 ? 'es' : ''}
                    <svg
                      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                <PodiumButton onClick={() => openPodium(group)} />
                </div>
                {open && (
                  <div className="border-t border-pool-700/40">
                    {/* Header de columnas — una sola vez por prueba, mismo grid que las filas */}
                    <div className={`${RESULTADO_GRID} gap-2 px-4 py-1.5 text-pool-500 text-[11px] font-medium uppercase tracking-wide border-b border-pool-700/40`}>
                      <span className="min-w-0 truncate">Puesto</span>
                      <span className="min-w-0 truncate">Nadador/a</span>
                      <span className="min-w-0 truncate">Club</span>
                      <span className="min-w-0 truncate text-right">Sembrado</span>
                      <span className="min-w-0 truncate text-right">Final</span>
                      <span className="min-w-0 truncate text-right">Pts</span>
                    </div>
                    {categories.map(({ category, rows: catRows }, catIdx) => (
                      <div key={catIdx} className="border-b border-pool-700/20 last:border-0">
                        {category && (
                          <div className="px-4 py-1.5 bg-aqua-500/5 text-xs font-semibold text-aqua-300">
                            {category}
                          </div>
                        )}
                        {/* Podio de la categoría: los tres primeros, por más nadadores que haya */}
                        <div className="px-3 pt-3 empty:hidden">
                          <Podium
                            entries={rankPodium(
                              catRows.map(({ row }) => ({ swimmerName: row.swimmerName, clubName: row.club, timeMs: row.finalTimeMs })),
                            )}
                          />
                        </div>
                        <div className="divide-y divide-pool-700/10">
                          {catRows.map(({ row: r, displayPlace }, i) => {
                            const key = `${groupKey}::${catIdx}::${i}`;
                            const isCurrent = key === currentMatchKey;
                            const pts = displayPlace != null ? getPoints(displayPlace) : null;
                            return (
                              <div
                                key={i}
                                ref={(el) => {
                                  if (el) rowRefs.current.set(key, el);
                                  else rowRefs.current.delete(key);
                                }}
                                className={`${RESULTADO_GRID} gap-2 px-4 py-2 text-xs items-center transition-colors ${
                                  isCurrent
                                    ? ROW_CURRENT
                                    : matchSet.has(key)
                                    ? ROW_MATCH
                                    : displayPlace != null
                                    ? positionClass(displayPlace)
                                    : ''
                                }`}
                              >
                                <span className="min-w-0">
                                  {displayPlace != null ? <MedalIcon position={displayPlace} /> : (
                                    <span className="font-bold text-aqua-300">{PLACE_LABEL[r.status] ?? '—'}</span>
                                  )}
                                </span>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <SwimmerNameLink
                                    name={r.swimmerName}
                                    className="min-w-0 truncate text-pool-100 hover:text-aqua-300 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  {/* Marcas básicas que cumple (orientativo: resultado todavía no oficial) */}
                                  {standardsMetByFileResult(r, standards).map((set) => (
                                    <span
                                      key={set.setId}
                                      title={`Cumple la ${set.name} para su edad (dato orientativo: resultado no oficial)`}
                                      className={`shrink-0 rounded border px-1 py-px text-[9px] font-bold tracking-wide ${STANDARD_CHIP[set.color] ?? STANDARD_CHIP_DEFAULT}`}
                                    >
                                      {set.shortLabel}
                                    </span>
                                  ))}
                                </span>
                                <span className="min-w-0 truncate text-pool-400">{r.club}</span>
                                <span className="min-w-0 truncate font-mono text-pool-400 text-right">
                                  {r.seedTimeMs === null ? '—' : formatTime(r.seedTimeMs)}
                                </span>
                                <span className="min-w-0 truncate font-mono font-bold text-aqua-200 text-right flex items-center justify-end gap-1.5">
                                  <TimeDelta seedMs={r.seedTimeMs} finalMs={r.finalTimeMs} />
                                  {r.finalTimeMs === null ? (PLACE_LABEL[r.status] ?? '—') : formatTime(r.finalTimeMs)}
                                </span>
                                <span className="min-w-0 truncate text-right">
                                  {pts != null ? (
                                    <span className="font-bold text-aqua-300 tabular-nums">{pts}</span>
                                  ) : (
                                    <span className="text-pool-600 text-xs">—</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {podiumFor && (
        <PodiumModal title={podiumFor.title} options={podiumFor.options} onClose={() => setPodiumFor(null)} />
      )}
    </div>
  );
}
