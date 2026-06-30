import { docsDirForPeriodo, findGlobFile, readCsvRows } from './rankingRacionesCsv';

export type TipoDependenciaCapital =
  | 'Comedor Oficial'
  | 'Comedor Solidario'
  | 'Comedor Institucional'
  | 'Grupos Voluntarios';

const ORDEN_TIPOS: TipoDependenciaCapital[] = [
  'Comedor Oficial',
  'Comedor Solidario',
  'Comedor Institucional',
  'Grupos Voluntarios',
];

/** Clasifica la columna «Dependencia Inmueble» de Capital Hoja 1.csv en 4 tipos. */
export function clasificarDependenciaInmueble(raw: string): TipoDependenciaCapital | null {
  const u = String(raw ?? '').trim().toUpperCase();
  if (!u || u === 'DEPENDENCIA INMUEBLE') return null;
  if (/^COMEDOR OFICIAL/.test(u)) return 'Comedor Oficial';
  if (/^COMEDOR SOLIDARIO/.test(u)) return 'Comedor Solidario';
  if (/^COMEDOR INSTITUCIONAL/.test(u)) return 'Comedor Institucional';
  if (/^GRUPO(S)? VOLUNTARIO(S)?/.test(u)) return 'Grupos Voluntarios';
  return null;
}

export function loadCapitalHoja1PorTipo(
  periodo: string
): { tipo: string; subtipo: string | null; cantidad: number }[] | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  const file = findGlobFile(dir, /^Capital Hoja 1\.csv$/i);
  if (!file) return null;

  const rows = readCsvRows(file);
  const hdrIdx = rows.findIndex((r) => r.some((c) => /dependencia inmueble/i.test(String(c))));
  if (hdrIdx < 0) return null;
  const hdr = rows[hdrIdx];
  const iDep = hdr.findIndex((h) => /dependencia inmueble/i.test(String(h)));
  const iId = hdr.findIndex((h) => /^id$/i.test(String(h).trim()));
  if (iDep < 0 || iId < 0) return null;

  const counts = new Map<TipoDependenciaCapital, number>();
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = String(r[iId] ?? '').trim();
    if (!id || !/^[\dA-Za-z]/.test(id)) continue;
    const tipo = clasificarDependenciaInmueble(String(r[iDep] ?? ''));
    if (!tipo) continue;
    counts.set(tipo, (counts.get(tipo) ?? 0) + 1);
  }

  if (!counts.size) return null;
  return ORDEN_TIPOS.filter((t) => (counts.get(t) ?? 0) > 0)
    .map((tipo) => ({
      tipo,
      subtipo: null,
      cantidad: counts.get(tipo) ?? 0,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

function idsCoinciden(a: string, b: string): boolean {
  const sa = String(a ?? '').trim();
  const sb = String(b ?? '').trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const na = parseInt(sa.replace(/\D/g, ''), 10);
  const nb = parseInt(sb.replace(/\D/g, ''), 10);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/** Tipo desde Capital Hoja 1.csv para detalle de dependencia (Capital). */
export function lookupCapitalHoja1TipoPorId(
  periodo: string,
  comedorId: string,
  numeroOficial?: string | null
): TipoDependenciaCapital | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  const file = findGlobFile(dir, /^Capital Hoja 1\.csv$/i);
  if (!file) return null;

  const rows = readCsvRows(file);
  const hdrIdx = rows.findIndex((r) => r.some((c) => /dependencia inmueble/i.test(String(c))));
  if (hdrIdx < 0) return null;
  const hdr = rows[hdrIdx];
  const iDep = hdr.findIndex((h) => /dependencia inmueble/i.test(String(h)));
  const iId = hdr.findIndex((h) => /^id$/i.test(String(h).trim()));
  if (iDep < 0 || iId < 0) return null;

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const csvId = String(r[iId] ?? '').trim();
    if (!csvId) continue;
    if (!idsCoinciden(csvId, comedorId) && !idsCoinciden(csvId, numeroOficial ?? '')) continue;
    return clasificarDependenciaInmueble(String(r[iDep] ?? ''));
  }
  return null;
}
