import { getDBConnection } from '../src/lib/db';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

async function main() {
    try {
        const { connection, close } = await getDBConnection();

        const report: any = {
            metadata: {
                generated_at: new Date().toISOString(),
                db: 'expedientes'
            },
            sections: {}
        };

        // 1. Datos Demográficos Reales (NBI_persona)
        const [sexo]: any = await connection.execute('SELECT sexo, COUNT(*) as count FROM NBI_persona GROUP BY sexo');
        const [instruccion]: any = await connection.execute('SELECT nivel_instruccion, COUNT(*) as count FROM NBI_persona GROUP BY nivel_instruccion');
        const [laboral]: any = await connection.execute('SELECT situacion_laboral, COUNT(*) as count FROM NBI_persona GROUP BY situacion_laboral');

        report.sections.demographics = { sexo, instruccion, laboral };

        // 2. Infraestructura Real (NBI_vivienda)
        const [infra]: any = await connection.execute(`
        SELECT 
            SUM(agua_corriente) as con_agua,
            SUM(cloaca) as con_cloaca,
            SUM(energia_electrica) as con_luz,
            SUM(internet) as con_internet,
            SUM(otros_dispositivos) as con_dispositivos,
            COUNT(*) as total
        FROM NBI_vivienda
    `);
        report.sections.infrastructure = infra[0];

        // 3. Montos por Programa (NBI_titular + NBI_programa)
        const [programas]: any = await connection.execute(`
        SELECT p.descripcion, SUM(t.monto) as total_invertido, COUNT(t.id) as beneficiarios
        FROM NBI_titular t
        JOIN NBI_programa p ON t.programa_id = p.id
        GROUP BY p.descripcion
    `);
        report.sections.programs = programas;

        // 4. Geografía Real (CDC_relevamiento_beneficiario)
        const [geo]: any = await connection.execute(`
        SELECT 
            COUNT(*) as total_relevamientos,
            SUM(CASE WHEN latitud IS NOT NULL THEN 1 ELSE 0 END) as con_coordenadas
        FROM CDC_relevamiento_beneficiario
    `);
        report.sections.geographic = geo[0];

        fs.writeFileSync('REAL_DB_STATS.json', JSON.stringify(report, null, 2));
        console.log('--- DATA EXTRACTED TO REAL_DB_STATS.json ---');

        await close();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
