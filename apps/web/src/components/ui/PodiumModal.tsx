'use client';

import { useEffect, useRef, useState } from 'react';

export interface PodiumOption {
  id: string;
  /** Nombre de la categoría; '' si la prueba tiene una sola. */
  label: string;
  /** Dirección de la imagen, sin el formato: se le agrega &format=… (y &download=1 para guardar). */
  imageUrl: string;
}

const FORMATS = [['square', 'Cuadrada'], ['story', 'Historia']] as const;
type Format = (typeof FORMATS)[number][0];

const CHIP = 'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors';
const CHIP_ON = 'border-aqua-500 bg-aqua-500 text-white';
const CHIP_OFF = 'border-pool-700/60 text-pool-300 hover:text-white';

/** Botón "Ver podio" con el mismo aspecto en todas las vistas de resultados. */
export function PodiumButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 transition-colors ${className}`}
    >
      Ver podio
    </button>
  );
}

/**
 * Ventana emergente con la imagen del podio. La imagen solo se muestra: se guarda
 * únicamente si la persona toca "Descargar". Cierra con Escape, con clic afuera y con la X.
 * `options` en null = todavía cargando.
 */
export function PodiumModal({
  title, options, onClose,
}: { title: string; options: PodiumOption[] | null; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('square');
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  // onClose en una referencia: el efecto corre una sola vez y no le roba el foco a nadie
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const selected = options?.find((o) => o.id === selectedId) ?? options?.[0] ?? null;
  const src = selected ? `${selected.imageUrl}&format=${format}` : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Podio · ${title}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-pool-700/60 bg-pool-900 shadow-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-pool-700/50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">Podio</p>
            <p className="truncate text-sm font-semibold text-white">{title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-pool-300 hover:bg-pool-800 hover:text-white transition-colors"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {options === null ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-aqua-400 border-t-transparent" />
            </div>
          ) : !selected ? (
            <p className="py-10 text-center text-sm text-pool-300">
              Esta prueba todavía no tiene podio: hacen falta resultados oficiales con tiempo.
            </p>
          ) : (
            <>
              {options.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categoría">
                  {options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={o.id === selected.id}
                      onClick={() => setSelectedId(o.id)}
                      className={`${CHIP} ${o.id === selected.id ? CHIP_ON : CHIP_OFF}`}
                    >
                      {o.label || 'General'}
                    </button>
                  ))}
                </div>
              )}
              <div className={`relative mx-auto w-full overflow-hidden rounded-xl bg-pool-950 ${format === 'story' ? 'aspect-[9/16] max-w-[15rem]' : 'aspect-square'}`}>
                {loadedUrl !== src && failedUrl !== src && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-aqua-400 border-t-transparent" />
                  </div>
                )}
                {failedUrl === src ? (
                  <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-pool-300">
                    No se pudo armar la imagen del podio.
                  </p>
                ) : (
                  <img
                    key={src}
                    src={src}
                    alt={`Podio de ${title}${selected.label ? `, ${selected.label}` : ''}`}
                    className="h-full w-full object-contain"
                    onLoad={() => setLoadedUrl(src)}
                    onError={() => setFailedUrl(src)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {selected && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-pool-700/50 px-4 py-3">
            <div className="flex gap-1.5" role="group" aria-label="Formato de la imagen">
              {FORMATS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                  className={`${CHIP} ${format === f ? CHIP_ON : CHIP_OFF}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <a
              href={`${src}&download=1`}
              download
              className="rounded-lg bg-aqua-500 px-4 py-2 text-sm font-bold text-white hover:bg-aqua-400 transition-colors"
            >
              Descargar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
