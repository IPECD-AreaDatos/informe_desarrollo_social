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
    // Función para formatear los nombres de los rangos según la propuesta oficial
    const formatRangeName = (name: string) => {
        const cleanName = name.toUpperCase().trim();
        if (cleanName.includes("JÓVENES")) return "Jóvenes (18 a 29 años)";
        if (cleanName.includes("ADULTOS MAYORES")) return "Adultos Mayores (51 a 70 años)";
        if (cleanName.includes("ADULTOS")) return "Adultos (30 a 50 años)";
        if (cleanName.includes("TERCERA EDAD")) return "Tercera Edad (Más de 70 años)";
        return name; // Mantiene "DATO ETARIO FALTANTE" o cualquier otro valor igual
    };

    if (loading) {
        return (
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm animate-pulse space-y-6 flex flex-col justify-between">
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
        <div className="bg-white p-6 md:p-8 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-xl group flex flex-col">
            {/* Encabezado Institucional */}
            <div className="flex justify-between items-start mb-6">
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

            {/* Gráfico de Barras Verticales Agrupadas */}
            <div className="w-full h-[380px] flex flex-col">
                {(() => {
                    if (data.length === 0) {
                        return <p className="w-full text-center text-slate-400">No hay datos demográficos.</p>;
                    }
                    const maxVal = Math.max(...data.flatMap(d => [d.varones, d.mujeres, d.sinDatos || 0]));
                    const formatCompact = (n: number) => {
                        if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
                        if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
                        return `${n}`;
                    };

                    return (
                        <div className="flex-1 flex flex-col">
                            <div className="flex-1 flex gap-2">
                                {/* EJE Y: Nombre Rotado + Valores */}
                                <div className="flex items-center gap-1 h-full pr-1">
                                    <span className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest -rotate-90 origin-center whitespace-nowrap">
                                        Cantidad
                                    </span>
                                    <div className="h-full flex flex-col justify-between text-right text-[10px] font-bold text-slate-400 min-w-[30px] border-r border-slate-100 pr-2">
                                        <span>{formatCompact(maxVal)}</span>
                                        <span>{formatCompact(maxVal / 2)}</span>
                                        <span>0</span>
                                    </div>
                                </div>

                                {/* Área del Gráfico - Cambiado a Flex para que entren todas las columnas en una fila */}
                                <div className="flex-1 flex justify-around items-end gap-1 relative px-2">
                                    {/* Líneas de guía */}
                                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                                        <div className="h-1/2 border-b border-dashed border-slate-200/80"></div>
                                        <div className="h-1/2 border-b border-dashed border-slate-200/80"></div>
                                    </div>

                                    {data.map((item, i) => {
                                        const totalVal = Number(item.total) || 1;
                                        const vVal = Number(item.varones) || 0;
                                        const mVal = Number(item.mujeres) || 0;
                                        const sdVal = Number(item.sinDatos) || 0;

                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full max-w-[90px] group/item relative pt-6">
                                                {/* Contenedor de barras agrupadas */}
                                                <div className="flex-1 flex items-end justify-center gap-1 w-full h-full relative">
                                                    
                                                    {/* Barra Varones */}
                                                    <div className="w-1/3 h-full flex flex-col justify-end group/bar relative">
                                                        {/* Renderiza siempre para que al pasar el mouse muestre 0 si está vacío */}
                                                        <div 
                                                            className="w-full bg-[#2E2D2C] rounded-t-[3px] transition-all duration-300 hover:opacity-100 opacity-80 cursor-pointer relative" 
                                                            style={{ height: `${Math.max((vVal / maxVal) * 100, vVal === 0 ? 2 : 0)}%` }} // Dejamos un mínimo de 2% visual si es 0 para poder apoyar el mouse
                                                            title={`Varones: ${vVal}`}
                                                        >
                                                            {/* El número ahora flota JUSTO sobre esta barrita */}
                                                            <span className="opacity-0 group-hover/bar:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[10px] font-barlow font-black text-[#2E2D2C] bg-white/95 px-1 rounded border border-slate-200 shadow-md transition-opacity pointer-events-none z-30">
                                                                {vVal}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Barra Mujeres */}
                                                    <div className="w-1/3 h-full flex flex-col justify-end group/bar relative">
                                                        <div 
                                                            className="w-full bg-[#989797] rounded-t-[3px] transition-all duration-300 hover:opacity-100 opacity-80 cursor-pointer relative" 
                                                            style={{ height: `${Math.max((mVal / maxVal) * 100, mVal === 0 ? 2 : 0)}%` }}
                                                            title={`Mujeres: ${mVal}`}
                                                        >
                                                            {/* El número ahora flota JUSTO sobre esta barrita */}
                                                            <span className="opacity-0 group-hover/bar:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[10px] font-barlow font-black text-[#989797] bg-white/95 px-1 rounded border border-slate-200 shadow-md transition-opacity pointer-events-none z-30">
                                                                {mVal}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Barra Sin Datos */}
                                                    <div className="w-1/3 h-full flex flex-col justify-end group/bar relative">
                                                        <div 
                                                            className="w-full bg-slate-200/70 rounded-t-[3px] transition-all duration-300 hover:opacity-100 opacity-80 cursor-pointer relative" 
                                                            style={{ height: `${Math.max((sdVal / maxVal) * 100, sdVal === 0 ? 2 : 0)}%` }}
                                                            title={`Sin Datos: ${sdVal}`}
                                                        >
                                                            {/* El número ahora flota JUSTO sobre esta barrita */}
                                                            <span className="opacity-0 group-hover/bar:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[10px] font-barlow font-black text-slate-400 bg-white/95 px-1 rounded border border-slate-200 shadow-md transition-opacity pointer-events-none z-30">
                                                                {sdVal}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Textos de los ejes */}
                                                <div className="mt-2 text-center leading-tight min-h-[24px] flex flex-col justify-start w-full overflow-hidden">
                                                    <span className="text-[9px] font-barlow font-extrabold text-slate-500 uppercase tracking-wide block truncate">
                                                        {formatRangeName(item.name).split('(')[0]}
                                                    </span>
                                                    <span className="text-[8px] font-barlow font-bold text-slate-400 block truncate">
                                                        {formatRangeName(item.name).split('(')[1] ? `(${formatRangeName(item.name).split('(')[1]}` : '()'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* EJE X: Contenedor inferior para la etiqueta del período */}
                            <div className="flex justify-center w-full pl-[50px] mt-1">
                                <span className="text-[10px] font-barlow font-bold text-[#989797] uppercase tracking-widest">
                                    Rango Etario
                                </span>
                            </div>
                        </div>
                    );
                })()}
            </div>
            
            {/* Leyenda Inferior */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap justify-center gap-x-8 gap-y-2 font-barlow">
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
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sin Datos</span>
                </div>
            </div>
        </div>
    );
};