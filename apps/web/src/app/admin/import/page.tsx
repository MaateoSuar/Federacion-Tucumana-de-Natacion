'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ftn_access_token');
}

export default function ImportPage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch(`${API}/import/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `Error ${res.status}`);
        }

        const { jobId } = (await res.json()) as { jobId: string; existing: boolean };
        router.push(`/admin/import/${jobId}/preview`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado al subir el archivo.');
      } finally {
        setUploading(false);
      }
    },
    [router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Importar resultados</h1>
        <p className="text-gray-500 text-sm mt-1">
          Subí un archivo PDF, HY3, CSV o Excel de Meet Manager para importar resultados a la base FTN.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center gap-4 cursor-pointer transition-all ${
          dragging
            ? 'border-aqua-400 bg-aqua-50'
            : 'border-gray-200 bg-white hover:border-aqua-300 hover:bg-slate-50'
        }`}
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
          dragging ? 'bg-aqua-100' : 'bg-slate-100'
        }`}>
          <svg className={`w-8 h-8 ${dragging ? 'text-aqua-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>

        <div className="text-center">
          <p className="font-semibold text-gray-700">
            {uploading ? 'Subiendo...' : 'Arrastrá el archivo acá'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            o <span className="text-aqua-600 font-medium">seleccioná desde tu computadora</span>
          </p>
          <p className="text-xs text-gray-300 mt-3">PDF · HY3 · CSV · XLSX — máx 20 MB</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.hy3,.sd3,.csv,.xlsx,.xls"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {uploading && (
        <div className="mt-6 flex items-center gap-3 p-4 bg-blue-50 rounded-xl text-blue-700">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Procesando archivo...
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Info */}
      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        {[
          { step: '1', label: 'Subís el archivo', desc: 'PDF, HY3, CSV o Excel de Meet Manager' },
          { step: '2', label: 'Revisás el preview', desc: 'Atletas nuevos, errores, warnings' },
          { step: '3', label: 'Confirmás', desc: 'Los resultados quedan en la base FTN' },
        ].map((s) => (
          <div key={s.step} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="w-7 h-7 rounded-full bg-aqua-100 text-aqua-700 text-xs font-bold flex items-center justify-center mx-auto mb-2">
              {s.step}
            </div>
            <p className="font-medium text-gray-800 text-sm">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
