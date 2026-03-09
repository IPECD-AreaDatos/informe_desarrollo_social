import mysql from 'mysql2/promise';
import { createSSHTunnel, SSHConfig, TunnelConfig } from './ssh-tunnel';

export const getDBConnection = async () => {
    let rawPrivateKey = process.env.SSH_PRIVATE_KEY;
    if (rawPrivateKey) {
        // Remover comillas si las hay
        rawPrivateKey = rawPrivateKey.replace(/^["']|["']$/g, '');
        // Reemplazar literal \n por salto real por si acaso
        rawPrivateKey = rawPrivateKey.replace(/\\n/g, '\n');

        // Si por alguna razón Vercel lo leyó en una sola línea y cambió los saltos por espacios (común al pegar)
        const beginRsa = '-----BEGIN RSA PRIVATE KEY-----';
        const endRsa = '-----END RSA PRIVATE KEY-----';

        if (rawPrivateKey.includes(beginRsa) && rawPrivateKey.includes(endRsa)) {
            // Extraemos solo el cuerpo en base64 (quitando los headers/footers y todos los espacios/saltos)
            const body = rawPrivateKey
                .substring(rawPrivateKey.indexOf(beginRsa) + beginRsa.length, rawPrivateKey.indexOf(endRsa))
                .replace(/\s+/g, '');

            // Si el cuerpo base64 existe, lo reformateamos con saltos cada 64 caracteres
            if (body.length > 0) {
                const chunks = body.match(/.{1,64}/g) || [];
                rawPrivateKey = `${beginRsa}\n${chunks.join('\n')}\n${endRsa}\n`;
            }
        }
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
