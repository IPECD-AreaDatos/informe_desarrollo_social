import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const query = url.searchParams.get('q');
        if (!query) return NextResponse.json({ error: 'no query' });

        const { connection, close } = await getDBConnection();
        const [result]: any = await connection.execute(query);
        await close();
        return NextResponse.json({ result });
    } catch (error: any) {
        return NextResponse.json({ error: error.message });
    }
}
