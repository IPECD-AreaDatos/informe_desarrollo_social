import { NextRequest, NextResponse } from 'next/server';
import { queryPg } from '@/lib/pgDb';
import { decryptSession } from '@/lib/session';

export async function POST(request: NextRequest) {
    try {
        // Authenticate user server-side from session cookie
        const sessionCookie = request.cookies.get('session');
        if (!sessionCookie || !sessionCookie.value) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }

        const payload = decryptSession(sessionCookie.value);
        if (!payload) {
            return NextResponse.json({ success: false, error: 'Sesión inválida o expirada' }, { status: 401 });
        }

        const { pathname, action } = await request.json();
        
        if (!pathname || !action) {
            return NextResponse.json({ success: false, error: 'Pathname y action son requeridos' }, { status: 400 });
        }

        // Get user agent and client IP address
        const userAgent = request.headers.get('user-agent') || 'Unknown';
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                         request.headers.get('x-real-ip') || 
                         '127.0.0.1';

        // Insert log entry into database
        await queryPg(
            `INSERT INTO user_logs (username, pathname, action, ip_address, user_agent) 
             VALUES ($1, $2, $3, $4, $5)`,
            [payload.username, pathname, action, clientIp, userAgent]
        );

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Logging API error:', e);
        return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 });
    }
}
