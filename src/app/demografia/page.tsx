export default function DemografiaPage() {
    return (
        <div className="p-8">
            <header className="mb-8">
                <h2 className="text-3xl font-bold text-secondary">Impacto Demográfico</h2>
                <p className="text-muted-foreground">Análisis de beneficiarios por zona, género y edad</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
                    <h3 className="text-lg font-semibold mb-6">Distribución por Localidad</h3>
                    <div className="space-y-4">
                        {[
                            { label: "Posadas", value: 35, color: "bg-primary" },
                            { label: "Oberá", value: 18, color: "bg-primary/80" },
                            { label: "Eldorado", value: 15, color: "bg-primary/60" },
                            { label: "Apóstoles", value: 12, color: "bg-primary/40" },
                            { label: "Otros", value: 20, color: "bg-slate-200" },
                        ].map((item, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium">{item.label}</span>
                                    <span className="text-muted-foreground">{item.value}%</span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${item.color}`}
                                        style={{ width: `${item.value}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
                    <h3 className="text-lg font-semibold mb-6">Rango Etario</h3>
                    <div className="flex items-end justify-between h-48 gap-4 px-4 pt-4">
                        {[25, 45, 60, 35, 20].map((height, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                <div
                                    className="w-full bg-accent/20 border-t-4 border-accent rounded-t-lg transition-all hover:bg-accent/30"
                                    style={{ height: `${height * 2}px` }}
                                />
                                <span className="text-xs text-muted-foreground">
                                    {["0-18", "19-35", "36-50", "51-65", "65+"][i]}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Resumen de Impacto Social</h3>
                <p className="text-sm text-muted-foreground mb-6">Datos consolidados del último trimestre 2026</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="p-4 rounded-lg bg-slate-50 border border-border">
                        <h4 className="text-sm font-medium text-slate-500 mb-2 uppercase tracking-wider">Género</h4>
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <p className="text-xs text-muted-foreground">Femenino</p>
                                <p className="text-xl font-bold text-primary">62%</p>
                            </div>
                            <div className="w-px h-10 bg-slate-200" />
                            <div className="flex-1">
                                <p className="text-xs text-muted-foreground">Masculino</p>
                                <p className="text-xl font-bold text-secondary">38%</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 rounded-lg bg-slate-50 border border-border">
                        <h4 className="text-sm font-medium text-slate-500 mb-2 uppercase tracking-wider">Zona de Mayor Impacto</h4>
                        <p className="text-xl font-bold">Zona Capital</p>
                        <p className="text-xs text-muted-foreground">Concentración del 42% del presupuesto</p>
                    </div>

                    <div className="p-4 rounded-lg bg-slate-50 border border-border">
                        <h4 className="text-sm font-medium text-slate-500 mb-2 uppercase tracking-wider">Crecimiento Mensual</h4>
                        <p className="text-xl font-bold text-accent">+4.2%</p>
                        <p className="text-xs text-muted-foreground">Respecto al mes de Febrero</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
