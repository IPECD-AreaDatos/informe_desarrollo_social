import {
  canonicalPadronId,
  docsDirForPeriodo,
  expandPadronLookupKeys,
  findGlobFile,
  getMapByPadronId,
  getPadronAliasMapForDir,
  loadTeknofoodById,
  padronIdAliases,
  parseArsMoney,
  parseEntero,
  readCsvRows,
} from './rankingRacionesCsv';

export interface RankingOtrosRecursosCsvRow {
  padronId: string;
  nombreDependencia: string | null;
  zonaCsv: string | null;
  montoGas: number;
  montoLimpieza: number;
  montoFumigacion: number;
  cantidadBeneficiarios: number;
  montoTotalMensual: number;
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (String(rows[i][0] ?? '').trim().toUpperCase() === 'ID') return i;
  }
  return -1;
}

function findCostoMensualColumn(rows: string[][], hdrIdx: number): number {
  const isMensualCol = (h: string) => {
    const t = String(h ?? '').trim();
    if (!/costo\s*mensual|gasto\s*mensual/i.test(t)) return false;
    return !/trimestre|bimestral|total/i.test(t);
  };
  for (const ri of [hdrIdx, hdrIdx - 1, 0]) {
    if (ri < 0 || ri >= rows.length) continue;
    const idx = rows[ri].findIndex((h) => isMensualCol(String(h)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function loadGasCantidadesById(
  dir: string
): Map<string, { garrafas_10: number; garrafas_15: number; garrafas_45: number }> {
  const file = findGlobFile(dir, /^GAS.*Mensual\.csv$/i);
  const out = new Map<string, { garrafas_10: number; garrafas_15: number; garrafas_45: number }>();
  if (!file) return out;
  const rows = readCsvRows(file);
  const hdrIdx = findHeaderRowIndex(rows);
  if (hdrIdx < 0) return out;
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[0] ?? '').trim());
    if (!id) continue;
    out.set(id, {
      garrafas_10: parseEntero(r[10]),
      garrafas_15: parseEntero(r[11]),
      garrafas_45: parseEntero(r[12]),
    });
  }
  return out;
}

function loadLimpiezaUnidadesById(dir: string): Map<string, number> {
  const file = findGlobFile(dir, /^Limpieza.*Mensual\.csv$/i);
  const out = new Map<string, number>();
  if (!file) return out;
  const rows = readCsvRows(file);
  const hdrIdx = findHeaderRowIndex(rows);
  if (hdrIdx < 0) return out;
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[0] ?? '').trim());
    if (!id) continue;
    let sum = 0;
    for (let c = 10; c <= 18; c++) {
      sum += parseEntero(r[c]);
    }
    if (sum > 0) out.set(id, sum);
  }
  return out;
}

function loadCostoMensualById(
  dir: string,
  pattern: RegExp
): Map<string, { monto: number; nombre: string | null }> {
  const file = findGlobFile(dir, pattern);
  const out = new Map<string, { monto: number; nombre: string | null }>();
  if (!file) return out;
  const rows = readCsvRows(file);
  const hdrIdx = findHeaderRowIndex(rows);
  if (hdrIdx < 0) return out;
  const colCosto = findCostoMensualColumn(rows, hdrIdx);
  if (colCosto < 0) return out;
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[0] ?? '').trim());
    if (!id) continue;
    const monto = parseArsMoney(r[colCosto]);
    if (monto <= 0) continue;
    out.set(id, {
      monto,
      nombre: String(r[1] ?? '').trim() || null,
    });
  }
  return out;
}

export function loadRankingOtrosRecursosFromCsvDir(dir: string): RankingOtrosRecursosCsvRow[] {
  const gas = loadCostoMensualById(dir, /^GAS.*Mensual\.csv$/i);
  const limpieza = loadCostoMensualById(dir, /^Limpieza.*Mensual\.csv$/i);
  const fumigacion = loadCostoMensualById(dir, /fumig.*mensual\.csv$/i);
  const tekno = loadTeknofoodById(dir);
  const aliasMap = getPadronAliasMapForDir(dir);

  const representatives = new Set<string>();
  for (const rawId of [...gas.keys(), ...limpieza.keys(), ...fumigacion.keys(), ...tekno.keys()]) {
    const keys = expandPadronLookupKeys(rawId, aliasMap);
    representatives.add([...keys].sort()[0]);
  }

  const rows: RankingOtrosRecursosCsvRow[] = [];

  for (const padronId of representatives) {
    const g = getMapByPadronId(gas, padronId, aliasMap);
    const l = getMapByPadronId(limpieza, padronId, aliasMap);
    const f = getMapByPadronId(fumigacion, padronId, aliasMap);
    const t = getMapByPadronId(tekno, padronId, aliasMap);
    const montoGas = g?.monto ?? 0;
    const montoLimpieza = l?.monto ?? 0;
    const montoFumigacion = f?.monto ?? 0;
    const cantidadBeneficiarios = t?.raciones ?? 0;
    const montoTotalMensual = montoGas + montoLimpieza + montoFumigacion;
    if (montoTotalMensual <= 0 && cantidadBeneficiarios <= 0) continue;
    rows.push({
      padronId,
      nombreDependencia: t?.nombre ?? g?.nombre ?? l?.nombre ?? f?.nombre ?? null,
      zonaCsv: t?.zona ?? null,
      montoGas,
      montoLimpieza,
      montoFumigacion,
      cantidadBeneficiarios,
      montoTotalMensual,
    });
  }

  rows.sort((a, b) => b.montoTotalMensual - a.montoTotalMensual);
  return rows;
}

