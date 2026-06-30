import fs from 'fs';
import path from 'path';
import { cantidadSemanalAMensual } from './presupuestoCantidadesSemanalMensual';
import { montoTeknofoodDesdeRaciones } from './teknofood';
import { periodoSlugParaDatos } from './periodosDemo';

/** Datos de ranking «raciones consolidado» por ID de padrón (CSV). */
export interface RankingRacionesCsvRow {
  padronId: string;
  nombreDependencia: string | null;
  zonaCsv: string | null;
  montoCarne: number;
  montoVerdurasFrutas: number;
  montoTeknofood: number;
  cantidadRaciones: number;
  montoTotalMensual: number;
}

/**
 * ID canónico de padrón: unifica variantes como M5 y M05 (misma dependencia).
 * IDs solo numéricos (p. ej. 52) no se modifican.
 */
export function canonicalPadronId(id: string): string {
  const s = String(id ?? '').trim();
  if (!s) return s;
  const m = /^([A-Za-z]+)0*(\d+)$/i.exec(s.replace(/-/g, ''));
  if (!m) return s;
  const prefix = m[1].toUpperCase();
  const num = parseInt(m[2], 10);
  if (!Number.isFinite(num)) return s;
  return `${prefix}${String(num).padStart(2, '0')}`;
}

/** Variantes de búsqueda para un ID de padrón (M5, M05, etc.). */
export function padronIdAliases(id: string): string[] {
  const s = String(id ?? '').trim();
  if (!s) return [];
  const out = new Set<string>([s, canonicalPadronId(s)]);
  const m = /^([A-Za-z]+)0*(\d+)$/i.exec(s.replace(/-/g, ''));
  if (m) {
    const prefix = m[1].toUpperCase();
    const num = parseInt(m[2], 10);
    if (Number.isFinite(num)) {
      out.add(`${prefix}${num}`);
      out.add(`${prefix}${String(num).padStart(2, '0')}`);
    }
  }
  return [...out];
}

