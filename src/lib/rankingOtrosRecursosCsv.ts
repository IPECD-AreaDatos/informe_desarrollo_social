import {
  docsDirForPeriodo,
  findGlobFile,
  loadTeknofoodById,
  parseArsMoney,
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
    const id = String(r[0] ?? '').trim();
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
  const ids = new Set<string>([
    ...gas.keys(),
    ...limpieza.keys(),
    ...fumigacion.keys(),
    ...tekno.keys(),
  ]);
  const rows: RankingOtrosRecursosCsvRow[] = [];

  for (const padronId of ids) {
    const g = gas.get(padronId);
    const l = limpieza.get(padronId);
    const f = fumigacion.get(padronId);
    const t = tekno.get(padronId);
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

export type OtrosRecursosPadronRow = Pick<
  RankingOtrosRecursosCsvRow,
  'montoGas' | 'montoLimpieza' | 'montoFumigacion' | 'montoTotalMensual'
>;

/** Busca gas + limpieza + fumigación del padrón por `numero_oficial` o `comedor_id`. */
export function lookupOtrosRecursosForComedor(
  periodo: string,
  comedorId: string | null | undefined,
  numeroOficial: string | null | undefined
): OtrosRecursosPadronRow | null {
  const rows = loadRankingOtrosRecursosForPeriodo(periodo);
  if (!rows?.length) return null;
  for (const key of [numeroOficial, comedorId]) {
    const k = String(key ?? '').trim();
    if (!k) continue;
    const hit = rows.find((r) => r.padronId === k);
    if (hit && hit.montoTotalMensual > 0) {
      return {
        montoGas: hit.montoGas,
        montoLimpieza: hit.montoLimpieza,
        montoFumigacion: hit.montoFumigacion,
        montoTotalMensual: hit.montoTotalMensual,
      };
    }
  }
  return null;
}

export function applyOtrosRecursosCsvToPresupuestoDesglose<
  T extends { rubro: string; subrubro: string | null; monto: number; cantidad: number; unidad: string | null },
>(desglose: T[], otros: OtrosRecursosPadronRow): T[] {
  const upsert = (subrubro: string, monto: number) => {
    const idx = desglose.findIndex(
      (r) => r.rubro === 'otros_recursos' && String(r.subrubro ?? '').trim() === subrubro
    );
    const row = {
      rubro: 'otros_recursos',
      subrubro,
      monto,
      cantidad: monto > 0 ? 1 : 0,
      unidad: '$',
    } as T;
    if (idx >= 0) {
      desglose = desglose.map((r, i) => (i === idx ? { ...r, ...row } : r));
    } else if (monto > 0) {
      desglose = [...desglose, row];
    }
  };
  upsert('gas', otros.montoGas);
  upsert('limpieza', otros.montoLimpieza);
  upsert('fumigacion', otros.montoFumigacion);
  return desglose;
}
