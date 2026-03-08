import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from') || '2024-01-01';
        const to = searchParams.get('to') || '2026-12-31';

        const { connection, close } = await getDBConnection();

        // 1. Conteo de Modulos Alimentarios 
        const [modulos]: any = await connection.execute(`
            SELECT 'Módulos Alimentarios' as descripcion, COUNT(*) as total_entregado, SUM(cantidad) as sum_cantidad
            FROM CDC_modulo
            WHERE activo = 1 AND fecha_ingreso BETWEEN ? AND ?
        `, [from, to]);

        // 2. Conteo de Pasajes
        const [pasajesData]: any = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM CDC_pasaje
            WHERE activo = 1 AND fecha_ingreso BETWEEN ? AND ?
        `, [from, to]);

        // 3. Recursos Varios (Otras ayudas)
        const [recursos]: any = await connection.execute(`
            SELECT descripcion, SUM(total) as total FROM (
                SELECT r.descripcion as descripcion, SUM(rr.cantidad) as total
                FROM CDC_relevamiento_recurso rr
                JOIN expediente_recurso r ON rr.recurso_id = r.id
                JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id
                JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id
                WHERE rr.activo = 1 AND rel.fecha BETWEEN ? AND ?
                GROUP BY r.descripcion
                UNION ALL
                SELECT r.descripcion as descripcion, SUM(rr.cantidad) as total
                FROM CDC_relevamiento_recursoextraordinario rr
                JOIN ADM_recurso r ON rr.recurso_id = r.id
                JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id
                JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id
                WHERE rr.activo = 1 AND rel.fecha BETWEEN ? AND ?
                GROUP BY r.descripcion
            ) combined
            GROUP BY descripcion
            ORDER BY total DESC
            LIMIT 5
        `, [from, to, from, to]);

        // 4. Distribución Territorial de Ayudas
        const [territory]: any = await connection.execute(`
            SELECT mun.descripcion as name, COUNT(*) as value
            FROM (
                SELECT e.localidad_id FROM CDC_modulo m 
                JOIN expediente_expediente e ON m.expediente_id = e.id
                WHERE m.activo = 1 AND m.fecha_ingreso BETWEEN ? AND ?
                
                UNION ALL
                
                SELECT e.localidad_id FROM CDC_pasaje p 
                JOIN expediente_expediente e ON p.id = e.id
                WHERE p.activo = 1 AND p.fecha_ingreso BETWEEN ? AND ?
                
                UNION ALL
                
                SELECT rel.localidad_id FROM CDC_relevamiento_recursoextraordinario rr 
                JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id
                JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id
                WHERE rr.activo = 1 AND rel.fecha BETWEEN ? AND ?
                
                UNION ALL
                
                SELECT rel.localidad_id FROM CDC_relevamiento_recurso rr 
                JOIN CDC_relevamiento_beneficiario rb ON rr.relevamiento_beneficiario_id = rb.id
                JOIN CDC_relevamiento rel ON rb.relevamiento_id = rel.id
                WHERE rr.activo = 1 AND rel.fecha BETWEEN ? AND ?
            ) as combined
            JOIN expediente_municipio mun ON combined.localidad_id = mun.id
            GROUP BY mun.descripcion
            ORDER BY value DESC
            LIMIT 10
        `, [from, to, from, to, from, to, from, to]);

        await close();

        return NextResponse.json({
            success: true,
            data: {
                modulos,
                pasajes: pasajesData[0].count,
                recursos,
                territory
            }
        });
    } catch (error: any) {
        console.error('Territorial API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
