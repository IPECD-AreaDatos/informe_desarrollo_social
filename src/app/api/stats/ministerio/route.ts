import { NextResponse } from 'next/server';
import { getMinisterioStats } from '@/lib/services/ministerio';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from') || '2025-01-01';
        const to = searchParams.get('to') || '2026-12-31';

        const data = await getMinisterioStats(from, to);

        return NextResponse.json({
            success: true,
            data
        });
    } catch (error: any) {
        console.error('Ministerio API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
