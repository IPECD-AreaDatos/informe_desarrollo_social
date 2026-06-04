import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
    const session = request.cookies.get('session');
    const { pathname } = request.nextUrl;
    // Basic format check: a valid encrypted session token (AES-256 base64) is always longer than 40 chars.
    // This rejects dummy cookies immediately on the Edge Runtime.
    const hasSession = !!session?.value && session.value.length > 40;

    console.log(`[MIDDLEWARE LOG] Pathname: "${pathname}", HasSession: ${hasSession}`);

    // Bypass public resources, static assets, and api/auth endpoints
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/auth') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    if (pathname === '/login') {
        if (hasSession) {
            const url = request.nextUrl.clone();
            url.pathname = '/';
            return NextResponse.redirect(url);
        }
        return NextResponse.next();
    }

    if (!hasSession) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/:path*'],
};
