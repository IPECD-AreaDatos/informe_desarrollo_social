import { NextResponse } from 'next/server';
import { comedoresService } from '@/lib/services/comedores';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') ?? '';

    const data = await comedoresService.getSummaryByPeriodo(periodo);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en resumen de comedores';
    console.error('Comedores summary API Error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