export function loadRankingOtrosRecursosForPeriodo(
  periodo: string
): RankingOtrosRecursosCsvRow[] | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  const gas = findGlobFile(dir, /^GAS.*Mensual\.csv$/i);
  const limpieza = findGlobFile(dir, /^Limpieza.*Mensual\.csv$/i);
  const fumigacion = findGlobFile(dir, /fumig.*mensual\.csv$/i);
  const tekno = findGlobFile(dir, /^Padron Teknofood\.csv$/i);
  if (!gas || !limpieza || !fumigacion || !tekno) return null;
  return loadRankingOtrosRecursosFromCsvDir(dir);
}

export type OtrosRecursosPadronRow = {
  montoGas: number;
  montoLimpieza: number;
  montoFumigacion: number;
  montoTotalMensual: number;
  garrafas_10: number;
  garrafas_15: number;
  garrafas_45: number;
  limpiezaUnidades: number;
};

/** Busca gas + limpieza + fumigación del padrón por `numero_oficial` o `comedor_id`. */
export function lookupOtrosRecursosForComedor(
  periodo: string,
  comedorId: string | null | undefined,
  numeroOficial: string | null | undefined
): OtrosRecursosPadronRow | null {
  const rows = loadRankingOtrosRecursosForPeriodo(periodo);
  if (!rows?.length) return null;
  const dir = docsDirForPeriodo(periodo);
  const gasMap = dir ? loadGasCantidadesById(dir) : new Map();
  const limpMap = dir ? loadLimpiezaUnidadesById(dir) : new Map();
  const aliasMap = dir ? getPadronAliasMapForDir(dir) : new Map();
  for (const key of [numeroOficial, comedorId]) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const lookupKeys = new Set(expandPadronLookupKeys(k, aliasMap));
    const hit = rows.find((r) => lookupKeys.has(r.padronId) || lookupKeys.has(canonicalPadronId(r.padronId)));
    if (hit && hit.montoTotalMensual > 0) {
      const gasQ = getMapByPadronId(gasMap, k, aliasMap);
      return {
        montoGas: hit.montoGas,
        montoLimpieza: hit.montoLimpieza,
        montoFumigacion: hit.montoFumigacion,
        montoTotalMensual: hit.montoTotalMensual,
        garrafas_10: gasQ?.garrafas_10 ?? 0,
        garrafas_15: gasQ?.garrafas_15 ?? 0,
        garrafas_45: gasQ?.garrafas_45 ?? 0,
        limpiezaUnidades: getMapByPadronId(limpMap, k, aliasMap) ?? 0,
      };
    }
  }
  return null;
}

function etiquetaUnidadGas(g10: number, g15: number, g45: number): string | null {
  const partes: string[] = [];
  if (g10 > 0) partes.push(`${g10}×10 kg`);
  if (g15 > 0) partes.push(`${g15}×15 kg`);
  if (g45 > 0) partes.push(`${g45}×45 kg`);
  return partes.length ? `garrafas (${partes.join(', ')})` : null;
}

export function applyOtrosRecursosCsvToPresupuestoDesglose<
  T extends { rubro: string; subrubro: string | null; monto: number; cantidad: number; unidad: string | null },
>(desglose: T[], otros: OtrosRecursosPadronRow): T[] {
  const upsert = (
    subrubro: string,
    monto: number,
    cantidad: number,
    unidad: string | null
  ) => {
    const idx = desglose.findIndex(
      (r) => r.rubro === 'otros_recursos' && String(r.subrubro ?? '').trim() === subrubro
    );
    const row = {
      rubro: 'otros_recursos',
      subrubro,
      monto,
      cantidad,
      unidad,
    } as T;
    if (idx >= 0) {
      desglose = desglose.map((r, i) => (i === idx ? { ...r, ...row } : r));
    } else if (monto > 0 || cantidad > 0) {
      desglose = [...desglose, row];
    }
  };

  const g10 = otros.garrafas_10;
  const g15 = otros.garrafas_15;
  const g45 = otros.garrafas_45;
  const totalGarrafas = g10 + g15 + g45;
  upsert(
    'gas',
    otros.montoGas,
    totalGarrafas,
    totalGarrafas > 0 ? etiquetaUnidadGas(g10, g15, g45) : null
  );
  upsert('limpieza', otros.montoLimpieza, otros.limpiezaUnidades, otros.limpiezaUnidades > 0 ? 'un.' : null);
  upsert(
    'fumigacion',
    otros.montoFumigacion,
    otros.montoFumigacion > 0 ? 1 : 0,
    otros.montoFumigacion > 0 ? 'servicio' : null
  );
  return desglose;
}
