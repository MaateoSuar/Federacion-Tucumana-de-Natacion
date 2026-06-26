'use client';

import { useRef, useState, useCallback } from 'react';

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const ACCEPTED_EXT  = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const MAX_MB        = 5;
const MAX_BYTES     = MAX_MB * 1024 * 1024;
const API_BASE      = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  shape?: 'square' | 'circle';
  token?: string; // JWT para autenticación
}

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ACCEPTED_MIME.includes(file.type))
    return `Tipo no permitido: "${file.type}". Solo JPG, PNG, WebP, GIF o SVG.`;
  if (!ACCEPTED_EXT.includes(ext))
    return `Extensión no permitida: "${ext}".`;
  if (file.size > MAX_BYTES)
    return `El archivo pesa más de ${MAX_MB} MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  return null;
}

export default function ImageUpload({ value, onChange, label = 'Imagen', shape = 'square', token }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [preview, setPreview]     = useState<string>(value);

  const upload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) { setError(validationError); return; }

    setError(null);
    setUploading(true);

    // Preview local inmediato
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const body = new FormData();
      body.append('file', file);

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/upload/image`, { method: 'POST', headers, body });
      const data = (await res.json()) as { url?: string; message?: string };

      if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`);
      if (!data.url) throw new Error('Respuesta inesperada del servidor.');

      const fullUrl = data.url.startsWith('http') ? data.url : `${API_BASE}${data.url}`;
      setPreview(fullUrl);
      onChange(fullUrl);
    } catch (e) {
      setError((e as Error).message);
      setPreview(value); // revertir preview
    } finally {
      setUploading(false);
    }
  }, [onChange, token, value]);

  /* ── Drag & Drop handlers ── */
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = ()                    => setDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  };
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    e.target.value = '';
  };

  const previewClass = shape === 'circle'
    ? 'w-24 h-24 rounded-full object-cover'
    : 'w-24 h-24 rounded-xl object-contain p-1';

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3
          border-2 border-dashed rounded-xl px-6 py-6 cursor-pointer
          transition-all duration-200 select-none
          ${dragging  ? 'border-aqua-400 bg-aqua-50/60 scale-[1.01]' : 'border-gray-200 bg-gray-50 hover:border-pool-400 hover:bg-pool-50/30'}
          ${uploading ? 'opacity-60 cursor-wait' : ''}
        `}
      >
        {/* Preview */}
        {preview ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="preview" className={previewClass} />
            {!uploading && (
              <span className="text-xs text-pool-600 font-medium">
                Clic o arrastrá para reemplazar
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <UploadIcon dragging={dragging} />
            <p className="text-sm font-medium text-gray-600">
              {dragging ? 'Soltá la imagen aquí' : 'Arrastrá una imagen o hacé clic'}
            </p>
            <p className="text-xs text-gray-400">
              JPG · PNG · WebP · GIF · SVG — máx. {MAX_MB} MB
            </p>
          </div>
        )}

        {/* Spinner de carga */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm">
            <svg className="w-8 h-8 text-aqua-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_MIME.join(',')}
          onChange={onFileInput}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-red-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Éxito — URL guardada */}
      {value && !error && !uploading && (
        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Imagen cargada correctamente
        </p>
      )}
    </div>
  );
}

function UploadIcon({ dragging }: { dragging: boolean }) {
  return (
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
      dragging ? 'bg-aqua-100 text-aqua-600' : 'bg-gray-100 text-gray-400'
    }`}>
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    </div>
  );
}
