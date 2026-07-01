'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, roleRedirect } from '@/lib/auth';

const NAV_LINKS = [
  { href: '/torneos',  label: 'Torneos'  },
  { href: '/rankings', label: 'Rankings' },
  { href: '/records',  label: 'Récords'  },
];

export function NavBar() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    void router.push('/login');
  };

  return (
    <nav className="sticky top-0 z-40 bg-pool-950/90 backdrop-blur border-b border-pool-800">
      <div className="max-w-6xl mx-auto px-4 md:px-8 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <div className="bg-white rounded-md px-2 py-0.5">
            <img src="/LogoPNGSinLetras.png" alt="FTN" className="h-9 w-auto" />
          </div>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className="px-3 py-1.5 rounded-lg text-sm text-pool-200 hover:text-white hover:bg-pool-800 transition-all">
              {l.label}
            </Link>
          ))}

          {!isLoading && (
            user ? (
              <div className="ml-2 flex items-center gap-2">
                <Link
                  href={roleRedirect(user.primaryRole)}
                  className="flex items-center gap-2 bg-pool-800 hover:bg-pool-700 border border-pool-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                >
                  <span className="w-5 h-5 rounded-full bg-aqua-500/30 border border-aqua-500/40 flex items-center justify-center text-aqua-300 text-[10px] font-bold uppercase">
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </span>
                  <span className="hidden sm:block">{user.firstName}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-pool-400 hover:text-red-400 text-xs px-2 py-1.5 rounded-lg hover:bg-red-400/10 transition-all"
                  title="Cerrar sesión"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            ) : (
              <Link href="/login"
                className="ml-2 bg-aqua-600 hover:bg-aqua-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors">
                Iniciar sesión
              </Link>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
