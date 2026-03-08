import { getDBConnection } from './src/lib/db';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    try {
        const { connection, close } = await getDBConnection();
        const [rows]: any = await connection.execute('SHOW TABLES');
        console.log(JSON.stringify(rows));
        await close();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
