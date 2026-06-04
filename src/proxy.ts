import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
    const session = request.cookies.get('session');
    const { pathname } = request.nextUrl;
    const hasSession = !!session?.value;

    console.log(`[PROXY LOG] Pathname: "${pathname}", HasSession: ${hasSession}`);

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
