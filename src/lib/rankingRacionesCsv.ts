import fs from 'fs';
import path from 'path';
import { TEKNOFOOD_DIAS_MES_RACION, TEKNOFOOD_PRECIO_RACION_ARS } from './teknofood';

/** Datos de ranking «raciones consolidado» por ID de padrón (CSV). */
export interface RankingRacionesCsvRow {
  padronId: string;
  nombreDependencia: string | null;
  /** Zona del padrón Teknofood (p. ej. CAPITAL, San Miguel). */
  zonaCsv: string | null;
  montoCarne: number;
  montoVerdurasFrutas: number;
  montoTeknofood: number;
  cantidadRaciones: number;
  montoTotalMensual: number;
}

const MESES_SLUG_A_CARPETA: Record<string, string> = {
  enero: 'enero',
  febrero: 'febrero',
  marzo: 'marzo',
  abril: 'abril',
  mayo: 'mayo',
  junio: 'junio',
  julio: 'julio',
  agosto: 'agosto',
  septiembre: 'septiembre',
  octubre: 'octubre',
  noviembre: 'noviembre',
  diciembre: 'diciembre',
};

/** Parsea montos tipo `$1.644.162` o `2.037.803,8`. */
export function parseArsMoney(raw: unknown): number {
  let s = String(raw ?? '')
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '');
  if (!s) return 0;
  if (/,/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Enteros del padrón (p. ej. `480`, `1.800`, `1,800`). */
export function parseEntero(raw: unknown): number {
  let s = String(raw ?? '').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  s = s.replace(/\s/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 3) {
      s = parts[0] + parts[1];
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      s = parts.join('');
    } else {
      s = s.replace(/\./g, '');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function detectCsvDelimiter(text: string): ',' | ';' {
  const sample = text.split(/\r?\n/).slice(0, 3).join('\n');
  const semi = (sample.match(/;/g) ?? []).length;
  const comma = (sample.match(/,/g) ?? []).length;
  return semi > comma ? ';' : ',';
}

export function readCsvRows(filePath: string): string[][] {
  const text = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const delim = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => String(c).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((c) => String(c).trim() !== '')) rows.push(row);
  }
  return rows;
}

/** Normaliza nombres de archivo (macOS suele usar NFD: o + acento combinado). */
function normalizeFileName(name: string): string {
  return name.normalize('NFC');
}

export function findGlobFile(dir: string, pattern: RegExp): string | null {
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir);
  const hit = names.find((n) => pattern.test(normalizeFileName(n)));
  return hit ? path.join(dir, hit) : null;
}

/** `marzo-2026` → `docs/marzo` bajo la raíz del proyecto. */
export function docsDirForPeriodo(periodo: string): string | null {
  const slug = String(periodo ?? '').trim().toLowerCase();
  if (!slug) return null;
  const parts = slug.split('-');
  if (parts.length < 2) return null;
  const mesSlug = parts.slice(0, -1).join('-');
  const carpeta = MESES_SLUG_A_CARPETA[mesSlug];
  if (!carpeta) return null;
  const dir = path.join(process.cwd(), 'docs', carpeta);
  return fs.existsSync(dir) ? dir : null;
}

function loadCarneById(dir: string): Map<string, { monto: number; nombre: string | null }> {
  const file = findGlobFile(dir, /^Frescos Carne.*Mensual\.csv$/i);
  const out = new Map<string, { monto: number; nombre: string | null }>();
  if (!file) return out;
  const rows = readCsvRows(file);
  if (rows.length < 3) return out;
  const gastoCol = rows[0].findIndex((h) => /gasto\s*mensual/i.test(String(h ?? '')));
  const colGasto = gastoCol >= 0 ? gastoCol : 16;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const id = String(r[0] ?? '').trim();
    if (!id) continue;
    out.set(id, {
      monto: parseArsMoney(r[colGasto]),
      nombre: String(r[1] ?? '').trim() || null,
    });
  }
  return out;
}

function loadVerdurasById(dir: string): Map<string, { monto: number; nombre: string | null }> {
  const file = findGlobFile(dir, /^Frescos Verduras.*Mensual\.csv$/i);
  const out = new Map<string, { monto: number; nombre: string | null }>();
  if (!file) return out;
  const rows = readCsvRows(file);
  if (rows.length < 3) return out;
  const gastoCol = rows[0].findIndex((h) => /gasto\s*mensual/i.test(String(h ?? '')));
  const colGasto = gastoCol >= 0 ? gastoCol : 22;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const id = String(r[0] ?? '').trim();
    if (!id) continue;
    out.set(id, {
      monto: parseArsMoney(r[colGasto]),
      nombre: String(r[1] ?? '').trim() || null,
    });
  }
  return out;
}

