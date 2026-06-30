import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { hashPassword } from '../src/lib/crypto';
dotenv.config();

async function main() {
    const dbConfig = {
        host: process.env.PG_HOST || process.env.HOST_DBB1 || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        user: process.env.PG_USER || process.env.USER_DBB1 || 'app',
        password: process.env.PG_PASSWORD || process.env.PASSWORD_DBB1 || 'app',
        database: (
            process.env.PG_DATABASE ||
            process.env.BASE_DESARROLLO_SOCIAL ||
            'informe_auth'
        ).trim(),
    };

    console.log(`Connecting to database ${dbConfig.database} on ${dbConfig.host}...`);
    const client = new Client(dbConfig);

    try {
        await client.connect();
        console.log('Connected successfully. Resetting database schema...');

        // Try to recreate schema first (cleanest way)
        try {
            console.log('Attempting schema drop and recreate...');
            await client.query('DROP SCHEMA public CASCADE');
            await client.query('CREATE SCHEMA public');
            await client.query('GRANT ALL ON SCHEMA public TO public');
            console.log('Schema recreated successfully.');
        } catch (e: any) {
            console.log('Drop schema failed, falling back to dropping tables individually. Error:', e.message);
            // Fallback: Get all tables and drop them cascade
            const res = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                  AND table_type = 'BASE TABLE'
            `);
            const tables = res.rows.map(r => r.table_name);
            console.log(`Found ${tables.length} tables to drop.`);
            for (const table of tables) {
                console.log(`Dropping table "${table}" CASCADE...`);
                await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
            }
        }

        // Create the users table
        console.log('Creating "users" table...');
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Users table created.');

        console.log('Creating "user_logs" table...');
        await client.query(`
            CREATE TABLE user_logs (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                pathname TEXT NOT NULL,
                action VARCHAR(100) NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('User logs table created.');

        // Seed default admin user
        const adminUser = 'admin';
        const adminPass = 'Admin2026!';
        const adminRole = 'Administrador';
        const hashedPassword = hashPassword(adminPass);

        console.log(`Inserting default admin user: "${adminUser}" with role "${adminRole}"...`);
        await client.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
            [adminUser, hashedPassword, adminRole]
        );
        console.log('Default admin user created successfully.');

        // Double check tables
        const verifyRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Current tables in public schema:', verifyRes.rows.map(r => r.table_name));

    } catch (err) {
        console.error('An error occurred during reset:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
