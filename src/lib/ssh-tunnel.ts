import { Client } from 'ssh2';
import net from 'net';

export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    privateKey?: string;
    privateKeyPath?: string;
}

export interface TunnelConfig {
    remoteHost: string;
    remotePort: number;
    localPort?: number;
}

export const createSSHTunnel = (
    sshConfig: SSHConfig,
    tunnelConfig: TunnelConfig
): Promise<{ localPort: number; close: () => void }> => {
    return new Promise((resolve, reject) => {
        const sshClient = new Client();
        const server = net.createServer((socket) => {
            sshClient.forwardOut(
                '127.0.0.1',
                socket.remotePort || 0,
                tunnelConfig.remoteHost,
                tunnelConfig.remotePort,
                (err, stream) => {
                    if (err) {
                        socket.end();
                        return;
                    }
                    socket.pipe(stream).pipe(socket);
                }
            );
        });

        sshClient
            .on('ready', () => {
                server.listen(tunnelConfig.localPort || 0, '127.0.0.1', () => {
                    const address = server.address() as net.AddressInfo;
                    resolve({
                        localPort: address.port,
                        close: () => {
                            server.close();
                            sshClient.end();
                        },
                    });
                });
            })
            .on('error', (err) => {
                reject(err);
            })
            .connect({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.username,
                privateKey: sshConfig.privateKey || (sshConfig.privateKeyPath ? require('fs').readFileSync(sshConfig.privateKeyPath) : undefined),
                readyTimeout: 30000, // 30 segundos de timeout para el handshake
            });
    });
};
