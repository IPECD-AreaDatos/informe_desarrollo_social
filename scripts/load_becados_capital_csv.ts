/**
 * Carga becarios de Capital desde CSV a BECARIO_CAPITAL + BECARIO_CAPITAL_LIQUIDACION.
 *
 * Uso:
 *   npx tsx scripts/load_becados_capital_csv.ts \
 *     --csv "docs/marzo/Becados de Capital Marzo 2026.csv" \
 *     --periodo marzo-2026
 *
 * Requiere .env con credenciales de comedores (getComedoresConnection).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getComedoresConnection } from '../src/lib/db';

dotenv.config();

function parseArgs(): { csvPath: string; periodo: string; applyMigration: boolean } {
  const args = process.argv.slice(2);
  let csvPath = '';
  let periodo = 'marzo-2026';
  let applyMigration = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && args[i + 1]) csvPath = args[++i];
    else if (args[i] === '--periodo' && args[i + 1]) periodo = args[++i];
    else if (args[i] === '--no-migrate') applyMigration = false;
  }
  if (!csvPath) {
    console.error('Falta --csv <ruta>');
    process.exit(1);
  }
  return { csvPath, periodo, applyMigration };
}

/** Parsea una línea CSV con último campo posiblemente entre comillas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseNeto(raw: string): number {
  let s = String(raw ?? '')
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .trim();
  if (!s) return 0;
  // Formato US del CSV: 249,539.09 o total 130,546,084.86
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

type CsvRow = {
  codigo_csv: number;
  apellido: string;
  nombre: string;
  localidad: string;
  funcion: string;
  monto_neto: number;
};

function loadCsv(filePath: string): { rows: CsvRow[]; totalFooter: number | null } {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: CsvRow[] = [];
  let totalFooter: number | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const idRaw = cols[0]?.trim();
    const apellido = cols[1]?.trim() ?? '';
    const nombre = cols[2]?.trim() ?? '';
    const localidad = cols[3]?.trim() ?? '';
    const funcion = cols[4]?.trim() ?? '';
    const netoRaw = cols[5] ?? '';

    if (!apellido) {
      const t = parseNeto(netoRaw);
      if (t > 0) totalFooter = t;
      continue;
    }

    const codigo_csv = Number(idRaw);
    if (!Number.isFinite(codigo_csv) || codigo_csv <= 0) continue;

    rows.push({
      codigo_csv,
      apellido,
      nombre,
      localidad,
      funcion,
      monto_neto: parseNeto(netoRaw),
    });
  }
  return { rows, totalFooter };
}

async function applyMigration(connection: { query: (sql: string) => Promise<unknown> }) {
  const sqlPath = path.join(process.cwd(), 'sql', '004_becario_capital.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await connection.query(stmt);
  }
  console.log('Migración 004_becario_capital aplicada.');
}

async function main() {
  const { csvPath, periodo, applyMigration } = parseArgs();
  const { rows, totalFooter } = loadCsv(csvPath);
  console.log(`Filas a cargar: ${rows.length}, periodo: ${periodo}`);
  if (totalFooter != null) {
    console.log(`Total en pie de CSV: ${totalFooter.toLocaleString('es-AR')}`);
  }

  const sumRows = rows.reduce((s, r) => s + r.monto_neto, 0);
  console.log(`Suma filas parseadas: ${sumRows.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`);

  const { connection, close } = await getComedoresConnection();
  try {
    if (applyMigration) {
      await applyMigration(connection as { query: (sql: string) => Promise<unknown> });
    }

    let insertedPersonas = 0;
    let insertedLiquidaciones = 0;
    let skippedLiquidacion = 0;

    for (const row of rows) {
      await connection.execute(
        `INSERT INTO BECARIO_CAPITAL (codigo_csv, apellido, nombre, localidad, funcion)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           apellido = VALUES(apellido),
           nombre = VALUES(nombre),
           localidad = VALUES(localidad),
           funcion = VALUES(funcion)`,
        [row.codigo_csv, row.apellido, row.nombre, row.localidad || null, row.funcion || null]
      );
      insertedPersonas++;

      const [ids]: any = await connection.execute(
        `SELECT becario_id FROM BECARIO_CAPITAL WHERE codigo_csv = ? LIMIT 1`,
        [row.codigo_csv]
      );
      const becarioId = Number(ids[0]?.becario_id);
      if (!becarioId) continue;

      try {
        await connection.execute(
          `INSERT INTO BECARIO_CAPITAL_LIQUIDACION (becario_id, periodo, monto_neto)
           VALUES (?, ?, ?)`,
          [becarioId, periodo, row.monto_neto]
        );
        insertedLiquidaciones++;
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code === 'ER_DUP_ENTRY') {
          skippedLiquidacion++;
        } else {
          throw e;
        }
      }
    }

    const [ver]: any = await connection.execute(
      `SELECT COUNT(*) AS n, COALESCE(SUM(monto_neto), 0) AS s
       FROM BECARIO_CAPITAL_LIQUIDACION WHERE periodo = ?`,
      [periodo]
    );
    console.log('---');
    console.log(`Personas procesadas (UPSERT): ${insertedPersonas}`);
    console.log(`Liquidaciones insertadas: ${insertedLiquidaciones}`);
    if (skippedLiquidacion > 0) {
      console.log(`Liquidaciones omitidas (ya existían): ${skippedLiquidacion}`);
    }
    console.log(
      `Verificación BD periodo=${periodo}: count=${ver[0]?.n}, sum=${Number(ver[0]?.s).toLocaleString('es-AR')}`
    );
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
