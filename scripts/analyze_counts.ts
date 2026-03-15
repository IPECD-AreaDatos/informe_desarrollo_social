
import { getDBConnection } from './src/lib/db';

async function analyze() {
    const { connection, close }: any = await getDBConnection();
    const from = '2025-01-01';
    const to = '2026-12-31';

    try {
        const [total]: any = await connection.execute('SELECT COUNT(*) as count FROM expediente_expediente WHERE activo = 1 AND fecha_inicio BETWEEN ? AND ?', [from, to]);
        console.log('Total Expedientes (Raw):', total[0].count);

        const [withJoin]: any = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            WHERE e.activo = 1 AND b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
        `, [from, to]);
        console.log('Total Expedientes (With Join to Beneficiario):', withJoin[0].count);

        const [distinctDni]: any = await connection.execute(`
            SELECT COUNT(DISTINCT b.dni) as count
            FROM expediente_expediente e
            JOIN expediente_iniciador i ON e.iniciador_id = i.id
            JOIN expediente_beneficiario b ON i.beneficiario_id = b.id
            WHERE e.activo = 1 AND b.activo = 1 AND e.fecha_inicio BETWEEN ? AND ?
        `, [from, to]);
        console.log('Distinct DNI with Expediente:', distinctDni[0].count);

    } finally {
        await close();
    }
}

analyze();
