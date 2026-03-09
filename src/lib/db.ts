import mysql from 'mysql2/promise';
import { createSSHTunnel, SSHConfig, TunnelConfig } from './ssh-tunnel';

export const getDBConnection = async () => {
    let rawPrivateKey = process.env.SSH_PRIVATE_KEY;
    if (rawPrivateKey) {
        // Remover comillas dobles o simples si las tiene en los extremos
        if (rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')) {
            rawPrivateKey = rawPrivateKey.slice(1, -1);
        } else if (rawPrivateKey.startsWith("'") && rawPrivateKey.endsWith("'")) {
            rawPrivateKey = rawPrivateKey.slice(1, -1);
        }
        rawPrivateKey = rawPrivateKey.replace(/\\n/g, '\n');
    }

    const sshConfig: SSHConfig = {
        host: process.env.SSH_HOST || '',
        port: parseInt(process.env.SSH_PORT || '22'),
        username: process.env.SSH_USER || '',
        privateKey: rawPrivateKey,
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
