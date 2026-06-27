export interface ExportSwimmer {
  id: string;
  firstName: string;
  lastName: string;
  gender: 'M' | 'F';
  birthDate: Date | null;
}

export interface ExportClub {
  id: string;
  name: string;
  shortName: string;
}

export interface ExportEventDef {
  code: string;
  stroke: string;
  distance: number;
  gender: 'M' | 'F';
  isRelay: boolean;
}

export interface ExportEntry {
  lane: number;
  swimmer: ExportSwimmer;
  club: ExportClub;
  entryTime: number | null;
}

export interface ExportResult {
  swimmerId: string;
  lane: number | null;
  finalTime: number | null;
  place: number | null;
  status: string;
  dsqCode: string | null;
  swimmer: ExportSwimmer;
  club: ExportClub;
  splits: Array<{ distance: number; cumulativeTime: number }>;
}

export interface ExportHeat {
  heatNumber: number;
  entries: ExportEntry[];
}

export interface ExportEvent {
  id: string;
  orderNo: number;
  round: string;
  eventDefinition: ExportEventDef;
  category: { code: string; name: string };
  heats: ExportHeat[];
  results: ExportResult[];
}

export interface TournamentExportData {
  id: string;
  name: string;
  venue: string | null;
  poolLength: 'P25' | 'P50';
  startDate: Date;
  endDate: Date;
  seasonYear: number;
  events: ExportEvent[];
}
