import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET() {
    try {
        const { connection, close } = await getDBConnection();

        // Ejecutar una consulta simple
        const [rows]: any = await connection.execute('SELECT VERSION() as version');

        await close();

        return NextResponse.json({
            success: true,
            message: 'Conexión a MySQL vía SSH Tunnel exitosa',
            data: rows[0]
        });
    } catch (error: any) {
        console.error('API Test-DB Error:', error);
        return NextResponse.json({
            success: false,
            message: 'Error al conectar a la base de datos',
            error: error.message
        }, { status: 500 });
    }
}
