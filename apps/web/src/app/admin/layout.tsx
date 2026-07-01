'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/lib/auth';

const navLinks = [
  {
    href: '/admin',
    label: 'Inicio',
    exactMatch: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/admin/clubes',
    label: 'Clubes',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/admin/nadadores',
    label: 'Nadadores',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="19" cy="6" r="2" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10l-2-2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 8c-3 1-7 1-11 3L4 9" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11l-2 5M12 10l0 5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 18c2-2 4 2 6 0s4-2 6 0 4 2 6 0" />
      </svg>
    ),
  },
  {
    href: '/admin/torneos',
    label: 'Torneos',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="15" r="5" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10L7 3h10l-2 7" />
      </svg>
    ),
  },
  {
    href: '/admin/records',
    label: 'Récords',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21l4-13 4 13M9 17h6M3 7l3-4 3 4M3 3v4h6" />
      </svg>
    ),
  },
];

function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    void router.push('/login');
  };

  return (
    <aside className="w-60 flex flex-col bg-pool-900 shadow-xl">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-pool-700/60">
        <Link href="/" className="flex flex-col items-center gap-2 group hover:opacity-90 transition-opacity">
          <div className="bg-white rounded-lg px-2 py-1">
            <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-9 w-auto" />
          </div>
          <span className="text-pool-400 text-[10px] font-semibold uppercase tracking-widest">
            Panel Administrador
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        <p className="text-pool-500 text-[10px] font-bold uppercase tracking-widest px-3 mb-3">
          Gestión
        </p>
        {navLinks.map((link) => {
          const active = link.exactMatch ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-aqua-500/20 text-aqua-300 border border-aqua-500/20'
                  : 'text-pool-300 hover:bg-pool-800 hover:text-white'
              }`}
            >
              <span className={active ? 'text-aqua-400' : 'text-pool-500'}>
                {link.icon}
              </span>
              {link.label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-aqua-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Usuario + logout */}
      <div className="border-t border-pool-700/60 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-aqua-500/20 border border-aqua-500/30 flex items-center justify-center text-aqua-300 text-xs font-bold uppercase">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-pool-500 text-[10px] truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-pool-400 hover:text-red-400 text-xs py-2 px-3 rounded-lg hover:bg-red-400/10 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
      </div>

      {/* Ola decorativa */}
      <div className="h-16 overflow-hidden opacity-10 pointer-events-none relative">
        <svg viewBox="0 0 240 64" className="absolute bottom-0 left-0 right-0 w-60">
          <path fill="#00b4d8" d="M0,32 C40,16 80,48 120,32 C160,16 200,48 240,32 L240,64 L0,64 Z" />
        </svg>
      </div>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const breadcrumbs = pathname.split('/').filter(Boolean).slice(1);

  return (
    <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="min-h-screen flex bg-slate-50">
        <AdminSidebar />

        <div className="flex-1 flex flex-col min-h-screen">
          {/* Top bar */}
          <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Admin</span>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="text-gray-200">/</span>
                  <span className={i === breadcrumbs.length - 1 ? 'text-gray-600 font-medium capitalize' : 'capitalize'}>
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-400">Sistema activo</span>
            </div>
          </header>

          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
