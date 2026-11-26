import { BadRequestException } from '@nestjs/common';
import { TUCUMAN_PROVINCE } from '../homologation/record-scopes';

/**
 * La plataforma da cuenta, seguimiento y perfil personal SOLO a nadadores de clubes de Tucumán
 * (decisión del 19/11/2026). Los de otras provincias se ven en resultados, rankings y récords,
 * pero no pueden tener cuenta vinculada. La provincia es la del club actual del nadador.
 */
export interface EligibilityInput {
  currentClub: { name: string; province: string | null } | null;
}

export function isTucumanSwimmer(swimmer: EligibilityInput): boolean {
  return swimmer.currentClub?.province === TUCUMAN_PROVINCE;
}

export function assertTucumanSwimmer(swimmer: EligibilityInput): void {
  if (isTucumanSwimmer(swimmer)) return;
  if (!swimmer.currentClub) {
    throw new BadRequestException('Este nadador no tiene club asignado: la federación tiene que asignárselo antes de habilitar su cuenta.');
  }
  if (!swimmer.currentClub.province) {
    throw new BadRequestException(
      `El club "${swimmer.currentClub.name}" todavía no tiene provincia asignada. La federación tiene que completarla (Admin → Clubes) para habilitar cuentas de sus nadadores.`,
    );
  }
  throw new BadRequestException(
    `Las cuentas con seguimiento son solo para nadadores de clubes de Tucumán. "${swimmer.currentClub.name}" es de ${swimmer.currentClub.province}: sus nadadores se pueden ver en resultados, rankings y récords, pero no tienen cuenta.`,
  );
}
