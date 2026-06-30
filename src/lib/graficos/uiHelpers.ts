import type { GraficoLinea, GraficoWorkbook, GraficoWorkbookConTabs } from './types';
import { isWorkbookConTabs } from './types';

export const CHART_PICKER_THRESHOLD = 4;

export function needsChartPicker(charts: GraficoLinea[]): boolean {
  return charts.length > CHART_PICKER_THRESHOLD;
}

/** Becados: 2 gráficos → pestañas Capital | Interior en UI sin tocar JSON. */
export function normalizeWorkbookForUi(wb: GraficoWorkbook): GraficoWorkbook {
  if (wb.id === 'becados' && !isWorkbookConTabs(wb)) {
    const [capital, interior] = wb.charts;
    return {
      id: wb.id,
      titulo: wb.titulo,
      tabs: [
        { id: 'capital', label: 'Capital', charts: capital ? [capital] : [] },
        { id: 'interior', label: 'Interior', charts: interior ? [interior] : [] },
      ],
    } satisfies GraficoWorkbookConTabs;
  }
  return wb;
}

export function shortChartLabel(titulo: string, max = 36): string {
  if (titulo.length <= max) return titulo;
  return `${titulo.slice(0, max - 1)}…`;
}

export const RUBRO_TAB_LABELS: Record<string, string> = {
  teknofood: 'Teknofood',
  becados: 'Becados',
  gas: 'Gas',
  fumigacion: 'Fumigación',
  limpieza: 'Limpieza',
  'frutas-verduras': 'Frutas y Verduras',
  carne: 'Carne',
};
