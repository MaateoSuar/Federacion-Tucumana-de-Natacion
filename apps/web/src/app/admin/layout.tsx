'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  {
    href: '/',
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
        {/* cabeza */}
        <circle cx="19" cy="6" r="2" strokeWidth={2} />
        {/* brazo adelante */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10l-2-2" />
        {/* cuerpo diagonal */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 8c-3 1-7 1-11 3L4 9" />
        {/* piernas */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11l-2 5M12 10l0 5" />
        {/* olas */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 18c2-2 4 2 6 0s4-2 6 0 4 2 6 0" />
      </svg>
    ),
  },
  {
    href: '/admin/torneos',
    label: 'Torneos',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* círculo de la medalla */}
        <circle cx="12" cy="15" r="5" strokeWidth={2} />
        {/* cinta */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10L7 3h10l-2 7" />
        {/* estrella interior */}
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 12.5l.8 2.3H15l-1.9 1.4.7 2.1-1.8-1.3-1.8 1.3.7-2.1L9 14.8h2.2z" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col bg-pool-900 shadow-xl">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-pool-700/60">
          <Link href="/" className="flex flex-col items-center gap-2 group">
            <Image
              src="/logo-ftn.png"
              alt="Federación Tucumana de Natación"
              width={120}
              height={80}
              className="object-contain drop-shadow-md"
              priority
            />
            <span className="text-pool-400 text-[10px] font-semibold uppercase tracking-widest">
              Panel Admin
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
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-aqua-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Ola decorativa al fondo */}
        <div className="h-20 overflow-hidden opacity-20 pointer-events-none">
          <svg viewBox="0 0 240 80" className="absolute bottom-0 left-0 right-0 w-60 wave-svg">
            <path
              fill="#00b4d8"
              d="M0,40 C40,20 80,60 120,40 C160,20 200,60 240,40 L240,80 L0,80 Z"
            />
          </svg>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Admin</span>
            <span className="text-gray-200">/</span>
            <span className="text-gray-600 font-medium capitalize">
              {pathname.split('/').filter(Boolean).slice(1).join(' / ')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-400">Sistema activo</span>
          </div>
        </header>

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}

