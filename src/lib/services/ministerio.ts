import { getDBConnection } from '../db';

export interface MinisterioStats {
    total_expedientes: number;
    personas_con_expediente: number;
    total_resoluciones: number;
    total_movimientos: number;
    inversion_total: number;
    personas_atendidas_total: number;
    personas_sin_expediente: number;
    recurso_mas_solicitado: { name: string; value: number } | null;
    total_modulos: number;
    total_pasajes: number;
    demografia: {
        sexo: Array<{ name: string; value: number }>;
        sexo_edad: Array<{ name: string; value: number }>;
        piramide: Array<{ name: string; mujeres: number; varones: number; sinDatos: number; total: number }>;
        edades: Array<{ name: string; value: number }>;
    };
    obras_sociales: Array<{ name: string; value: number }>;
    logistica: {
        destinos: Array<{ name: string; value: number }>;
        salidas: Array<{ name: string; value: number }>;
        recorridos: Array<{ name: string; value: number }>;
    };
    gasto_mensual: Array<{ month: string; amount: number }>;
    entregas: Array<{ name: string; value: number }>;
    estado_recursos: { solicitudes: number; asistencias: number };
}


export async function getMinisterioStats(from: string, to: string): Promise<MinisterioStats> {
    const { connection, close } = await getDBConnection();

    try {
        // 1. Total Personas Atendidas (DNI únicos en cualquier sistema)
        const [people]: any = await connection.execute(`
            SELECT COUNT(DISTINCT dni) as count FROM (
                SELECT b.dni FROM expediente_expediente e
                JOIN expediente_iniciador i ON e.iniciador_id = i.id
                JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
                WHERE b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
                UNION
                SELECT b.dni FROM CDC_recursos_varios rv
                JOIN expediente_beneficiario b ON rv.beneficiario_id = b.id
                WHERE rv.activo = 1 AND b.activo = 1 AND (rv.fecha BETWEEN ? AND ? OR rv.fecha_ingreso BETWEEN ? AND ?)
                UNION
                SELECT b.dni FROM CDC_modulo m
                JOIN expediente_beneficiario b ON m.beneficiario_id = b.id
                WHERE m.activo = 1 AND b.activo = 1 AND (m.fecha BETWEEN ? AND ? OR m.fecha_ingreso BETWEEN ? AND ?)
                UNION
                SELECT b.dni FROM CDC_pasaje p
                JOIN expediente_beneficiario b ON p.beneficiario_id = b.id
                WHERE p.activo = 1 AND b.activo = 1 AND (p.fecha BETWEEN ? AND ? OR p.fecha_ingreso BETWEEN ? AND ?)
            ) as t
        `, [from, to, from, to, from, to, from, to, from, to, from, to, from, to]);

        // 1b. Personas Con Expediente (Foco solicitado por el usuario)
        const [peopleWithExp]: any = await connection.execute(`
            SELECT COUNT(DISTINCT b.dni) as count
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            WHERE b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
        `, [from, to]);

        // 1c. Total Expedientes Creados
        const [totalExp]: any = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM expediente_expediente 
            WHERE fecha_inicio BETWEEN ? AND ? AND activo = 1
        `, [from, to]);

        // 1d. Total Resoluciones
        const [totalRes]: any = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM expediente_resolucion 
            WHERE fecha BETWEEN ? AND ? AND activo = 1
        `, [from, to]);

        // 1e. Total Movimientos
        const [totalMov]: any = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM expediente_movimiento 
            WHERE fecha_pase BETWEEN ? AND ? AND activo = 1
        `, [from, to]);

        // 4. Inversión Financiera
        const [financials]: any = await connection.execute(`
            SELECT 
                (
                    SELECT COALESCE(SUM(bs.monto), 0) FROM ADM_beneficiariosubsidio bs
                    JOIN expediente_expediente e ON bs.expediente_id = e.id
                    WHERE e.fecha_inicio BETWEEN ? AND ?
                ) + 
                (
                    SELECT COALESCE(SUM(t.monto), 0) FROM NBI_titular t
                    JOIN NBI_persona p ON t.persona_id = p.id
                    JOIN expediente_expediente e ON p.id = e.iniciador_id
                    WHERE e.fecha_inicio BETWEEN ? AND ?
                ) as total_ejecutado
        `, [from, to, from, to]);

        // 2 & 3. Recursos entregados (Auxiliar)
        const [modulos]: any = await connection.execute(`
            SELECT SUM(cantidad) as total FROM CDC_modulo WHERE activo = 1 AND (fecha BETWEEN ? AND ? OR fecha_ingreso BETWEEN ? AND ?)
        `, [from, to, from, to]);
        const [pasajes]: any = await connection.execute(`
            SELECT SUM(adultos + menores) as total FROM CDC_pasaje WHERE activo = 1 AND (fecha BETWEEN ? AND ? OR fecha_ingreso BETWEEN ? AND ?)
        `, [from, to, from, to]);

        // Demográficos base
        const baseBeneficiariosCte = `
            WITH BeneficiariosPeriodo AS (
                SELECT DISTINCT b.id, b.dni, b.fecha_nacimiento FROM (
                    SELECT b.id FROM expediente_expediente e JOIN expediente_iniciador i ON e.iniciador_id = i.id JOIN expediente_beneficiario b ON i.beneficiario_id = b.id WHERE b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
                    UNION
                    SELECT b.id FROM CDC_recursos_varios rv JOIN expediente_beneficiario b ON rv.beneficiario_id = b.id WHERE rv.activo = 1 AND b.activo = 1 AND (rv.fecha BETWEEN ? AND ? OR rv.fecha_ingreso BETWEEN ? AND ?)
                ) AS unique_ids JOIN expediente_beneficiario b ON unique_ids.id = b.id
            )
        `;
        const cteArgs = [from, to, from, to, from, to];

        const [sexoStats]: any = await connection.execute(`${baseBeneficiariosCte} SELECT CASE WHEN n.sexo = 1 OR n.sexo = '1' THEN 'Masculino' WHEN n.sexo = 2 OR n.sexo = '2' THEN 'Femenino' ELSE 'Sin Datos' END as name, COUNT(DISTINCT bp.dni) as value FROM BeneficiariosPeriodo bp LEFT JOIN NBI_persona n ON bp.id = n.beneficiario_id GROUP BY name`, cteArgs);
        const [sexoEdadStats]: any = await connection.execute(`${baseBeneficiariosCte} SELECT CASE WHEN n.sexo = 1 OR n.sexo = '1' THEN 'Masculino' WHEN n.sexo = 2 OR n.sexo = '2' THEN 'Femenino' ELSE 'Sin Datos' END as sexo_name, CASE WHEN bp.fecha_nacimiento IS NULL THEN 'Dato Etario Faltante' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) < 18 THEN 'Niñez/Adolescencia' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) BETWEEN 18 AND 30 THEN 'Jóvenes' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) BETWEEN 31 AND 50 THEN 'Adultos' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) BETWEEN 51 AND 65 THEN 'Adultos Mayores' ELSE 'Tercera Edad' END as age_range, COUNT(DISTINCT bp.dni) as value FROM BeneficiariosPeriodo bp LEFT JOIN NBI_persona n ON bp.id = n.beneficiario_id GROUP BY sexo_name, age_range`, cteArgs);

        const ageRanges = ['Dato Etario Faltante', 'Niñez/Adolescencia', 'Jóvenes', 'Adultos', 'Adultos Mayores', 'Tercera Edad'];
        const piramide = ageRanges.map(range => ({
            name: range,
            mujeres: sexoEdadStats.find((s: any) => s.sexo_name === 'Femenino' && s.age_range === range)?.value || 0,
            varones: sexoEdadStats.find((s: any) => s.sexo_name === 'Masculino' && s.age_range === range)?.value || 0,
            sinDatos: sexoEdadStats.find((s: any) => s.sexo_name === 'Sin Datos' && s.age_range === range)?.value || 0,
            total: 0 // Placeholder
        })).map(r => ({ ...r, total: r.mujeres + r.varones + r.sinDatos })).filter(r => r.total > 0);

        const [edadStats]: any = await connection.execute(`${baseBeneficiariosCte} SELECT CASE WHEN bp.fecha_nacimiento IS NULL THEN 'Dato Etario Faltante' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) < 18 THEN 'Niñez/Adolescencia (0-17)' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) BETWEEN 18 AND 30 THEN 'Jóvenes (18-30)' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) BETWEEN 31 AND 50 THEN 'Adultos (31-50)' WHEN TIMESTAMPDIFF(YEAR, bp.fecha_nacimiento, CURDATE()) BETWEEN 51 AND 65 THEN 'Adultos Mayores (51-65)' ELSE 'Tercera Edad (66+)' END as name, COUNT(DISTINCT bp.dni) as value FROM BeneficiariosPeriodo bp GROUP BY name`, cteArgs);
        const [obrasSociales]: any = await connection.execute(`${baseBeneficiariosCte} SELECT o.descripcion as name, COUNT(DISTINCT bp.dni) as value FROM BeneficiariosPeriodo bp JOIN NBI_persona p ON bp.id = p.beneficiario_id JOIN NBI_obrasocial o ON p.obra_social_id = o.id GROUP BY o.descripcion ORDER BY value DESC LIMIT 5`, cteArgs);

        // Logistics (Pasajes)
        const [destinos]: any = await connection.execute(`SELECT m.descripcion as name, SUM(COALESCE(cp.adultos, 0) + COALESCE(cp.menores, 0)) as value FROM expediente_pasaje p JOIN expediente_municipio m ON p.destino_id = m.id JOIN CDC_pasaje cp ON cp.id = p.id WHERE cp.fecha BETWEEN ? AND ? GROUP BY m.descripcion ORDER BY value DESC`, [from, to]);
        const [salidas]: any = await connection.execute(`SELECT m.descripcion as name, SUM(COALESCE(cp.adultos, 0) + COALESCE(cp.menores, 0)) as value FROM expediente_pasaje p JOIN expediente_municipio m ON p.salida_id = m.id JOIN CDC_pasaje cp ON cp.id = p.id WHERE cp.fecha BETWEEN ? AND ? GROUP BY m.descripcion ORDER BY value DESC`, [from, to]);
        const [recorridos]: any = await connection.execute(`SELECT CONCAT(m1.descripcion, ' → ', m2.descripcion) as name, SUM(COALESCE(cp.adultos, 0) + COALESCE(cp.menores, 0)) as value FROM expediente_pasaje p JOIN expediente_municipio m1 ON p.salida_id = m1.id JOIN expediente_municipio m2 ON p.destino_id = m2.id JOIN CDC_pasaje cp ON cp.id = p.id WHERE cp.fecha BETWEEN ? AND ? GROUP BY m1.descripcion, m2.descripcion ORDER BY value DESC`, [from, to]);

        const [gastoMensual]: any = await connection.execute(`SELECT month, SUM(amount) as amount FROM (SELECT DATE_FORMAT(e.fecha_inicio, '%Y-%m') as month, SUM(bs.monto) as amount FROM ADM_beneficiariosubsidio bs JOIN expediente_expediente e ON bs.expediente_id = e.id WHERE e.fecha_inicio BETWEEN ? AND ? GROUP BY month UNION ALL SELECT DATE_FORMAT(e.fecha_inicio, '%Y-%m') as month, SUM(t.monto) as amount FROM NBI_titular t JOIN NBI_persona p ON t.persona_id = p.id JOIN expediente_expediente e ON p.id = e.iniciador_id WHERE e.fecha_inicio BETWEEN ? AND ? GROUP BY month) combined GROUP BY month ORDER BY month`, [from, to, from, to]);
        const [entregas]: any = await connection.execute(`SELECT name, SUM(value) as value FROM (SELECT r.descripcion as name, SUM(rr.cantidad) as value FROM CDC_relevamiento_recurso rr JOIN expediente_recurso r ON rr.recurso_id = r.id JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id WHERE rr.activo = 1 AND (rel.fecha BETWEEN ? AND ? OR rb.fecha_ingreso BETWEEN ? AND ?) GROUP BY r.descripcion) combined GROUP BY name HAVING value > 0 ORDER BY value DESC LIMIT 10`, [from, to, from, to]);

        const [estadoRecursos]: any = await connection.execute(`SELECT (SELECT COALESCE(SUM(rr.cantidad), 0) FROM CDC_relevamiento_recurso rr JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id WHERE rr.activo = 1 AND (rel.fecha BETWEEN ? AND ? OR rb.fecha_ingreso BETWEEN ? AND ?)) as solicitudes, (SELECT COALESCE(SUM(ir.cantidad), 0) FROM CDC_intervencion_recurso ir JOIN CDC_recursos_varios rv ON ir.intervencion_id = rv.id WHERE rv.activo = 1 AND (rv.fecha BETWEEN ? AND ? OR rv.fecha_ingreso BETWEEN ? AND ?)) as asistencias`, [from, to, from, to, from, to, from, to]);

        const totalAtendidos = people[0].count;
        const conExpediente = peopleWithExp[0].count;

        return {
            total_expedientes: totalExp[0].count,
            personas_con_expediente: conExpediente,
            total_resoluciones: totalRes[0].count,
            total_movimientos: totalMov[0].count,
            inversion_total: financials[0].total_ejecutado || 0,
            personas_atendidas_total: totalAtendidos,
            personas_sin_expediente: Math.max(0, totalAtendidos - conExpediente),
            recurso_mas_solicitado: entregas.length > 0 ? entregas[0] : null,
            total_modulos: modulos[0].total || 0,
            total_pasajes: pasajes[0].total || 0,
            demografia: { sexo: sexoStats, sexo_edad: sexoEdadStats, piramide: piramide, edades: edadStats },
            obras_sociales: obrasSociales,
            logistica: { destinos, salidas, recorridos },
            gasto_mensual: gastoMensual,
            entregas: entregas,
            estado_recursos: { solicitudes: Number(estadoRecursos[0]?.solicitudes || 0), asistencias: Number(estadoRecursos[0]?.asistencias || 0) }
        };
    } finally {
        await close();
    }
}
