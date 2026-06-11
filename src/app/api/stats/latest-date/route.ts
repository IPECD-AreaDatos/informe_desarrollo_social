import { NextResponse } from 'next/server';
import { getDBConnection } from '@/lib/db';

export async function GET() {
    let connObj;
    try {
        connObj = await getDBConnection();
        const connection = connObj.connection;

        const [rows]: any = await connection.execute(
            'SELECT MAX(fecha_inicio) as max_date FROM expediente_expediente WHERE activo = 1'
        );

        let latestDate = new Date();
        if (rows && rows[0] && rows[0].max_date) {
            latestDate = new Date(rows[0].max_date);
        }

        const year = latestDate.getFullYear();
        const month = latestDate.getMonth();

        // Start of month
        const fromDate = new Date(year, month, 1);
        // End of month
        const toDate = new Date(year, month + 1, 0);

        // Helper to format Date as YYYY-MM-DD in local time
        const formatLocalDate = (date: Date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const fromStr = formatLocalDate(fromDate);
        const toStr = formatLocalDate(toDate);

        return NextResponse.json({
            success: true,
            latestDate: latestDate.toISOString(),
            from: fromStr,
            to: toStr,
        });
    } catch (error: any) {
        console.error('Error fetching latest date:', error);
        // Fail-safe defaults to current calendar month
        const now = new Date();
        const isEarlyMonth = now.getDate() < 10;
        const fallbackFrom = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0), 1);
        const fallbackTo = new Date(now.getFullYear(), now.getMonth() - (isEarlyMonth ? 1 : 0) + 1, 0);

        const formatLocalDate = (date: Date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        return NextResponse.json({
            success: false,
            error: error.message,
            from: formatLocalDate(fallbackFrom),
            to: formatLocalDate(fallbackTo),
        });
    } finally {
        if (connObj) {
            await connObj.close();
        }
    }
}
