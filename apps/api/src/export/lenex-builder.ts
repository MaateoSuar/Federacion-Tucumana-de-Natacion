import { create } from 'xmlbuilder2';
import type { TournamentExportData, ExportResult, ExportEntry } from './export.types';

const STROKE_MAP: Record<string, string> = {
  libre: 'FREE',
  espalda: 'BACK',
  pecho: 'BREAST',
  mariposa: 'FLY',
  combinado: 'MEDLEY',
  relevo_libre: 'FREE',
  relevo_combinado: 'MEDLEY',
};

const ROUND_MAP: Record<string, string> = {
  clasificatorio: 'PRE',
  final: 'FIN',
  serie_unica: 'TIM',
};

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

/** milliseconds → Lenex swimtime format "MM:SS.cc" */
export function msToSwimtime(ms: number): string {
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

interface ClubAthleteMap {
  clubName: string;
  clubCode: string;
  athletes: Map<
    string,
    {
      swimmer: { id: string; firstName: string; lastName: string; gender: 'M' | 'F'; birthDate: Date | null };
      entries: Array<{ eventId: string; entryTime: number | null }>;
      results: Array<{ eventId: string } & Pick<ExportResult, 'lane' | 'place' | 'finalTime' | 'status' | 'splits'>>;
    }
  >;
}

function buildClubMap(data: TournamentExportData, type: 'entries' | 'results'): Map<string, ClubAthleteMap> {
  const clubs = new Map<string, ClubAthleteMap>();

  function ensureClub(clubId: string, clubName: string, clubCode: string): ClubAthleteMap {
    if (!clubs.has(clubId)) {
      clubs.set(clubId, { clubName, clubCode, athletes: new Map() });
    }
    return clubs.get(clubId)!;
  }

  function ensureAthlete(club: ClubAthleteMap, swimmer: ExportEntry['swimmer'] | ExportResult['swimmer'], swimmerId: string) {
    if (!club.athletes.has(swimmerId)) {
      club.athletes.set(swimmerId, {
        swimmer: { id: swimmerId, firstName: swimmer.firstName, lastName: swimmer.lastName, gender: swimmer.gender, birthDate: swimmer.birthDate },
        entries: [],
        results: [],
      });
    }
    return club.athletes.get(swimmerId)!;
  }

  for (const event of data.events) {
    if (type === 'entries') {
      for (const heat of event.heats) {
        for (const entry of heat.entries) {
          const club = ensureClub(entry.club.id, entry.club.name, entry.club.shortName);
          const athlete = ensureAthlete(club, entry.swimmer, entry.swimmer.id);
          athlete.entries.push({ eventId: event.id, entryTime: entry.entryTime });
        }
      }
    } else {
      for (const result of event.results) {
        const club = ensureClub(result.club.id, result.club.name, result.club.shortName);
        const athlete = ensureAthlete(club, result.swimmer, result.swimmerId);
        athlete.results.push({
          eventId: event.id,
          lane: result.lane,
          place: result.place,
          finalTime: result.finalTime,
          status: result.status,
          splits: result.splits,
        });
      }
    }
  }

  return clubs;
}

/**
 * Builds a Lenex 3.0 XML string from tournament export data.
 * Pure function — deterministic output for the same input.
 */
export function buildLenex(data: TournamentExportData, type: 'entries' | 'results'): string {
  const course = data.poolLength === 'P50' ? 'LCM' : 'SCM';
  const clubMap = buildClubMap(data, type);

  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('LENEX', { version: '3.0' });

  root.ele('CONSTRUCTOR').ele('CONTACT', { name: 'FTN Platform — Federación Tucumana de Natación' });

  const meet = root
    .ele('MEETS')
    .ele('MEET', {
      course,
      name: data.name,
      nation: 'ARG',
      city: data.venue ?? '',
      startdate: isoDate(data.startDate),
      stopdate: isoDate(data.endDate),
    });

  // ── CLUBS / ATHLETES ────────────────────────────────────────────────────────
  const clubsEle = meet.ele('CLUBS');

  for (const [, clubData] of [...clubMap.entries()].sort((a, b) => a[1].clubName.localeCompare(b[1].clubName))) {
    const clubEle = clubsEle.ele('CLUB', {
      code: clubData.clubCode,
      name: clubData.clubName,
      nation: 'ARG',
    });
    const athletesEle = clubEle.ele('ATHLETES');

    for (const [, athleteData] of [...clubData.athletes.entries()].sort((a, b) =>
      `${a[1].swimmer.lastName}${a[1].swimmer.firstName}`.localeCompare(
        `${b[1].swimmer.lastName}${b[1].swimmer.firstName}`,
      ),
    )) {
      const { swimmer } = athleteData;
      const attrs: Record<string, string> = {
        athleteid: swimmer.id,
        firstname: swimmer.firstName,
        lastname: swimmer.lastName,
        gender: swimmer.gender,
      };
      if (swimmer.birthDate) attrs['birthdate'] = isoDate(swimmer.birthDate);

      const athleteEle = athletesEle.ele('ATHLETE', attrs);

      if (type === 'entries' && athleteData.entries.length > 0) {
        const entriesEle = athleteEle.ele('ENTRIES');
        for (const entry of athleteData.entries) {
          const entryAttrs: Record<string, string> = { eventid: entry.eventId };
          if (entry.entryTime !== null) entryAttrs['entryvalue'] = msToSwimtime(entry.entryTime);
          entriesEle.ele('ENTRY', entryAttrs);
        }
      }

      if (type === 'results' && athleteData.results.length > 0) {
        const resultsEle = athleteEle.ele('RESULTS');
        for (const res of athleteData.results) {
          const resAttrs: Record<string, string> = {
            eventid: res.eventId,
            status: res.status === 'OK' ? '0' : res.status,
          };
          if (res.lane !== null) resAttrs['lane'] = String(res.lane);
          if (res.place !== null) resAttrs['place'] = String(res.place);
          if (res.finalTime !== null) resAttrs['swimtime'] = msToSwimtime(res.finalTime);

          const resultEle = resultsEle.ele('RESULT', resAttrs);

          if (res.splits.length > 0) {
            const splitsEle = resultEle.ele('SPLITS');
            for (const split of res.splits) {
              splitsEle.ele('SPLIT', {
                distance: String(split.distance),
                swimtime: msToSwimtime(split.cumulativeTime),
              });
            }
          }
        }
      }
    }
  }

  // ── SESSIONS / EVENTS / HEATS ────────────────────────────────────────────────
  const sessionsEle = meet.ele('SESSIONS');
  const sessionEle = sessionsEle.ele('SESSION', {
    number: '1',
    date: isoDate(data.startDate),
    course,
  });
  const eventsEle = sessionEle.ele('EVENTS');

  for (const event of data.events) {
    const def = event.eventDefinition;
    const stroke = STROKE_MAP[def.stroke] ?? 'FREE';
    const round = ROUND_MAP[event.round] ?? 'TIM';

    const eventEle = eventsEle.ele('EVENT', {
      eventid: event.id,
      number: String(event.orderNo),
      gender: def.gender,
      distance: String(def.distance),
      stroke,
      round,
    });

    if (event.heats.length > 0) {
      const heatsEle = eventEle.ele('HEATS');
      for (const heat of event.heats) {
        const heatEle = heatsEle.ele('HEAT', {
          heatid: `${event.id}-h${heat.heatNumber}`,
          number: String(heat.heatNumber),
        });
        if (heat.entries.length > 0) {
          const heatEntriesEle = heatEle.ele('ENTRIES');
          for (const entry of heat.entries) {
            const heatEntryAttrs: Record<string, string> = {
              athleteid: entry.swimmer.id,
              lane: String(entry.lane),
              heatid: `${event.id}-h${heat.heatNumber}`,
            };
            if (entry.entryTime !== null) heatEntryAttrs['entrytime'] = msToSwimtime(entry.entryTime);
            heatEntriesEle.ele('ENTRY', heatEntryAttrs);
          }
        }
      }
    }
  }

  return root.end({ prettyPrint: true });
}
