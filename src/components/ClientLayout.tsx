"use client";

import React, { useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Sidebar, SidebarProvider, MainContent } from '@/components/sidebar';
import { apiUrl } from '@/lib/apiBase';
import { APP_BASE_PATH } from '@/lib/basePath';

interface ClientLayoutProps {
    children: React.ReactNode;
}

/**
 * Helper to map pathnames to human-readable screen names.
 */
function getPageName(path: string): string {
    switch (path) {
        case '/':
            return 'Resumen Central';
        case '/comedores':
            return 'Seguridad Alimentaria';
        case '/comedores/graficos':
            return 'Gráficos — Seguridad Alimentaria';
        case '/vulnerabilidad':
            return 'Perfil Vulnerabilidad';
        case '/educacion':
            return 'Análisis Educativo';
        case '/salud':
            return 'Reporte de Salud';
        case '/territorial':
            return 'Gestión Territorial';
        default:
            return path;
    }
}

/**
 * NavigationTracker listens to routing and URL search parameters
 * to automatically log navigation and action history.
 */
function NavigationTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const lastLoggedPath = useRef<string | null>(null);
    const lastLoggedPeriod = useRef<string | null>(null);

    // Dynamically default to the latest data month if 'from' or 'to' is missing on dashboard pages
    useEffect(() => {
        if (!pathname) return;

        if (pathname === '/' || pathname === '/territorial') {
            if (!from || !to) {
                const fetchLatestDate = async () => {
                    try {
                        const res = await fetch(apiUrl('/api/stats/latest-date'));
                        const data = await res.json();
                        if (data.success && data.from && data.to) {
                            const params = new URLSearchParams(searchParams.toString());
                            params.set('from', data.from);
                            params.set('to', data.to);
                            router.replace(`${pathname}?${params.toString()}`);
                        }
                    } catch (error) {
                        console.error('Error fetching default date range:', error);
                    }
                };
                fetchLatestDate();
            }
        }
    }, [pathname, from, to, searchParams, router]);

    // Track page views
    useEffect(() => {
        if (
            !pathname || 
            pathname === '/login' || 
            pathname.endsWith('/login') || 
            lastLoggedPath.current === pathname
        ) {
            return;
        }

        lastLoggedPath.current = pathname;
        const pageName = getPageName(pathname);

        const logPageView = async () => {
            try {
                await fetch(apiUrl('/api/logs'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        pathname: pageName,
                        action: 'page_view',
                    }),
                });
            } catch (error) {
                console.error('Error logging page view:', error);
            }
        };

        logPageView();
    }, [pathname]);

    // Track period/filter changes
    useEffect(() => {
        if (!pathname || pathname === '/login' || pathname.endsWith('/login')) {
            return;
        }
        if (!from && !to) {
            return;
        }

        const periodKey = `${from || ''}_${to || ''}`;
        if (lastLoggedPeriod.current === periodKey) {
            return;
        }

        lastLoggedPeriod.current = periodKey;
        const pageName = getPageName(pathname);

        const logPeriodChange = async () => {
            try {
                await fetch(apiUrl('/api/logs'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        pathname: pageName,
                        action: `cambiar_periodo: ${from || 'Inicio'} al ${to || 'Fin'}`,
                    }),
                });
            } catch (error) {
                console.error('Error logging period change:', error);
            }
        };

        logPeriodChange();
    }, [pathname, from, to]);

    return null;
}

/**
 * ClientLayout wraps children in the sidebar and content shell,
 * except when navigating to the login page to show a full-screen interface.
 */
export function ClientLayout({ children }: ClientLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();

    // Check if the current route is the login route
    const isLoginPage = pathname === '/login' || pathname?.endsWith('/login');

    // Client-side authentication check as a second layer of defense (e.g. if middleware is bypassed or not loaded)
    useEffect(() => {
        if (isLoginPage) return;

        const checkAuth = async () => {
            try {
                const res = await fetch(apiUrl('/api/auth/me'));
                if (res.ok) {
                    const data = await res.json();
                    if (!data.authenticated) {
                        window.location.href = `${APP_BASE_PATH}/login`;
                    }
                } else {
                    window.location.href = `${APP_BASE_PATH}/login`;
                }
            } catch (e) {
                console.error('Error verifying auth on client:', e);
                window.location.href = `${APP_BASE_PATH}/login`;
            }
        };

        checkAuth();
    }, [isLoginPage]);

    if (isLoginPage) {
        return <div className="w-full min-h-screen bg-[#0B1329]">{children}</div>;
    }

    return (
        <SidebarProvider>
            <Suspense fallback={null}>
                <NavigationTracker />
            </Suspense>
            <Sidebar />
            <MainContent>{children}</MainContent>
        </SidebarProvider>
    );
}
