export type GraficoSerie = {
  name: string;
  dataKey: string;
};

export type GraficoLinea = {
  id: string;
  titulo: string;
  xLabel?: string;
  yLabel?: string;
  series: GraficoSerie[];
  /** Filas: { x, [dataKey]: number } */
  data: Record<string, string | number>[];
  formatY?: 'ars' | 'number';
};

export type TablaHistorico = {
  titulo: string;
  columnas: string[];
  filas: (string | number)[][];
};

export type GraficoWorkbookSimple = {
  id: string;
  titulo: string;
  charts: GraficoLinea[];
};

export type GraficoWorkbookConTabs = {
  id: string;
  titulo: string;
  tabs: {
    id: string;
    label: string;
    charts: GraficoLinea[];
    tablas?: TablaHistorico[];
  }[];
};

export type GraficoWorkbook = GraficoWorkbookSimple | GraficoWorkbookConTabs;

export const GRAFICOS_FASE1_IDS = [
  'teknofood',
  'becados',
  'gas',
  'fumigacion',
  'limpieza',
] as const;

export const GRAFICOS_FASE2_IDS = ['frutas-verduras', 'carne'] as const;

export type GraficoWorkbookId =
  | (typeof GRAFICOS_FASE1_IDS)[number]
  | (typeof GRAFICOS_FASE2_IDS)[number];

export const GRAFICOS_ORDEN: GraficoWorkbookId[] = [
  'teknofood',
  'becados',
  'gas',
  'fumigacion',
  'limpieza',
  'frutas-verduras',
  'carne',
];

export function isWorkbookConTabs(w: GraficoWorkbook): w is GraficoWorkbookConTabs {
  return 'tabs' in w;
}
