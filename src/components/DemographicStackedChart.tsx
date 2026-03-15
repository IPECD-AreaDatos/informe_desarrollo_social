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
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider mb-2">
                                <span className="text-slate-500">{item.name}</span>
                                <div className="flex items-center gap-3">
                                    {item.varones > 0 && <span className="text-slate-900">V: {item.varones}</span>}
                                    {item.mujeres > 0 && <span className="text-slate-500">M: {item.mujeres}</span>}
                                    {(item.sinDatos || 0) > 0 && <span className="text-slate-400 opacity-60">S/D: {item.sinDatos}</span>}
                                    <span className="text-slate-800 border-l border-slate-200 pl-3">Total: {item.total.toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-slate-50 rounded-full border border-slate-100 overflow-hidden flex relative">
                                {/* Varones - Black */}
                                <div
                                    className="h-full bg-slate-900 relative transition-all duration-1000 z-10"
                                    style={{ width: `${varonPercent}%` }}
                                />
                                {/* Mujeres - White */}
                                <div
                                    className="h-full bg-white relative transition-all duration-1000 border-x border-slate-100 z-10"
                                    style={{ width: `${mujerPercent}%` }}
                                />
                                {/* Sin Datos - Grey */}
                                <div
                                    className="h-full bg-slate-300 relative transition-all duration-1000 z-10"
                                    style={{ width: `${sinDatosPercent}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap justify-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-900 rounded-full" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Varones</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-white border border-slate-200 rounded-full" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mujeres</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-slate-300 rounded-full" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sin Datos</span>
                </div>
            </div>
        </div>
    );
};
