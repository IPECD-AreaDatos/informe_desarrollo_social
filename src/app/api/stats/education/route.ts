import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from') || '2025-01-01';
        const to = searchParams.get('to') || '2026-12-31';

        const { connection, close } = await getDBConnection();

        // 1. Niveles de Instrucción (General)
        const [instruccion]: any = await connection.execute(`
            SELECT nivel_instruccion, COUNT(*) as value
            FROM NBI_persona
            GROUP BY nivel_instruccion
            ORDER BY value DESC
        `);

        // 2. Educación por Programa (Filtrado por titularidad en periodo)
        const [eduByProgram]: any = await connection.execute(`
            SELECT pr.descripcion as name, AVG(p.nivel_instruccion) as avg_level
            FROM NBI_persona p
            JOIN NBI_titular t ON t.persona_id = p.id
            JOIN NBI_programa pr ON t.programa_id = pr.id
            LEFT JOIN expediente_expediente e ON p.id = e.iniciador_id
            WHERE e.fecha_inicio BETWEEN ? AND ?
            GROUP BY pr.descripcion
            ORDER BY avg_level DESC
        `, [from, to]);

        // 3. Totales (Filtrado por periodo de expediente)
        const [totals]: any = await connection.execute(`
            SELECT 
                COUNT(p.id) as total_personas,
                SUM(CASE WHEN p.nivel_instruccion > 6 THEN 1 ELSE 0 END) as nivel_superior_completo
            FROM NBI_persona p
            JOIN expediente_expediente e ON p.id = e.iniciador_id
            WHERE e.fecha_inicio BETWEEN ? AND ?
        `, [from, to]);

        await close();

        return NextResponse.json({
            success: true,
            data: {
                instructionLevels: instruccion,
                eduByProgram,
                stats: totals[0] || { total_personas: 0, nivel_superior_completo: 0 }
            }
        });
    } catch (error: any) {
        console.error('Education API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
