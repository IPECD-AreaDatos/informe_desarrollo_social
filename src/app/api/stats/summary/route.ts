import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from') || '2025-01-01';
        const to = searchParams.get('to') || '2026-12-31';

        const { connection, close } = await getDBConnection();

        // 1. Personas y Hogares (Totales acumulados)
        const [people]: any = await connection.execute('SELECT COUNT(*) as count FROM NBI_persona');
        const [families]: any = await connection.execute('SELECT COUNT(*) as count FROM NBI_vivienda');

        // 2. Inversión Total EFECTUADA EN EL PERIODO
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

        // 3. Resumen de Vulnerabilidad (General)
        const [infra]: any = await connection.execute(`
            SELECT 
                COALESCE(AVG(agua_corriente), 0) * 100 as pct_agua,
                COALESCE(AVG(energia_electrica), 0) * 100 as pct_luz
            FROM NBI_vivienda
        `);

        // 4. Entregas Territoriales EN EL PERIODO
        const [territorial]: any = await connection.execute(`
            SELECT COUNT(*) as total_entregas
            FROM CDC_modulo
            WHERE activo = 1 AND fecha_ingreso BETWEEN ? AND ?
        `, [from, to]);

        // 5. Ranking de Municipios (Solo expedientes del PERIODO)
        const [topMunicipios]: any = await connection.execute(`
            SELECT m.descripcion as name, COUNT(e.id) as value
            FROM expediente_expediente e
            JOIN expediente_municipio m ON e.localidad_id = m.id
            WHERE e.fecha_inicio BETWEEN ? AND ?
            GROUP BY m.descripcion
            ORDER BY value DESC
            LIMIT 5
        `, [from, to]);

        // 6. Últimos Movimientos Globales (PERIODO)
        const [recent]: any = await connection.execute(`
            SELECT 'Expediente' as type, e.extracto as detail, e.fecha_inicio as date, m.descripcion as location
            FROM expediente_expediente e
            JOIN expediente_municipio m ON e.localidad_id = m.id
            WHERE e.fecha_inicio BETWEEN ? AND ?
            ORDER BY e.fecha_inicio DESC
            LIMIT 4
        `, [from, to]);

        await close();

        return NextResponse.json({
            success: true,
            data: {
                metrics: {
                    total_personas: people[0].count,
                    total_hogares: families[0].count,
                    inversion_total: financials[0].total_ejecutado || 0,
                    entregas_territoriales: territorial[0].total_entregas
                },
                infrastructure: infra[0],
                topMunicipios,
                recent
            }
        });
    } catch (error: any) {
        console.error('Summary API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
