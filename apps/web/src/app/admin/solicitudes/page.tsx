'use client';

import { LinkRequestsReview } from '@/components/account-link/LinkRequestsReview';

export default function SolicitudesAdminPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes de vinculación</h1>
        <p className="text-gray-500 text-sm mt-1">
          Personas que crearon su cuenta y piden quedar vinculadas a su perfil de nadador. Siempre decide una persona:
          la coincidencia de nombre es solo una ayuda. Los entrenadores revisan las de su propio club.
        </p>
      </div>
      <LinkRequestsReview variant="light" />
    </div>
  );
}
