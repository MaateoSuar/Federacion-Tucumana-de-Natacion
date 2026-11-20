'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

/** Solo lo ve el nadador dueño del perfil (su cuenta está vinculada a este nadador). */
export function OwnerEditButton({ swimmerId }: { swimmerId: string }) {
  const { user } = useAuth();
  if (!user || user.swimmerId !== swimmerId) return null;
  return (
    <Link
      href="/nadador/perfil"
      className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-aqua-500/40 bg-aqua-500/10 px-4 py-2 text-sm font-semibold text-aqua-300 transition-colors hover:bg-aqua-500/20 hover:text-aqua-200"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2.5 2.5 0 113.536 3.536L12.5 16.5 8 18l1-5z" />
      </svg>
      Editar mi perfil
    </Link>
  );
}
