'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, SystemRole } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles: SystemRole[];
  redirectTo?: string;
}

export function AuthGuard({ children, allowedRoles, redirectTo = '/login' }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      void router.replace(redirectTo);
      return;
    }
    if (!allowedRoles.includes(user.primaryRole)) {
      // Redirigir al dashboard propio del rol
      if (user.primaryRole === 'ADMIN' || user.primaryRole === 'SUPER_ADMIN') void router.replace('/admin');
      else if (user.primaryRole === 'COACH') void router.replace('/entrenador');
      else if (user.primaryRole === 'SWIMMER') void router.replace('/nadador');
      else void router.replace('/');
    }
  }, [user, isLoading, allowedRoles, redirectTo, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <WaveSpinner />
          <p className="text-sm text-slate-400">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.primaryRole)) {
    return null;
  }

  return <>{children}</>;
}

function WaveSpinner() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="animate-pulse">
      <circle cx="20" cy="20" r="18" fill="#0096c7" fillOpacity="0.12" />
      <path d="M8 22c2-3 4-5 6-5s4 4 6 4 4-4 6-4 4 2 6 5" stroke="#00b4d8" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
