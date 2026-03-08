import React from 'react';
import { LucideIcon, PieChart } from 'lucide-react';
import { clsx } from "clsx";

interface PiramideItem {
    name: string;
    mujeres: number;
    varones: number;
    sinDatos?: number;
    total: number;
}

interface DemographicStackedChartProps {
    title: string;
    subtitle?: string;
    icon: LucideIcon;
    data: PiramideItem[];
    loading?: boolean;
}

export const DemographicStackedChart: React.FC<DemographicStackedChartProps> = ({
    title,
    subtitle,
    icon: Icon,
    data,
    loading
}) => {
    if (loading) {
        return (
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm animate-pulse space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                    <div className="h-6 w-32 bg-slate-100 rounded-md" />
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-10 w-full bg-slate-50 rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm transition-all hover:shadow-xl group">
            <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#CADFAB] rounded-xl flex items-center justify-center text-[#526928]">
                        <Icon size={22} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">{title}</h3>
                        {subtitle && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</p>}
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {data.map((item, i) => {
                    const mujerPercent = item.total > 0 ? (item.mujeres / item.total) * 100 : 0;
                    const varonPercent = item.total > 0 ? (item.varones / item.total) * 100 : 0;
                    const sinDatosPercent = item.total > 0 ? ((item.sinDatos || 0) / item.total) * 100 : 0;

                    return (
                        <div key={i} className="space-y-3">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                                <span className="text-slate-500">{item.name}</span>
                                <span className="text-slate-400">Total: {item.total.toLocaleString()}</span>
                            </div>
                            <div className="h-10 w-full bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden flex relative group/bar">
                                {/* Varones - Blue */}
                                <div
                                    className="h-full bg-[#1E293B] relative flex items-center justify-center transition-all duration-1000 z-10"
                                    style={{ width: `${varonPercent}%` }}
                                >
                                    {item.varones > 0 && varonPercent > 10 && (
                                        <span className="text-[10px] font-black text-white px-2 truncate">
                                            {item.varones}
                                        </span>
                                    )}
                                </div>
                                {/* Mujeres - Pink */}
                                <div
                                    className="h-full bg-pink-500 relative flex items-center justify-center transition-all duration-1000 border-l border-white/10 z-10"
                                    style={{ width: `${mujerPercent}%` }}
                                >
                                    {item.mujeres > 0 && mujerPercent > 10 && (
                                        <span className="text-[10px] font-black text-white px-2 truncate">
                                            {item.mujeres}
                                        </span>
                                    )}
                                </div>
                                {/* Sin Datos - Grey/Light */}
                                <div
                                    className="h-full bg-slate-200 relative flex items-center justify-center transition-all duration-1000 border-l border-slate-300 z-10"
                                    style={{ width: `${sinDatosPercent}%` }}
                                >
                                    {(item.sinDatos || 0) > 0 && sinDatosPercent > 10 && (
                                        <span className="text-[9px] font-black text-slate-500 px-2 truncate">
                                            {item.sinDatos}
                                        </span>
                                    )}
                                </div>

                                {/* Label indicators on hover */}
                                <div className="absolute inset-0 flex justify-between px-4 items-center opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-20">
                                    <span className="text-[8px] font-black text-white/50 uppercase">V</span>
                                    <span className="text-[8px] font-black text-white/50 uppercase">M</span>
                                    <span className="text-[8px] font-black text-slate-400 uppercase">S/D</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap justify-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[#1E293B] rounded-full" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Varones</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-pink-500 rounded-full" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mujeres</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-200 rounded-full" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sin Datos</span>
                </div>
            </div>
        </div>
    );
};