export function loadTeknofoodById(
  dir: string
): Map<string, { monto: number; raciones: number; nombre: string | null; zona: string | null }> {
  const file = findGlobFile(dir, /^Padron Teknofood\.csv$/i);
  const out = new Map<
    string,
    { monto: number; raciones: number; nombre: string | null; zona: string | null }
  >();
  if (!file) return out;
  const rows = readCsvRows(file);
  if (rows.length < 2) return out;
  const hdr = rows[0].map((h) => String(h ?? '').trim().toUpperCase());
  const iId = hdr.indexOf('ID');
  const iNombre = hdr.findIndex((h) => h.includes('DEPENDENCIA') || h.includes('CENTRO'));
  const iZona = hdr.indexOf('ZONA');
  const iComidas = hdr.indexOf('COMIDAS');
  const iRefrig = hdr.findIndex((h) => h.includes('REFRIGER'));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = String(r[iId >= 0 ? iId : 0] ?? '').trim();
    if (!id) continue;
    const comidas = parseEntero(iComidas >= 0 ? r[iComidas] : 0);
    const refrig = parseEntero(iRefrig >= 0 ? r[iRefrig] : 0);
    const raciones = comidas + refrig;
    const monto = raciones * TEKNOFOOD_PRECIO_RACION_ARS * TEKNOFOOD_DIAS_MES_RACION;
    out.set(id, {
      monto,
      raciones,
      nombre: iNombre >= 0 ? String(r[iNombre] ?? '').trim() || null : null,
      zona: iZona >= 0 ? String(r[iZona] ?? '').trim() || null : null,
    });
  }
  return out;
}

/** Carga y fusiona los tres CSV de actualización mensual por ID de padrón. */
export function loadRankingRacionesFromCsvDir(dir: string): RankingRacionesCsvRow[] {
  const carne = loadCarneById(dir);
  const verduras = loadVerdurasById(dir);
  const tekno = loadTeknofoodById(dir);
  const ids = new Set<string>([...carne.keys(), ...verduras.keys(), ...tekno.keys()]);
  const rows: RankingRacionesCsvRow[] = [];

  for (const padronId of ids) {
    const c = carne.get(padronId);
    const v = verduras.get(padronId);
    const t = tekno.get(padronId);
    const montoCarne = c?.monto ?? 0;
    const montoVerdurasFrutas = v?.monto ?? 0;
    const montoTeknofood = t?.monto ?? 0;
    const cantidadRaciones = t?.raciones ?? 0;
    const montoTotalMensual = montoCarne + montoVerdurasFrutas + montoTeknofood;
    if (montoTotalMensual <= 0 && cantidadRaciones <= 0) continue;
    rows.push({
      padronId,
      nombreDependencia: t?.nombre ?? c?.nombre ?? v?.nombre ?? null,
      zonaCsv: t?.zona ?? null,
      montoCarne,
      montoVerdurasFrutas,
      montoTeknofood,
      cantidadRaciones,
      montoTotalMensual,
    });
  }

  rows.sort((a, b) => b.montoTotalMensual - a.montoTotalMensual);
  return rows;
}

export function loadRankingRacionesForPeriodo(periodo: string): RankingRacionesCsvRow[] | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  const tekno = findGlobFile(dir, /^Padron Teknofood\.csv$/i);
  const carne = findGlobFile(dir, /^Frescos Carne.*Mensual\.csv$/i);
  const verd = findGlobFile(dir, /^Frescos Verduras.*Mensual\.csv$/i);
  if (!tekno || !carne || !verd) return null;
  return loadRankingRacionesFromCsvDir(dir);
}

export type TeknofoodPadronRow = {
  monto: number;
  raciones: number;
  nombre: string | null;
  zona: string | null;
};

function isTeknofoodDesgloseRow(rubro: string, subrubro: string | null): boolean {
  if (String(rubro ?? '').trim() !== 'monto_invertido') return false;
  const sr = String(subrubro ?? '').trim().toLowerCase();
  return sr === '' || sr === 'teknofood';
}

/** Busca fila Teknofood del padrón por `numero_oficial` o `comedor_id`. */
export function lookupTeknofoodPadronForComedor(
  periodo: string,
  comedorId: string | null | undefined,
  numeroOficial: string | null | undefined
): TeknofoodPadronRow | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  const map = loadTeknofoodById(dir);
  for (const key of [numeroOficial, comedorId]) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const hit = map.get(k);
    if (hit && (hit.monto > 0 || hit.raciones > 0)) return hit;
  }
  return null;
}

export function applyTeknofoodCsvToPresupuestoDesglose<
  T extends { rubro: string; subrubro: string | null; monto: number; cantidad: number; unidad: string | null },
>(desglose: T[], tekno: TeknofoodPadronRow): T[] {
  const idx = desglose.findIndex((r) => isTeknofoodDesgloseRow(r.rubro, r.subrubro));
  const row = {
    rubro: 'monto_invertido',
    subrubro: 'teknofood',
    monto: tekno.monto,
    cantidad: tekno.raciones,
    unidad: 'raciones',
  } as T;
  if (idx >= 0) {
    return desglose.map((r, i) => (i === idx ? { ...r, ...row } : r));
  }
  return [...desglose, row];
}
