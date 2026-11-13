'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Normaliza "APELLIDO, Nombre Nombre2" → "apellido nombre nombre2" para el matching. */
function normalize(name: string): string {
  return name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Props {
  name: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Muestra el nombre del nadador como un link clickeable.
 * Al hacer click busca al nadador por nombre en la API; si hay un único resultado
 * navega directo al perfil, si hay varios va a /nadadores?search=... como fallback.
 */
export function SwimmerNameLink({ name, className, onClick }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onClick?.(e);

    const q = normalize(name);
    if (!q) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/swimmers?search=${encodeURIComponent(q)}&limit=5`,
      );
      if (res.ok) {
        const data = await res.json() as { items: { id: string }[]; total: number };
        if (data.total === 1 && data.items[0]) {
          router.push(`/nadadores/${data.items[0].id}`);
          return;
        }
      }
    } catch {
      // Si falla el fetch, caemos al fallback
    } finally {
      setLoading(false);
    }

    // Fallback: ir a la página de búsqueda
    router.push(`/nadadores?search=${encodeURIComponent(normalize(name))}`);
  }

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={loading}
      className={`text-left disabled:opacity-60 ${className ?? ''}`}
    >
      {name}
    </button>
  );
}