/** Nombre normalizado para enlazar el mismo comedor con distinto ID (p. ej. 73 en Teknofood y 74 en frescos). */
export function normalizeDependenciaNombre(nombre: string | null | undefined): string {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(comedor|merendero|centro)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function expandPadronLookupKeys(
  id: string,
  aliasMap?: Map<string, Set<string>>
): string[] {
  const keys = new Set<string>();
  for (const a of padronIdAliases(id)) keys.add(a);
  const canon = canonicalPadronId(id);
  keys.add(canon);
  if (aliasMap) {
    for (const a of aliasMap.get(canon) ?? []) keys.add(a);
  }
  return [...keys];
}

export function getMapByPadronId<T>(
  map: Map<string, T>,
  id: string,
  aliasMap?: Map<string, Set<string>>
): T | undefined {
  for (const key of expandPadronLookupKeys(id, aliasMap)) {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

let cachedAliasDir: string | null = null;
let cachedAliasMap = new Map<string, Set<string>>();

/** Agrupa IDs de padrón que comparten el mismo nombre de dependencia en los CSV del mes. */
export function buildPadronAliasMapForDir(dir: string): Map<string, Set<string>> {
  const nombreToIds = new Map<string, string[]>();

  const add = (rawId: string, nombre: string | null) => {
    const id = canonicalPadronId(rawId);
    if (!id) return;
    const norm = normalizeDependenciaNombre(nombre);
    if (norm.length < 4) return;
    const list = nombreToIds.get(norm) ?? [];
    if (!list.includes(id)) list.push(id);
    nombreToIds.set(norm, list);
  };

  for (const [id, row] of loadCarneById(dir)) add(id, row.nombre);
  for (const [id, row] of loadVerdurasById(dir)) add(id, row.nombre);
  for (const [id, row] of loadTeknofoodById(dir)) add(id, row.nombre);

  const out = new Map<string, Set<string>>();

  const ensureSet = (id: string): Set<string> => {
    const canon = canonicalPadronId(id);
    let set = out.get(canon);
    if (!set) {
      set = new Set(padronIdAliases(canon));
      set.add(canon);
      out.set(canon, set);
    }
    return set;
  };

  for (const ids of nombreToIds.values()) {
    if (ids.length < 2) {
      for (const id of ids) ensureSet(id);
      continue;
    }
    const merged = new Set<string>();
    for (const id of ids) {
      for (const a of padronIdAliases(id)) merged.add(a);
      merged.add(id);
      merged.add(canonicalPadronId(id));
    }
    for (const id of ids) {
      const set = ensureSet(id);
      for (const a of merged) set.add(a);
    }
  }

  return out;
}

export function getPadronAliasMapForDir(dir: string): Map<string, Set<string>> {
  if (cachedAliasDir === dir && cachedAliasMap.size > 0) return cachedAliasMap;
  cachedAliasMap = buildPadronAliasMapForDir(dir);
  cachedAliasDir = dir;
  return cachedAliasMap;
}

export function getPadronAliasMapForPeriodo(periodo: string): Map<string, Set<string>> {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return new Map();
  return getPadronAliasMapForDir(dir);
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

/** Kg/unidades semanales del CSV (p. ej. `8,00`, `16,1`). */
function parseDecimalSemanal(raw: unknown): number {
  let s = String(raw ?? '')
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '');
  if (!s) return 0;
  if (/,/.test(s)) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0].replace(/\./g, '') + '.' + parts[1];
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  } else {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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
  const slug = periodoSlugParaDatos(String(periodo ?? '').trim().toLowerCase());
  if (!slug) return null;
  const parts = slug.split('-');
  if (parts.length < 2) return null;
  const mesSlug = parts.slice(0, -1).join('-');
  const carpeta = MESES_SLUG_A_CARPETA[mesSlug];
  if (!carpeta) return null;
  const dir = path.join(process.cwd(), 'docs', carpeta);
  return fs.existsSync(dir) ? dir : null;
}

export type CarneCsvRow = {
  monto: number;
  nombre: string | null;
  /** Kg mensuales (semanal × 4): vacuna + pollo + cerdo. */
  carnesKgMensual: number;
};

export type VerdurasCsvRow = {
  monto: number;
  nombre: string | null;
  verdurasKgMensual: number;
  frutasUnidadesMensual: number;
};

function loadCarneById(dir: string): Map<string, CarneCsvRow> {
  const file = findGlobFile(dir, /^Frescos Carne.*Mensual\.csv$/i);
  const out = new Map<string, CarneCsvRow>();
  if (!file) return out;
  const rows = readCsvRows(file);
  if (rows.length < 3) return out;
  const gastoCol = rows[0].findIndex((h) => /gasto\s*mensual/i.test(String(h ?? '')));
  const colGasto = gastoCol >= 0 ? gastoCol : 16;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[0] ?? '').trim());
    if (!id) continue;
    const kgSem =
      parseDecimalSemanal(r[10]) + parseDecimalSemanal(r[12]) + parseDecimalSemanal(r[14]);
    out.set(id, {
      monto: parseArsMoney(r[colGasto]),
      nombre: String(r[1] ?? '').trim() || null,
      carnesKgMensual: cantidadSemanalAMensual(kgSem),
    });
  }
  return out;
}

