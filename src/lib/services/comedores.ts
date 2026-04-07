import { getComedoresConnection } from '../db';

export type Ambito = 'CAPITAL' | 'INTERIOR';
export type RankingTipo =
  | 'beneficiarios'
  | 'gas'
  | 'limpieza'
  | 'frescos'
  | 'responsables'
  | 'raciones'
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
    frescos_kg: number;
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
    /** Presupuesto marzo: kg de verduras (sin frutas en unidades) */
    refrigerio_verduras_kg: number;
    /** Presupuesto marzo: unidades de frutas */
    refrigerio_frutas_unidades: number;
    carnes_monto: number;
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
  comedores_por_interior: { departamento: string; localidad: string | null; cantidad: number }[];
  /** Conteos desde tipo/subtipo en COMEDOR (p. ej. ETL marzo por DEPENDENCIA) */
  comedores_por_tipo: { tipo: string; subtipo: string | null; cantidad: number }[];
}

export interface ComedoresRankingRow {
  comedor_id: number;
  nombre: string;
  zona_nombre: string | null;
  ambito: Ambito;
  responsable_nombre: string | null;
  valor: number;
  beneficiarios?: number;
  unidad?: string;
}

export interface ComedorDetail {
  comedor_id: number;
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
  /** Líneas de presupuesto por rubro/subrubro (todos los programas cargados en ETL) */
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
    const [totalRows]: any = await connection.execute(
      `SELECT COUNT(DISTINCT c.comedor_id) AS total FROM COMEDOR c`
    );
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
       WHERE r.plan_ref <=> ?
       GROUP BY z.ambito`,
      [periodo || null]
    );
    const benefInterior = Number((beneficiariosPorAmbito as any[]).find((r: any) => r.ambito === 'INTERIOR')?.total ?? 0);
    const benefCapital = Number((beneficiariosPorAmbito as any[]).find((r: any) => r.ambito === 'CAPITAL')?.total ?? 0);
    const [racionTotal]: any = await connection.execute(
      `SELECT COUNT(*) AS total FROM RACION WHERE plan_ref <=> ?`,
      [periodo || null]
    );
    const [racionPorTipo]: any = await connection.execute(
      `SELECT tipo_servicio AS tipo_servicio, COUNT(*) AS cantidad
       FROM RACION WHERE plan_ref <=> ? GROUP BY tipo_servicio`,
      [periodo || null]
    );
    const [gas]: any = await connection.execute(
      `SELECT COALESCE(SUM(g.garrafas_10kg * 10 + g.garrafas_15kg * 15 + g.garrafas_45kg * 45), 0) AS kg,
              COALESCE(SUM(g.garrafas_10kg), 0) AS g10, COALESCE(SUM(g.garrafas_15kg), 0) AS g15, COALESCE(SUM(g.garrafas_45kg), 0) AS g45
       FROM BENEFICIO_GAS g WHERE (? IS NULL OR g.periodo <=> ?)`,
      [periodo || null, periodo || null]
    );
    const [limp]: any = await connection.execute(
      `SELECT COALESCE(SUM(l.lavandina_4lt + l.detergente_45lt + l.desengrasante_5lt + l.trapo_piso + l.trapo_rejilla + l.virulana + l.esponja + l.escobillon + l.escurridor), 0) AS total,
              COALESCE(SUM(l.lavandina_4lt), 0) AS lavandina_4lt, COALESCE(SUM(l.detergente_45lt), 0) AS detergente_45lt,
              COALESCE(SUM(l.desengrasante_5lt), 0) AS desengrasante_5lt, COALESCE(SUM(l.trapo_piso), 0) AS trapo_piso,
              COALESCE(SUM(l.trapo_rejilla), 0) AS trapo_rejilla, COALESCE(SUM(l.virulana), 0) AS virulana,
              COALESCE(SUM(l.esponja), 0) AS esponja, COALESCE(SUM(l.escobillon), 0) AS escobillon, COALESCE(SUM(l.escurridor), 0) AS escurridor
       FROM BENEFICIO_LIMPIEZA l WHERE (? IS NULL OR l.periodo <=> ?)`,
      [periodo || null, periodo || null]
    );
    const [frescos]: any = await connection.execute(
      `SELECT COALESCE(SUM(f.cebolla_kg + f.zanahoria_kg + f.zapallo_kg + f.papa_kg + f.acelga_kg + f.carne_vacuna_kg + f.pollo_kg + f.cerdo_kg), 0) AS kg,
              COALESCE(SUM(f.cebolla_kg), 0) AS cebolla_kg, COALESCE(SUM(f.zanahoria_kg), 0) AS zanahoria_kg,
              COALESCE(SUM(f.zapallo_kg), 0) AS zapallo_kg, COALESCE(SUM(f.papa_kg), 0) AS papa_kg, COALESCE(SUM(f.acelga_kg), 0) AS acelga_kg,
              COALESCE(SUM(f.frutas_unidades), 0) AS frutas_unidades, COALESCE(SUM(f.carne_vacuna_kg), 0) AS carne_vacuna_kg,
              COALESCE(SUM(f.pollo_kg), 0) AS pollo_kg, COALESCE(SUM(f.cerdo_kg), 0) AS cerdo_kg
       FROM BENEFICIO_FRESCOS f WHERE (? IS NULL OR f.periodo <=> ?)`,
      [periodo || null, periodo || null]
    );
    const [fum]: any = await connection.execute(
      `SELECT COUNT(*) AS n FROM BENEFICIO_FUMIGACION WHERE (? IS NULL OR periodo <=> ?)`,
      [periodo || null, periodo || null]
    );
    let montos: any[] = [];
    try {
      const [m]: any = await connection.execute(
        `SELECT
           COALESCE((
             SELECT MAX(t.monto)
             FROM PRESUPUESTO_TEKNOFOOD t
             WHERE t.escala = 'MENSUAL' AND t.concepto = 'raciones_mensuales'
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
           ), 0) AS monto_invertido_cantidad,
           COALESCE((
             SELECT MAX(monto_total) FROM PRESUPUESTO_RESUMEN
             WHERE rubro = 'becados' AND (TRIM(COALESCE(subrubro, '')) = 'totales' OR subrubro IS NULL OR subrubro = '')
           ), 0) AS becados_monto,
           COALESCE((
             SELECT MAX(cantidad_total) FROM PRESUPUESTO_RESUMEN
             WHERE rubro = 'becados' AND (TRIM(COALESCE(subrubro, '')) = 'totales' OR subrubro IS NULL OR subrubro = '')
           ), 0) AS becados_cantidad,
           COALESCE((
             SELECT MAX(cantidad_total) FROM PRESUPUESTO_RESUMEN
             WHERE rubro = 'becados' AND TRIM(COALESCE(subrubro, '')) = 'capital'
           ), 0) AS becados_capital,
           COALESCE((
             SELECT MAX(cantidad_total) FROM PRESUPUESTO_RESUMEN
             WHERE rubro = 'becados' AND TRIM(COALESCE(subrubro, '')) = 'interior'
           ), 0) AS becados_interior,
           COALESCE((
             SELECT SUM(cantidad_total) FROM PRESUPUESTO_RESUMEN
             WHERE rubro = 'becados' AND TRIM(COALESCE(subrubro, '')) IN ('capital', 'interior')
           ), 0) AS becados_suma_cap_int,
           COALESCE((
             SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'frutas_verduras'
               AND COALESCE(pr.monto_total, 0) > 0
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS refrigerio_comida_monto,
           COALESCE((
             SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'verduras_kg'
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS refrigerio_verduras_kg,
           COALESCE((
             SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'refrigerio_comida' AND TRIM(COALESCE(pr.subrubro, '')) = 'frutas_unidades'
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS refrigerio_frutas_unidades,
           COALESCE((
             SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'carnes' AND TRIM(COALESCE(pr.subrubro, '')) = 'carne'
               AND COALESCE(pr.monto_total, 0) > 0
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS carnes_monto,
           COALESCE((
             SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr
             WHERE pr.rubro = 'carnes' AND TRIM(COALESCE(pr.subrubro, '')) = 'carne'
               AND COALESCE(pr.monto_total, 0) > 0
               AND pr.cantidad_total < 1000000
             ORDER BY pr.resumen_id DESC
             LIMIT 1
           ), 0) AS carnes_cantidad,
           (
             COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='limpieza' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0) +
             COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='fumigacion' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0) +
             COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='gas' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           ) AS otros_recursos_monto,
           COALESCE((SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='limpieza' ORDER BY pr.resumen_id DESC LIMIT 1), 0) AS otros_limpieza_cantidad,
           COALESCE((SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='gas' ORDER BY pr.resumen_id DESC LIMIT 1), 0) AS otros_gas_cantidad,
           COALESCE((SELECT pr.cantidad_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='fumigacion' ORDER BY pr.resumen_id DESC LIMIT 1), 0) AS otros_fumigacion_cantidad`
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
       GROUP BY z.zona_id, z.nombre ORDER BY z.codigo`
    );
    const [interior]: any = await connection.execute(
      `SELECT z.departamento AS departamento, z.localidad AS localidad, COUNT(DISTINCT c.comedor_id) AS cantidad
       FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
       WHERE z.ambito = 'INTERIOR'
       GROUP BY z.departamento, z.localidad ORDER BY cantidad DESC LIMIT 15`
    );
    let porTipo: { tipo: string; subtipo: string | null; cantidad: number }[] = [];
    try {
      const [pt]: any = await connection.execute(
        `SELECT COALESCE(tc.nombre, 'Sin clasificar') AS tipo,
                st.nombre AS subtipo,
                COUNT(DISTINCT c.comedor_id) AS cantidad
         FROM COMEDOR c
         LEFT JOIN TIPO_COMEDOR tc ON c.tipo_id = tc.tipo_id
         LEFT JOIN SUBTIPO_COMEDOR st ON c.subtipo_id = st.subtipo_id
         GROUP BY tc.tipo_id, tc.nombre, st.subtipo_id, st.nombre
         ORDER BY cantidad DESC`
      );
      porTipo = (pt as any[]).map((r: any) => ({
        tipo: String(r.tipo ?? 'Sin clasificar'),
        subtipo: r.subtipo != null && String(r.subtipo).trim() !== '' ? String(r.subtipo) : null,
        cantidad: Number(r.cantidad ?? 0),
      }));
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const g = gas[0] || {};
    const l = limp[0] || {};
    const f = frescos[0] || {};
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
        frescos_kg: Number(f.kg ?? 0),
        frescos_desglose: {
          cebolla_kg: Number(f.cebolla_kg ?? 0),
          zanahoria_kg: Number(f.zanahoria_kg ?? 0),
          zapallo_kg: Number(f.zapallo_kg ?? 0),
          papa_kg: Number(f.papa_kg ?? 0),
          acelga_kg: Number(f.acelga_kg ?? 0),
          frutas_unidades: Number(f.frutas_unidades ?? 0),
          carne_vacuna_kg: Number(f.carne_vacuna_kg ?? 0),
          pollo_kg: Number(f.pollo_kg ?? 0),
          cerdo_kg: Number(f.cerdo_kg ?? 0),
        },
        fumigacion_count: Number(fum[0]?.n ?? 0),
      },
      montos: {
        monto_invertido_total: Number(montos[0]?.monto_invertido_total ?? 0),
        monto_invertido_cantidad: Number(montos[0]?.monto_invertido_cantidad ?? 0),
        becados_monto: Number(montos[0]?.becados_monto ?? 0),
        becados_cantidad: (() => {
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
          if (fromPr > 0) return fromPr;
          return (
            Number(f.cebolla_kg ?? 0) +
            Number(f.zanahoria_kg ?? 0) +
            Number(f.zapallo_kg ?? 0) +
            Number(f.papa_kg ?? 0) +
            Number(f.acelga_kg ?? 0)
          );
        })(),
        refrigerio_frutas_unidades: (() => {
          const fromPr = Number(montos[0]?.refrigerio_frutas_unidades ?? 0);
          if (fromPr > 0) return fromPr;
          return Number(f.frutas_unidades ?? 0);
        })(),
        carnes_monto: Number(montos[0]?.carnes_monto ?? 0),
        carnes_cantidad: (() => {
          let c = Number(montos[0]?.carnes_cantidad ?? 0);
          const meat =
            Number(f.carne_vacuna_kg ?? 0) + Number(f.pollo_kg ?? 0) + Number(f.cerdo_kg ?? 0);
          if (c > 500000 || c < 0) c = 0;
          if (c === 0 && meat > 0 && meat < 500000) return meat;
          return c;
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
      })),
      comedores_por_tipo: porTipo,
    };
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
  const { connection, close } = await getComedoresConnection();
  const limitVal = Math.min(Math.max(0, params.limit ?? 50), 2000);
  const offsetVal = Math.max(0, params.offset ?? 0);

  try {
    if (params.tipo === 'beneficiarios') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito,
                c.responsable_nombre,
                COALESCE(SUM(r.cantidad_beneficiarios), 0) AS valor
         FROM COMEDOR c
         JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN RACION r ON r.comedor_id = c.comedor_id AND r.plan_ref <=> ?
         WHERE z.ambito = 'INTERIOR'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         HAVING valor > 0
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [params.periodo || null]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: r.comedor_id,
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
             COALESCE(SUM(pd.beneficiarios), 0) AS beneficiarios
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           WHERE pd.rubro = 'monto_invertido'
             AND (pd.subrubro <=> 'teknofood' OR pd.subrubro IS NULL OR TRIM(COALESCE(pd.subrubro, '')) = '')
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           HAVING valor > 0 OR beneficiarios > 0
           ORDER BY valor DESC`,
          []
        );
        rows = r as any[];
      } catch (e: any) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        rows = [];
      }
      const sinMonto = (rows as any[]).every((row: any) => Number(row.valor ?? 0) <= 0);
      if (sinMonto && rows.length > 0) {
        let totalMontoResumen = 0;
        try {
          const [tr]: any = await connection.execute(
            `SELECT COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'monto_invertido'
                 AND (TRIM(COALESCE(pr.subrubro, '')) = 'teknofood' OR TRIM(COALESCE(pr.subrubro, '')) = '')
                 AND COALESCE(pr.monto_total, 0) > 0
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) AS m`
          );
          totalMontoResumen = Number(tr[0]?.m ?? 0);
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
        const benefTotal = (rows as any[]).reduce((s, row) => s + Number(row.beneficiarios ?? 0), 0);
        if (totalMontoResumen > 0 && benefTotal > 0) {
          rows = (rows as any[]).map((row: any) => ({
            ...row,
            valor: (totalMontoResumen * Number(row.beneficiarios ?? 0)) / benefTotal,
          }));
          rows.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
        }
      }
      const sliced = rows.slice(offsetVal, offsetVal + limitVal);
      return sliced.map((r: any) => ({
        comedor_id: Number(r.comedor_id ?? 0),
        nombre: r.nombre || 'Sin nombre',
        zona_nombre: r.zona_nombre || null,
        ambito: (r.ambito || 'CAPITAL') as Ambito,
        responsable_nombre: r.responsable_nombre || null,
        valor: Number(r.valor ?? 0),
        beneficiarios: Number(r.beneficiarios ?? 0),
        unidad: '$',
      }));
    }

    if (params.tipo === 'gas') {
      const [rows]: any = await connection.execute(
        `SELECT c.comedor_id, c.nombre, z.nombre AS zona_nombre, z.ambito, c.responsable_nombre,
                COALESCE(SUM(g.garrafas_10kg * 10 + g.garrafas_15kg * 15 + g.garrafas_45kg * 45), 0) AS valor
         FROM COMEDOR c JOIN ZONA z ON c.zona_id = z.zona_id
         LEFT JOIN BENEFICIO_GAS g ON g.comedor_id = c.comedor_id AND g.periodo <=> ?
         WHERE z.ambito = 'CAPITAL'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [params.periodo || null]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: r.comedor_id,
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
         LEFT JOIN BENEFICIO_LIMPIEZA l ON l.comedor_id = c.comedor_id AND l.periodo <=> ?
         WHERE z.ambito = 'CAPITAL'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [params.periodo || null]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: r.comedor_id,
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
         LEFT JOIN BENEFICIO_FRESCOS f ON f.comedor_id = c.comedor_id AND f.periodo <=> ?
         WHERE z.ambito = 'CAPITAL'
         GROUP BY c.comedor_id, c.nombre, z.nombre, z.ambito, c.responsable_nombre
         ORDER BY valor DESC LIMIT ${limitVal} OFFSET ${offsetVal}`,
        [params.periodo || null]
      );
      return (rows as any[]).map((r: any) => ({
        comedor_id: r.comedor_id,
        nombre: r.nombre,
        zona_nombre: r.zona_nombre,
        ambito: r.ambito,
        responsable_nombre: r.responsable_nombre,
        valor: Number(r.valor),
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
          comedor_id: 0,
          nombre: r.responsable_nombre,
          zona_nombre: r.zona_nombre,
          ambito: r.ambito as Ambito,
          responsable_nombre: r.responsable_nombre,
          valor: r.valor,
          unidad: 'comedores',
        }));
    }

    if (['becados', 'refrigerio_comida', 'carnes', 'otros_recursos', 'promedio_beneficiario'].includes(params.tipo)) {
      const rubro = params.tipo === 'promedio_beneficiario' ? 'monto_invertido' : params.tipo;
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
             COALESCE(SUM(pd.beneficiarios), 0) AS beneficiarios,
             COALESCE(SUM(pd.cantidad), 0) AS cantidad
           FROM PRESUPUESTO_DEPENDENCIA pd
           LEFT JOIN COMEDOR c ON c.comedor_id = pd.comedor_id
           LEFT JOIN ZONA z ON z.zona_id = c.zona_id
           WHERE pd.rubro = ?
           GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
           ORDER BY ${params.tipo === 'promedio_beneficiario' ? 'CASE WHEN SUM(pd.beneficiarios) > 0 THEN SUM(pd.monto)/SUM(pd.beneficiarios) ELSE 0 END' : 'valor'} DESC
           LIMIT ${limitVal} OFFSET ${offsetVal}`,
          [rubro]
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
                 COALESCE(c.comedor_id, 0) AS comedor_id,
                 COALESCE(NULLIF(TRIM(c.nombre), ''), NULLIF(TRIM(bl.comedor_nombre), ''), 'Sin comedor') AS nombre,
                 z.nombre AS zona_nombre,
                 COALESCE(z.ambito, bl.ambito, 'CAPITAL') AS ambito,
                 c.responsable_nombre,
                 COUNT(*) AS n_personas
               FROM BECARIO_LINEA bl
               LEFT JOIN COMEDOR c ON (
                 (TRIM(COALESCE(bl.numero_oficial,'')) <> '' AND c.numero_oficial IS NOT NULL
                   AND TRIM(c.numero_oficial) = TRIM(bl.numero_oficial))
                 OR (
                   TRIM(COALESCE(bl.comedor_nombre,'')) <> ''
                   AND TRIM(LOWER(c.nombre)) = TRIM(LOWER(bl.comedor_nombre))
                 )
               )
               LEFT JOIN ZONA z ON z.zona_id = c.zona_id
               WHERE bl.tipo_linea = 'PERSONA'
                 AND (TRIM(COALESCE(bl.apellido,'')) <> '' OR TRIM(COALESCE(bl.nombre,'')) <> '')
               GROUP BY COALESCE(c.comedor_id, 0),
                        COALESCE(NULLIF(TRIM(c.nombre), ''), NULLIF(TRIM(bl.comedor_nombre), ''), 'Sin comedor'),
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

      if (params.tipo === 'otros_recursos' && sinMontoPresupuesto) {
        try {
          const [tm]: any = await connection.execute(
            `SELECT COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'otros_recursos' AND TRIM(COALESCE(pr.subrubro, '')) = 'limpieza'
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) +
             COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'otros_recursos' AND TRIM(COALESCE(pr.subrubro, '')) = 'fumigacion'
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) +
             COALESCE((
               SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr
               WHERE pr.rubro = 'otros_recursos' AND TRIM(COALESCE(pr.subrubro, '')) = 'gas'
               ORDER BY pr.resumen_id DESC LIMIT 1
             ), 0) AS t`
          );
          const totalM = Number(tm[0]?.t ?? 0);
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
             WHERE pd.rubro = 'otros_recursos'
             GROUP BY COALESCE(pd.comedor_id, c.comedor_id), COALESCE(c.nombre, pd.dependencia_nombre), z.nombre, COALESCE(z.ambito, pd.ambito), c.responsable_nombre
             HAVING cantidad > 0`
          );
          const aggRows = cr as any[];
          const sumW = aggRows.reduce((s, row) => s + Number(row.cantidad ?? 0), 0);
          rows = aggRows.map((row: any) => ({
            ...row,
            valor: sumW > 0 && totalM > 0 ? (totalM * Number(row.cantidad ?? 0)) / sumW : 0,
          }));
          rows.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
          rows = rows.slice(offsetVal, offsetVal + limitVal);
        } catch (e: any) {
          if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      }

      return (rows as any[]).map((r: any) => {
        const monto = Number(r.valor ?? 0);
        const benef = Number(r.beneficiarios ?? 0);
        const promedio = benef > 0 ? monto / benef : 0;
        return {
          comedor_id: Number(r.comedor_id ?? 0),
          nombre: r.nombre || 'Sin nombre',
          zona_nombre: r.zona_nombre || null,
          ambito: (r.ambito || 'CAPITAL') as Ambito,
          responsable_nombre: r.responsable_nombre || null,
          valor: params.tipo === 'promedio_beneficiario' ? promedio : monto,
          beneficiarios: benef,
          unidad: params.tipo === 'promedio_beneficiario' ? '$/benef.' : '$',
        };
      });
    }

    return [];
  } finally {
    await close();
  }
}

async function getComedorDetail(comedorId: number, periodo: string): Promise<ComedorDetail | null> {
  const { connection, close } = await getComedoresConnection();
  try {
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
      `SELECT COALESCE(SUM(cantidad_beneficiarios), 0) AS total FROM RACION WHERE comedor_id = ? AND plan_ref <=> ?`,
      [comedorId, periodo || null]
    );
    const [gas]: any = await connection.execute(
      `SELECT COALESCE(SUM(garrafas_10kg), 0) AS g10, COALESCE(SUM(garrafas_15kg), 0) AS g15, COALESCE(SUM(garrafas_45kg), 0) AS g45
       FROM BENEFICIO_GAS WHERE comedor_id = ? AND (? IS NULL OR periodo <=> ?)`,
      [comedorId, periodo || null, periodo || null]
    );
    const [limp]: any = await connection.execute(
      `SELECT lavandina_4lt, detergente_45lt, desengrasante_5lt, trapo_piso, trapo_rejilla, virulana, esponja, escobillon, escurridor
       FROM BENEFICIO_LIMPIEZA WHERE comedor_id = ? AND (? IS NULL OR periodo <=> ?) LIMIT 1`,
      [comedorId, periodo || null, periodo || null]
    );
    const [frescos]: any = await connection.execute(
      `SELECT COALESCE(SUM(cebolla_kg + zanahoria_kg + zapallo_kg + papa_kg + acelga_kg + carne_vacuna_kg + pollo_kg + cerdo_kg), 0) AS kg,
              COALESCE(SUM(cebolla_kg), 0) AS cebolla_kg, COALESCE(SUM(zanahoria_kg), 0) AS zanahoria_kg,
              COALESCE(SUM(zapallo_kg), 0) AS zapallo_kg, COALESCE(SUM(papa_kg), 0) AS papa_kg, COALESCE(SUM(acelga_kg), 0) AS acelga_kg,
              COALESCE(SUM(frutas_unidades), 0) AS frutas_unidades, COALESCE(SUM(carne_vacuna_kg), 0) AS carne_vacuna_kg,
              COALESCE(SUM(pollo_kg), 0) AS pollo_kg, COALESCE(SUM(cerdo_kg), 0) AS cerdo_kg
       FROM BENEFICIO_FRESCOS WHERE comedor_id = ? AND (? IS NULL OR periodo <=> ?)`,
      [comedorId, periodo || null, periodo || null]
    );
    let presupFrescosRows: any[] = [];
    try {
      const [pfr]: any = await connection.execute(
        `SELECT item_nombre, COALESCE(SUM(cantidad), 0) AS cantidad
         FROM PRESUPUESTO_ITEM
         WHERE comedor_id = ? AND rubro IN ('refrigerio_comida', 'carnes')
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
         GROUP BY rubro, subrubro, item_nombre`,
        [comedorId]
      );
      presupItemsAll = pi as any[];
    } catch (e: any) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    const [fum]: any = await connection.execute(
      `SELECT COUNT(*) AS n FROM BENEFICIO_FUMIGACION WHERE comedor_id = ? AND (? IS NULL OR periodo <=> ?)`,
      [comedorId, periodo || null, periodo || null]
    );
    let gastoComp: any[] = [];
    try {
      const [gc]: any = await connection.execute(
        `SELECT
           COALESCE(SUM(CASE WHEN rubro = 'monto_invertido' THEN monto ELSE 0 END), 0) AS raciones,
           COALESCE(SUM(CASE WHEN rubro = 'becados' THEN monto ELSE 0 END), 0) AS becados,
           COALESCE(SUM(CASE WHEN rubro = 'refrigerio_comida' THEN monto ELSE 0 END), 0) AS refrigerio_comida,
           COALESCE(SUM(CASE WHEN rubro = 'carnes' THEN monto ELSE 0 END), 0) AS carnes,
           COALESCE(SUM(CASE WHEN rubro = 'otros_recursos' THEN monto ELSE 0 END), 0) AS otros_recursos
         FROM PRESUPUESTO_DEPENDENCIA
         WHERE comedor_id = ?`,
        [comedorId]
      );
      gastoComp = gc as any[];
    } catch (error: any) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
      gastoComp = [];
    }

    let gastoTotalGlobal = 0;
    try {
      const [gt]: any = await connection.execute(
        `SELECT
           COALESCE((SELECT MAX(t.monto) FROM PRESUPUESTO_TEKNOFOOD t WHERE t.escala='MENSUAL' AND t.concepto='raciones_mensuales'), 0)
           + COALESCE((SELECT MAX(pr.monto_total) FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='becados' AND (TRIM(COALESCE(pr.subrubro,''))='totales' OR TRIM(COALESCE(pr.subrubro,''))='')), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='refrigerio_comida' AND TRIM(COALESCE(pr.subrubro,''))='frutas_verduras' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='carnes' AND TRIM(COALESCE(pr.subrubro,''))='carne' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='limpieza' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='fumigacion' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0)
           + COALESCE((SELECT pr.monto_total FROM PRESUPUESTO_RESUMEN pr WHERE pr.rubro='otros_recursos' AND TRIM(COALESCE(pr.subrubro,''))='gas' AND COALESCE(pr.monto_total,0)>0 ORDER BY pr.resumen_id DESC LIMIT 1), 0)
         AS t`
      );
      gastoTotalGlobal = Number(gt[0]?.t ?? 0);
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
    const frescosDesglose: Record<string, number> = {
      cebolla_kg: hasPresupFrescos ? Number(fromPresup.cebolla_kg ?? 0) : Number(fr.cebolla_kg ?? 0),
      zanahoria_kg: hasPresupFrescos ? Number(fromPresup.zanahoria_kg ?? 0) : Number(fr.zanahoria_kg ?? 0),
      zapallo_kg: hasPresupFrescos ? Number(fromPresup.zapallo_kg ?? 0) : Number(fr.zapallo_kg ?? 0),
      papa_kg: hasPresupFrescos ? Number(fromPresup.papa_kg ?? 0) : Number(fr.papa_kg ?? 0),
      acelga_kg: hasPresupFrescos ? Number(fromPresup.acelga_kg ?? 0) : Number(fr.acelga_kg ?? 0),
      frutas_unidades: hasPresupFrescos ? Number(fromPresup.frutas_unidades ?? 0) : Number(fr.frutas_unidades ?? 0),
      carne_vacuna_kg: hasPresupFrescos ? Number(fromPresup.carne_vacuna_kg ?? 0) : Number(fr.carne_vacuna_kg ?? 0),
      pollo_kg: hasPresupFrescos ? Number(fromPresup.pollo_kg ?? 0) : Number(fr.pollo_kg ?? 0),
      cerdo_kg: hasPresupFrescos ? Number(fromPresup.cerdo_kg ?? 0) : Number(fr.cerdo_kg ?? 0),
    };
    const kgVerduras =
      frescosDesglose.cebolla_kg +
      frescosDesglose.zanahoria_kg +
      frescosDesglose.zapallo_kg +
      frescosDesglose.papa_kg +
      frescosDesglose.acelga_kg;
    const kgCarnes =
      frescosDesglose.carne_vacuna_kg + frescosDesglose.pollo_kg + frescosDesglose.cerdo_kg;
    const frescosKgTotal = kgVerduras + kgCarnes;

    const raciones = Number(gastoComp[0]?.raciones ?? 0);
    const becados = Number(gastoComp[0]?.becados ?? 0);
    const refrigerio_comida = Number(gastoComp[0]?.refrigerio_comida ?? 0);
    const carnesMonto = Number(gastoComp[0]?.carnes ?? 0);
    const otros_recursos = Number(gastoComp[0]?.otros_recursos ?? 0);
    const gastoTotalComedor = raciones + becados + refrigerio_comida + carnesMonto + otros_recursos;

    return {
      comedor_id: c.comedor_id,
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
        raciones,
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
    const arr = Array.from(set).sort().reverse();
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
