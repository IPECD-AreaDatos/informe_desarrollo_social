import { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Returns a shared connection pool for the PostgreSQL database (DBB1).
 */
export function getPgPool(): Pool {
    if (!pool) {
        pool = new Pool({
            host: process.env.PG_HOST,
            port: parseInt(process.env.PG_PORT || '5432'),
            user: process.env.PG_USER,
            password: process.env.PG_PASSWORD,
            database: (process.env.PG_DATABASE || '').trim(),
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
    return pool;
}

/**
 * Utility to run a query against the PostgreSQL database.
 */
export async function queryPg(text: string, params?: any[]) {
    const poolInstance = getPgPool();
    return poolInstance.query(text, params);
}
