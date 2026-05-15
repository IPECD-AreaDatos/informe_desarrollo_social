/** Monto institucional fijo Teknofood (ARS) para KPI, totales globales y prorrateos. */
export const TEKNOFOOD_MONTO_FIJO_ARS = 2_118_950_400;

/**
 * Precio de referencia **por ración y por día** (ARS), usado en ranking cuando no hay
 * monto/cantidad Teknofood en `PRESUPUESTO_DEPENDENCIA` para la fila.
 */
export const TEKNOFOOD_PRECIO_RACION_ARS = 1600;

/** Días por mes para monto Teknofood en ranking (raciones × precio diario × 30). */
export const TEKNOFOOD_DIAS_MES_RACION = 30;

/** Promedio de días por mes (365/12) para expresar un valor diario en equivalente mensual. */
export const TEKNOFOOD_DIAS_PROMEDIO_POR_MES = 365 / 12;

/** Precio de referencia por ración en equivalente mensual (diario × 365/12). */
export const TEKNOFOOD_PRECIO_RACION_MENSUAL_ARS = TEKNOFOOD_PRECIO_RACION_ARS * TEKNOFOOD_DIAS_PROMEDIO_POR_MES;

/** Monto mensual Teknofood por dependencia: raciones × precio diario × 30 días. */
export function montoTeknofoodDesdeRaciones(cantidadRaciones: number): number {
  const q = Math.max(0, Math.round(Number(cantidadRaciones) || 0));
  return q * TEKNOFOOD_PRECIO_RACION_ARS * TEKNOFOOD_DIAS_MES_RACION;
}

export function esRubroTeknofoodPresupuesto(rubro: string, subrubro: string | null | undefined): boolean {
  if (String(rubro ?? '').trim() !== 'monto_invertido') return false;
  const sr = String(subrubro ?? '').trim().toLowerCase();
  return sr === '' || sr === 'teknofood';
}
