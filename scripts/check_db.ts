import { getDBConnection } from '../src/lib/db';

async function test() {
    const { connection, close } = await getDBConnection();
    try {
        const [rows]: any = await connection.execute('DESCRIBE NBI_persona');
        console.log(rows.map((r: any) => r.Field));
    } catch (e) {
        console.error(e);
    } finally {
        await close();
    }
}

test();