function loadVerdurasById(dir: string): Map<string, VerdurasCsvRow> {
  const file = findGlobFile(dir, /^Frescos Verduras.*Mensual\.csv$/i);
  const out = new Map<string, VerdurasCsvRow>();
  if (!file) return out;
  const rows = readCsvRows(file);
  if (rows.length < 3) return out;
  const gastoCol = rows[0].findIndex((h) => /gasto\s*mensual/i.test(String(h ?? '')));
  const colGasto = gastoCol >= 0 ? gastoCol : 22;
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[0] ?? '').trim());
    if (!id) continue;
    const kgVerdSem =
      parseDecimalSemanal(r[10]) +
      parseDecimalSemanal(r[12]) +
      parseDecimalSemanal(r[14]) +
      parseDecimalSemanal(r[16]) +
      parseDecimalSemanal(r[18]);
    const frutasSem = parseDecimalSemanal(r[20]);
    out.set(id, {
      monto: parseArsMoney(r[colGasto]),
      nombre: String(r[1] ?? '').trim() || null,
      verdurasKgMensual: cantidadSemanalAMensual(kgVerdSem),
      frutasUnidadesMensual: cantidadSemanalAMensual(frutasSem),
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
    const id = canonicalPadronId(String(r[iId >= 0 ? iId : 0] ?? '').trim());
    if (!id) continue;
    const comidas = parseEntero(iComidas >= 0 ? r[iComidas] : 0);
    const refrig = parseEntero(iRefrig >= 0 ? r[iRefrig] : 0);
    const raciones = comidas + refrig;
    out.set(id, {
      monto: 0,
      raciones,
      nombre: iNombre >= 0 ? String(r[iNombre] ?? '').trim() || null : null,
      zona: iZona >= 0 ? String(r[iZona] ?? '').trim() || null : null,
    });
  }

  let totalRaciones = 0;
  for (const row of out.values()) totalRaciones += row.raciones;
  for (const [id, row] of out) {
    out.set(id, {
      ...row,
      monto: montoTeknofoodDesdeRaciones(row.raciones, totalRaciones),
    });
  }
  return out;
}

/** Suma de raciones Teknofood (comidas + refrigerios) del padrón CSV del periodo. */
export function totalRacionesTeknofoodForDir(dir: string): number {
  const map = loadTeknofoodById(dir);
  let total = 0;
  for (const row of map.values()) total += row.raciones;
  return total;
}

export function totalRacionesTeknofoodForPeriodo(periodo: string): number {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return 0;
  return totalRacionesTeknofoodForDir(dir);
}

export function loadRankingRacionesFromCsvDir(dir: string): RankingRacionesCsvRow[] {
  const carne = loadCarneById(dir);
  const verduras = loadVerdurasById(dir);
  const tekno = loadTeknofoodById(dir);
  const aliasMap = getPadronAliasMapForDir(dir);

  const representatives = new Set<string>();
  for (const rawId of [...carne.keys(), ...verduras.keys(), ...tekno.keys()]) {
    const keys = expandPadronLookupKeys(rawId, aliasMap);
    representatives.add([...keys].sort()[0]);
  }

  const rows: RankingRacionesCsvRow[] = [];

  for (const padronId of representatives) {
    const lookupKeys = expandPadronLookupKeys(padronId, aliasMap);
    const c = getMapByPadronId(carne, padronId, aliasMap);
    const v = getMapByPadronId(verduras, padronId, aliasMap);
    const t = getMapByPadronId(tekno, padronId, aliasMap);
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

/** Busca fila Teknofood del padrón por `numero_oficial` o `comedor_id`. */
export function lookupTeknofoodPadronForComedor(
  periodo: string,
  comedorId: string | null | undefined,
  numeroOficial: string | null | undefined
): TeknofoodPadronRow | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  const map = loadTeknofoodById(dir);
  const aliasMap = getPadronAliasMapForDir(dir);
  for (const key of [numeroOficial, comedorId]) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const hit = getMapByPadronId(map, k, aliasMap);
    if (hit && (hit.monto > 0 || hit.raciones > 0)) return hit;
  }
  return null;
}

export type FrescosPadronRow = {
  montoCarne: number;
  montoVerdurasFrutas: number;
  carnesKgMensual: number;
  verdurasKgMensual: number;
  frutasUnidadesMensual: number;
};

