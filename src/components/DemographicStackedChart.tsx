import React from 'react';
import { LucideIcon } from 'lucide-react';

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
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm animate-pulse space-y-6 h-full flex flex-col justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                    <div className="h-6 w-32 bg-slate-100 rounded-md" />
                </div>
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-10 w-full bg-slate-50 rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white p-5 md:p-6 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-xl group h-full flex flex-col justify-between">
            {/* Encabezado con Tipografía unificada */}
            <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#2E2D2C]/10 rounded-2xl flex items-center justify-center text-[#2E2D2C]">
                        <Icon size={24} />
                    </div>
                    <div>
                        <h3 className="font-barlow-semicondensed font-extrabold text-2xl text-[#2e2d2c] tracking-tight">
                            {title}
                        </h3>
                        {subtitle && (
                            <p className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest mt-0.5">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Listado de Rangos Etarios - Más compacto */}
            <div className="space-y-3 flex-1 flex flex-col justify-start">
                {data.map((item, i) => {
                    const totalVal = item.total || 1;
                    const varonPercent = (item.varones / totalVal) * 100;
                    const mujerPercent = (item.mujeres / totalVal) * 100;
                    const sinDatosPercent = ((item.sinDatos || 0) / totalVal) * 100;

                    return (
                        <div key={i} className="space-y-1.5">
                            {/* Fila de Etiquetas de texto */}
                            <div className="flex justify-between items-end font-barlow text-[11px] mb-0.5">
                                <span className="font-extrabold text-[#2e2d2c] uppercase tracking-wide">
                                    {item.name}
                                </span>
                                <div className="flex items-center gap-2.5 text-[10px] font-bold text-slate-400">
                                    {item.varones > 0 && <span className="text-[#2e2d2c]">V: {item.varones}</span>}
                                    {item.mujeres > 0 && <span className="text-[#989797]">M: {item.mujeres}</span>}
                                    {(item.sinDatos || 0) > 0 && <span>S/D: {item.sinDatos}</span>}
                                    <span className="text-slate-300 font-normal">|</span>
                                    <span className="font-extrabold text-[#2e2d2c]">TOTAL: {item.total.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Barra Apilada Fina y Elegante (h-2) */}
                            <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden flex border border-slate-200/30">
                                {/* Varones - Gris Oscuro (#2E2D2C) */}
                                {item.varones > 0 && (
                                    <div
                                        className="h-full bg-[#2E2D2C] transition-all duration-1000"
                                        style={{ width: `${varonPercent}%` }}
                                        title={`Varones: ${item.varones} (${varonPercent.toFixed(1)}%)`}
                                    />
                                )}

                                {/* Mujeres - Gris Medio (#989797) */}
                                {item.mujeres > 0 && (
                                    <div
                                        className="h-full bg-[#989797] transition-all duration-1000 border-l border-[#2E2D2C]/10"
                                        style={{ width: `${mujerPercent}%` }}
                                        title={`Mujeres: ${item.mujeres} (${mujerPercent.toFixed(1)}%)`}
                                    />
                                )}

                                {/* Sin Datos - Tono neutro sutil textureado */}
                                {(item.sinDatos || 0) > 0 && (
                                    <div
                                        className="h-full bg-slate-100 transition-all duration-1000 border-l border-slate-200"
                                        style={{ 
                                            width: `${sinDatosPercent}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.6) 3px, rgba(255,255,255,0.6) 6px)'
                                        }}
                                        title={`Sin Especificar: ${item.sinDatos} (${sinDatosPercent.toFixed(1)}%)`}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Leyenda Inferior Explicativa */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap justify-center gap-x-8 gap-y-2 font-barlow">
                <div className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 bg-[#2E2D2C] rounded-md shadow-sm" />
                    <span className="text-[11px] font-bold text-[#2e2d2c] uppercase tracking-wider">Varones</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 bg-[#989797] rounded-md shadow-sm" />
                    <span className="text-[11px] font-bold text-[#989797] uppercase tracking-wider">Mujeres</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 bg-slate-200 rounded-md shadow-sm border border-slate-300/40" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.4) 2px, rgba(255,255,255,0.4) 4px)' }} />
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sin Especificar</span>
                </div>
            </div>
        </div>
    );
};