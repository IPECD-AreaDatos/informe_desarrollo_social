import { NextResponse } from 'next/server';

export async function POST() {
    const response = NextResponse.json({ success: true, message: 'Sesión cerrada correctamente' });
    
    // Clear session cookie
    response.cookies.set('session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
    });
    
    return response;
}

export async function GET() {
    const response = NextResponse.json({ success: true, message: 'Sesión cerrada correctamente' });
    
    // Clear session cookie
    response.cookies.set('session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
    });
    
    return response;
}
