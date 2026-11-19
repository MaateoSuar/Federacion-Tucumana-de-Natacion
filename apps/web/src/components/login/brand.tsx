import Image from 'next/image';
import Link from 'next/link';

/** Logo FTN sobre chapa blanca (el PNG tiene fondo claro) + nombre de la federación. */
export function Brand({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua-300 ${className}`}
      aria-label="Federación Tucumana de Natación, ir al sitio público"
    >
      <span className="flex items-center justify-center rounded-2xl bg-white px-3 py-2 shadow-lg shadow-pool-950/50 transition-transform duration-300 group-hover:scale-105">
        <Image src="/LogoPNGSinLetras.png" alt="" width={386} height={268} priority className="h-12 w-auto sm:h-14" />
      </span>
      <span className="leading-tight">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-aqua-200">Federación</span>
        <span className="block text-base font-extrabold text-white sm:text-lg">Tucumana de Natación</span>
      </span>
    </Link>
  );
}
