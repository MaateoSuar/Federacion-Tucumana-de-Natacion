import type { DrivePlan } from './drive-scan';
import type { LoadReport } from './drive-loader';

export interface DbCounts {
  [table: string]: number;
}

export interface FullReport {
  generatedAt: string;
  mode: 'dry-run' | 'carga';
  database: string;
  root: string;
  plan: {
    tournaments: Array<{
      folder: string;
      year: number;
      name: string;
      nameSource: string;
      headerName: string | null;
      scope: string;
      type: string;
      pool: number;
      startDate: string;
      endDate: string;
      datesEstimated: boolean;
      decision: string;
      files: Array<{ file: string; rows: number; events: number; withSeed: number }>;
      notes: string[];
    }>;
    skipped: DrivePlan['skipped'];
    ignoredSembrados: string[];
    scannedFiles: number;
  };
  load: LoadReport | null;
  countsBefore: DbCounts | null;
  countsAfter: DbCounts | null;
}

export function summarizePlan(plan: DrivePlan): FullReport['plan'] {
  return {
    tournaments: plan.tournaments.map((t) => ({
      folder: t.folder,
      year: t.year,
      name: t.name,
      nameSource: t.nameSource,
      headerName: t.headerName,
      scope: t.scope,
      type: t.type,
      pool: t.pool,
      startDate: t.dates.startDate,
      endDate: t.dates.endDate,
      datesEstimated: t.dates.estimated,
      decision: t.decision,
      files: t.files.map((f) => ({
        file: f.fileName,
        rows: f.summary?.rows ?? 0,
        events: f.summary?.events ?? 0,
        withSeed: f.summary?.withSeed ?? 0,
      })),
      notes: t.notes,
    })),
    skipped: plan.skipped,
    ignoredSembrados: plan.ignoredSembrados,
    scannedFiles: plan.scannedFiles,
  };
}

const cell = (v: unknown): string => String(v ?? '').replace(/\|/g, '/');

