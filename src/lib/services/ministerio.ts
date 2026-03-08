import { getDBConnection } from '../db';

export interface MinisterioStats {
    total_personas: number;
    total_modulos: number;
    total_pasajes: number;
    inversion_total: number;
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
}

export async function getMinisterioStats(from: string, to: string): Promise<MinisterioStats> {
    const { connection, close } = await getDBConnection();

    try {
        // 1. Total Personas (DNI únicos en expediente_beneficiario con expediente en el periodo)
        const [people]: any = await connection.execute(`
            SELECT COUNT(DISTINCT b.dni) as count 
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            WHERE b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
        `, [from, to]);

        // 2. Cantidades Entregadas (Módulos)
        const [modulos]: any = await connection.execute(`
            SELECT SUM(cantidad) as total 
            FROM CDC_modulo 
            WHERE activo = 1 AND (fecha BETWEEN ? AND ? OR fecha_ingreso BETWEEN ? AND ?)
        `, [from, to, from, to]);

        // 3. Cantidades Entregadas (Pasajes - adultos + menores)
        const [pasajes]: any = await connection.execute(`
            SELECT SUM(adultos + menores) as total 
            FROM CDC_pasaje 
            WHERE activo = 1 AND (fecha BETWEEN ? AND ? OR fecha_ingreso BETWEEN ? AND ?)
        `, [from, to, from, to]);

        // 4. Inversión (Subsidios + Titulares)
        const [financials]: any = await connection.execute(`
            SELECT 
                (
                    SELECT COALESCE(SUM(bs.monto), 0) 
                    FROM ADM_beneficiariosubsidio bs
                    JOIN expediente_expediente e ON bs.expediente_id = e.id
                    WHERE e.fecha_inicio BETWEEN ? AND ?
                ) + 
                (
                    SELECT COALESCE(SUM(t.monto), 0) 
                    FROM NBI_titular t
                    JOIN NBI_persona p ON t.persona_id = p.id
                    JOIN expediente_expediente e ON p.id = e.iniciador_id
                    WHERE e.fecha_inicio BETWEEN ? AND ?
                ) as total_ejecutado
        `, [from, to, from, to]);

        // 5. Demografía - Sexo (Solo Mujer y Varón - Dinámico por periodo)
        const [sexoStats]: any = await connection.execute(`
            SELECT 
                CASE 
                    WHEN n.sexo = 1 OR n.sexo = '1' THEN 'Masculino'
                    WHEN n.sexo = 2 OR n.sexo = '2' THEN 'Femenino'
                    ELSE 'Sin Datos'
                END as name,
                COUNT(DISTINCT b.dni) as value
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            JOIN NBI_persona n ON b.id = n.beneficiario_id
            WHERE b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
            GROUP BY name
        `, [from, to]);

        // 5b. Demografía - Sexo por Edad (Dinámico por periodo)
        const [sexoEdadStats]: any = await connection.execute(`
            SELECT 
                CASE 
                    WHEN n.sexo = 1 OR n.sexo = '1' THEN 'Masculino' 
                    WHEN n.sexo = 2 OR n.sexo = '2' THEN 'Femenino'
                    ELSE 'Sin Datos'
                END as sexo_name,
                CASE 
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) < 18 THEN 'Niñez/Adolescencia'
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) BETWEEN 18 AND 30 THEN 'Jóvenes'
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) BETWEEN 31 AND 50 THEN 'Adultos'
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) BETWEEN 51 AND 65 THEN 'Adultos Mayores'
                    ELSE 'Tercera Edad'
                END as age_range,
                COUNT(DISTINCT b.dni) as value
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            JOIN NBI_persona n ON b.id = n.beneficiario_id
            WHERE b.fecha_nacimiento IS NOT NULL 
              AND b.activo = 1 
              AND e.fecha_inicio BETWEEN ? AND ?
            GROUP BY sexo_name, age_range
        `, [from, to]);

        // Transformar sexoEdadStats en un formato de pirámide estructurado
        const ageRanges = [
            'Niñez/Adolescencia',
            'Jóvenes',
            'Adultos',
            'Adultos Mayores',
            'Tercera Edad'
        ];

        const piramide = ageRanges.map(range => {
            const mujeres = sexoEdadStats.find((s: any) => s.sexo_name === 'Femenino' && s.age_range === range)?.value || 0;
            const varones = sexoEdadStats.find((s: any) => s.sexo_name === 'Masculino' && s.age_range === range)?.value || 0;
            const sinDatos = sexoEdadStats.find((s: any) => s.sexo_name === 'Sin Datos' && s.age_range === range)?.value || 0;

            return {
                name: range,
                mujeres,
                varones,
                sinDatos,
                total: mujeres + varones + sinDatos
            };
        }).filter(r => r.total > 0);

        // 6. Demografía - Edad (Categorías claras - Dinámico por periodo)
        const [edadStats]: any = await connection.execute(`
            SELECT 
                CASE 
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) < 18 THEN 'Niñez/Adolescencia (0-17)'
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) BETWEEN 18 AND 30 THEN 'Jóvenes (18-30)'
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) BETWEEN 31 AND 50 THEN 'Adultos (31-50)'
                    WHEN TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()) BETWEEN 51 AND 65 THEN 'Adultos Mayores (51-65)'
                    ELSE 'Tercera Edad (66+)'
                END as name,
                COUNT(DISTINCT b.dni) as value
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            WHERE b.fecha_nacimiento IS NOT NULL AND b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
            GROUP BY name
            ORDER BY MIN(TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE()))
        `, [from, to]);

        // 7. Obras Sociales (Dinámico por periodo)
        const [obrasSociales]: any = await connection.execute(`
            SELECT o.descripcion as name, COUNT(DISTINCT b.dni) as value
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            JOIN NBI_persona p ON b.id = p.beneficiario_id
            JOIN NBI_obrasocial o ON p.obra_social_id = o.id
            WHERE e.fecha_inicio BETWEEN ? AND ?
            GROUP BY o.descripcion
            ORDER BY value DESC
            LIMIT 5
        `, [from, to]);

        // 8. Logística - Destinos Recurrentes (Dinámico por periodo)
        const [destinos]: any = await connection.execute(`
            SELECT m.descripcion as name, SUM(COALESCE(cp.adultos, 0) + COALESCE(cp.menores, 0)) as value
            FROM expediente_pasaje p
            JOIN expediente_municipio m ON p.destino_id = m.id
            JOIN CDC_pasaje cp ON cp.id = p.id
            WHERE cp.fecha BETWEEN ? AND ?
            GROUP BY m.descripcion
            ORDER BY value DESC
        `, [from, to]);

        // 9. Logística - Salidas Recurrentes (Dinámico por periodo)
        const [salidas]: any = await connection.execute(`
            SELECT m.descripcion as name, SUM(COALESCE(cp.adultos, 0) + COALESCE(cp.menores, 0)) as value
            FROM expediente_pasaje p
            JOIN expediente_municipio m ON p.salida_id = m.id
            JOIN CDC_pasaje cp ON cp.id = p.id
            WHERE cp.fecha BETWEEN ? AND ?
            GROUP BY m.descripcion
            ORDER BY value DESC
        `, [from, to]);

        // 9b. Logística - Recorridos (Origen -> Destino) (Dinámico por periodo)
        const [recorridos]: any = await connection.execute(`
            SELECT 
                CONCAT(m1.descripcion, ' → ', m2.descripcion) as name, 
                SUM(COALESCE(cp.adultos, 0) + COALESCE(cp.menores, 0)) as value
            FROM expediente_pasaje p
            JOIN expediente_municipio m1 ON p.salida_id = m1.id
            JOIN expediente_municipio m2 ON p.destino_id = m2.id
            JOIN CDC_pasaje cp ON cp.id = p.id
            WHERE cp.fecha BETWEEN ? AND ?
            GROUP BY m1.descripcion, m2.descripcion
            ORDER BY value DESC
        `, [from, to]);

        // 10. Gasto Mensual (Trend - Suma de Subsidios + Ayudas)
        const [gastoMensual]: any = await connection.execute(`
            SELECT month, SUM(amount) as amount FROM (
                SELECT 
                    DATE_FORMAT(e.fecha_inicio, '%Y-%m') as month,
                    SUM(bs.monto) as amount
                FROM ADM_beneficiariosubsidio bs
                JOIN expediente_expediente e ON bs.expediente_id = e.id
                WHERE e.fecha_inicio BETWEEN ? AND ?
                GROUP BY month
                UNION ALL
                SELECT 
                    DATE_FORMAT(e.fecha_inicio, '%Y-%m') as month,
                    SUM(t.monto) as amount
                FROM NBI_titular t
                JOIN NBI_persona p ON t.persona_id = p.id
                JOIN expediente_expediente e ON p.id = e.iniciador_id
                WHERE e.fecha_inicio BETWEEN ? AND ?
                GROUP BY month
            ) combined
            GROUP BY month
            ORDER BY month
        `, [from, to, from, to]);

        // 11. Entregas - Ranking de Ayudas (Módulos, Pasajes, Recursos)
        const [entregas]: any = await connection.execute(`
            SELECT name, SUM(value) as value FROM (
                SELECT 'Módulos Alimentarios' as name, SUM(cantidad) as value 
                FROM CDC_modulo 
                WHERE activo = 1 AND (fecha BETWEEN ? AND ? OR fecha_ingreso BETWEEN ? AND ?)
                UNION ALL
                SELECT 'Pasajes' as name, SUM(adultos + menores) as value 
                FROM CDC_pasaje 
                WHERE activo = 1 AND (fecha BETWEEN ? AND ? OR fecha_ingreso BETWEEN ? AND ?)
                UNION ALL
                SELECT r.descripcion as name, SUM(rr.cantidad) as value
                FROM CDC_relevamiento_recurso rr
                JOIN expediente_recurso r ON rr.recurso_id = r.id
                JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id
                JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id
                WHERE rr.activo = 1 AND rel.fecha BETWEEN ? AND ?
                GROUP BY r.descripcion
                UNION ALL
                SELECT r.descripcion as name, SUM(rr.cantidad) as value
                FROM CDC_relevamiento_recursoextraordinario rr
                JOIN ADM_recurso r ON rr.recurso_id = r.id
                JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id
                JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id
                WHERE rr.activo = 1 AND rel.fecha BETWEEN ? AND ?
                GROUP BY r.descripcion
            ) combined
            GROUP BY name
            HAVING value > 0
            ORDER BY value DESC
            LIMIT 10
        `, [from, to, from, to, from, to, from, to, from, to, from, to]);

        return {
            total_personas: people[0].count,
            total_modulos: modulos[0].total || 0,
            total_pasajes: pasajes[0].total || 0,
            inversion_total: financials[0].total_ejecutado || 0,
            demografia: {
                sexo: sexoStats,
                sexo_edad: sexoEdadStats,
                piramide: piramide,
                edades: edadStats
            },
            obras_sociales: obrasSociales,
            logistica: {
                destinos,
                salidas,
                recorridos
            },
            gasto_mensual: gastoMensual,
            entregas: entregas
        };
    } finally {
        await close();
    }
}
