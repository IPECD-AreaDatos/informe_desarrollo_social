import mysql from 'mysql2/promise';
import { createSSHTunnel, SSHConfig, TunnelConfig } from './ssh-tunnel';

export const getDBConnection = async () => {
    // Si no hay configuración de SSH, nos conectamos directamente (como en local)
    if (!process.env.SSH_HOST) {
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            });

            return {
                connection, close: async () => {
                    await connection.end();
                }
            };
        } catch (error) {
            console.error('Error establishing direct database connection:', error);
            throw error;
        }
    }

    const sshConfig: SSHConfig = {
        host: process.env.SSH_HOST || '',
        port: parseInt(process.env.SSH_PORT || '22'),
        username: process.env.SSH_USER || '',
        privateKey: process.env.SSH_PRIVATE_KEY ? process.env.SSH_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        privateKeyPath: process.env.SSH_KEY_PATH || '',
    };

    const tunnelConfig: TunnelConfig = {
        remoteHost: process.env.DB_HOST || '127.0.0.1',
        remotePort: parseInt(process.env.DB_PORT || '3306'),
    };

    try {
        const { localPort, close: closeTunnel } = await createSSHTunnel(sshConfig, tunnelConfig);

        const connection = await mysql.createConnection({
            host: '127.0.0.1',
            port: localPort,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        return {
            connection, close: async () => {
                await connection.end();
                closeTunnel();
            }
        };
    } catch (error) {
        console.error('Error establishing database connection via SSH tunnel:', error);
        throw error;
    }
};

export const getComedoresConnection = async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.HOST_DBB1,
            user: process.env.USER_DBB1,
            password: process.env.PASSWORD_DBB1,
            database: process.env.BASE_DESARROLLO_SOCIAL,
        });

        return {
            connection, close: async () => {
                await connection.end();
            }
        };
    } catch (error) {
        console.error('Error establishing direct database connection for comedores:', error);
        throw error;
    }
};
