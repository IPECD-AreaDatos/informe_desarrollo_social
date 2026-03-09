import mysql from 'mysql2/promise';

export const getDBConnection = async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        return {
            connection,
            close: async () => {
                await connection.end();
            }
        };
    } catch (error) {
        console.error('Error establishing direct database connection:', error);
        throw error;
    }
};
