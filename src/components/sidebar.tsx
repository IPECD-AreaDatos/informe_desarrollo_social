"use client";

import { LayoutDashboard, Users, FileText, LogIn, Database, BookOpen, HeartPulse } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const menuItems = [
    { name: "Resumen Central", icon: LayoutDashboard, href: "/" },
    { name: "Perfil Vulnerabilidad", icon: Users, href: "/vulnerabilidad" },
    { name: "Análisis Educativo", icon: BookOpen, href: "/educacion" },
    { name: "Reporte de Salud", icon: HeartPulse, href: "/salud" },
    { name: "Gestión Territorial", icon: FileText, href: "/territorial" },
    { name: "Conexión DB", icon: Database, href: "/db-status" },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-[var(--sidebar-bg)] text-[var(--sidebar-foreground)] flex flex-col z-50">
            <div className="p-8">
                <div className="flex items-center justify-center">
                    <Image
                        src="/Logo_desarrollo_social.png"
                        alt="Desarrollo Social"
                        width={180}
                        height={60}
                        priority
                        className="object-contain"
                    />
                </div>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                                isActive
                                    ? "bg-[var(--primary)] text-white font-semibold shadow-lg shadow-green-500/20"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                            )}
                        >
                            <item.icon
                                size={20}
                                className={clsx(isActive ? "text-white" : "group-hover:text-white")}
                            />
                            <span className="text-sm">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-6 mt-auto">
                <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all active:scale-[0.98]">
                    <Image
                        src="/LOGO IPECD-12 (1).png"
                        alt="IPECD"
                        width={180}
                        height={60}
                        className="object-contain"
                    />
                </button>
            </div>
        </aside>
    );
}
