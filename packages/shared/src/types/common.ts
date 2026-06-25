export type PoolLength = 25 | 50;

export type Gender = 'M' | 'F';

export type ResultStatus = 'OK' | 'DSQ' | 'DNS' | 'DNF';

export type TournamentStatus = 'programado' | 'en_curso' | 'finalizado' | 'homologado';

export type TournamentType = 'provincial' | 'nacional' | 'promocional';

export type RecordScope = 'provincial' | 'nacional';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CLUB_DELEGATE'
  | 'COACH'
  | 'JUDGE'
  | 'SWIMMER'
  | 'PUBLIC';

export type ClubStatus = 'afiliado' | 'suspendido' | 'baja';

export type NewsStatus = 'borrador' | 'publicada';

export type AffiliationStatus = 'vigente' | 'vencida' | 'suspendida';
