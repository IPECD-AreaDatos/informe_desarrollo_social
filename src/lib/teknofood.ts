/** Monto institucional fijo Teknofood (ARS) para KPI, totales globales y prorrateos. */
export const TEKNOFOOD_MONTO_FIJO_ARS = 2_118_950_400;

/**
 * Precio de referencia **por ración y por día** (ARS). Solo referencia documental;
 * el monto por dependencia usa reparto proporcional sobre el total de raciones del periodo.
 */
export const TEKNOFOOD_PRECIO_RACION_ARS = 1600;

/** Días por mes (referencia histórica; ya no define el monto mensual por dependencia). */
export const TEKNOFOOD_DIAS_MES_RACION = 30;

/** Promedio de días por mes (365/12) para expresar un valor diario en equivalente mensual. */
export const TEKNOFOOD_DIAS_PROMEDIO_POR_MES = 365 / 12;

/** Precio de referencia por ración en equivalente mensual (diario × 365/12). */
export const TEKNOFOOD_PRECIO_RACION_MENSUAL_ARS = TEKNOFOOD_PRECIO_RACION_ARS * TEKNOFOOD_DIAS_PROMEDIO_POR_MES;

/**
 * Monto Teknofood de una dependencia:
 * monto fijo mensual × (raciones del comedor ÷ raciones totales del periodo).
 */
export function montoTeknofoodDesdeRaciones(
  cantidadRacionesComedor: number,
  totalRacionesPeriodo: number
): number {
  const q = Math.max(0, Math.round(Number(cantidadRacionesComedor) || 0));
  const total = Math.max(0, Math.round(Number(totalRacionesPeriodo) || 0));
  if (q <= 0 || total <= 0) return 0;
  return (TEKNOFOOD_MONTO_FIJO_ARS * q) / total;
}

export function esRubroTeknofoodPresupuesto(rubro: string, subrubro: string | null | undefined): boolean {
  if (String(rubro ?? '').trim() !== 'monto_invertido') return false;
  const sr = String(subrubro ?? '').trim().toLowerCase();
  return sr === '' || sr === 'teknofood';
}
