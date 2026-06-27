import type { TournamentExportData, ExportEvent } from './export.types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  if (min > 0) return `${min}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  return `${sec}.${String(cs).padStart(2, '0')}`;
}

function poolLabel(pool: 'P25' | 'P50'): string {
  return pool === 'P50' ? 'Piscina 50 m' : 'Piscina 25 m';
}

function strokeLabel(stroke: string): string {
  const labels: Record<string, string> = {
    libre: 'Libre',
    espalda: 'Espalda',
    pecho: 'Pecho',
    mariposa: 'Mariposa',
    combinado: 'Combinado',
    relevo_libre: 'Relevo Libre',
    relevo_combinado: 'Relevo Combinado',
  };
  return labels[stroke] ?? stroke;
}

function genderLabel(g: 'M' | 'F'): string {
  return g === 'M' ? 'Masculino' : 'Femenino';
}

function placeLabel(place: number | null): string {
  if (place === null) return '—';
  if (place === 1) return '🥇';
  if (place === 2) return '🥈';
  if (place === 3) return '🥉';
  return String(place);
}

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; background: #fff; }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
  h2 { font-size: 15px; font-weight: 700; margin: 16px 0 4px; color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 2px; }
  h3 { font-size: 12px; font-weight: 600; margin: 10px 0 4px; color: #374151; }
  .header { padding: 12px 0 8px; border-bottom: 3px solid #1e40af; margin-bottom: 16px; }
  .header-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
  th { background: #1e40af; color: #fff; text-align: left; padding: 4px 6px; font-weight: 600; }
  td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .place-1 td { background: #fef9c3; font-weight: 700; }
  .place-2 td { background: #f1f5f9; }
  .place-3 td { background: #fef3c7; }
  .status-DSQ td, .status-DNS td, .status-DNF td { color: #9ca3af; font-style: italic; }
  .event-block { page-break-inside: avoid; margin-bottom: 20px; }
  .heat-block { page-break-inside: avoid; margin-bottom: 12px; }
  @media print {
    body { font-size: 10px; }
    h2 { font-size: 13px; }
    .event-block { page-break-before: auto; }
    @page { margin: 1.5cm; }
  }
`;

function buildResultsSection(events: ExportEvent[]): string {
  return events
    .map((event) => {
      const def = event.eventDefinition;
      const title = esc(`${def.distance}m ${strokeLabel(def.stroke)} — ${genderLabel(def.gender)} — ${event.category.name}`);

      const rows = event.results
        .map((r) => {
          const cls = r.status !== 'OK' ? `status-${esc(r.status)}` : r.place ? `place-${r.place}` : '';
          const time = r.status !== 'OK' ? esc(r.status) : formatTime(r.finalTime);
          return `
        <tr class="${cls}">
          <td>${placeLabel(r.place)}</td>
          <td>${esc(r.swimmer.lastName)}, ${esc(r.swimmer.firstName)}</td>
          <td>${esc(r.club.shortName)}</td>
          <td><strong>${esc(time)}</strong></td>
          <td style="color:#6b7280">${r.splits.map((s) => formatTime(s.cumulativeTime)).join(' / ')}</td>
        </tr>`;
        })
        .join('');

      if (!rows) return `<div class="event-block"><h2>${title}</h2><p style="color:#9ca3af;padding:8px">Sin resultados homologados.</p></div>`;

      return `
    <div class="event-block">
      <h2>${title}</h2>
      <table>
        <thead><tr><th>#</th><th>Nadador/a</th><th>Club</th><th>Tiempo</th><th>Parciales</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    })
    .join('');
}

function buildHeatSheetSection(events: ExportEvent[]): string {
  return events
    .map((event) => {
      const def = event.eventDefinition;
      const title = esc(`${def.distance}m ${strokeLabel(def.stroke)} — ${genderLabel(def.gender)} — ${event.category.name}`);

      const heatsHtml = event.heats
        .map((heat) => {
          const rows = heat.entries
            .map(
              (e) => `
          <tr>
            <td>${e.lane}</td>
            <td>${esc(e.swimmer.lastName)}, ${esc(e.swimmer.firstName)}</td>
            <td>${esc(e.club.shortName)}</td>
            <td>${formatTime(e.entryTime)}</td>
          </tr>`,
            )
            .join('');

          return `
        <div class="heat-block">
          <h3>Serie ${heat.heatNumber}</h3>
          <table>
            <thead><tr><th>Carril</th><th>Nadador/a</th><th>Club</th><th>Marca inscripción</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
        })
        .join('');

      return `
    <div class="event-block">
      <h2>${title}</h2>
      ${heatsHtml || '<p style="color:#9ca3af;padding:8px">Sin series asignadas.</p>'}
    </div>`;
    })
    .join('');
}

/**
 * Builds a print-ready HTML document from tournament export data.
 * Pure function — deterministic output for the same input.
 */
export function buildHtml(data: TournamentExportData, type: 'results' | 'heat_sheet'): string {
  const startDate = data.startDate.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  const endDate = data.endDate.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  const subtitle = startDate === endDate ? startDate : `${startDate} — ${endDate}`;
  const pool = poolLabel(data.poolLength);

  const pageTitle = type === 'results' ? 'Resultados' : 'Programa de Series';
  const body = type === 'results' ? buildResultsSection(data.events) : buildHeatSheetSection(data.events);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(data.name)} — ${esc(pageTitle)}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(data.name)}</h1>
    <div class="header-sub">${esc(subtitle)} &nbsp;|&nbsp; ${esc(pool)} &nbsp;|&nbsp; Temporada ${data.seasonYear}</div>
    <div class="header-sub" style="margin-top:4px">Federación Tucumana de Natación &nbsp;|&nbsp; ${esc(pageTitle)}</div>
  </div>
  ${body}
</body>
</html>`;
}
