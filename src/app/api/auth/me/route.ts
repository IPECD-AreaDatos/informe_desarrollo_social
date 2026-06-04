import { NextRequest, NextResponse } from 'next/server';
import { decryptSession } from '@/lib/session';

export async function GET(request: NextRequest) {
    const sessionCookie = request.cookies.get('session');

    if (!sessionCookie || !sessionCookie.value) {
        return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    const payload = decryptSession(sessionCookie.value);

    if (!payload) {
        return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json({
        authenticated: true,
        user: {
            username: payload.username,
            role: payload.role,
        }
    });
}
