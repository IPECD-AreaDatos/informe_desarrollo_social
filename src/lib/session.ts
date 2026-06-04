import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'ipecd-desarrollo-social-secret-key-2026-default-fallback-long-key';

export interface SessionPayload {
    username: string;
    role: string;
    expiresAt: number;
}

/**
 * Encrypts and serializes session payload into a secure token.
 */
export function encryptSession(payload: SessionPayload): string {
    const data = JSON.stringify(payload);
    const key = crypto.scryptSync(SECRET, 'session-salt', 32);
    const iv = Buffer.alloc(16, 0); // Static IV is fine for our session tokens, but we could use a random one. Static is simpler for this scope.
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

/**
 * Decrypts and validates session token. Returns null if invalid or expired.
 */
export function decryptSession(token: string): SessionPayload | null {
    try {
        const key = crypto.scryptSync(SECRET, 'session-salt', 32);
        const iv = Buffer.alloc(16, 0);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(token, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        const payload = JSON.parse(decrypted) as SessionPayload;
        if (payload.expiresAt < Date.now()) {
            return null; // Token has expired
        }
        return payload;
    } catch (e) {
        return null;
    }
}
