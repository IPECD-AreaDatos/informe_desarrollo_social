import mysql from 'mysql2/promise';
import { createSSHTunnel, SSHConfig, TunnelConfig } from './ssh-tunnel';

const useSSHTunnel = process.env.USE_SSH_TUNNEL !== 'false' && !!process.env.SSH_HOST;

export const getDBConnection = async () => {
    if (useSSHTunnel) {
        const rawKey = process.env.SSH_PRIVATE_KEY;
        const privateKey = rawKey
            ? rawKey.replace(/\\n/g, '\n').trim()
            : undefined;

        const sshConfig: SSHConfig = {
            host: process.env.SSH_HOST || '',
            port: parseInt(process.env.SSH_PORT || process.env.PORT || '22', 10),
            username: process.env.SSH_USER || '',
            privateKey,
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
                connection,
                close: async () => {
                    await connection.end();
                    closeTunnel();
                },
            };
        } catch (error: any) {
            const msg = error?.message || String(error);
            console.error('Error establishing database connection via SSH tunnel:', error);
            throw new Error(`Túnel SSH: ${msg}`);
        }
    }

    const host = process.env.DB_HOST || '127.0.0.1';
    const port = parseInt(process.env.DB_PORT || '3306');
    const connection = await mysql.createConnection({
        host,
        port,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    return {
        connection,
        close: async () => {
            await connection.end();
        },
    };
};
