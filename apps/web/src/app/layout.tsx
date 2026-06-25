import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Federación Tucumana de Natación',
  description: 'Plataforma digital de la Federación Tucumana de Natación',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
