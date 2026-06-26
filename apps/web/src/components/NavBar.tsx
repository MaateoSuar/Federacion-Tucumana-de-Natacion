import Link from 'next/link';

const NAV_LINKS = [
  { href: '/torneos',  label: 'Torneos'   },
  { href: '/rankings', label: 'Rankings'  },
  { href: '/records',  label: 'Récords'   },
];

export function NavBar() {
  return (
    <nav className="sticky top-0 z-40 bg-pool-950/90 backdrop-blur border-b border-pool-800">
      <div className="max-w-6xl mx-auto px-4 md:px-8 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 font-bold text-white hover:text-aqua-300 transition-colors">
          <WaveLogo />
          <span className="hidden sm:block text-sm tracking-tight">
            FTN <span className="text-aqua-400 font-light">Tucumán</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 rounded-lg text-sm text-pool-200 hover:text-white hover:bg-pool-800 transition-all"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/admin"
            className="ml-2 bg-aqua-600 hover:bg-aqua-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Admin
          </Link>
        </div>
      </div>
    </nav>
  );
}

function WaveLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" fill="currentColor" fillOpacity="0.15" className="text-aqua-400" />
      <path d="M5 16c1.4-2 2.8-3.5 4.2-3.5s2.8 2.8 4.2 2.8 2.8-2.8 4.2-2.8S20.6 16 22 16" stroke="#00b4d8" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M5 12c1.4-2 2.8-3.5 4.2-3.5s2.8 2.8 4.2 2.8 2.8-2.8 4.2-2.8S20.6 12 22 12" stroke="#00b4d8" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.4" />
    </svg>
  );
}
