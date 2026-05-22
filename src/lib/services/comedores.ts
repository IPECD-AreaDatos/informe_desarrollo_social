import type { Connection } from 'mysql2/promise';
import { getComedoresConnection } from '../db';
import {
  TEKNOFOOD_MONTO_FIJO_ARS,
  esRubroTeknofoodPresupuesto,
  montoTeknofoodDesdeRaciones,
} from '../teknofood';
import {
  cantidadSemanalAMensual,
  escalarFrescosDesgloseSemanalAMensual,
} from '../presupuestoCantidadesSemanalMensual';
import {
  applyOtrosRecursosCsvToPresupuestoDesglose,
  loadRankingOtrosRecursosForPeriodo,
  lookupOtrosRecursosForComedor,
} from '../rankingOtrosRecursosCsv';
import { loadRankingPromedioBeneficiarioForPeriodo } from '../rankingPromedioBeneficiarioCsv';
import {
  applyFrescosCsvToPresupuestoDesglose,
  applyTeknofoodCsvToPresupuestoDesglose,
  canonicalPadronId,
  loadRankingRacionesForPeriodo,
  expandPadronLookupKeys,
  getPadronAliasMapForPeriodo,
  lookupFrescosCsvForComedor,
  lookupTeknofoodPadronForComedor,
  totalRacionesTeknofoodForPeriodo,
} from '../rankingRacionesCsv';
/** Orden cronológico para slugs tipo `marzo-2026` (no lexicográfico). */
const MESES_SLUG: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/**
 * Totales de becados validados para el informe (cuando el resumen en base aún no coincide).
 * Clave = slug de periodo (`marzo-2026`), igual que el selector de la app.
 */
const BECADOS_RESUMEN_OFICIAL: Record<string, { monto: number; cantidad: number }> = {
  'marzo-2026': { monto: 2_255_691, cantidad: 637 },
};

