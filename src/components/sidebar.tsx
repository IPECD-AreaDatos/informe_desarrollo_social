"use client";

import {
    LayoutDashboard,
    Users,
    FileText,
    BookOpen,
    HeartPulse,
    UtensilsCrossed,
    Menu,
    X,
    PanelLeftClose,
    PanelLeft,
} from "lucide-react";
import Link from "next/link";

import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { createContext, useContext, useState } from "react";

const menuItems = [
    { name: "Resumen Central", icon: LayoutDashboard, href: "/" },
    { name: "Seguridad alimentaria", icon: UtensilsCrossed, href: "/comedores" },
    {
        name: "Perfil Vulnerabilidad",
        icon: Users,
        href: "/vulnerabilidad",
        subMenu: [
            { name: "Análisis Educativo", icon: BookOpen, href: "/educacion" },
            { name: "Reporte de Salud", icon: HeartPulse, href: "/salud" },
        ]
    },
    { name: "Gestión Territorial", icon: FileText, href: "/territorial" },
];

type SidebarContextType = { collapsed: boolean; setCollapsed: (v: boolean) => void };
const SidebarContext = createContext<SidebarContextType | null>(null);

export function useSidebar() {
    const ctx = useContext(SidebarContext);
    return ctx ?? { collapsed: false, setCollapsed: () => {} };
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function MainContent({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebar();
    return (
        <main
            className={clsx(
                "flex-1 bg-[var(--background)] transition-[padding] duration-300",
                collapsed ? "md:pl-16" : "md:pl-64"
            )}
        >
            {children}
        </main>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const { collapsed, setCollapsed } = useSidebar();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    const renderNav = (onNavigate?: () => void, compact?: boolean) => (
        <>
            <div className={clsx("flex items-center justify-between", compact ? "p-3" : "p-8")}>
                {!compact && (
                    <div className="flex flex-1 items-center justify-center w-full px-2">
                        <img
                            src={`${basePath}/Logo_desarrollo_social.png`}
                            alt="Desarrollo Social"
                            className="w-full max-w-[200px] h-auto max-h-[80px] object-contain"
                        />
                    </div>
                )}
                {compact && (
                    <Link href="/" className="flex shrink-0 items-center justify-center w-full" onClick={onNavigate}>
                        <img
                            src={`${basePath}/Logo_desarrollo_social.png`}
                            alt="Desarrollo Social"
                            className="w-10 h-10 object-contain"
                        />
                    </Link>
                )}
            </div>

            <nav className={clsx("flex-1 space-y-2", compact ? "px-2 py-4" : "px-4 py-4")}>
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    const hasSubMenu = (item as any).subMenu && (item as any).subMenu.length > 0;
                    const isAnySubActive = hasSubMenu && (item as any).subMenu.some((sub: any) => pathname === sub.href);

                    return (
                        <div key={item.href} className="space-y-1">
                            <Link
                                href={item.href}
                                onClick={onNavigate}
                                title={compact ? item.name : undefined}
                                className={clsx(
                                    "flex items-center rounded-xl transition-all duration-200 group",
                                    compact ? "justify-center p-3" : "gap-3 px-4 py-3",
                                    isActive || (isAnySubActive && !compact)
                                        ? "bg-[var(--primary)] text-white font-semibold shadow-lg shadow-green-500/20"
                                        : "text-gray-600 hover:text-black hover:bg-gray-100"
                                )}
                            >
                                <item.icon
                                    size={20}
                                    className={clsx("shrink-0", isActive || isAnySubActive ? "text-white" : "group-hover:text-black")}
                                />
                                {!compact && <span className="text-sm">{item.name}</span>}
                            </Link>

                            {hasSubMenu && !compact && (
                                <div className="ml-8 space-y-1">
                                    {(item as any).subMenu.map((sub: any) => (
                                        <Link
                                            key={sub.href}
                                            href={sub.href}
                                            onClick={onNavigate}
                                            className={clsx(
                                                "flex items-center gap-3 px-4 py-2 rounded-xl text-xs transition-all duration-200",
                                                pathname === sub.href
                                                    ? "text-[var(--primary)] font-bold bg-green-50"
                                                    : "text-gray-400 hover:text-slate-800 hover:bg-gray-50"
                                            )}
                                        >
                                            <sub.icon size={16} />
                                            <span>{sub.name}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className={clsx("mt-auto pb-4", compact ? "p-2" : "p-6 w-full")}>
                <div className={clsx("flex justify-center", compact ? "" : "w-full items-center px-4 py-2")}>
                    <img
                        src={`${basePath}/LOGO IPECD-12 (1).png`}
                        alt="IPECD"
                        className={clsx("object-contain", compact ? "w-10 h-10" : "w-full max-w-[180px] h-auto max-h-[70px]")}
                    />
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* Botón flotante para abrir el menú en mobile */}
            <button
                type="button"
                aria-label={open ? "Cerrar menú" : "Abrir menú"}
                className="fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg shadow-black/30 md:hidden"
                onClick={() => setOpen((prev) => !prev)}
            >
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Sidebar fijo en desktop: expandido o colapsado */}
            <aside
                className={clsx(
                    "hidden md:flex fixed left-0 top-0 h-screen bg-[var(--sidebar-bg)] text-[var(--sidebar-foreground)] flex-col z-30 transition-all duration-300",
                    collapsed ? "w-16" : "w-64"
                )}
            >
                {renderNav(undefined, collapsed)}
                {/* Botón comprimir/expandir (solo desktop) */}
                <button
                    type="button"
                    aria-label={collapsed ? "Expandir menú" : "Comprimir menú"}
                    className="absolute right-0 top-4 -translate-y-1/2 translate-x-1/2 h-8 w-8 flex items-center justify-center rounded-lg bg-gray-200 text-gray-800 shadow-md hover:bg-gray-300 transition-colors"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    {collapsed ? (
                        <PanelLeft className="w-4 h-4" />
                    ) : (
                        <PanelLeftClose className="w-4 h-4" />
                    )}
                </button>
            </aside>

            {/* Sidebar deslizable en mobile */}
            <aside
                className={clsx(
                    "md:hidden fixed inset-y-0 left-0 w-64 bg-[var(--sidebar-bg)] text-[var(--sidebar-foreground)] flex flex-col z-50 transform transition-transform duration-300",
                    open ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {renderNav(() => setOpen(false), false)}
            </aside>
        </>
    );
}
