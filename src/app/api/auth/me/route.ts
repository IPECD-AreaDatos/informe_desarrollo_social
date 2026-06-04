import { NextRequest, NextResponse } from 'next/server';
import { decryptSession } from '@/lib/session';

export async function GET(request: NextRequest) {
    const sessionCookie = request.cookies.get('session');

    if (!sessionCookie || !sessionCookie.value) {
        return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const payload = decryptSession(sessionCookie.value);

    if (!payload) {
        const response = NextResponse.json({ authenticated: false }, { status: 200 });
        response.cookies.set('session', '', {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            expires: new Date(0),
        });
        return response;
    }

    return NextResponse.json({
        authenticated: true,
        user: {
            username: payload.username,
            role: payload.role,
        }
    });
}
