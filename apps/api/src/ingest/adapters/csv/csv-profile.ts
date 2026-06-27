/**
 * Declarative profiles for CSV/Excel column detection.
 * Each profile maps semantic field names to lists of possible column headers
 * (case-insensitive, accent-stripped). The profile with the most matches wins.
 */
export interface CsvProfile {
  id: string;
  description: string;
  defaultDelimiter: ',' | ';';
  /** Each key maps to an ordered list of possible column-header aliases */
  aliases: {
    event_stroke?: string[];
    event_distance?: string[];
    event_gender?: string[];
    event_name?: string[];
    event_category?: string[];
    swimmer_first?: string[];
    swimmer_last?: string[];
    swimmer_name?: string[];
    swimmer_age?: string[];
    club?: string[];
    time?: string[];
    entry_time?: string[];
    place?: string[];
    heat?: string[];
    lane?: string[];
    status?: string[];
  };
}

export type CsvSemanticField = keyof CsvProfile['aliases'];

export const CSV_PROFILES: CsvProfile[] = [
  {
    id: 'ftn-results',
    description: 'Plantilla FTN de resultados (español)',
    defaultDelimiter: ';',
    aliases: {
      event_stroke: ['estilo'],
      event_distance: ['distancia', 'dist'],
      event_gender: ['genero', 'género', 'sexo'],
      event_name: ['evento', 'prueba'],
      event_category: ['categoria', 'categoría', 'categoria_edad'],
      swimmer_first: ['nombre'],
      swimmer_last: ['apellido'],
      swimmer_name: ['nadador', 'atleta'],
      swimmer_age: ['edad', 'age'],
      club: ['club', 'equipo'],
      time: ['tiempo', 'marca', 'tiempo_final'],
      entry_time: ['tiempo_inscripcion', 'marca_inscripcion'],
      place: ['puesto', 'posicion', 'posición'],
      heat: ['serie', 'bateria', 'batería'],
      lane: ['carril'],
      status: ['estado'],
    },
  },
  {
    id: 'mm-export-en',
    description: 'Meet Manager results export (English)',
    defaultDelimiter: ',',
    aliases: {
      event_stroke: ['stroke', 'event stroke'],
      event_distance: ['dist', 'distance'],
      event_gender: ['gender', 'sex'],
      event_name: ['event'],
      event_category: ['age group', 'agegroup', 'age_group'],
      swimmer_first: ['first name', 'firstname', 'first'],
      swimmer_last: ['last name', 'lastname', 'last'],
      swimmer_name: ['name', 'athlete', 'swimmer'],
      swimmer_age: ['age'],
      club: ['team', 'club', 'school'],
      time: ['finals time', 'final time', 'time', 'result'],
      entry_time: ['seed time', 'entry time'],
      place: ['place', 'rank', 'finish'],
      heat: ['heat', 'heat number'],
      lane: ['lane', 'lane number'],
      status: ['status', 'result status'],
    },
  },
];
