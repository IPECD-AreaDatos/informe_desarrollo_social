import { NextResponse } from 'next/server';
import { comedoresService } from '@/lib/services/comedores';
import type { RankingTipo, Ambito } from '@/lib/services/comedores';

const TIPOS: RankingTipo[] = ['beneficiarios', 'gas', 'limpieza', 'frescos', 'responsables'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodo = searchParams.get('periodo') ?? '';
    const tipo = (searchParams.get('tipo') ?? 'gas') as RankingTipo;
    const ambito = searchParams.get('ambito') as Ambito | undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    if (!TIPOS.includes(tipo)) {
      return NextResponse.json({ success: false, error: 'tipo inválido' }, { status: 400 });
    }

    const data = await comedoresService.getRankings({
      periodo,
      tipo,
      ambito,
      limit,
      offset,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en rankings de comedores';
    console.error('Comedores rankings API Error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
