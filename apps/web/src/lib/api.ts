import type { StandardsTable } from './standards-match';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('ftn_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function tryRefresh(): Promise<boolean> {
  try {
    const rt = localStorage.getItem('ftn_refresh_token');
    if (!rt) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rt}` },
    });
    if (!res.ok) return false;
    const { accessToken, refreshToken } = await res.json() as {
      accessToken: string;
      refreshToken: string;
    };
    localStorage.setItem('ftn_access_token', accessToken);
    localStorage.setItem('ftn_refresh_token', refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  _retry = true,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...options?.headers,
    },
    ...options,
  });

  if (res.status === 401 && _retry && typeof window !== 'undefined') {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, options, false);
    localStorage.removeItem('ftn_access_token');
    localStorage.removeItem('ftn_refresh_token');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message: string =
      (body as { message?: string }).message ?? `Error ${res.status}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ─── Server-side fetchers (sin authHeader — datos públicos) ─────────────────

async function serverFetch<T>(path: string, revalidate?: number): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: revalidate != null ? { revalidate } : { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Torneos ─────────────────────────────────────────────────────────────────

export function fetchTournaments(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return serverFetch<{ items: Tournament[]; total: number; page: number; limit: number }>(`/tournaments${qs}`, 30);
}

export function fetchTournament(id: string) {
  return serverFetch<Tournament>(`/tournaments/${id}`, 30);
}

export function fetchTournamentEvents(tournamentId: string) {
  return serverFetch<TournamentEvent[]>(`/tournaments/${tournamentId}/events`, 30);
}

export function fetchEventResults(tournamentId: string, eventId: string) {
  return serverFetch<EventResultsResponse>(`/tournaments/${tournamentId}/events/${eventId}/results`, 20);
}

export function fetchTournamentDayFiles(tournamentId: string, day: number) {
  return serverFetch<DayFile[]>(`/tournaments/${tournamentId}/days/${day}/files`, 20);
}

// ─── Rankings ────────────────────────────────────────────────────────────────

export function fetchEventRanking(params: Record<string, string>) {
  const qs = '?' + new URLSearchParams(params).toString();
  return serverFetch<RankingEntry[]>(`/rankings/event${qs}`, 60);
}

/** Tabla de marcas básicas de una pileta, por edad (para los resultados de archivo). */
export function fetchStandardsTable(poolLength: 'P25' | 'P50') {
  return serverFetch<StandardsTable>(`/rankings/standards?poolLength=${poolLength}`, 300);
}

export function fetchClubRanking(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return serverFetch<ClubRankingEntry[]>(`/rankings/club${qs}`, 120);
}

// ─── Nadadores ───────────────────────────────────────────────────────────────

export function fetchSwimmers(params?: { search?: string; page?: number; limit?: number }) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : '';
  return serverFetch<{ items: Swimmer[]; total: number; page: number; limit: number }>(`/swimmers${qs}`, 30);
}

export function fetchSwimmer(id: string) {
  return serverFetch<Swimmer>(`/swimmers/${id}`, 300);
}

export function fetchSwimmerPersonalBests(id: string) {
  return serverFetch<PersonalBest[]>(`/swimmers/${id}/personal-bests`, 300);
}

export function fetchSwimmerResults(id: string, page = 1) {
  return serverFetch<SwimmerResultsPage>(`/swimmers/${id}/results?page=${page}&limit=20`, 60);
}

export function fetchSwimmerClubHistory(id: string) {
  return serverFetch<ClubHistoryEntry[]>(`/swimmers/${id}/club-history`, 300);
}

export interface SwimmerSeasonPoint { year: number; bestTime: number }
export interface SwimmerEvolutionEntry {
  eventDef: { id: string; stroke: string; distance: number; gender: string };
  pool: string;
  seasons: SwimmerSeasonPoint[];
  bestTime: number | null;
  improvementMs: number | null;
}
export interface SwimmerAchievement {
  id: string;
  type: string;
  medal?: string;
  title: string;
  description?: string;
  achievedAt: string;
}
export interface SwimmerStatistics {
  global: { totalCompetitions: number; totalPbs: number; gold: number; silver: number; bronze: number; improvementPct?: number } | null;
  bySeason: Array<{ season: { year: number } | null; totalCompetitions: number; gold: number; silver: number; bronze: number }>;
  achievements: SwimmerAchievement[];
}

export function fetchSwimmerTimeEvolution(id: string) {
  return serverFetch<SwimmerEvolutionEntry[]>(`/swimmers/${id}/time-evolution`, 300);
}

export function fetchSwimmerStatistics(id: string) {
  return serverFetch<SwimmerStatistics>(`/swimmers/${id}/statistics`, 300);
}

export interface ProgressionHistoryEntry {
  tournamentId: string;
  tournamentName: string;
  date: string;
  timeMs: number;
  deltaVsPreviousMs: number | null;
  deltaVsPbMs: number | null;
  isPb: boolean;
  categoryName: string;
  clubName: string;
  place: number | null;
  medal: 'gold' | 'silver' | 'bronze' | null;
}

export interface ProgressionEvent {
  eventDefinitionId: string;
  label: string;
  stroke: string;
  distance: number;
  pool: 'P25' | 'P50';
  personalBest: { timeMs: number; tournamentId: string; tournamentName: string; date: string; worldAquaticsPoints: number | null } | null;
  last: { timeMs: number; tournamentId: string; tournamentName: string; date: string; deltaVsPreviousMs: number | null; deltaVsPbMs: number | null; isPb: boolean } | null;
  totalImprovementMs: number | null;
  history: ProgressionHistoryEntry[];
}

export interface SwimmerProgression {
  swimmerId: string;
  events: ProgressionEvent[];
  tournaments: Array<{ tournamentId: string; name: string; date: string; pool: 'P25' | 'P50'; events: number; pbs: number; medals: { gold: number; silver: number; bronze: number } }>;
}

export function fetchSwimmerProgression(id: string, pool?: 'P25' | 'P50') {
  const qs = pool ? `?pool=${pool}` : '';
  return serverFetch<SwimmerProgression>(`/swimmers/${id}/progression${qs}`, 60);
}

// ─── Récords ─────────────────────────────────────────────────────────────────

export function fetchRecords(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return serverFetch<RecordEntry[]>(`/records${qs}`, 300);
}

export function fetchNationalRecords(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return serverFetch<RecordEntry[]>(`/records/national${qs}`, 300);
}

export function fetchEventDefinitions() {
  return serverFetch<EventDefinition[]>('/tournaments/event-definitions', 3600);
}

export function fetchCategories() {
  return serverFetch<Category[]>('/tournaments/categories', 3600);
}

export function fetchSeasons() {
  return serverFetch<Season[]>('/tournaments/seasons', 3600);
}

// ─── Tipos de dominio (mínimo para el frontend) ──────────────────────────────

export interface Tournament {
  id: string;
  name: string;
  venue?: string;
  poolLength: 'P25' | 'P50';
  startDate: string;
  endDate: string;
  status: string;
  scope: string;
  type: string;
  season: { id: string; year: number };
  hostClub?: { id: string; name: string; shortName: string };
  _count?: { events: number };
}

export interface TournamentEvent {
  id: string;
  orderNo: number;
  status: string;
  round: string;
  eventDefinition: { id: string; code: string; stroke: string; distance: number; gender: string };
  category: { id: string; code: string; name: string };
  _count: { registrations: number; results: number };
}

export interface ResultEntry {
  id: string;
  place: number | null;
  finalTime: number | null;
  status: string;
  dsqCode?: string | null;
  isPb: boolean;
  isRecord: boolean;
  homologated: boolean;
  swimmer: { id: string; firstName: string; lastName: string; gender: string };
  club: { id: string; name: string; shortName: string };
  category: { id: string; name: string; orderNo: number };
  splits: { distance: number; cumulativeTime: number }[];
}

export interface EventResultsResponse {
  event: {
    id: string;
    eventDefinition: { id?: string; code: string; stroke: string; distance: number; gender: string };
    category: { code: string; name: string };
    tournament: { id: string; name: string; poolLength: 'P25' | 'P50'; startDate: string; scope: string };
  };
  results: ResultEntry[];
}

export interface SembradoRow {
  eventNo: number;
  eventLabel: string;
  heatNo: number;
  lane: number;
  swimmerName: string;
  age: number | null;
  club: string;
  seedTimeMs: number | null;
}

export interface ResultadoRow {
  eventNo: number;
  eventLabel: string;
  place: number | null;
  swimmerName: string;
  age: number | null;
  club: string;
  seedTimeMs: number | null;
  finalTimeMs: number | null;
  status: 'OK' | 'DSQ' | 'DNS' | 'DNF';
}

export interface DayFile {
  id: string;
  dayNumber: number;
  type: 'sembrados' | 'resultados';
  title: string;
  fileUrl: string;
  mimeType: string;
  createdAt: string;
  parsedRows: SembradoRow[] | ResultadoRow[] | null;
  parseWarning: string | null;
}

export interface RankingEntry {
  position: number;
  swimmerId: string;
  swimmerName: string;
  clubId: string;
  clubName: string;
  categoryId: string;
  categoryName: string;
  finalTime: number;
  sourceResultId: string | null;
  /** Fecha (ISO) del torneo o del récord donde hizo ese tiempo. */
  achievedAt?: string;
  /** Ids de los sets de marcas básicas que este tiempo cumple en su categoría. */
  meets?: string[];
}

/** Set de marcas básicas aplicado al ranking por prueba (GET /rankings/event/standards). */
export interface EventStandard {
  setId: string;
  code: string;
  name: string;
  shortLabel: string;
  color: string;
  /** Marca de la categoría filtrada; null si no hay categoría elegida o no tiene marca. */
  timeMs: number | null;
  qualifiedCount: number;
}

export interface ClubRankingEntry {
  position: number;
  clubId: string;
  clubName: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  activeSwimmers: number;
  currentRecords: number;
}

export interface Swimmer {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate?: string;
  nationality: string;
  isActive: boolean;
  currentClub?: { id: string; name: string; shortName: string; logoUrl?: string };
  profile?: { bio?: string; photoUrl?: string; publicVisibility: boolean };
}

export interface PersonalBest {
  id: string;
  poolLength: 'P25' | 'P50';
  bestTime: number;
  achievedAt: string;
  eventDefinition: { id: string; code: string; stroke: string; distance: number };
  sourceResult?: { id: string; event: { tournament: { id: string; name: string; startDate: string } } };
}

export interface SwimmerResult {
  id: string;
  finalTime: number | null;
  place: number | null;
  status: string;
  isPb: boolean;
  isRecord: boolean;
  homologated: boolean;
  event: {
    eventDefinition: { code: string; stroke: string; distance: number };
    tournament: { id: string; name: string; startDate: string; poolLength: 'P25' | 'P50' };
  };
  club: { id: string; name: string; shortName: string };
  category: { code: string; name: string };
}

export interface SwimmerResultsPage {
  total: number;
  page: number;
  limit: number;
  results: SwimmerResult[];
}

export interface ClubHistoryEntry {
  id: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  club: { id: string; name: string; shortName: string; logoUrl?: string };
  season: { id: string; year: number };
}

export interface RecordEntry {
  id: string;
  scope: string;
  poolLength: 'P25' | 'P50';
  gender: string;
  timeMs: number;
  recordDate: string;
  status: string;
  isCurrent: boolean;
  homologatedAt: string | null;
  createdAt: string;
  swimmer: { id: string; firstName: string; lastName: string };
  club: { id: string; name: string; shortName: string };
  eventDefinition: { id: string; code: string; stroke: string; distance: number };
  category: { id: string; code: string; name: string };
  sourceResult?: { id: string; event: { tournament: { id: string; name: string; startDate: string } } };
  /** Id del récord al que reemplazó (si lo hay): permite volver atrás desde el panel. */
  previousRecordId?: string | null;
  /** Solo en candidatos (`/records/candidates`): récord vigente al momento de la detección. */
  previousRecord?: {
    id: string;
    timeMs: number;
    recordDate: string;
    swimmer: { id: string; firstName: string; lastName: string };
  } | null;
}

export interface EventDefinition {
  id: string;
  code: string;
  stroke: string;
  distance: number;
  gender: string;
  isRelay: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  orderNo: number;
  scope: string;
  minAge?: number | null;
  maxAge?: number | null;
}

export interface Season {
  id: string;
  year: number;
  isActive: boolean;
}