/** IDs de comedor en DB son VARCHAR (1, M01, F-16, …). */
function rowComedorId(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Montos MySQL (DECIMAL / string / objeto) → número finito. */
function safeNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Cantidades semanales de refrigerio/carnes en PD → equivalente mensual (alineado a montos mensuales). */
function escalarCantidadPresupuestoDepSemanalMensual(rubro: string, cantidad: number): number {
  const r = String(rubro ?? '').trim().toLowerCase();
  if (r !== 'refrigerio_comida' && r !== 'carnes') return cantidad;
  return cantidadSemanalAMensual(cantidad);
}

function cantidadRacionesTeknofoodDesdeFila(row: {
  cantidad_raciones?: unknown;
  beneficiarios?: unknown;
}): number {
  return Math.max(Number(row.cantidad_raciones ?? 0), Number(row.beneficiarios ?? 0));
}

function montoRacionesConsolidadoDesdeFila(
  row: {
    monto_frescos?: unknown;
    cantidad_raciones?: unknown;
    beneficiarios?: unknown;
  },
  totalRacionesTeknoPeriodo: number
): number {
  const cantidadRaciones = cantidadRacionesTeknofoodDesdeFila(row);
  return (
    Number(row.monto_frescos ?? 0) +
    montoTeknofoodDesdeRaciones(cantidadRaciones, totalRacionesTeknoPeriodo)
  );
}

function mapFilaRankingRacionesConsolidado(
  r: Record<string, unknown>,
  totalRacionesTeknoPeriodo: number
): ComedoresRankingRow {
  const cantidadRaciones = cantidadRacionesTeknofoodDesdeFila(r);
  const montoTeknofood = montoTeknofoodDesdeRaciones(cantidadRaciones, totalRacionesTeknoPeriodo);
  const valor = montoRacionesConsolidadoDesdeFila(r, totalRacionesTeknoPeriodo);
  return {
    comedor_id: rowComedorId(r.comedor_id),
    nombre: String(r.nombre || 'Sin nombre').trim() || 'Sin nombre',
    zona_nombre: r.zona_nombre != null ? String(r.zona_nombre) : null,
    ambito: (String(r.ambito || 'CAPITAL') || 'CAPITAL') as Ambito,
    responsable_nombre: r.responsable_nombre != null ? String(r.responsable_nombre) : null,
    valor,
    beneficiarios: Number(r.beneficiarios ?? 0),
    cantidad_raciones: cantidadRaciones,
    monto_teknofood: montoTeknofood,
    unidad: '$',
  };
}

function mapFilaRankingOtrosRecursos(r: Record<string, unknown>): ComedoresRankingRow {
  const cantidadRaciones = cantidadRacionesTeknofoodDesdeFila(r);
  const valor = Number(r.monto_otros ?? 0);
  return {
    comedor_id: rowComedorId(r.comedor_id),
    nombre: String(r.nombre || 'Sin nombre').trim() || 'Sin nombre',
    zona_nombre: r.zona_nombre != null ? String(r.zona_nombre) : null,
    ambito: (String(r.ambito || 'CAPITAL') || 'CAPITAL') as Ambito,
    responsable_nombre: r.responsable_nombre != null ? String(r.responsable_nombre) : null,
    valor,
    beneficiarios: Number(r.beneficiarios ?? 0),
    cantidad_raciones: cantidadRaciones,
    unidad: '$',
  };
}

function mapFilaRankingPromedioBeneficiario(
  r: Record<string, unknown>,
  totalRacionesTeknoPeriodo: number
): ComedoresRankingRow {
  const cantidadRaciones = cantidadRacionesTeknofoodDesdeFila(r);
  const montoTotal =
    montoRacionesConsolidadoDesdeFila(r, totalRacionesTeknoPeriodo) + Number(r.monto_otros ?? 0);
  const benef = Number(r.beneficiarios ?? 0);
  return {
    comedor_id: rowComedorId(r.comedor_id),
    nombre: String(r.nombre || 'Sin nombre').trim() || 'Sin nombre',
    zona_nombre: r.zona_nombre != null ? String(r.zona_nombre) : null,
    ambito: (String(r.ambito || 'CAPITAL') || 'CAPITAL') as Ambito,
    responsable_nombre: r.responsable_nombre != null ? String(r.responsable_nombre) : null,
    valor: benef > 0 ? montoTotal / benef : 0,
    gasto_total_mensual: montoTotal,
    beneficiarios: benef,
    cantidad_raciones: cantidadRaciones,
    unidad: '$/benef.',
  };
}

function sqlExprCantidadRacionesTeknofoodPd(): string {
  return `COALESCE(SUM(
    CASE
      WHEN pd.rubro = 'monto_invertido'
       AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = '')
        THEN COALESCE(pd.cantidad, 0)
      ELSE 0
    END
  ), 0)`;
}

async function queryTotalRacionesTeknofoodSql(connection: Connection): Promise<number> {
  try {
    const [rows]: any = await connection.execute(
      `SELECT COALESCE(SUM(
         CASE
           WHEN pd.rubro = 'monto_invertido'
            AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = '')
             THEN COALESCE(pd.cantidad, 0)
           ELSE 0
         END
       ), 0) AS total
       FROM PRESUPUESTO_DEPENDENCIA pd
       WHERE (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)`
    );
    const t = Number((rows as { total?: unknown }[])[0]?.total ?? 0);
    if (t > 0) return t;
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  try {
    const [rows]: any = await connection.execute(
      `SELECT COALESCE(SUM(r2.cantidad_beneficiarios), 0) AS total
       FROM RACION r2
       WHERE (TRIM(COALESCE(@cp, '')) = '' OR TRIM(r2.plan_ref) <=> TRIM(CONVERT(@cp USING utf8mb4)))`
    );
    return Number((rows as { total?: unknown }[])[0]?.total ?? 0);
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'ER_NO_SUCH_TABLE') throw e;
    return 0;
  }
}

async function resolveTotalRacionesTeknofoodPeriodo(
  periodo: string,
  connection?: Connection
): Promise<number> {
  const fromCsv = totalRacionesTeknofoodForPeriodo(periodo);
  if (fromCsv > 0) return fromCsv;
  if (connection) return queryTotalRacionesTeknofoodSql(connection);
  return 0;
}

function sqlExprBeneficiariosPdRacion(subqBenefRacion: string): string {
  return `GREATEST(COALESCE(MAX(pd.beneficiarios), 0), ${subqBenefRacion})`;
}

/** Peso para reparto de «otros recursos» (misma lógica que ranking cuando no hay monto en PD). */
function pesoOtrosDesdeBeneficios(
  gas: { garrafas_10: number; garrafas_15: number; garrafas_45: number },
  limpieza: Record<string, number>,
  hayFumigacion: boolean
): number {
  let s =
    safeNumber(gas.garrafas_10) * 10 +
    safeNumber(gas.garrafas_15) * 15 +
    safeNumber(gas.garrafas_45) * 45;
  for (const v of Object.values(limpieza)) {
    s += safeNumber(v);
  }
  if (hayFumigacion) s += 1;
  return s;
}

function periodoSlugSortKey(slug: string): [number, number] {
  const parts = slug.split('-');
  if (parts.length < 2) return [0, 0];
  const year = Number(parts[parts.length - 1]);
  const mesSlug = parts.slice(0, -1).join('-').toLowerCase();
  const month = MESES_SLUG[mesSlug] ?? 0;
  return [Number.isFinite(year) ? year : 0, month];
}

export type Ambito = 'CAPITAL' | 'INTERIOR';
export type RankingTipo =
  | 'beneficiarios'
  | 'gas'
  | 'limpieza'
  | 'frescos'
  | 'responsables'
  | 'raciones'
  | 'raciones_consolidado'
  | 'becados'
  | 'refrigerio_comida'
  | 'carnes'
  | 'otros_recursos'
  | 'promedio_beneficiario';

export interface ComedoresSummary {
  total_comedores: number;
  por_ambito: { ambito: Ambito; cantidad: number }[];
  total_beneficiarios_interior: number;
  total_beneficiarios_capital: number;
  racion: {
    total_raciones: number;
    por_tipo_servicio: { tipo_servicio: string; cantidad: number }[];
  };
  recursos_globales: {
    gas_kg_equiv: number;
    gas_desglose: { garrafas_10: number; garrafas_15: number; garrafas_45: number };
    limpieza_total_articulos: number;
    limpieza_desglose: Record<string, number>;
    /** Kg totales frescos/carnes equivalente mensual (origen semanal × 4 semanas). */
    frescos_kg: number;
    /** Desglose kg/unidades equivalente mensual (origen semanal × 4 semanas). */
    frescos_desglose: Record<string, number>;
    fumigacion_count: number;
  };
  montos: {
    monto_invertido_total: number;
    monto_invertido_cantidad: number;
    becados_monto: number;
    becados_cantidad: number;
    /** Desde Anexo II: cantidades por ámbito (texto del Excel) */
    becados_capital: number;
    becados_interior: number;
    refrigerio_comida_monto: number;
    /** Kg de verduras equivalente mensual (origen semanal × 4 semanas). */
    refrigerio_verduras_kg: number;
    /** Unidades de frutas equivalente mensual (origen semanal × 4 semanas). */
    refrigerio_frutas_unidades: number;
    carnes_monto: number;
    /** Kg de carnes equivalente mensual (origen semanal × 4 semanas). */
    carnes_cantidad: number;
    otros_recursos_monto: number;
    /** Presupuesto marzo: unidades de artículos de limpieza */
    otros_limpieza_cantidad: number;
    /** Presupuesto marzo: total garrafas */
    otros_gas_cantidad: number;
    /** Presupuesto marzo: cantidad de servicios de fumigación (filas en planilla) */
    otros_fumigacion_cantidad: number;
  };
  comedores_por_zona_capital: { zona: string; cantidad: number }[];
  comedores_por_interior: {
    departamento: string;
    localidad: string | null;
    cantidad: number;
    tipos?: { tipo: string; subtipo: string | null; cantidad: number }[];
  }[];
  /** Conteos desde tipo/subtipo en COMEDOR (p. ej. ETL marzo por DEPENDENCIA) */
  comedores_por_tipo: { tipo: string; subtipo: string | null; cantidad: number }[];
  /** Solo COMEDOR en zonas CAPITAL */
  comedores_por_tipo_capital: { tipo: string; subtipo: string | null; cantidad: number }[];
  /** Interior: agregado por departamento (todas las localidades) */
  comedores_por_departamento_interior: { departamento: string; cantidad: number }[];
}

export interface ComedoresRankingRow {
  comedor_id: string;
  nombre: string;
  zona_nombre: string | null;
  ambito: Ambito;
  responsable_nombre: string | null;
  valor: number;
  beneficiarios?: number;
  unidad?: string;
  /** Suma de montos presupuesto antes de convertir a promedio (solo `promedio_beneficiario`). */
  gasto_total_mensual?: number;
  /** Parte Teknofood del consolidado de raciones. */
  monto_teknofood?: number;
  /** Cantidad de raciones (presupuesto) asociada a Teknofood. */
  cantidad_raciones?: number;
}

export interface ComedorDetail {
  comedor_id: string;
  numero_oficial: string | null;
  nombre: string;
  domicilio: string | null;
  zona_nombre: string | null;
  ambito: Ambito;
  departamento: string | null;
  localidad: string | null;
  tipo_nombre: string | null;
  subtipo_nombre: string | null;
  organismo_nombre: string | null;
  responsable_nombre: string | null;
  telefono: string | null;
  link_google_maps: string | null;
  coordenadas_lat: number | null;
  coordenadas_lng: number | null;
  beneficiarios: number | null;
  recursos: {
    gas: { garrafas_10: number; garrafas_15: number; garrafas_45: number };
    limpieza: Record<string, number>;
    frescos_kg: number;
    /** Kg y unidades en equivalente mensual (origen semanal × 4 semanas). */
    frescos_desglose: Record<string, number>;
    fumigacion: boolean;
  };
  composicion_gasto?: {
    raciones: number;
    becados: number;
    refrigerio_comida: number;
    carnes: number;
    otros_recursos: number;
    /** Suma de los rubros anteriores para esta dependencia */
    gasto_total_comedor: number;
    /** Suma de todos los montos en PRESUPUESTO_DEPENDENCIA (todas las dependencias) */
    gasto_total_global: number;
  };
  /** Líneas de presupuesto por rubro/subrubro (todos los programas cargados en ETL). Cantidades de `refrigerio_comida` y `carnes` en equivalente mensual (origen semanal × 4 semanas). */
  presupuesto_desglose?: {
    rubro: string;
    subrubro: string | null;
    monto: number;
    cantidad: number;
    unidad: string | null;
  }[];
}

export interface PeriodoOption {
  valor: string;
  etiqueta: string;
}

export interface BecarioAreaFuncionRow {
  area: string;
  funcion: string;
  categoria: string | null;
  monto: number;
}

export interface BecarioPersonaRow {
  apellido: string | null;
  nombre: string | null;
  localidad: string | null;
  ambito: Ambito | null;
  dni: string | null;
  comedor_nombre: string | null;
  domicilio: string | null;
  area: string | null;
  funcion: string | null;
  categoria: string | null;
}

export interface BecariosDesglose {
  areas: BecarioAreaFuncionRow[];
  personas: BecarioPersonaRow[];
}

async function getSummaryByPeriodo(periodo: string): Promise<ComedoresSummary> {
  const { connection, close } = await getComedoresConnection();
  try {
    const pSl = String(periodo ?? '').trim();
    await connection.execute(`SET @cp = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`, [pSl]);
    const periodBind = [pSl, pSl] as const;
    const [totalRows]: any = await connection.execute(`SELECT COUNT(*) AS total FROM COMEDOR c`);
    const [porAmbito]: any = await connection.execute(
      `SELECT z.ambito AS ambito, COUNT(DISTINCT c.comedor_id) AS cantidad
       FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
       GROUP BY z.ambito`
    );
    const [beneficiariosPorAmbito]: any = await connection.execute(
      `SELECT z.ambito AS ambito, COALESCE(SUM(r.cantidad_beneficiarios), 0) AS total
       FROM RACION r
       INNER JOIN COMEDOR c ON c.comedor_id = r.comedor_id
       INNER JOIN ZONA z ON z.zona_id = c.zona_id
       WHERE (COALESCE(?, '') = '' OR TRIM(r.plan_ref) <=> TRIM(?))
       GROUP BY z.ambito`,
      [...periodBind]
    );
    const benefInterior = Number((beneficiariosPorAmbito as any[]).find((r: any) => r.ambito === 'INTERIOR')?.total ?? 0);
    const benefCapital = Number((beneficiariosPorAmbito as any[]).find((r: any) => r.ambito === 'CAPITAL')?.total ?? 0);
    const [racionTotal]: any = await connection.execute(
      `SELECT COUNT(*) AS total FROM RACION WHERE (COALESCE(?, '') = '' OR TRIM(plan_ref) <=> TRIM(?))`,
      [...periodBind]
    );
    const [racionPorTipo]: any = await connection.execute(
      `SELECT tipo_servicio AS tipo_servicio, COUNT(*) AS cantidad
       FROM RACION WHERE (COALESCE(?, '') = '' OR TRIM(plan_ref) <=> TRIM(?)) GROUP BY tipo_servicio`,
      [...periodBind]
    );
    const [gas]: any = await connection.execute(
      `SELECT COALESCE(SUM(g.garrafas_10kg * 10 + g.garrafas_15kg * 15 + g.garrafas_45kg * 45), 0) AS kg,
              COALESCE(SUM(g.garrafas_10kg), 0) AS g10, COALESCE(SUM(g.garrafas_15kg), 0) AS g15, COALESCE(SUM(g.garrafas_45kg), 0) AS g45
       FROM BENEFICIO_GAS g WHERE (COALESCE(?, '') = '' OR TRIM(g.periodo) <=> TRIM(?))`,
      [...periodBind]
    );
    const [limp]: any = await connection.execute(
      `SELECT COALESCE(SUM(l.lavandina_4lt + l.detergente_45lt + l.desengrasante_5lt + l.trapo_piso + l.trapo_rejilla + l.virulana + l.esponja + l.escobillon + l.escurridor), 0) AS total,
              COALESCE(SUM(l.lavandina_4lt), 0) AS lavandina_4lt, COALESCE(SUM(l.detergente_45lt), 0) AS detergente_45lt,
              COALESCE(SUM(l.desengrasante_5lt), 0) AS desengrasante_5lt, COALESCE(SUM(l.trapo_piso), 0) AS trapo_piso,
              COALESCE(SUM(l.trapo_rejilla), 0) AS trapo_rejilla, COALESCE(SUM(l.virulana), 0) AS virulana,
              COALESCE(SUM(l.esponja), 0) AS esponja, COALESCE(SUM(l.escobillon), 0) AS escobillon, COALESCE(SUM(l.escurridor), 0) AS escurridor
       FROM BENEFICIO_LIMPIEZA l WHERE (COALESCE(?, '') = '' OR TRIM(l.periodo) <=> TRIM(?))`,
      [...periodBind]
    );
    const [frescos]: any = await connection.execute(
      `SELECT COALESCE(SUM(f.cebolla_kg + f.zanahoria_kg + f.zapallo_kg + f.papa_kg + f.acelga_kg + f.carne_vacuna_kg + f.pollo_kg + f.cerdo_kg), 0) AS kg,
              COALESCE(SUM(f.cebolla_kg), 0) AS cebolla_kg, COALESCE(SUM(f.zanahoria_kg), 0) AS zanahoria_kg,
              COALESCE(SUM(f.zapallo_kg), 0) AS zapallo_kg, COALESCE(SUM(f.papa_kg), 0) AS papa_kg, COALESCE(SUM(f.acelga_kg), 0) AS acelga_kg,
              COALESCE(SUM(f.frutas_unidades), 0) AS frutas_unidades, COALESCE(SUM(f.carne_vacuna_kg), 0) AS carne_vacuna_kg,
              COALESCE(SUM(f.pollo_kg), 0) AS pollo_kg, COALESCE(SUM(f.cerdo_kg), 0) AS cerdo_kg
       FROM BENEFICIO_FRESCOS f WHERE (COALESCE(?, '') = '' OR TRIM(f.periodo) <=> TRIM(?))`,
      [...periodBind]
    );
    const [fum]: any = await connection.execute(
      `SELECT COUNT(*) AS n FROM BENEFICIO_FUMIGACION WHERE (COALESCE(?, '') = '' OR TRIM(periodo) <=> TRIM(?))`,
      [...periodBind]
    );
    let montos: any[] = [];
    try {
      const [m]: any = await connection.execute(
        `SELECT
           COALESCE((
             SELECT MAX(t.monto)
             FROM PRESUPUESTO_TEKNOFOOD t
             WHERE t.escala = 'MENSUAL' AND t.concepto = 'raciones_mensuales'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(t.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS monto_invertido_total,
           COALESCE((
             SELECT MAX(
               CASE
                 WHEN COALESCE(t.cantidad_comida, 0) + COALESCE(t.cantidad_refrigerio, 0) > 0
                 THEN COALESCE(t.cantidad_comida, 0) + COALESCE(t.cantidad_refrigerio, 0)
                 ELSE t.cantidad
               END
             )
             FROM PRESUPUESTO_TEKNOFOOD t
             WHERE t.escala = 'DIARIO' AND t.concepto = 'raciones_diarias'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(t.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS monto_invertido_cantidad,
           COALESCE((
             SELECT MAX(pr.monto_total) FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'becados' AND (TRIM(COALESCE(pr.subrubro, '')) = 'totales' OR pr.subrubro IS NULL OR pr.subrubro = '')
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS becados_monto,
           COALESCE((
             SELECT MAX(pr.cantidad_total) FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'becados' AND (TRIM(COALESCE(pr.subrubro, '')) = 'totales' OR pr.subrubro IS NULL OR pr.subrubro = '')
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS becados_cantidad,
           COALESCE((
             SELECT MAX(pr.cantidad_total) FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'becados' AND TRIM(COALESCE(pr.subrubro, '')) = 'capital'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS becados_capital,
           COALESCE((
             SELECT MAX(pr.cantidad_total) FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'becados' AND TRIM(COALESCE(pr.subrubro, '')) = 'interior'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS becados_interior,
           COALESCE((
             SELECT SUM(pr.cantidad_total) FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'becados' AND TRIM(COALESCE(pr.subrubro, '')) IN ('capital', 'interior')
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           ), 0) AS becados_suma_cap_int,
           COALESCE((
             SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'frutas_verduras'
               AND COALESCE(pr.monto_total, 0) > 0
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS refrigerio_comida_monto,
           COALESCE((
             SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'verduras_kg'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS refrigerio_verduras_kg,
           COALESCE((
             SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'frutas_unidades'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS refrigerio_frutas_unidades,
           COALESCE(
             (SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
              WHERE pr.rubro = 'carnes' AND TRIM(COALESCE(pr.subrubro, '')) = 'carne'
                AND COALESCE(pr.monto_total, 0) > 0
                AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
              ORDER BY pr.resumen_id DESC
              LIMIT 1),
             (SELECT COALESCE(SUM(pd.monto), 0) FROM PRESUPUESTO_DEPENDENCIA pd
              WHERE pd.rubro = 'carnes'
                AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)),
             0
           ) AS carnes_monto,
           COALESCE(
             (SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr
              WHERE pr.rubro = 'carnes' AND TRIM(COALESCE(pr.subrubro, '')) = 'carne'
                AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
              ORDER BY pr.resumen_id DESC
              LIMIT 1),
             (SELECT COALESCE(SUM(pd.cantidad), 0) FROM PRESUPUESTO_DEPENDENCIA pd
              WHERE pd.rubro = 'carnes'
                AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)),
             0
           ) AS carnes_cantidad,
           (
             COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='limpieza' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0) +
             COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='fumigacion' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0) +
             COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='gas' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           ) AS otros_recursos_monto,
           COALESCE((SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='limpieza' AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0) AS otros_limpieza_cantidad,
           COALESCE((SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='gas' AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0) AS otros_gas_cantidad,
           COALESCE((SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='fumigacion' AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0) AS otros_fumigacion_cantidad`
      );
      montos = m as any[];
    } catch (error: any) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
      montos = [];
    }
    let becariosPersonasCount = 0;
    try {
      const [pc]: any = await connection.execute(
        `SELECT COUNT(*) AS n FROM BECARIO_LINEA WHERE tipo_linea = 'PERSONA'`
      );
      becariosPersonasCount = Number(pc[0]?.n ?? 0);
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    const [zonasCapital]: any = await connection.execute(
      `SELECT z.nombre AS zona, COUNT(DISTINCT c.comedor_id) AS cantidad
       FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
       WHERE z.ambito = 'CAPITAL'
       GROUP BY z.zona_id, z.nombre
       ORDER BY z.nombre`
    );
    const [interior]: any = await connection.execute(
      `SELECT z.departamento AS departamento, z.localidad AS localidad, COUNT(DISTINCT c.comedor_id) AS cantidad
       FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
       WHERE z.ambito = 'INTERIOR'
       GROUP BY z.departamento, z.localidad ORDER BY cantidad DESC LIMIT 15`
    );
    const [interiorTiposRows]: any = await connection.execute(
      `SELECT
         z.departamento AS departamento,
         z.localidad AS localidad,
         COALESCE(tc.nombre, 'Comedores') AS tipo,
         st.nombre AS subtipo,
         COUNT(DISTINCT c.comedor_id) AS cantidad
       FROM COMEDOR c
       JOIN ZONA z ON c.zona_id = z.zona_id
       LEFT JOIN TIPO_COMEDOR tc ON c.tipo_id = tc.tipo_id
       LEFT JOIN SUBTIPO_COMEDOR st ON c.subtipo_id = st.subtipo_id
       WHERE z.ambito = 'INTERIOR'
       GROUP BY z.departamento, z.localidad, tc.tipo_id, tc.nombre, st.subtipo_id, st.nombre`
    );
    const tiposPorInterior = new Map<string, { tipo: string; subtipo: string | null; cantidad: number }[]>();
    for (const row of interiorTiposRows as any[]) {
      const depto = String(row.departamento ?? '');
      const loc = row.localidad != null ? String(row.localidad) : '';
      const key = `${depto}||${loc}`;
      const tiposActuales = tiposPorInterior.get(key) ?? [];
      tiposActuales.push({
        tipo: String(row.tipo ?? 'Comedores'),
        subtipo: row.subtipo != null && String(row.subtipo).trim() !== '' ? String(row.subtipo) : null,
        cantidad: Number(row.cantidad ?? 0),
      });
      tiposPorInterior.set(key, tiposActuales);
    }
    let porTipo: { tipo: string; subtipo: string | null; cantidad: number }[] = [];
    try {
      const [pt]: any = await connection.execute(
        `SELECT COALESCE(tc.nombre, 'Comedores') AS tipo,
                st.nombre AS subtipo,
                COUNT(DISTINCT c.comedor_id) AS cantidad
         FROM COMEDOR c
         LEFT JOIN TIPO_COMEDOR tc ON c.tipo_id = tc.tipo_id
         LEFT JOIN SUBTIPO_COMEDOR st ON c.subtipo_id = st.subtipo_id
         GROUP BY tc.tipo_id, tc.nombre, st.subtipo_id, st.nombre
         ORDER BY cantidad DESC`
      );
      porTipo = (pt as any[]).map((r: any) => ({
        tipo: String(r.tipo ?? 'Comedores'),
        subtipo: r.subtipo != null && String(r.subtipo).trim() !== '' ? String(r.subtipo) : null,
        cantidad: Number(r.cantidad ?? 0),
      }));
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let porTipoCapital: { tipo: string; subtipo: string | null; cantidad: number }[] = [];
    try {
      const [ptc]: any = await connection.execute(
        `SELECT COALESCE(tc.nombre, 'Comedores') AS tipo,
                st.nombre AS subtipo,
                COUNT(DISTINCT c.comedor_id) AS cantidad
         FROM COMEDOR c
         JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN TIPO_COMEDOR tc ON c.tipo_id = tc.tipo_id
         LEFT JOIN SUBTIPO_COMEDOR st ON c.subtipo_id = st.subtipo_id
         WHERE z.ambito = 'CAPITAL'
         GROUP BY tc.tipo_id, tc.nombre, st.subtipo_id, st.nombre
         ORDER BY cantidad DESC`
      );
      porTipoCapital = (ptc as any[]).map((r: any) => ({
        tipo: String(r.tipo ?? 'Comedores'),
        subtipo: r.subtipo != null && String(r.subtipo).trim() !== '' ? String(r.subtipo) : null,
        cantidad: Number(r.cantidad ?? 0),
      }));
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let interiorPorDepartamento: { departamento: string; cantidad: number }[] = [];
    try {
      const [idpt]: any = await connection.execute(
        `SELECT z.departamento AS departamento, COUNT(DISTINCT c.comedor_id) AS cantidad
         FROM COMEDOR c
         JOIN ZONA z ON c.zona_id = z.zona_id
         WHERE z.ambito = 'INTERIOR'
         GROUP BY z.departamento
         ORDER BY cantidad DESC`
      );
      interiorPorDepartamento = (idpt as any[]).map((r: any) => ({
        departamento: String(r.departamento ?? ''),
        cantidad: Number(r.cantidad ?? 0),
      }));
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const g = gas[0] || {};
    const l = limp[0] || {};
    const f = frescos[0] || {};
    const frescosDesgloseMensual = escalarFrescosDesgloseSemanalAMensual({
      cebolla_kg: Number(f.cebolla_kg ?? 0),
      zanahoria_kg: Number(f.zanahoria_kg ?? 0),
      zapallo_kg: Number(f.zapallo_kg ?? 0),
      papa_kg: Number(f.papa_kg ?? 0),
      acelga_kg: Number(f.acelga_kg ?? 0),
      frutas_unidades: Number(f.frutas_unidades ?? 0),
      carne_vacuna_kg: Number(f.carne_vacuna_kg ?? 0),
      pollo_kg: Number(f.pollo_kg ?? 0),
      cerdo_kg: Number(f.cerdo_kg ?? 0),
    });
    const frescosKgMensual =
      frescosDesgloseMensual.cebolla_kg +
      frescosDesgloseMensual.zanahoria_kg +
      frescosDesgloseMensual.zapallo_kg +
      frescosDesgloseMensual.papa_kg +
      frescosDesgloseMensual.acelga_kg +
      frescosDesgloseMensual.carne_vacuna_kg +
      frescosDesgloseMensual.pollo_kg +
      frescosDesgloseMensual.cerdo_kg;
    return {
      total_comedores: totalRows[0]?.total ?? 0,
      por_ambito: (porAmbito as any[]).map((r: any) => ({ ambito: r.ambito, cantidad: r.cantidad })),
      total_beneficiarios_interior: benefInterior,
      total_beneficiarios_capital: benefCapital,
      racion: {
        total_raciones: Number(racionTotal[0]?.total ?? 0),
        por_tipo_servicio: (racionPorTipo as any[]).map((r: any) => ({ tipo_servicio: r.tipo_servicio || '', cantidad: r.cantidad })),
      },
      recursos_globales: {
        gas_kg_equiv: Number(g.kg ?? 0),
        gas_desglose: {
          garrafas_10: Number(g.g10 ?? 0),
          garrafas_15: Number(g.g15 ?? 0),
          garrafas_45: Number(g.g45 ?? 0),
        },
        limpieza_total_articulos: Number(l.total ?? 0),
        limpieza_desglose: {
          lavandina_4lt: Number(l.lavandina_4lt ?? 0),
          detergente_45lt: Number(l.detergente_45lt ?? 0),
          desengrasante_5lt: Number(l.desengrasante_5lt ?? 0),
          trapo_piso: Number(l.trapo_piso ?? 0),
          trapo_rejilla: Number(l.trapo_rejilla ?? 0),
          virulana: Number(l.virulana ?? 0),
          esponja: Number(l.esponja ?? 0),
          escobillon: Number(l.escobillon ?? 0),
          escurridor: Number(l.escurridor ?? 0),
        },
        frescos_kg: frescosKgMensual,
        frescos_desglose: frescosDesgloseMensual,
        fumigacion_count: Number(fum[0]?.n ?? 0),
      },
      montos: {
        monto_invertido_total: TEKNOFOOD_MONTO_FIJO_ARS,
        monto_invertido_cantidad: Number(montos[0]?.monto_invertido_cantidad ?? 0),
        becados_monto: BECADOS_RESUMEN_OFICIAL[pSl]?.monto ?? Number(montos[0]?.becados_monto ?? 0),
        becados_cantidad: (() => {
          const oficial = BECADOS_RESUMEN_OFICIAL[pSl];
          if (oficial) return oficial.cantidad;
          const m0 = montos[0] as Record<string, unknown> | undefined;
          const num = (k: string) => {
            const raw = m0?.[k] ?? m0?.[k.toLowerCase()];
            const n = Number(raw ?? 0);
            return Number.isFinite(n) ? n : 0;
          };
          const tot = num('becados_cantidad');
          const cap = num('becados_capital');
          const int = num('becados_interior');
          const suma = cap + int;
          const sumSql = num('becados_suma_cap_int');
          if (tot > 0) return tot;
          if (cap > 0 && int > 0) return suma;
          if (becariosPersonasCount > 0) return becariosPersonasCount;
          if (sumSql > 0 && cap > 0) return sumSql;
          if (suma > 0 && cap > 0) return suma;
          return 0;
        })(),
        becados_capital: Number(montos[0]?.becados_capital ?? 0),
        becados_interior: Number(montos[0]?.becados_interior ?? 0),
        refrigerio_comida_monto: Number(montos[0]?.refrigerio_comida_monto ?? 0),
        refrigerio_verduras_kg: (() => {
          const fromPr = Number(montos[0]?.refrigerio_verduras_kg ?? 0);
          if (fromPr > 0) return cantidadSemanalAMensual(fromPr);
          return (
            frescosDesgloseMensual.cebolla_kg +
            frescosDesgloseMensual.zanahoria_kg +
            frescosDesgloseMensual.zapallo_kg +
            frescosDesgloseMensual.papa_kg +
            frescosDesgloseMensual.acelga_kg
          );
        })(),
        refrigerio_frutas_unidades: (() => {
          const fromPr = Number(montos[0]?.refrigerio_frutas_unidades ?? 0);
          if (fromPr > 0) return cantidadSemanalAMensual(fromPr);
          return frescosDesgloseMensual.frutas_unidades;
        })(),
        carnes_monto: Number(montos[0]?.carnes_monto ?? 0),
        carnes_cantidad: (() => {
          let c = Number(montos[0]?.carnes_cantidad ?? 0);
          const meat =
            Number(f.carne_vacuna_kg ?? 0) + Number(f.pollo_kg ?? 0) + Number(f.cerdo_kg ?? 0);
          if (c > 500000 || c < 0) c = 0;
          if (c === 0 && meat > 0 && meat < 500000) {
            return (
              frescosDesgloseMensual.carne_vacuna_kg +
              frescosDesgloseMensual.pollo_kg +
              frescosDesgloseMensual.cerdo_kg
            );
          }
          return cantidadSemanalAMensual(c);
        })(),
        otros_recursos_monto: Number(montos[0]?.otros_recursos_monto ?? 0),
        otros_limpieza_cantidad: (() => {
          const fromPr = Number(montos[0]?.otros_limpieza_cantidad ?? 0);
          if (fromPr > 0) return fromPr;
          return Number(l.total ?? 0);
        })(),
        otros_gas_cantidad: (() => {
          const fromPr = Number(montos[0]?.otros_gas_cantidad ?? 0);
          if (fromPr > 0) return fromPr;
          return Number(g.g10 ?? 0) + Number(g.g15 ?? 0) + Number(g.g45 ?? 0);
        })(),
        otros_fumigacion_cantidad: (() => {
          const fromPr = Number(montos[0]?.otros_fumigacion_cantidad ?? 0);
          if (fromPr > 0) return fromPr;
          return Number(fum[0]?.n ?? 0);
        })(),
      },
      comedores_por_zona_capital: (zonasCapital as any[]).map((r: any) => ({ zona: r.zona || 'Sin zona', cantidad: r.cantidad })),
      comedores_por_interior: (interior as any[]).map((r: any) => ({
        departamento: r.departamento || '',
        localidad: r.localidad ?? null,
        cantidad: r.cantidad,
        tipos: (
          tiposPorInterior.get(`${String(r.departamento ?? '')}||${r.localidad != null ? String(r.localidad) : ''}`) ?? []
        ).sort((a, b) => b.cantidad - a.cantidad),
      })),
      comedores_por_tipo: porTipo,
      comedores_por_tipo_capital: porTipoCapital,
      comedores_por_departamento_interior: interiorPorDepartamento,
    };
  } finally {
    await close();
  }
}

function getComedorRowPorPadronId(
  padronId: string,
  byComedorId: Map<string, Record<string, unknown>>,
  byNumeroOficial: Map<string, Record<string, unknown>>,
  aliasMap?: Map<string, Set<string>>
): Record<string, unknown> | undefined {
  for (const key of expandPadronLookupKeys(padronId, aliasMap)) {
    const hit = byComedorId.get(key) ?? byNumeroOficial.get(key);
    if (hit) return hit;
  }
  return undefined;
}

function indexComedorEnMapas(
  c: Record<string, unknown>,
  byComedorId: Map<string, Record<string, unknown>>,
  byNumeroOficial: Map<string, Record<string, unknown>>,
  aliasMap?: Map<string, Set<string>>
): void {
  const id = rowComedorId(c.comedor_id);
  if (id) {
    for (const key of expandPadronLookupKeys(id, aliasMap)) {
      byComedorId.set(key, c);
    }
  }
  const num = rowComedorId(c.numero_oficial);
  if (num) {
    for (const key of expandPadronLookupKeys(num, aliasMap)) {
      byNumeroOficial.set(key, c);
    }
  }
}

function inferAmbitoDesdeZonaCsv(zona: string | null | undefined): Ambito {
  if (String(zona ?? '').trim().toUpperCase() === 'CAPITAL') return 'CAPITAL';
  return 'INTERIOR';
}

async function getRankingsRacionesConsolidadoFromCsv(params: {
  periodo: string;
  ambito?: Ambito;
  limit?: number;
  offset?: number;
}): Promise<ComedoresRankingRow[] | null> {
  const csvRows = loadRankingRacionesForPeriodo(params.periodo);
  if (!csvRows?.length) return null;

  const aliasMap = getPadronAliasMapForPeriodo(params.periodo);
  const { connection, close } = await getComedoresConnection();
  const limitVal = Math.min(Math.max(0, params.limit ?? 50), 2000);
  const offsetVal = Math.max(0, params.offset ?? 0);

  try {
    const [comedores]: any = await connection.execute(
      `SELECT c.comedor_id, c.numero_oficial, c.nombre, z.nombre AS zona_nombre,
              z.ambito, c.responsable_nombre
       FROM COMEDOR c
       LEFT JOIN ZONA z ON c.zona_id = z.zona_id`
    );
    const byComedorId = new Map<string, Record<string, unknown>>();
    const byNumeroOficial = new Map<string, Record<string, unknown>>();
    for (const c of comedores as Record<string, unknown>[]) {
      indexComedorEnMapas(c, byComedorId, byNumeroOficial, aliasMap);
    }

    const merged: ComedoresRankingRow[] = [];
    for (const row of csvRows) {
      const pid = row.padronId;
      const c = getComedorRowPorPadronId(pid, byComedorId, byNumeroOficial, aliasMap);
      const ambito = (
        c?.ambito ? String(c.ambito) : inferAmbitoDesdeZonaCsv(row.zonaCsv)
      ) as Ambito;
      if (params.ambito && ambito !== params.ambito) continue;

      merged.push({
        comedor_id: c ? rowComedorId(c.comedor_id) : pid,
        nombre: String(c?.nombre ?? row.nombreDependencia ?? 'Sin nombre').trim() || 'Sin nombre',
        zona_nombre: c?.zona_nombre != null ? String(c.zona_nombre) : null,
        ambito,
        responsable_nombre: c?.responsable_nombre != null ? String(c.responsable_nombre) : null,
        valor: row.montoTotalMensual,
        beneficiarios: 0,
        cantidad_raciones: row.cantidadRaciones,
        monto_teknofood: row.montoTeknofood,
        unidad: '$',
      });
    }

    merged.sort((a, b) => b.valor - a.valor);
    return merged.slice(offsetVal, offsetVal + limitVal);
  } finally {
    await close();
  }
}

async function getRankingsOtrosRecursosFromCsv(params: {
  periodo: string;
  ambito?: Ambito;
  limit?: number;
  offset?: number;
}): Promise<ComedoresRankingRow[] | null> {
  const csvRows = loadRankingOtrosRecursosForPeriodo(params.periodo);
  if (!csvRows?.length) return null;

  const aliasMap = getPadronAliasMapForPeriodo(params.periodo);
  const { connection, close } = await getComedoresConnection();
  const limitVal = Math.min(Math.max(0, params.limit ?? 50), 2000);
  const offsetVal = Math.max(0, params.offset ?? 0);

  try {
    const [comedores]: any = await connection.execute(
      `SELECT c.comedor_id, c.numero_oficial, c.nombre, z.nombre AS zona_nombre,
              z.ambito, c.responsable_nombre
       FROM COMEDOR c
       LEFT JOIN ZONA z ON c.zona_id = z.zona_id`
    );
    const byComedorId = new Map<string, Record<string, unknown>>();
    const byNumeroOficial = new Map<string, Record<string, unknown>>();
    for (const c of comedores as Record<string, unknown>[]) {
      indexComedorEnMapas(c, byComedorId, byNumeroOficial, aliasMap);
    }

    const merged: ComedoresRankingRow[] = [];
    for (const row of csvRows) {
      const pid = row.padronId;
      const c = getComedorRowPorPadronId(pid, byComedorId, byNumeroOficial, aliasMap);
      const ambito = (
        c?.ambito ? String(c.ambito) : inferAmbitoDesdeZonaCsv(row.zonaCsv)
      ) as Ambito;
      if (params.ambito && ambito !== params.ambito) continue;

      merged.push({
        comedor_id: c ? rowComedorId(c.comedor_id) : pid,
        nombre: String(c?.nombre ?? row.nombreDependencia ?? 'Sin nombre').trim() || 'Sin nombre',
        zona_nombre: c?.zona_nombre != null ? String(c.zona_nombre) : null,
        ambito,
        responsable_nombre: c?.responsable_nombre != null ? String(c.responsable_nombre) : null,
        valor: row.montoTotalMensual,
        beneficiarios: row.cantidadBeneficiarios,
        cantidad_raciones: row.cantidadBeneficiarios,
        unidad: '$',
      });
    }

    merged.sort((a, b) => b.valor - a.valor);
    return merged.slice(offsetVal, offsetVal + limitVal);
  } finally {
    await close();
  }
}

async function getRankingsPromedioBeneficiarioFromCsv(params: {
  periodo: string;
  ambito?: Ambito;
  limit?: number;
  offset?: number;
}): Promise<ComedoresRankingRow[] | null> {
  const csvRows = loadRankingPromedioBeneficiarioForPeriodo(params.periodo);
  if (!csvRows?.length) return null;

  const aliasMap = getPadronAliasMapForPeriodo(params.periodo);
  const { connection, close } = await getComedoresConnection();
  const limitVal = Math.min(Math.max(0, params.limit ?? 50), 2000);
  const offsetVal = Math.max(0, params.offset ?? 0);

  try {
    const [comedores]: any = await connection.execute(
      `SELECT c.comedor_id, c.numero_oficial, c.nombre, z.nombre AS zona_nombre,
              z.ambito, c.responsable_nombre
       FROM COMEDOR c
       LEFT JOIN ZONA z ON c.zona_id = z.zona_id`
    );
    const byComedorId = new Map<string, Record<string, unknown>>();
    const byNumeroOficial = new Map<string, Record<string, unknown>>();
    for (const c of comedores as Record<string, unknown>[]) {
      indexComedorEnMapas(c, byComedorId, byNumeroOficial, aliasMap);
    }

    const merged: ComedoresRankingRow[] = [];
    for (const row of csvRows) {
      const pid = row.padronId;
      const c = getComedorRowPorPadronId(pid, byComedorId, byNumeroOficial, aliasMap);
      const ambito = (
        c?.ambito ? String(c.ambito) : inferAmbitoDesdeZonaCsv(row.zonaCsv)
      ) as Ambito;
      if (params.ambito && ambito !== params.ambito) continue;

      const gastoTotal = row.montoTotalMensual;
      const benef = row.cantidadBeneficiarios;
      merged.push({
        comedor_id: c ? rowComedorId(c.comedor_id) : pid,
        nombre: String(c?.nombre ?? row.nombreDependencia ?? 'Sin nombre').trim() || 'Sin nombre',
        zona_nombre: c?.zona_nombre != null ? String(c.zona_nombre) : null,
        ambito,
        responsable_nombre: c?.responsable_nombre != null ? String(c.responsable_nombre) : null,
        valor: gastoTotal,
        gasto_total_mensual: gastoTotal,
        beneficiarios: benef,
        cantidad_raciones: benef,
        unidad: '$/benef.',
      });
    }

    merged.sort((a, b) => (b.gasto_total_mensual ?? 0) - (a.gasto_total_mensual ?? 0));
    return merged.slice(offsetVal, offsetVal + limitVal);
  } finally {
    await close();
  }
}

async function getRankings(params: {
  periodo: string;
  tipo: RankingTipo;
  ambito?: Ambito;
  limit?: number;
  offset?: number;
}): Promise<ComedoresRankingRow[]> {
  const limitVal = Math.min(Math.max(0, params.limit ?? 50), 2000);
  const offsetVal = Math.max(0, params.offset ?? 0);

  if (params.tipo === 'raciones_consolidado') {
    const fromCsv = await getRankingsRacionesConsolidadoFromCsv(params);
    if (fromCsv) return fromCsv;
  }

  if (params.tipo === 'otros_recursos') {
    const fromCsv = await getRankingsOtrosRecursosFromCsv(params);
    if (fromCsv) return fromCsv;
  }

  if (params.tipo === 'promedio_beneficiario') {
    const fromCsv = await getRankingsPromedioBeneficiarioFromCsv(params);
    if (fromCsv) return fromCsv;
  }

  const { connection, close } = await getComedoresConnection();

  try {
    const pRank = String(params.periodo ?? '').trim();
    await connection.execute(`SET @cp = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`, [pRank]);
    const pBind = [pRank, pRank] as const;
    if (params.tipo === 'beneficiarios') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito,
                c.responsable_nombre,
                COALESCE(SUM(r.cantidad_beneficiarios), 0) AS valor
         FROM COMEDOR c
         JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN RACION r ON r.comedor_id = c.comedor_id
           AND (COALESCE(?, '') = '' OR TRIM(r.plan_ref) <=> TRIM(?))
         WHERE z.ambito = 'INTERIOR'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         HAVING valor > 0
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [...pBind]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: rowComedorId(r.comedor_id),
        nombre: r.nombre,
        zona_nombre: r.zona_nombre,
        ambito: r.ambito,
        responsable_nombre: r.responsable_nombre,
        valor: Number(r.valor),
        unidad: 'benef.',
      }));
    }

    if (params.tipo === 'raciones') {
      let rows: any[] = [];
      try {
        const [r]: any = await connection.execute(
          `SELECT
             COALESCE(pd.comedor_id, c.comedor_id) AS comedor_id,
             COALESCE(c.nombre, pd.dependencia_nombre) AS nombre,
             z.nombre AS zona_nombre,
             COALESCE(z.ambito, pd.ambito) AS ambito,
             c.responsable_nombre,
             COALESCE(SUM(pd.monto), 0) AS valor,
             COALESCE(SUM(pd.cantidad), 0) AS cantidad_raciones,
             GREATEST(
               COALESCE(SUM(pd.beneficiarios), 0),
               (SELECT COALESCE(SUM(r2.cantidad_beneficiarios), 0) FROM RACION r2
                WHERE r2.comedor_id = COALESCE(MAX(pd.comedor_id), MAX(c.comedor_id))
                  AND (TRIM(COALESCE(@cp, '')) = '' OR TRIM(r2.plan_ref) <=> TRIM(CONVERT(@cp USING utf8mb4))))
             ) AS beneficiarios
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           WHERE pd.rubro = 'monto_invertido'
             AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = '')
             AND (? IS NULL OR COALESCE(z.ambito, pd.ambito) = ?)
             AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           HAVING valor > 0 OR beneficiarios > 0
           ORDER BY valor DESC`,
          [params.ambito ?? null, params.ambito ?? null]
        );
        rows = r as any[];
      } catch (e: any) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        rows = [];
      }
      const hasInterior = (rows as any[]).some((row: any) => String(row.ambito || '').toUpperCase() === 'INTERIOR');
      const hasCapital = (rows as any[]).some((row: any) => String(row.ambito || '').toUpperCase() === 'CAPITAL');
      const ambitoSesgado = rows.length > 0 && hasCapital && !hasInterior;
      const sinMonto = (rows as any[]).every((row: any) => Number(row.valor ?? 0) <= 0);
      if ((sinMonto && rows.length > 0) || ambitoSesgado || rows.length === 0) {
        let rowsRacion: any[] = [];
        try {
          const [rr]: any = await connection.execute(
            `SELECT
               c.comedor_id,
               c.nombre,
               z.nombre AS zona_nombre,
               z.ambito AS ambito,
               c.responsable_nombre,
               COALESCE(SUM(r.cantidad_beneficiarios), 0) AS beneficiarios
             FROM RACION r
             INNER JOIN COMEDOR c ON c.comedor_id = r.comedor_id
             INNER JOIN ZONA z ON z.zona_id = c.zona_id
             WHERE (COALESCE(?, '') = '' OR TRIM(r.plan_ref) <=> TRIM(?))
               AND (? IS NULL OR z.ambito = ?)
             GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
             HAVING beneficiarios > 0
             ORDER BY beneficiarios DESC`,
            [...pBind, params.ambito ?? null, params.ambito ?? null]
          );
          rowsRacion = rr as any[];
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
          rowsRacion = [];
        }
        rows = rowsRacion.length > 0 ? rowsRacion : rows;
      }
      const totalRacionesTekno = await resolveTotalRacionesTeknofoodPeriodo(pRank, connection);
      if (totalRacionesTekno > 0 && rows.length > 0) {
        rows = (rows as any[]).map((row: any) => {
          const cantidad = Math.max(
            Number(row.cantidad_raciones ?? 0),
            Number(row.beneficiarios ?? 0)
          );
          return {
            ...row,
            cantidad_raciones: cantidad,
            valor: montoTeknofoodDesdeRaciones(cantidad, totalRacionesTekno),
          };
        });
        rows.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
      }
      const sliced = rows.slice(offsetVal, offsetVal + limitVal);
      return sliced.map((r: any) => ({
        comedor_id: rowComedorId(r.comedor_id),
        nombre: r.nombre || 'Sin nombre',
        zona_nombre: r.zona_nombre || null,
        ambito: (r.ambito || 'CAPITAL') as Ambito,
        responsable_nombre: r.responsable_nombre || null,
        valor: Number(r.valor ?? 0),
        beneficiarios: Number(r.beneficiarios ?? 0),
        unidad: '$',
      }));
    }

    if (params.tipo === 'raciones_consolidado') {
      let rows: any[] = [];
      try {
        const [r]: any = await connection.execute(
          `SELECT
             COALESCE(pd.comedor_id, c.comedor_id) AS comedor_id,
             COALESCE(c.nombre, pd.dependencia_nombre) AS nombre,
             z.nombre AS zona_nombre,
             COALESCE(z.ambito, pd.ambito) AS ambito,
             c.responsable_nombre,
             COALESCE(SUM(
               CASE
                 WHEN pd.rubro IN ('refrigerio_comida', 'carnes') THEN pd.monto
                 ELSE 0
               END
             ), 0) AS monto_frescos,
             GREATEST(
               COALESCE(MAX(pd.beneficiarios), 0),
               (SELECT COALESCE(SUM(r2.cantidad_beneficiarios), 0) FROM RACION r2
                WHERE r2.comedor_id = COALESCE(MAX(pd.comedor_id), MAX(c.comedor_id))
                  AND (TRIM(COALESCE(@cp, '')) = '' OR TRIM(r2.plan_ref) <=> TRIM(CONVERT(@cp USING utf8mb4))))
             ) AS beneficiarios,
             COALESCE(SUM(
               CASE
                 WHEN pd.rubro = 'monto_invertido'
                  AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = '')
                   THEN COALESCE(pd.cantidad, 0)
                 ELSE 0
               END
             ), 0) AS cantidad_raciones,
             COALESCE(SUM(
               CASE
                 WHEN pd.rubro = 'monto_invertido'
                  AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = '')
                   THEN pd.monto
                 ELSE 0
               END
             ), 0) AS monto_teknofood
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           WHERE (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
             AND (? IS NULL OR COALESCE(z.ambito, pd.ambito) = ?)
             AND (
               pd.rubro IN ('refrigerio_comida', 'carnes')
               OR (pd.rubro = 'monto_invertido' AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = ''))
             )
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           HAVING monto_frescos > 0 OR beneficiarios > 0 OR cantidad_raciones > 0
           ORDER BY (monto_frescos + cantidad_raciones) DESC
           LIMIT ${limitVal} OFFSET ${offsetVal}`,
          [params.ambito ?? null, params.ambito ?? null]
        );
        rows = r as any[];
      } catch (e: any) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        rows = [];
      }
      const totalRacionesTekno = await resolveTotalRacionesTeknofoodPeriodo(pRank, connection);
      const mapped = (rows as Record<string, unknown>[]).map((r) =>
        mapFilaRankingRacionesConsolidado(r, totalRacionesTekno)
      );
      mapped.sort((a, b) => b.valor - a.valor);
      return mapped;
    }

    if (params.tipo === 'gas') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito, c.responsable_nombre,
                COALESCE(SUM(g.garrafas_10kg * 10 + g.garrafas_15kg * 15 + g.garrafas_45kg * 45), 0) AS valor
         FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN BENEFICIO_GAS g ON g.comedor_id = c.comedor_id
           AND (COALESCE(?, '') = '' OR TRIM(g.periodo) <=> TRIM(?))
         WHERE z.ambito = 'CAPITAL'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [...pBind]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: rowComedorId(r.comedor_id),
        nombre: r.nombre,
        zona_nombre: r.zona_nombre,
        ambito: r.ambito,
        responsable_nombre: r.responsable_nombre,
        valor: Number(r.valor),
        unidad: 'kg eq.',
      }));
    }

    if (params.tipo === 'limpieza') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito, c.responsable_nombre,
                COALESCE(SUM(l.lavandina_4lt + l.detergente_45lt + l.desengrasante_5lt + l.trapo_piso + l.trapo_rejilla + l.virulana + l.esponja + l.escobillon + l.escurridor), 0) AS valor
         FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN BENEFICIO_LIMPIEZA l ON l.comedor_id = c.comedor_id
           AND (COALESCE(?, '') = '' OR TRIM(l.periodo) <=> TRIM(?))
         WHERE z.ambito = 'CAPITAL'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [...pBind]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: rowComedorId(r.comedor_id),
        nombre: r.nombre,
        zona_nombre: r.zona_nombre,
        ambito: r.ambito,
        responsable_nombre: r.responsable_nombre,
        valor: Number(r.valor),
        unidad: 'un.',
      }));
    }

    if (params.tipo === 'frescos') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito, c.responsable_nombre,
                COALESCE(SUM(f.cebolla_kg + f.zanahoria_kg + f.zapallo_kg + f.papa_kg + f.acelga_kg + f.carne_vacuna_kg + f.pollo_kg + f.cerdo_kg), 0) AS valor
         FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN BENEFICIO_FRESCOS f ON f.comedor_id = c.comedor_id
           AND (COALESCE(?, '') = '' OR TRIM(f.periodo) <=> TRIM(?))
         WHERE z.ambito = 'CAPITAL'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [...pBind]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: rowComedorId(r.comedor_id),
        nombre: r.nombre,
        zona_nombre: r.zona_nombre,
        ambito: r.ambito,
        responsable_nombre: r.responsable_nombre,
        valor: cantidadSemanalAMensual(Number(r.valor)),
        unidad: 'kg',
      }));
    }

    if (params.tipo === 'responsables') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito, c.responsable_nombre,
                COUNT(DISTINCT c.comedor_id) AS valor
         FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
         WHERE c.responsable_nombre IS NOT NULL AND TRIM(c.responsable_nombre) != ''
         GROUP BY c.responsable_nombre, c.comedor_id, c.nombre, z.nombre, z.ambito
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`
      );
      const byResp = (rows as any[]).reduce((acc: Record<string, { nombre: string; zona_nombre: string; ambito: string; responsable_nombre: string; valor: number }>, r: any) => {
        const key = (r.responsable_nombre || '').trim().toUpperCase();
        if (!key) return acc;
        if (!acc[key]) acc[key] = { nombre: r.nombre, zona_nombre: r.zona_nombre, ambito: r.ambito, responsable_nombre: r.responsable_nombre, valor: 0 };
        acc[key].valor += 1;
        return acc;
      }, {});
      return Object.values(byResp)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, limitVal)
        .map((r) => ({
          comedor_id: '',
          nombre: r.responsable_nombre,
          zona_nombre: r.zona_nombre,
          ambito: r.ambito as Ambito,
          responsable_nombre: r.responsable_nombre,
          valor: r.valor,
          unidad: 'comedores',
        }));
    }

    if (params.tipo === 'otros_recursos') {
      let rows: any[] = [];
      try {
        const pdPeriodo = ` AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)`;
        const subqBenefRacion = `(SELECT COALESCE(SUM(r2.cantidad_beneficiarios), 0) FROM RACION r2
                WHERE r2.comedor_id = COALESCE(MAX(pd.comedor_id), MAX(c.comedor_id))
                  AND (TRIM(COALESCE(@cp, '')) = '' OR TRIM(r2.plan_ref) <=> TRIM(CONVERT(@cp USING utf8mb4))))`;
        const cantidadTekno = sqlExprCantidadRacionesTeknofoodPd();
        const [r]: any = await connection.execute(
          `SELECT
             COALESCE(pd.comedor_id, c.comedor_id) AS comedor_id,
             COALESCE(c.nombre, pd.dependencia_nombre) AS nombre,
             z.nombre AS zona_nombre,
             COALESCE(z.ambito, pd.ambito) AS ambito,
             c.responsable_nombre,
             COALESCE(SUM(CASE WHEN pd.rubro = 'otros_recursos' THEN pd.monto ELSE 0 END), 0) AS monto_otros,
             ${cantidadTekno} AS cantidad_raciones,
             ${sqlExprBeneficiariosPdRacion(subqBenefRacion)} AS beneficiarios
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           WHERE (? IS NULL OR COALESCE(z.ambito, pd.ambito) = ?)${pdPeriodo}
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           HAVING monto_otros > 0 OR cantidad_raciones > 0 OR beneficiarios > 0
           ORDER BY monto_otros DESC
           LIMIT ${limitVal} OFFSET ${offsetVal}`,
          [params.ambito ?? null, params.ambito ?? null]
        );
        rows = r as any[];
      } catch (e: any) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        rows = [];
      }
      const mapped = (rows as Record<string, unknown>[]).map(mapFilaRankingOtrosRecursos);
      mapped.sort((a, b) => b.valor - a.valor);
      return mapped;
    }

    if (params.tipo === 'promedio_beneficiario') {
      let rows: any[] = [];
      try {
        const pdPeriodo = ` AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)`;
        const subqBenefRacion = `(SELECT COALESCE(SUM(r2.cantidad_beneficiarios), 0) FROM RACION r2
                WHERE r2.comedor_id = COALESCE(MAX(pd.comedor_id), MAX(c.comedor_id))
                  AND (TRIM(COALESCE(@cp, '')) = '' OR TRIM(r2.plan_ref) <=> TRIM(CONVERT(@cp USING utf8mb4))))`;
        const cantidadTekno = sqlExprCantidadRacionesTeknofoodPd();
        const [r]: any = await connection.execute(
          `SELECT
             COALESCE(pd.comedor_id, c.comedor_id) AS comedor_id,
             COALESCE(c.nombre, pd.dependencia_nombre) AS nombre,
             z.nombre AS zona_nombre,
             COALESCE(z.ambito, pd.ambito) AS ambito,
             c.responsable_nombre,
             COALESCE(SUM(
               CASE WHEN pd.rubro IN ('refrigerio_comida', 'carnes') THEN pd.monto ELSE 0 END
             ), 0) AS monto_frescos,
             ${cantidadTekno} AS cantidad_raciones,
             COALESCE(SUM(CASE WHEN pd.rubro = 'otros_recursos' THEN pd.monto ELSE 0 END), 0) AS monto_otros,
             ${sqlExprBeneficiariosPdRacion(subqBenefRacion)} AS beneficiarios
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           WHERE (? IS NULL OR COALESCE(z.ambito, pd.ambito) = ?)${pdPeriodo}
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           HAVING monto_frescos > 0 OR monto_otros > 0 OR cantidad_raciones > 0 OR beneficiarios > 0
           ORDER BY (monto_frescos + monto_otros + cantidad_raciones) DESC
           LIMIT ${limitVal} OFFSET ${offsetVal}`,
          [params.ambito ?? null, params.ambito ?? null]
        );
        rows = r as any[];
      } catch (e: any) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        rows = [];
      }
      const totalRacionesTekno = await resolveTotalRacionesTeknofoodPeriodo(pRank, connection);
      const mapped = (rows as Record<string, unknown>[]).map((r) =>
        mapFilaRankingPromedioBeneficiario(r, totalRacionesTekno)
      );
      mapped.sort((a, b) => (b.gasto_total_mensual ?? 0) - (a.gasto_total_mensual ?? 0));
      return mapped;
    }

    if (['becados', 'refrigerio_comida', 'carnes'].includes(params.tipo)) {
      const rubro = params.tipo;
      let rows: any[] = [];
      try {
        const pdPeriodo = ` AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)`;
        const whereClause =
          'WHERE pd.rubro = ? AND (? IS NULL OR COALESCE(z.ambito, pd.ambito) = ?)' + pdPeriodo;
        const subqBenefRacion = `(SELECT COALESCE(SUM(r2.cantidad_beneficiarios), 0) FROM RACION r2
                WHERE r2.comedor_id = COALESCE(MAX(pd.comedor_id), MAX(c.comedor_id))
                  AND (TRIM(COALESCE(@cp, '')) = '' OR TRIM(r2.plan_ref) <=> TRIM(CONVERT(@cp USING utf8mb4))))`;
        const beneficiariosExpr = `GREATEST(COALESCE(SUM(pd.beneficiarios), 0), ${subqBenefRacion})`;
        const [r]: any = await connection.execute(
          `SELECT
             COALESCE(pd.comedor_id, c.comedor_id) AS comedor_id,
             COALESCE(c.nombre, pd.dependencia_nombre) AS nombre,
             z.nombre AS zona_nombre,
             COALESCE(z.ambito, pd.ambito) AS ambito,
             c.responsable_nombre,
             COALESCE(SUM(pd.monto), 0) AS valor,
             ${beneficiariosExpr} AS beneficiarios,
             COALESCE(SUM(pd.cantidad), 0) AS cantidad
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           ${whereClause}
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           ORDER BY valor DESC
           LIMIT ${limitVal} OFFSET ${offsetVal}`,
          [rubro, params.ambito ?? null, params.ambito ?? null]
        );
        rows = r as any[];
      } catch (error: any) {
        if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
        rows = [];
      }

      const sinMontoPresupuesto = (rows as any[]).every((row: any) => Number(row.valor ?? 0) <= 0);
      if (params.tipo === 'becados' && sinMontoPresupuesto) {
        try {
          let totalMontoBec = 0;
          try {
            const [tb]: any = await connection.execute(
              `SELECT COALESCE((
                 SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
                 WHERE pr.rubro = 'becados'
                   AND (TRIM(COALESCE(pr.subrubro, '')) = 'totales' OR TRIM(COALESCE(pr.subrubro, '')) = '')
                   AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
                 ORDER BY pr.resumen_id DESC LIMIT 1
               ), 0) AS m`
            );
            totalMontoBec = Number(tb[0]?.m ?? 0);
          } catch (e2: any) {
            if (e2?.code !== 'ER_NO_SUCH_TABLE') throw e2;
          }
          const [totM]: any = await connection.execute(
            `SELECT COALESCE(SUM(monto_linea), 0) AS m FROM BECARIO_LINEA WHERE tipo_linea = 'AREA_FUNCION'`
          );
          const montoFuente = totalMontoBec > 0 ? totalMontoBec : Number(totM[0]?.m ?? 0);
          const [br]: any = await connection.execute(
            `SELECT
               agg.comedor_id,
               agg.nombre,
               agg.zona_nombre,
               agg.ambito,
               agg.responsable_nombre,
               agg.n_personas AS beneficiarios,
               agg.n_personas AS n_personas
             FROM (
               SELECT
                 COALESCE(c.comedor_id, '') AS comedor_id,
                COALESCE(NULLIF(TRIM(c.nombre), ''), 'Dependencia sin asociación') AS nombre,
                 z.nombre AS zona_nombre,
                 COALESCE(z.ambito, bl.ambito, 'CAPITAL') AS ambito,
                 c.responsable_nombre,
                 COUNT(*) AS n_personas
               FROM BECARIO_LINEA bl
              LEFT JOIN COMEDOR c ON (
                TRIM(COALESCE(bl.numero_oficial,'')) <> '' AND c.numero_oficial IS NOT NULL
                AND TRIM(c.numero_oficial) = TRIM(bl.numero_oficial)
              )
               LEFT JOIN ZONA z ON z.zona_id = c.zona_id
               WHERE bl.tipo_linea = 'PERSONA'
                 AND (TRIM(COALESCE(bl.apellido,'')) <> '' OR TRIM(COALESCE(bl.nombre,'')) <> '')
               GROUP BY COALESCE(c.comedor_id, ''),
                       COALESCE(NULLIF(TRIM(c.nombre), ''), 'Dependencia sin asociación'),
                        z.nombre,
                        COALESCE(z.ambito, bl.ambito, 'CAPITAL'),
                        c.responsable_nombre
               HAVING n_personas > 0
             ) agg
             ORDER BY agg.n_personas DESC`
          );
          const aggRows = br as any[];
          const totalP = aggRows.reduce((s, x) => s + Number(x.n_personas ?? 0), 0);
          rows = aggRows.map((row: any) => ({
            ...row,
            valor: totalP > 0 && montoFuente > 0 ? (montoFuente * Number(row.n_personas ?? 0)) / totalP : 0,
          }));
          rows.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
          rows = rows.slice(offsetVal, offsetVal + limitVal);
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      if (params.tipo === 'carnes' && sinMontoPresupuesto) {
        try {
          const [tm]: any = await connection.execute(
            `SELECT COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'carnes' AND TRIM(COALESCE(pr.subrubro, '')) = 'carne'
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) AS m`
          );
          const totalM = Number(tm[0]?.m ?? 0);
          const [cr]: any = await connection.execute(
            `SELECT
               COALESCE(pd.comedor_id, c.comedor_id) AS comedor_id,
               COALESCE(c.nombre, pd.dependencia_nombre) AS nombre,
               z.nombre AS zona_nombre,
               COALESCE(z.ambito, pd.ambito) AS ambito,
               c.responsable_nombre,
               COALESCE(SUM(pd.monto), 0) AS valor,
               COALESCE(SUM(pd.beneficiarios), 0) AS beneficiarios,
               COALESCE(SUM(pd.cantidad), 0) AS cantidad
             FROM PRESUPUESTO_DEPENDENCIA pd
             LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
             LEFT JOIN ZONA z ON z.zona_id = c.zona_id
             WHERE pd.rubro = 'carnes'
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pd.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
             GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
             HAVING cantidad > 0`
          );
          const aggRows = cr as any[];
          const sumKg = aggRows.reduce((s, row) => s + Number(row.cantidad ?? 0), 0);
          rows = aggRows.map((row: any) => ({
            ...row,
            valor: sumKg > 0 && totalM > 0 ? (totalM * Number(row.cantidad ?? 0)) / sumKg : 0,
          }));
          rows.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
          rows = rows.slice(offsetVal, offsetVal + limitVal);
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      if (params.tipo === 'refrigerio_comida' && sinMontoPresupuesto) {
        try {
          const [tm]: any = await connection.execute(
            `SELECT COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'frutas_verduras'
                 AND COALESCE(pr.monto_total, 0) > 0
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) AS m`
          );
          const totalM = Number(tm[0]?.m ?? 0);
          const [fr]: any = await connection.execute(
            `SELECT
               c.comedor_id,
               c.nombre,
               z.nombre AS zona_nombre,
               z.ambito,
               c.responsable_nombre,
               COALESCE(SUM(
                 COALESCE(f.cebolla_kg, 0) + COALESCE(f.zanahoria_kg, 0) + COALESCE(f.zapallo_kg, 0)
                 + COALESCE(f.papa_kg, 0) + COALESCE(f.acelga_kg, 0) + COALESCE(f.frutas_unidades, 0)
               ), 0) AS cantidad
             FROM BENEFICIO_FRESCOS f
             INNER JOIN COMEDOR c ON c.comedor_id = f.comedor_id
             INNER JOIN ZONA z ON z.zona_id = c.zona_id
             WHERE (? IS NULL OR z.ambito = ?)
               AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(f.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
             GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
             HAVING cantidad > 0`,
            [params.ambito ?? null, params.ambito ?? null]
          );
          let aggRows = fr as any[];
          let sumW = aggRows.reduce((s, row) => s + Number(row.cantidad ?? 0), 0);

          // Si BENEFICIO_FRESCOS no trae cantidades útiles, usar RACION como fallback
          // para no dejar vacío el ranking cuando sí existe monto en PRESUPUESTO_RESUMEN.
          if (sumW <= 0 || aggRows.length === 0) {
            const [rr]: any = await connection.execute(
              `SELECT
                 c.comedor_id,
                 c.nombre,
                 z.nombre AS zona_nombre,
                 z.ambito,
                 c.responsable_nombre,
                 COALESCE(SUM(r.cantidad_beneficiarios), 0) AS cantidad
               FROM RACION r
               INNER JOIN COMEDOR c ON c.comedor_id = r.comedor_id
               INNER JOIN ZONA z ON z.zona_id = c.zona_id
               WHERE (? IS NULL OR z.ambito = ?)
                 AND (COALESCE(?, '') = '' OR TRIM(r.plan_ref) <=> TRIM(?))
               GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
               HAVING cantidad > 0`,
              [params.ambito ?? null, params.ambito ?? null, pRank, pRank]
            );
            aggRows = rr as any[];
            sumW = aggRows.reduce((s, row) => s + Number(row.cantidad ?? 0), 0);
          }

          rows = aggRows.map((row: any) => ({
            ...row,
            valor: sumW > 0 && totalM > 0 ? (totalM * Number(row.cantidad ?? 0)) / sumW : 0,
            beneficiarios: Number(row.cantidad ?? 0),
          }));
          rows.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
          rows = rows.slice(offsetVal, offsetVal + limitVal);
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      return (rows as any[]).map((r: any) => ({
        comedor_id: rowComedorId(r.comedor_id),
        nombre: r.nombre || 'Sin nombre',
        zona_nombre: r.zona_nombre || null,
        ambito: (r.ambito || 'CAPITAL') as Ambito,
        responsable_nombre: r.responsable_nombre || null,
        valor: Number(r.valor ?? 0),
        beneficiarios: Number(r.beneficiarios ?? 0),
        unidad: '$',
      }));
    }

    return [];
  } finally {
    await close();
  }
}

async function getComedorDetail(comedorId: string, periodo: string): Promise<ComedorDetail | null> {
  const { connection, close } = await getComedoresConnection();
  try {
    const pDet = String(periodo ?? '').trim();
    await connection.execute(`SET @cp = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`, [pDet]);
    const pb = [pDet, pDet] as const;
    const [comedor]: any = await connection.execute(
      `SELECT c.comedor_id, c.numero_oficial, c.nombre, c.domicilio, c.responsable_nombre, c.telefono,
              c.link_google_maps, c.coordenadas_lat, c.coordenadas_lng,
              z.nombre AS zona_nombre, z.ambito, z.departamento, z.localidad,
              t.nombre AS tipo_nombre, s.nombre AS subtipo_nombre, o.nombre AS organismo_nombre
       FROM COMEDOR c
       JOIN ZONA z ON c.zona_id = z.zona_id
       LEFT JOIN TIPO_COMEDOR t ON c.tipo_id = t.tipo_id
       LEFT JOIN SUBTIPO_COMEDOR s ON c.subtipo_id = s.subtipo_id
       LEFT JOIN ORGANISMO o ON c.organismo_id = o.organismo_id
       WHERE c.comedor_id = ?`,
      [comedorId]
    );
    if (!comedor?.length) return null;
    const c = comedor[0];

    const [ben]: any = await connection.execute(
      `SELECT COALESCE(SUM(cantidad_beneficiarios), 0) AS total FROM RACION WHERE comedor_id = ?
       AND (COALESCE(?, '') = '' OR TRIM(plan_ref) <=> TRIM(?))`,
      [comedorId, ...pb]
    );
    const [gas]: any = await connection.execute(
      `SELECT COALESCE(SUM(garrafas_10kg), 0) AS g10, COALESCE(SUM(garrafas_15kg), 0) AS g15, COALESCE(SUM(garrafas_45kg), 0) AS g45
       FROM BENEFICIO_GAS WHERE comedor_id = ? AND (COALESCE(?, '') = '' OR TRIM(periodo) <=> TRIM(?))`,
      [comedorId, ...pb]
    );
    const [limp]: any = await connection.execute(
      `SELECT lavandina_4lt, detergente_45lt, desengrasante_5lt, trapo_piso, trapo_rejilla, virulana, esponja, escobillon, escurridor
       FROM BENEFICIO_LIMPIEZA WHERE comedor_id = ? AND (COALESCE(?, '') = '' OR TRIM(periodo) <=> TRIM(?)) LIMIT 1`,
      [comedorId, ...pb]
    );
    const [frescos]: any = await connection.execute(
      `SELECT COALESCE(SUM(cebolla_kg + zanahoria_kg + zapallo_kg + papa_kg + acelga_kg + carne_vacuna_kg + pollo_kg + cerdo_kg), 0) AS kg,
              COALESCE(SUM(cebolla_kg), 0) AS cebolla_kg, COALESCE(SUM(zanahoria_kg), 0) AS zanahoria_kg,
              COALESCE(SUM(zapallo_kg), 0) AS zapallo_kg, COALESCE(SUM(papa_kg), 0) AS papa_kg, COALESCE(SUM(acelga_kg), 0) AS acelga_kg,
              COALESCE(SUM(frutas_unidades), 0) AS frutas_unidades, COALESCE(SUM(carne_vacuna_kg), 0) AS carne_vacuna_kg,
              COALESCE(SUM(pollo_kg), 0) AS pollo_kg, COALESCE(SUM(cerdo_kg), 0) AS cerdo_kg
       FROM BENEFICIO_FRESCOS WHERE comedor_id = ? AND (COALESCE(?, '') = '' OR TRIM(periodo) <=> TRIM(?))`,
      [comedorId, ...pb]
    );
    let presupFrescosRows: any[] = [];
    try {
      const [pfr]: any = await connection.execute(
        `SELECT item_nombre, COALESCE(SUM(cantidad), 0) AS cantidad
         FROM PRESUPUESTO_ITEM
         WHERE comedor_id = ? AND rubro IN ('refrigerio_comida', 'carnes')
           AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
         GROUP BY item_nombre`,
        [comedorId]
      );
      presupFrescosRows = pfr as any[];
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    let presupItemsAll: { rubro: string; subrubro: string | null; item_nombre: string; cantidad: number }[] = [];
    try {
      const [pi]: any = await connection.execute(
        `SELECT rubro, subrubro, item_nombre, COALESCE(SUM(cantidad), 0) AS cantidad
         FROM PRESUPUESTO_ITEM
         WHERE comedor_id = ?
           AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
         GROUP BY rubro, subrubro, item_nombre`,
        [comedorId]
      );
      presupItemsAll = pi as any[];
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    const [fum]: any = await connection.execute(
      `SELECT COUNT(*) AS n FROM BENEFICIO_FUMIGACION WHERE comedor_id = ? AND (COALESCE(?, '') = '' OR TRIM(periodo) <=> TRIM(?))`,
      [comedorId, ...pb]
    );
    let gastoComp: any[] = [];
    try {
      const [gc]: any = await connection.execute(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(TRIM(rubro)) = 'monto_invertido' THEN monto ELSE 0 END), 0) AS raciones,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(rubro)) = 'becados' THEN monto ELSE 0 END), 0) AS becados,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(rubro)) = 'refrigerio_comida' THEN monto ELSE 0 END), 0) AS refrigerio_comida,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(rubro)) = 'carnes' THEN monto ELSE 0 END), 0) AS carnes,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(rubro)) = 'otros_recursos' THEN monto ELSE 0 END), 0) AS otros_recursos
         FROM PRESUPUESTO_DEPENDENCIA
         WHERE comedor_id = ?
           AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)`,
        [comedorId]
      );
      gastoComp = gc as any[];
    } catch (error: any) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
      gastoComp = [];
    }

    const totalRacionesTeknoPeriodo = await resolveTotalRacionesTeknofoodPeriodo(
      pDet ?? '',
      connection
    );

    let gastoTotalGlobal = 0;
    try {
      const [gt]: any = await connection.execute(
        `SELECT
           COALESCE((SELECT MAX(t.monto) FROM PRESUPUESTO_TEKNOFOOD t WHERE t.escala='MENSUAL' AND t.concepto='raciones_mensuales' AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(t.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)), 0)
           + COALESCE((SELECT MAX(pr.monto_total) FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='becados' AND (TRIM(COALESCE(pr.subrubro,''))='totales' OR TRIM(COALESCE(pr.subrubro,''))='') AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='refrigerio_comida' AND TRIM(COALESCE(pr.subrubro,''))='frutas_verduras' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='carnes' AND TRIM(COALESCE(pr.subrubro,''))='carne' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='limpieza' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='fumigacion' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='gas' AND COALESCE(pr.monto_total,0)>0 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp) ORDER BY pr.resumen_id DESC LIMIT 1), 0)
         AS t`
      );
      gastoTotalGlobal = Number(gt[0]?.t ?? 0);
      try {
        const [tkMx]: any = await connection.execute(
          `SELECT COALESCE((SELECT MAX(t.monto) FROM PRESUPUESTO_TEKNOFOOD t WHERE t.escala='MENSUAL' AND t.concepto='raciones_mensuales' AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(t.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)), 0) AS x`
        );
        const teknoFromDb = Number(tkMx[0]?.x ?? 0);
        gastoTotalGlobal = gastoTotalGlobal - teknoFromDb + TEKNOFOOD_MONTO_FIJO_ARS;
      } catch (e2: any) {
        if (e2?.code !== 'ER_NO_SUCH_TABLE') throw e2;
      }
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let presupuestoDesglose: {
      rubro: string;
      subrubro: string | null;
      monto: number;
      cantidad: number;
      unidad: string | null;
    }[] = [];
    try {
      const [pd]: any = await connection.execute(
        `SELECT rubro, subrubro,
                COALESCE(SUM(monto), 0) AS monto,
                COALESCE(SUM(cantidad), 0) AS cantidad,
                MAX(unidad) AS unidad
         FROM PRESUPUESTO_DEPENDENCIA
         WHERE comedor_id = ?
           AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
         GROUP BY rubro, subrubro
         ORDER BY rubro, subrubro`,
        [comedorId]
      );
      presupuestoDesglose = (pd as any[]).map((r: any) => ({
        rubro: String(r.rubro ?? ''),
        subrubro: r.subrubro != null ? String(r.subrubro) : null,
        monto: Number(r.monto ?? 0),
        cantidad: Number(r.cantidad ?? 0),
        unidad: r.unidad != null ? String(r.unidad) : null,
      }));
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const csvTekno = pDet
      ? lookupTeknofoodPadronForComedor(
          pDet,
          rowComedorId(c.comedor_id),
          rowComedorId(c.numero_oficial)
        )
      : null;

    const csvOtros = pDet
      ? lookupOtrosRecursosForComedor(
          pDet,
          rowComedorId(c.comedor_id),
          rowComedorId(c.numero_oficial)
        )
      : null;

    const csvFrescos = pDet
      ? lookupFrescosCsvForComedor(
          pDet,
          rowComedorId(c.comedor_id),
          rowComedorId(c.numero_oficial)
        )
      : null;

    if (csvTekno) {
      presupuestoDesglose = applyTeknofoodCsvToPresupuestoDesglose(presupuestoDesglose, csvTekno);
    } else {
      presupuestoDesglose = presupuestoDesglose.map((row) => {
        if (!esRubroTeknofoodPresupuesto(row.rubro, row.subrubro)) return row;
        const cant = Number(row.cantidad ?? 0);
        if (cant > 0 && totalRacionesTeknoPeriodo > 0) {
          return {
            ...row,
            monto: montoTeknofoodDesdeRaciones(cant, totalRacionesTeknoPeriodo),
          };
        }
        return row;
      });
    }

    presupuestoDesglose = presupuestoDesglose.map((row) => ({
      ...row,
      cantidad: escalarCantidadPresupuestoDepSemanalMensual(row.rubro, row.cantidad),
    }));

    if (csvOtros) {
      presupuestoDesglose = applyOtrosRecursosCsvToPresupuestoDesglose(presupuestoDesglose, csvOtros);
    }

    if (csvFrescos) {
      presupuestoDesglose = applyFrescosCsvToPresupuestoDesglose(presupuestoDesglose, csvFrescos);
    }

    const sumMontoRubroPd = (rubroNorm: string) =>
      presupuestoDesglose
        .filter((r) => String(r.rubro ?? '').trim().toLowerCase() === rubroNorm)
        .reduce((acc, r) => acc + safeNumber(r.monto), 0);

    const l = limp[0] || {};
    const fr = frescos[0] || {};
    const limpiezaKeys = [
      'lavandina_4lt',
      'detergente_45lt',
      'desengrasante_5lt',
      'trapo_piso',
      'trapo_rejilla',
      'virulana',
      'esponja',
      'escobillon',
      'escurridor',
    ] as const;
    const limpiezaFromBenef: Record<string, number> = {
      lavandina_4lt: Number(l.lavandina_4lt ?? 0),
      detergente_45lt: Number(l.detergente_45lt ?? 0),
      desengrasante_5lt: Number(l.desengrasante_5lt ?? 0),
      trapo_piso: Number(l.trapo_piso ?? 0),
      trapo_rejilla: Number(l.trapo_rejilla ?? 0),
      virulana: Number(l.virulana ?? 0),
      esponja: Number(l.esponja ?? 0),
      escobillon: Number(l.escobillon ?? 0),
      escurridor: Number(l.escurridor ?? 0),
    };
    const limpiezaFromPresup: Record<string, number> = Object.fromEntries(limpiezaKeys.map((k) => [k, 0])) as Record<
      string,
      number
    >;
    for (const row of presupItemsAll) {
      if (row.rubro !== 'otros_recursos' || row.subrubro !== 'limpieza') continue;
      const kn = String(row.item_nombre || '').trim();
      if (kn in limpiezaFromPresup) limpiezaFromPresup[kn] = Number(row.cantidad ?? 0);
    }
    const hasPresupLimpieza = Object.values(limpiezaFromPresup).some((v) => v > 0);
    const limpieza: Record<string, number> = hasPresupLimpieza
      ? { ...limpiezaFromPresup }
      : { ...limpiezaFromBenef };

    let g10 = Number(gas[0]?.g10 ?? 0);
    let g15 = Number(gas[0]?.g15 ?? 0);
    let g45 = Number(gas[0]?.g45 ?? 0);
    if (g10 + g15 + g45 === 0) {
      for (const row of presupItemsAll) {
        if (row.rubro !== 'otros_recursos' || row.subrubro !== 'gas') continue;
        const n = String(row.item_nombre || '');
        const q = Number(row.cantidad ?? 0);
        if (n === 'garrafa_10kg') g10 = q;
        else if (n === 'garrafa_15kg') g15 = q;
        else if (n === 'garrafa_45kg') g45 = q;
      }
    }

    let fumigacion = Number(fum[0]?.n ?? 0) > 0;
    const fumPres = presupuestoDesglose.find((r) => r.rubro === 'otros_recursos' && r.subrubro === 'fumigacion');
    if (fumPres && (fumPres.monto > 0 || fumPres.cantidad > 0)) fumigacion = true;
    const fromPresup: Record<string, number> = {};
    for (const row of presupFrescosRows) {
      const k = String((row as any).item_nombre || '').trim();
      if (k) fromPresup[k] = Number((row as any).cantidad ?? 0);
    }
    const hasPresupFrescos = Object.values(fromPresup).some((v) => v > 0);
    const frescosDesglose: Record<string, number> = escalarFrescosDesgloseSemanalAMensual({
      cebolla_kg: hasPresupFrescos ? Number(fromPresup.cebolla_kg ?? 0) : Number(fr.cebolla_kg ?? 0),
      zanahoria_kg: hasPresupFrescos ? Number(fromPresup.zanahoria_kg ?? 0) : Number(fr.zanahoria_kg ?? 0),
      zapallo_kg: hasPresupFrescos ? Number(fromPresup.zapallo_kg ?? 0) : Number(fr.zapallo_kg ?? 0),
      papa_kg: hasPresupFrescos ? Number(fromPresup.papa_kg ?? 0) : Number(fr.papa_kg ?? 0),
      acelga_kg: hasPresupFrescos ? Number(fromPresup.acelga_kg ?? 0) : Number(fr.acelga_kg ?? 0),
      frutas_unidades: hasPresupFrescos ? Number(fromPresup.frutas_unidades ?? 0) : Number(fr.frutas_unidades ?? 0),
      carne_vacuna_kg: hasPresupFrescos ? Number(fromPresup.carne_vacuna_kg ?? 0) : Number(fr.carne_vacuna_kg ?? 0),
      pollo_kg: hasPresupFrescos ? Number(fromPresup.pollo_kg ?? 0) : Number(fr.pollo_kg ?? 0),
      cerdo_kg: hasPresupFrescos ? Number(fromPresup.cerdo_kg ?? 0) : Number(fr.cerdo_kg ?? 0),
    });
    const kgVerduras =
      frescosDesglose.cebolla_kg +
      frescosDesglose.zanahoria_kg +
      frescosDesglose.zapallo_kg +
      frescosDesglose.papa_kg +
      frescosDesglose.acelga_kg;
    const kgCarnes =
      frescosDesglose.carne_vacuna_kg + frescosDesglose.pollo_kg + frescosDesglose.cerdo_kg;
    const frescosKgTotal = kgVerduras + kgCarnes;

    const becados = Number(gastoComp[0]?.becados ?? 0);
    let refrigerio_comida = Number(gastoComp[0]?.refrigerio_comida ?? 0);
    let carnesMonto = Number(gastoComp[0]?.carnes ?? 0);
    if (csvFrescos) {
      if (csvFrescos.montoVerdurasFrutas > 0) {
        refrigerio_comida = csvFrescos.montoVerdurasFrutas;
      }
      if (csvFrescos.montoCarne > 0) {
        carnesMonto = csvFrescos.montoCarne;
      }
    }
    const teknoRow = presupuestoDesglose.find((row) => esRubroTeknofoodPresupuesto(row.rubro, row.subrubro));
    const cantTeknoDetalle = csvTekno
      ? csvTekno.raciones
      : Math.max(Number(teknoRow?.cantidad ?? 0), 0);
    let montoTeknoDetalle = Number(teknoRow?.monto ?? 0);
    if (montoTeknoDetalle <= 0 && csvTekno && csvTekno.monto > 0) {
      montoTeknoDetalle = csvTekno.monto;
    }
    if (montoTeknoDetalle <= 0 && cantTeknoDetalle > 0 && totalRacionesTeknoPeriodo > 0) {
      montoTeknoDetalle = montoTeknofoodDesdeRaciones(cantTeknoDetalle, totalRacionesTeknoPeriodo);
    }
    const otrosSql = safeNumber(gastoComp[0]?.otros_recursos);
    const otrosFromPd = sumMontoRubroPd('otros_recursos');
    let otros_recursos = Math.max(otrosSql, otrosFromPd);
    if (csvOtros && csvOtros.montoTotalMensual > 0) {
      otros_recursos = csvOtros.montoTotalMensual;
    } else if (otros_recursos <= 0 && pDet) {
      const pesoLoc = pesoOtrosDesdeBeneficios(
        { garrafas_10: g10, garrafas_15: g15, garrafas_45: g45 },
        limpieza,
        fumigacion
      );
      if (pesoLoc > 0) {
        try {
          const [tm]: any = await connection.execute(
            `SELECT COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'otros_recursos' AND TRIM(COALESCE(pr.subrubro, '')) = 'limpieza'
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) +
             COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'otros_recursos' AND TRIM(COALESCE(pr.subrubro, '')) = 'fumigacion'
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) +
             COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'otros_recursos' AND TRIM(COALESCE(pr.subrubro, '')) = 'gas'
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(pr.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) AS t`
          );
          const totalM = safeNumber(tm[0]?.t);
          if (totalM > 0) {
            const [sp]: any = await connection.execute(
              `SELECT COALESCE(SUM(
                 COALESCE(g.garrafas_10kg, 0) * 10 + COALESCE(g.garrafas_15kg, 0) * 15 + COALESCE(g.garrafas_45kg, 0) * 45
                 + COALESCE(l.lavandina_4lt, 0) + COALESCE(l.detergente_45lt, 0) + COALESCE(l.desengrasante_5lt, 0)
                 + COALESCE(l.trapo_piso, 0) + COALESCE(l.trapo_rejilla, 0) + COALESCE(l.virulana, 0) + COALESCE(l.esponja, 0)
                 + COALESCE(l.escobillon, 0) + COALESCE(l.escurridor, 0)
                 + CASE WHEN fum.comedor_id IS NOT NULL THEN 1 ELSE 0 END
               ), 0) AS suma_pesos
               FROM COMEDOR c
               INNER JOIN ZONA z ON z.zona_id = c.zona_id
               LEFT JOIN BENEFICIO_GAS g ON g.comedor_id = c.comedor_id
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(g.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               LEFT JOIN BENEFICIO_LIMPIEZA l ON l.comedor_id = c.comedor_id
                 AND (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(l.periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               LEFT JOIN (
                 SELECT DISTINCT comedor_id FROM BENEFICIO_FUMIGACION
                 WHERE (TRIM(COALESCE(@cp, '')) = '' OR CONVERT(TRIM(periodo) USING utf8mb4) COLLATE utf8mb4_unicode_ci <=> @cp)
               ) fum ON fum.comedor_id = c.comedor_id`
            );
            const sumPesos = safeNumber(sp[0]?.suma_pesos);
            if (sumPesos > 0) {
              otros_recursos = (totalM * pesoLoc) / sumPesos;
            }
          }
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }
    }
    const gastoTotalComedor =
      montoTeknoDetalle + becados + refrigerio_comida + carnesMonto + otros_recursos;

    return {
      comedor_id: rowComedorId(c.comedor_id),
      numero_oficial: c.numero_oficial,
      nombre: c.nombre,
      domicilio: c.domicilio,
      zona_nombre: c.zona_nombre,
      ambito: c.ambito,
      departamento: c.departamento,
      localidad: c.localidad,
      tipo_nombre: c.tipo_nombre,
      subtipo_nombre: c.subtipo_nombre,
      organismo_nombre: c.organismo_nombre,
      responsable_nombre: c.responsable_nombre,
      telefono: c.telefono,
      link_google_maps: c.link_google_maps || null,
      coordenadas_lat: c.coordenadas_lat != null ? Number(c.coordenadas_lat) : null,
      coordenadas_lng: c.coordenadas_lng != null ? Number(c.coordenadas_lng) : null,
      beneficiarios: ben[0]?.total ?? null,
      recursos: {
        gas: {
          garrafas_10: g10,
          garrafas_15: g15,
          garrafas_45: g45,
        },
        limpieza,
        frescos_kg: frescosKgTotal,
        frescos_desglose: frescosDesglose,
        fumigacion,
      },
      presupuesto_desglose: presupuestoDesglose,
      composicion_gasto: {
        /** Solo Teknofood (monto_invertido/teknofood), alineado a presupuesto_desglose. */
        raciones: montoTeknoDetalle,
        becados,
        refrigerio_comida,
        carnes: carnesMonto,
        otros_recursos,
        gasto_total_comedor: gastoTotalComedor,
        gasto_total_global: gastoTotalGlobal,
      },
    };
  } finally {
    await close();
  }
}

async function getBecariosDesglose(): Promise<BecariosDesglose> {
  const { connection, close } = await getComedoresConnection();
  try {
    const [areas]: any = await connection.execute(
      `SELECT area, funcion, categoria, monto_linea
       FROM BECARIO_LINEA WHERE tipo_linea = 'AREA_FUNCION' ORDER BY linea_id`
    );
    const [personas]: any = await connection.execute(
      `SELECT apellido, nombre, localidad, ambito, dni, comedor_nombre, domicilio,
              area_personal AS area, funcion_personal AS funcion, categoria_personal AS categoria
       FROM BECARIO_LINEA WHERE tipo_linea = 'PERSONA' ORDER BY linea_id`
    );
    return {
      areas: (areas as any[]).map((r) => ({
        area: r.area || '',
        funcion: r.funcion || '',
        categoria: r.categoria ?? null,
        monto: Number(r.monto_linea ?? 0),
      })),
      personas: (personas as any[]).map((r) => ({
        apellido: r.apellido ?? null,
        nombre: r.nombre ?? null,
        localidad: r.localidad ?? null,
        ambito: (r.ambito as Ambito) ?? null,
        dni: r.dni ?? null,
        comedor_nombre: r.comedor_nombre ?? null,
        domicilio: r.domicilio ?? null,
        area: r.area ?? null,
        funcion: r.funcion ?? null,
        categoria: r.categoria ?? null,
      })),
    };
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return { areas: [], personas: [] };
    throw error;
  } finally {
    await close();
  }
}

async function getPeriodosDisponibles(): Promise<PeriodoOption[]> {
  const { connection, close } = await getComedoresConnection();
  try {
    const [plan]: any = await connection.execute(
      `SELECT DISTINCT plan_ref AS valor FROM RACION WHERE plan_ref IS NOT NULL AND plan_ref != '' ORDER BY 1 DESC LIMIT 20`
    );
    const [periodo]: any = await connection.execute(
      `SELECT DISTINCT periodo AS valor FROM BENEFICIO_GAS WHERE periodo IS NOT NULL AND periodo != '' ORDER BY 1 DESC LIMIT 20`
    );
    const set = new Set<string>();
    (plan as any[]).forEach((r: any) => r.valor && set.add(r.valor));
    (periodo as any[]).forEach((r: any) => r.valor && set.add(r.valor));
    const arr = Array.from(set).sort((a, b) => {
      const [ya, ma] = periodoSlugSortKey(a);
      const [yb, mb] = periodoSlugSortKey(b);
      if (yb !== ya) return yb - ya;
      if (mb !== ma) return mb - ma;
      return b.localeCompare(a);
    });
    return arr.length ? arr.map((v) => ({ valor: v, etiqueta: v })) : [{ valor: '', etiqueta: 'Todos' }];
  } finally {
    await close();
  }
}

export const comedoresService = {
  getSummaryByPeriodo,
  getRankings,
  getComedorDetail,
  getPeriodosDisponibles,
  getBecariosDesglose,
};
