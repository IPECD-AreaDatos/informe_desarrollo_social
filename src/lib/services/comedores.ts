import { getDBConnection } from '../db';

export type Ambito = 'CAPITAL' | 'INTERIOR';
export type RankingTipo = 'beneficiarios' | 'gas' | 'limpieza' | 'frescos' | 'responsables';

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
  comedores_por_zona_capital: { zona: string; cantidad: number }[];
  comedores_por_interior: { departamento: string; localidad: string | null; cantidad: number }[];
}

export interface ComedoresRankingRow {
  comedor_id: number;
  nombre: string;
  zona_nombre: string | null;
  ambito: Ambito;
  responsable_nombre: string | null;
  valor: number;
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
}

export interface PeriodoOption {
  valor: string;
  etiqueta: string;
}

async function getSummaryByPeriodo(periodo: string): Promise<ComedoresSummary> {
  const { connection, close } = await getDBConnection();
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
      comedores_por_zona_capital: (zonasCapital as any[]).map((r: any) => ({ zona: r.zona || 'Sin zona', cantidad: r.cantidad })),
      comedores_por_interior: (interior as any[]).map((r: any) => ({
        departamento: r.departamento || '',
        localidad: r.localidad ?? null,
        cantidad: r.cantidad,
      })),
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
  const { connection, close } = await getDBConnection();
  const limitVal = Math.min(Math.max(0, params.limit ?? 50), 100);
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

    return [];
  } finally {
    await close();
  }
}

async function getComedorDetail(comedorId: number, periodo: string): Promise<ComedorDetail | null> {
  const { connection, close } = await getDBConnection();
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
    const [fum]: any = await connection.execute(
      `SELECT COUNT(*) AS n FROM BENEFICIO_FUMIGACION WHERE comedor_id = ? AND (? IS NULL OR periodo <=> ?)`,
      [comedorId, periodo || null, periodo || null]
    );

    const l = limp[0] || {};
    const fr = frescos[0] || {};
    const limpieza: Record<string, number> = {
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
    const frescosDesglose: Record<string, number> = {
      cebolla_kg: Number(fr.cebolla_kg ?? 0),
      zanahoria_kg: Number(fr.zanahoria_kg ?? 0),
      zapallo_kg: Number(fr.zapallo_kg ?? 0),
      papa_kg: Number(fr.papa_kg ?? 0),
      acelga_kg: Number(fr.acelga_kg ?? 0),
      frutas_unidades: Number(fr.frutas_unidades ?? 0),
      carne_vacuna_kg: Number(fr.carne_vacuna_kg ?? 0),
      pollo_kg: Number(fr.pollo_kg ?? 0),
      cerdo_kg: Number(fr.cerdo_kg ?? 0),
    };

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
          garrafas_10: Number(gas[0]?.g10 ?? 0),
          garrafas_15: Number(gas[0]?.g15 ?? 0),
          garrafas_45: Number(gas[0]?.g45 ?? 0),
        },
        limpieza,
        frescos_kg: Number(fr.kg ?? 0),
        frescos_desglose: frescosDesglose,
        fumigacion: Number(fum[0]?.n ?? 0) > 0,
      },
    };
  } finally {
    await close();
  }
}

async function getPeriodosDisponibles(): Promise<PeriodoOption[]> {
  const { connection, close } = await getDBConnection();
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
};
