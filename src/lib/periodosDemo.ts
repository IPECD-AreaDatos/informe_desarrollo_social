/** Periodos visibles en el selector (hasta junio 2026). */
export const PERIODOS_UI_HASTA_JUNIO_2026 = [
  { valor: 'marzo-2026', etiqueta: 'Marzo 2026' },
  { valor: 'abril-2026', etiqueta: 'Abril 2026' },
  { valor: 'mayo-2026', etiqueta: 'Mayo 2026' },
  { valor: 'junio-2026', etiqueta: 'Junio 2026' },
] as const;

export const PERIODO_DEFAULT = 'junio-2026' as const;

/** ponytail: abr–jun 2026 reutilizan planillas/BD de marzo hasta cargar datos reales */
const ALIAS_DATOS: Record<string, string> = {
  'abril-2026': 'marzo-2026',
  'mayo-2026': 'marzo-2026',
  'junio-2026': 'marzo-2026',
};

/** Slug usado para leer CSV y filtrar BD; la UI sigue mostrando el slug elegido. */
export function periodoSlugParaDatos(periodo: string): string {
  const s = String(periodo ?? '').trim().toLowerCase();
  return ALIAS_DATOS[s] ?? s;
}
