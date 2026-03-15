import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    try {
        const { connection, close } = await getDBConnection();

        let whereClause = 'WHERE 1=1';
        const params: any[] = [];

        if (from && to) {
            whereClause += ' AND e.fecha_inicio BETWEEN ? AND ?';
            params.push(from, to);
        }

        let whereClauseCobertura = whereClause + ' AND UPPER(os.descripcion) != "SUMAR"';
        const [cobertura]: any = await connection.execute(`
            SELECT os.descripcion as name, COUNT(p.id) as count 
            FROM NBI_persona p 
            JOIN NBI_obrasocial os ON p.obra_social_id = os.id 
            LEFT JOIN expediente_expediente e ON p.beneficiario_id = e.iniciador_id 
            ${whereClauseCobertura} 
            GROUP BY os.descripcion
            ORDER BY count DESC
        `, params);

        let whereClauseSumar = whereClause + ' AND UPPER(os.descripcion) = "SUMAR"';
        const [planSumarRows]: any = await connection.execute(`
            SELECT COUNT(p.id) as count
            FROM NBI_persona p 
            JOIN NBI_obrasocial os ON p.obra_social_id = os.id 
            LEFT JOIN expediente_expediente e ON p.beneficiario_id = e.iniciador_id 
            ${whereClauseSumar}
        `, params);

        let whereClauseSin = 'WHERE p.obra_social_id IS NULL';
        const paramsSin: any[] = [];

        if (from && to) {
            whereClauseSin += ' AND e.fecha_inicio BETWEEN ? AND ?';
            paramsSin.push(from, to);
        }

        const [sinCobertura]: any = await connection.execute(`
            SELECT COUNT(p.id) as count
            FROM NBI_persona p
            LEFT JOIN expediente_expediente e ON p.beneficiario_id = e.iniciador_id 
            ${whereClauseSin}
        `, paramsSin);

        await close();

        return NextResponse.json({
            success: true,
            data: {
                cobertura,
                sinCobertura: sinCobertura[0].count,
                planSumar: planSumarRows[0].count
            }
        });
    } catch (error: any) {
        console.error('Health API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
