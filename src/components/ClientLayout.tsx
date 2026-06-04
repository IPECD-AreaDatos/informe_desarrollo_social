"use client";

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar, SidebarProvider, MainContent } from '@/components/sidebar';
import { apiUrl } from '@/lib/apiBase';

interface ClientLayoutProps {
    children: React.ReactNode;
}

/**
 * ClientLayout wraps children in the sidebar and content shell,
 * except when navigating to the login page to show a full-screen interface.
 * It also automatically tracks user page views and logs them to the database.
 */
export function ClientLayout({ children }: ClientLayoutProps) {
    const pathname = usePathname();
    const lastLoggedPath = useRef<string | null>(null);

    useEffect(() => {
        // Skip logging for empty pathnames, login page, or duplicate triggers (Strict Mode)
        if (
            !pathname || 
            pathname === '/login' || 
            pathname.endsWith('/login') || 
            lastLoggedPath.current === pathname
        ) {
            return;
        }

        lastLoggedPath.current = pathname;

        const logPageView = async () => {
            try {
                await fetch(apiUrl('/api/logs'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        pathname,
                        action: 'page_view',
                    }),
                });
            } catch (error) {
                console.error('Error logging page view:', error);
            }
        };

        logPageView();
    }, [pathname]);

    // Check if the current route is the login route
    const isLoginPage = pathname === '/login' || pathname?.endsWith('/login');

    if (isLoginPage) {
        return <div className="w-full min-h-screen bg-[#0B1329]">{children}</div>;
    }

    return (
        <SidebarProvider>
            <Sidebar />
            <MainContent>{children}</MainContent>
        </SidebarProvider>
    );
}
