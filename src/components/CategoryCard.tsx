"use client";

import React, { useState } from 'react';
import { LucideIcon, HelpCircle } from 'lucide-react';

interface CategoryItem {
    name: string;
    value: number;
    color?: string;
}

interface CategoryCardProps {
    title: string;
    subtitle?: string;
    icon: LucideIcon;
    items: CategoryItem[];
    description?: string;
    loading?: boolean;
    type?: 'bar' | 'list';
    headerActions?: React.ReactNode;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
    title,
    subtitle,
    icon: Icon,
    items,
    description,
    loading,
    type = 'bar',
    headerActions
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    if (loading) {
        return (
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm animate-pulse space-y-6 h-full flex flex-col justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                    <div className="h-6 w-32 bg-slate-100 rounded-md" />
                </div>
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-4 w-full bg-slate-50 rounded-full" />
                    ))}
                </div>
            </div>
        );
    }

    // --- FUNCIÓN DE AGRUPACIÓN PARA EL RANKING DE RECURSOS ---
    const getGroupedItems = (rawItems: CategoryItem[]): CategoryItem[] => {
        // Solo aplicamos la agrupación si esta tarjeta es la de "Recursos"
        if (title !== "Recursos") return rawItems;

        const groups: { [key: string]: number } = {};

        rawItems.forEach(item => {
            const nameUpper = item.name.toUpperCase().trim();
            let targetGroup = item.name; // Nombre por defecto si no matchea

            // Reglas de unificación con nombres 100% limpios y directos
            if (nameUpper.includes("PAÑAL")) targetGroup = "PAÑALES";
            else if (nameUpper.includes("CHAPA")) targetGroup = "CHAPAS";
            else if (nameUpper.includes("COLCHÓN") || nameUpper.includes("COLCHON")) targetGroup = "COLCHONES";
            else if (nameUpper.includes("SÁBANA") || nameUpper.includes("SABANA")) targetGroup = "SÁBANAS";
            else if (nameUpper.includes("FRAZADA")) targetGroup = "FRAZADAS";
            else if (nameUpper.includes("CAMA")) targetGroup = "CAMAS";
            else if (nameUpper.includes("TIRANTE")) targetGroup = "TIRANTES";
            else if (nameUpper.includes("MODULO") || nameUpper.includes("MÓDULO")) targetGroup = "MÓDULOS ALIMENTARIOS";

            // Forzamos a número real y acumulamos la suma matemática
            const numericValue = Number(item.value) || 0;
            groups[targetGroup] = (groups[targetGroup] || 0) + numericValue;
        });

        // Convertimos el diccionario de nuevo a un array ordenado de mayor a menor
        return Object.keys(groups)
            .map(name => ({ name, value: groups[name] }))
            .sort((a, b) => b.value - a.value);
    };

    // Procesamos los ítems antes de renderizarlos
    const displayedItems = getGroupedItems(items);
    const maxVal = Math.max(...displayedItems.map(i => i.value), 1);

    return (
        <div className="bg-white p-5 md:p-6 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-xl group relative flex flex-col justify-between">
            <div className="flex flex-col gap-4 mb-5">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-[#2E2D2C]/10 rounded-2xl flex items-center justify-center text-[#2e2d2c] shrink-0">
                            <Icon size={24} />
                        </div>
                        <div>
                            <h3 className="font-barlow-semicondensed font-extrabold text-2xl text-[#2e2d2c] tracking-tight">{title}</h3>
                            {subtitle && <p className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest mt-0.5">{subtitle}</p>}
                        </div>
                    </div>

                    {description && (
                        <div className="relative shrink-0">
                            <button
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                                className="text-slate-200 hover:text-slate-400 transition-colors p-1"
                            >
                                <HelpCircle size={16} />
                            </button>

                            {/* Custom Tooltip */}
                            {showTooltip && (
                                <div className="absolute right-0 bottom-full mb-3 w-56 bg-slate-800 text-white text-[11px] p-4 rounded-2xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="absolute -bottom-1 right-2 w-3 h-3 bg-slate-800 rotate-45" />
                                    <p className="font-barlow font-normal leading-relaxed">{description}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {headerActions && (
                    <div className="w-full">
                        {headerActions}
                    </div>
                )}
            </div>

            {/* Listado de barras finales */}
            <div className="space-y-4 flex-1 flex flex-col justify-start">
                {displayedItems.length === 0 ? (
                    <p className="text-center py-10 text-slate-300 text-[10px] font-barlow font-black uppercase tracking-widest">Sin datos en el periodo</p>
                ) : (
                    displayedItems.map((item, i) => (
                        <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center text-[11px] font-barlow text-[#2e2d2c] tracking-wide">
                                <span className="font-bold text-slate-600 uppercase">{item.name}</span>
                                <span className="font-extrabold">{item.value.toLocaleString()}</span>
                            </div>
                            {type === 'bar' && (
                                <div className="h-2 w-full bg-slate-50 rounded-full border border-slate-200/40 overflow-hidden">
                                    <div
                                        className="h-full bg-[#2e2d2c] rounded-full transition-all duration-1000"
                                        style={{ width: `${(item.value / maxVal) * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};