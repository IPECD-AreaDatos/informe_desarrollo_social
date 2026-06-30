import { NextResponse } from 'next/server';
import { loadAllGraficoWorkbooks, loadGraficoWorkbook, listGraficosIndex } from '@/lib/graficos/loadJson';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workbook = searchParams.get('workbook');
    const all = searchParams.get('all') === '1';

    if (all) {
      const data = loadAllGraficoWorkbooks();
      return NextResponse.json({ success: true, data });
    }

    if (workbook) {
      const data = loadGraficoWorkbook(workbook);
      if (!data) {
        return NextResponse.json({ success: false, error: 'Workbook no encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: true, data: listGraficosIndex() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cargar gráficos';
    console.error('Comedores graficos API Error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
