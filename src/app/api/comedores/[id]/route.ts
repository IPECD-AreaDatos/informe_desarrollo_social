import { NextResponse } from 'next/server';
import { comedoresService } from '@/lib/services/comedores';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comedorId = parseInt(id, 10);
    if (Number.isNaN(comedorId)) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') ?? '';

    const data = await comedoresService.getComedorDetail(comedorId, periodo);
    if (!data) {
      return NextResponse.json({ success: false, error: 'Comedor no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al obtener detalle';
    console.error('Comedores detail API Error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
