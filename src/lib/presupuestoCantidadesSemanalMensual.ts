/**
 * Kilogramos y unidades de frutas/verduras/carnes cargados como **semanales**
 * se expresan en **equivalente mensual** para alinearlos a montos presupuestarios mensuales.
 * Factor = 4 semanas por mes.
 */
export const SEMANAL_A_MENSUAL_FACTOR = 4;

export function cantidadSemanalAMensual(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x) || x === 0) return x;
  return x * SEMANAL_A_MENSUAL_FACTOR;
}

const FRESCOS_DESGLOSE_KEYS = [
  "cebolla_kg",
  "zanahoria_kg",
  "zapallo_kg",
  "papa_kg",
  "acelga_kg",
  "frutas_unidades",
  "carne_vacuna_kg",
  "pollo_kg",
  "cerdo_kg",
] as const;

/** Escala solo claves conocidas de desglose de frescos/carnes (semanal → equivalente mensual). */
export function escalarFrescosDesgloseSemanalAMensual(d: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...d };
  for (const k of FRESCOS_DESGLOSE_KEYS) {
    out[k] = cantidadSemanalAMensual(Number(out[k] ?? 0));
  }
  return out;
}

export const ETIQUETA_EQUIVALENTE_MENSUAL_FRESCOS_CARNES =
  "Cantidades en equivalente mensual (origen semanal × 4 semanas), alineadas a montos mensuales.";