/** Montos mensuales de carnes y frutas/verduras desde CSV del periodo. */
export function lookupFrescosCsvForComedor(
  periodo: string,
  comedorId: string | null | undefined,
  numeroOficial: string | null | undefined
): FrescosPadronRow | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  if (
    !findGlobFile(dir, /^Frescos Carne.*Mensual\.csv$/i) ||
    !findGlobFile(dir, /^Frescos Verduras.*Mensual\.csv$/i)
  ) {
    return null;
  }
  const carne = loadCarneById(dir);
  const verduras = loadVerdurasById(dir);
  const aliasMap = getPadronAliasMapForDir(dir);
  for (const key of [numeroOficial, comedorId]) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const c = getMapByPadronId(carne, k, aliasMap);
    const v = getMapByPadronId(verduras, k, aliasMap);
    const montoCarne = c?.monto ?? 0;
    const montoVerdurasFrutas = v?.monto ?? 0;
    if (montoCarne > 0 || montoVerdurasFrutas > 0) {
      return {
        montoCarne,
        montoVerdurasFrutas,
        carnesKgMensual: c?.carnesKgMensual ?? 0,
        verdurasKgMensual: v?.verdurasKgMensual ?? 0,
        frutasUnidadesMensual: v?.frutasUnidadesMensual ?? 0,
      };
    }
  }
  return null;
}

/** Etiqueta única de cantidad mensual para la fila «Frutas y verduras». */
export function formatCantidadRefrigerioMensual(
  verdurasKgMensual: number,
  frutasUnidadesMensual: number
): string | null {
  const parts: string[] = [];
  if (verdurasKgMensual > 0) {
    parts.push(
      `${Math.round(verdurasKgMensual).toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg`
    );
  }
  if (frutasUnidadesMensual > 0) {
    parts.push(
      `${Math.round(frutasUnidadesMensual).toLocaleString('es-AR', { maximumFractionDigits: 0 })} u.`
    );
  }
  return parts.length ? parts.join(' y ') : null;
}

export function applyFrescosCsvToPresupuestoDesglose<
  T extends { rubro: string; subrubro: string | null; monto: number; cantidad: number; unidad: string | null },
>(desglose: T[], frescos: FrescosPadronRow): T[] {
  desglose = desglose.filter(
    (r) =>
      !(
        String(r.rubro ?? '').trim() === 'refrigerio_comida' &&
        ['verduras_kg', 'frutas_unidades'].includes(String(r.subrubro ?? '').trim())
      )
  );

  const upsert = (
    rubro: string,
    subrubro: string,
    monto: number,
    cantidad: number,
    unidad: string | null
  ) => {
    const idx = desglose.findIndex(
      (r) =>
        String(r.rubro ?? '').trim() === rubro &&
        String(r.subrubro ?? '').trim().toLowerCase() === subrubro
    );
    const row = { rubro, subrubro, monto, cantidad, unidad } as T;
    if (idx >= 0) {
      desglose = desglose.map((r, i) => (i === idx ? { ...r, ...row } : r));
    } else if (monto > 0 || cantidad > 0 || unidad) {
      desglose = [...desglose, row];
    }
  };

  const cantidadRefrigerio = formatCantidadRefrigerioMensual(
    frescos.verdurasKgMensual,
    frescos.frutasUnidadesMensual
  );
  upsert('refrigerio_comida', 'frutas_verduras', frescos.montoVerdurasFrutas, 0, cantidadRefrigerio);
  upsert('carnes', 'carne', frescos.montoCarne, frescos.carnesKgMensual, 'kg');
  return desglose;
}

export function applyTeknofoodCsvToPresupuestoDesglose<
  T extends { rubro: string; subrubro: string | null; monto: number; cantidad: number; unidad: string | null },
>(desglose: T[], tekno: TeknofoodPadronRow): T[] {
  const isTekno = (rubro: string, subrubro: string | null) => {
    if (String(rubro ?? '').trim() !== 'monto_invertido') return false;
    const sr = String(subrubro ?? '').trim().toLowerCase();
    return sr === '' || sr === 'teknofood';
  };
  const idx = desglose.findIndex((r) => isTekno(r.rubro, r.subrubro));
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