export function renderMarkdown(r: FullReport): string {
  const L: string[] = [];
  L.push(`# Carga de torneos del Drive (${r.mode})`, '');
  L.push(`- Generado: ${r.generatedAt}`, `- Base: ${r.database}`, `- Copia del Drive: ${r.root}`, `- PDF recorridos: ${r.plan.scannedFiles}`, '');

  if (r.load) {
    L.push('## Torneos cargados', '');
    L.push('| Carpeta | Año | Torneo | Alcance | Pileta | Archivos | Pruebas | Resultados en base | Filas del lector | Sin explicar | Fechas | Homologación |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const t of r.load.tournaments) {
      const unexplained = t.files.reduce((a, f) => a + f.unexplained, 0);
      L.push(
        `| ${t.folder} | ${t.year} | ${cell(t.name)} | ${t.scope} | ${t.pool} m | ${t.files.length} | ${t.counts?.events ?? '-'} | ${t.counts?.results ?? '-'} | ${t.readerRows} | ${unexplained} | ${t.startDate}${t.endDate !== t.startDate ? ` a ${t.endDate}` : ''}${t.datesEstimated ? ' (estimada)' : ''} | ${t.homologation} |`,
      );
    }
    L.push('');

    L.push('## Detalle por archivo', '');
    L.push('| Torneo | Archivo | Estado | Filas lector | Insertadas | Dup. en archivo | Ya en torneo | Género cruzado | Nuevos nadadores | Nuevos clubes | Identidades dudosas | Líneas no reconocidas |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const t of r.load.tournaments) {
      for (const f of t.files) {
        L.push(
          `| ${cell(t.name)} | ${cell(f.file)} | ${f.status}${f.error ? ` (${cell(f.error)})` : ''} | ${f.readerRows} | ${f.inserted} | ${f.skipped.duplicate_in_file} | ${f.skipped.already_in_tournament} | ${f.skipped.gender_mismatch} | ${f.newSwimmers} | ${f.newClubs} | ${f.pendingIdentities} | ${f.unrecognizedLines} |`,
        );
      }
    }
    L.push('');
  } else {
    L.push('## Torneos que se cargarían', '');
    L.push('| Carpeta | Año | Torneo | Alcance | Pileta | Archivos | Filas | Fechas | Notas |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const t of r.plan.tournaments) {
      L.push(
        `| ${t.folder} | ${t.year} | ${cell(t.name)} | ${t.scope} | ${t.pool} m | ${t.files.length} | ${t.files.reduce((a, f) => a + f.rows, 0)} | ${t.startDate}${t.endDate !== t.startDate ? ` a ${t.endDate}` : ''}${t.datesEstimated ? ' (estimada)' : ''} | ${cell(t.notes.join(' / '))} |`,
      );
    }
    L.push('');
  }

  L.push('## Fechas estimadas (revisar)', '');
  const est = r.plan.tournaments.filter((t) => t.datesEstimated);
  if (est.length === 0) L.push('Ninguna.');
  for (const t of est) L.push(`- ${t.folder}/${t.year} · ${t.name}: ${t.startDate} — ${t.notes.find((n) => n.startsWith('El PDF no trae') || n.startsWith('Sin fecha')) ?? ''}`);
  L.push('');

  L.push('## Torneos / archivos que NO se cargaron', '');
  if (r.plan.skipped.length === 0) L.push('Ninguno.');
  for (const s of r.plan.skipped) L.push(`- ${s.folder}/${s.year} · ${s.torneo} [${s.kind}] (${s.files.join(', ')}): ${s.reason}`);
  L.push('');

  L.push('## Notas por torneo', '');
  for (const t of r.plan.tournaments.filter((x) => x.notes.length > 0)) L.push(`- ${t.folder}/${t.year} · ${t.name}: ${t.notes.join(' | ')}`);
  L.push('');
  L.push(`## PDF de sembrados ignorados (${r.plan.ignoredSembrados.length})`, '');
  for (const s of r.plan.ignoredSembrados) L.push(`- ${s}`);
  L.push('');

  if (r.load) {
    L.push(`## Identidades dudosas para un Admin (${r.load.pendingIdentities.length})`, '');
    L.push('La carga NO vinculó a nadie con candidatos: los marcó como nuevos (autor: usuario de sistema) y quedan acá para unir/corregir.', '');
    L.push('| Archivo | Tipo | Nombre en el archivo | Cómo lo vio el matcher | Candidatos |');
    L.push('|---|---|---|---|---|');
    for (const p of r.load.pendingIdentities) {
      L.push(
        `| ${cell(p.file)} | ${p.kind} | ${cell(p.name)} | ${p.confidence}/${p.matchedBy} | ${cell(p.candidates.map((c) => `${c.displayName} [${c.id}] ${Math.round(c.score * 100)}%`).join('; '))} |`,
      );
    }
    L.push('');
    L.push(`## Resultados no insertados por género cruzado (${r.load.genderMismatches.length})`, '');
    for (const g of r.load.genderMismatches) L.push(`- ${g.file} (línea ${g.line}): ${g.swimmerRef} — ${g.detail}`);
    L.push('');
    const cur = r.load.autoRecords.filter((x) => x.isCurrent);
    L.push(`## Récords publicados solos durante la carga (${r.load.autoRecords.length}; ${cur.length} vigentes al final)`, '');
    L.push('Regla 4: al homologar, un resultado que supera al récord vigente (o llena una clave sin récord) lo reemplaza solo. El detalle completo está en informe.json (autoRecords). Ojo: la provincia de los clubes todavía no está cargada, así que un nadador de otra provincia puede figurar acá como récord provincial.', '');
    if (r.load.probes.length > 0) {
      L.push('## Prueba de idempotencia (mismo contenido, otro hash)', '');
      for (const p of r.load.probes) L.push(`- ${p.file}: +${p.inserted} resultados, ${p.skippedAlreadyInTournament} ya presentes -> ${p.ok ? 'OK' : `FALLA ${p.error ?? ''}`}`);
      L.push('');
    }
  }

  if (r.countsBefore || r.countsAfter) {
    L.push('## Conteos de la base', '');
    L.push('| Tabla | Antes | Después |', '|---|---|---|');
    const keys = Object.keys(r.countsAfter ?? r.countsBefore ?? {});
    for (const k of keys) L.push(`| ${k} | ${r.countsBefore?.[k] ?? '-'} | ${r.countsAfter?.[k] ?? '-'} |`);
    L.push('');
  }
  return L.join('\n');
}
