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

    const maxVal = Math.max(...items.map(i => i.value), 1);

    return (
        <div className="bg-white p-5 md:p-6 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-xl group relative h-full flex flex-col justify-between">
            <div className="flex flex-col gap-4 mb-5">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#CADFAB] rounded-xl flex items-center justify-center text-[#526928] shrink-0">
                            <Icon size={22} />
                        </div>
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-800 tracking-tight leading-tight">{title}</h3>
                            {subtitle && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
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

                            {/* Custom Tooltip - Positioned ABOVE */}
                            {showTooltip && (
                                <div className="absolute right-0 bottom-full mb-3 w-56 bg-slate-800 text-white text-[11px] p-4 rounded-2xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="absolute -bottom-1 right-2 w-3 h-3 bg-slate-800 rotate-45" />
                                    <p className="font-bold leading-relaxed">{description}</p>
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

            <div className="space-y-4 flex-1 flex flex-col justify-start">
                {items.length === 0 ? (
                    <p className="text-center py-10 text-slate-300 text-[10px] font-black uppercase tracking-widest">Sin datos en el periodo</p>
                ) : (
                    items.map((item, i) => (
                        <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                                <span className="text-slate-500">{item.name}</span>
                                <span className="text-slate-800">{item.value.toLocaleString()}</span>
                            </div>
                            {type === 'bar' && (
                                <div className="h-2 w-full bg-slate-50 rounded-full border border-slate-100 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[#526928] to-[#96C156] rounded-full transition-all duration-1000"
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
