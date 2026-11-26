'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LinkRequestsReview } from '@/components/account-link/LinkRequestsReview';

export default function SolicitudesEntrenadorPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.primaryRole !== 'COACH')) void router.replace('/login');
  }, [user, isLoading, router]);

  if (isLoading || !user) return <div className="min-h-screen bg-pool-950" />;

  return (
    <div className="min-h-screen bg-pool-950 text-white">
      <nav className="border-b border-pool-800 px-6 md:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-md px-1.5 py-0.5">
            <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-7 w-auto" />
          </div>
          <span className="text-pool-500 text-xs">Entrenador</span>
        </div>
        <Link href="/entrenador" className="text-pool-400 hover:text-white text-sm transition-colors">← Volver a mi club</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Solicitudes de vinculación</h1>
        <p className="text-pool-400 text-sm mb-6">
          Nadadores de tu club cuyas familias crearon una cuenta y piden quedar vinculadas a su perfil.
          Solo ves y aprobás las de tu club.
        </p>
        <LinkRequestsReview variant="dark" />
      </main>
    </div>
  );
}
