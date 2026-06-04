import { NextResponse } from 'next/server';
import { queryPg } from '@/lib/pgDb';
import { verifyPassword } from '@/lib/crypto';
import { encryptSession } from '@/lib/session';

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { success: false, error: 'Usuario y contraseña son requeridos' },
                { status: 400 }
            );
        }

        // Query user from PostgreSQL
        const res = await queryPg('SELECT id, username, password, role FROM users WHERE username = $1', [username.trim().toLowerCase()]);
        
        if (res.rows.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Credenciales inválidas' },
                { status: 401 }
            );
        }

        const user = res.rows[0];

        // Verify hashed password
        const isMatch = verifyPassword(password, user.password);
        if (!isMatch) {
            return NextResponse.json(
                { success: false, error: 'Credenciales inválidas' },
                { status: 401 }
            );
        }

        // Create secure session token
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        const sessionToken = encryptSession({
            username: user.username,
            role: user.role,
            expiresAt,
        });

        // Create response with HTTP-only cookie
        const response = NextResponse.json({
            success: true,
            user: {
                username: user.username,
                role: user.role,
            }
        });

        // Set cookie
        response.cookies.set('session', sessionToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            expires: new Date(expiresAt),
        });

        return response;

    } catch (e: any) {
        console.error('Login error:', e);
        return NextResponse.json(
            { success: false, error: 'Error interno en el servidor' },
            { status: 500 }
        );
    }
}
