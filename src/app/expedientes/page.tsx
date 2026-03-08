export default function ExpedientesPage() {
    return (
        <div className="p-8">
            <header className="mb-8">
                <h2 className="text-3xl font-bold text-secondary">Gestión de Expedientes</h2>
                <p className="text-muted-foreground">Listado completo y búsqueda de expedientes del sistema</p>
            </header>

            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div className="flex gap-4">
                        <input
                            type="text"
                            placeholder="Buscar por número o nombre..."
                            className="px-4 py-2 border border-border rounded-lg bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <select className="px-4 py-2 border border-border rounded-lg bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                            <option>Todos los Estados</option>
                            <option>Iniciado</option>
                            <option>En Proceso</option>
                            <option>Finalizado</option>
                        </select>
                    </div>
                    <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                        Nuevo Expediente
                    </button>
                </div>

                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-border">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Número</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Extracto</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((_, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-sm font-medium">EX-2026-{2500 - i}</td>
                                <td className="px-6 py-4 text-sm text-slate-600 truncate max-w-xs">
                                    Solicitud de asistencia técnica para la localidad de {["Posadas", "Eldorado", "Oberá", "Apóstoles"][i % 4]}
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-500">
                                    {new Date().toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        En Proceso
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <button className="text-primary hover:text-primary/80 text-sm font-medium">Ver detalle</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="p-6 border-t border-border bg-slate-50 flex justify-between items-center text-sm text-muted-foreground">
                    <span>Mostrando 8 de 1,280 expedientes</span>
                    <div className="flex gap-2">
                        <button className="px-3 py-1 border border-border rounded bg-white hover:bg-slate-50 disabled:opacity-50" disabled>Anterior</button>
                        <button className="px-3 py-1 border border-border rounded bg-white hover:bg-slate-50">Siguiente</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
