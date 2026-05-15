import { loadRankingOtrosRecursosForPeriodo } from './rankingOtrosRecursosCsv';
import { loadRankingRacionesForPeriodo } from './rankingRacionesCsv';

export interface RankingPromedioBeneficiarioCsvRow {
  padronId: string;
  nombreDependencia: string | null;
  zonaCsv: string | null;
  montoRaciones: number;
  montoOtrosRecursos: number;
  montoTotalMensual: number;
  cantidadBeneficiarios: number;
}

/** Fusiona rankings de raciones y otros recursos por ID de padrón. */
export function loadRankingPromedioBeneficiarioForPeriodo(
  periodo: string
): RankingPromedioBeneficiarioCsvRow[] | null {
  const raciones = loadRankingRacionesForPeriodo(periodo);
  const otros = loadRankingOtrosRecursosForPeriodo(periodo);
  if (!raciones?.length || !otros?.length) return null;

  const byId = new Map<string, RankingPromedioBeneficiarioCsvRow>();

  for (const row of raciones) {
    byId.set(row.padronId, {
      padronId: row.padronId,
      nombreDependencia: row.nombreDependencia,
      zonaCsv: row.zonaCsv,
      montoRaciones: row.montoTotalMensual,
      montoOtrosRecursos: 0,
      montoTotalMensual: row.montoTotalMensual,
      cantidadBeneficiarios: row.cantidadRaciones,
    });
  }

  for (const row of otros) {
    const prev = byId.get(row.padronId);
    const montoRaciones = prev?.montoRaciones ?? 0;
    const montoOtrosRecursos = row.montoTotalMensual;
    const cantidadBeneficiarios = Math.max(
      prev?.cantidadBeneficiarios ?? 0,
      row.cantidadBeneficiarios
    );
    byId.set(row.padronId, {
      padronId: row.padronId,
      nombreDependencia:
        prev?.nombreDependencia ?? row.nombreDependencia ?? null,
      zonaCsv: prev?.zonaCsv ?? row.zonaCsv ?? null,
      montoRaciones,
      montoOtrosRecursos,
      montoTotalMensual: montoRaciones + montoOtrosRecursos,
      cantidadBeneficiarios,
    });
  }

  const rows = [...byId.values()].filter(
    (r) => r.montoTotalMensual > 0 || r.cantidadBeneficiarios > 0
  );
  rows.sort((a, b) => b.montoTotalMensual - a.montoTotalMensual);
  return rows.length ? rows : null;
}
