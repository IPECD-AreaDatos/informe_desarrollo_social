import { NextResponse } from 'next/server';
import { comedoresService } from '@/lib/services/comedores';

export async function GET() {
  try {
    const data = await comedoresService.getPeriodosDisponibles();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al listar periodos';
    console.error('Comedores periodos API Error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
