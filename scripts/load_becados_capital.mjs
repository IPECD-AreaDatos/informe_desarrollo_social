/**
 * Carga becarios Capital (sin tsx). Uso:
 *   node scripts/load_becados_capital.mjs --csv "docs/marzo/Becados de Capital Marzo 2026.csv" --periodo marzo-2026
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseArgs() {
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
  return { csvPath, periodo, shouldMigrate: applyMigration };
}

function parseCsvLine(line) {
  const out = [];
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

function parseNeto(raw) {
  let s = String(raw ?? '')
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .trim();
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function loadCsv(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  let totalFooter = null;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const apellido = cols[1]?.trim() ?? '';
    if (!apellido) {
      const t = parseNeto(cols[5] ?? '');
      if (t > 0) totalFooter = t;
      continue;
    }
    const codigo_csv = Number(cols[0]?.trim());
    if (!Number.isFinite(codigo_csv) || codigo_csv <= 0) continue;
    rows.push({
      codigo_csv,
      apellido,
      nombre: cols[2]?.trim() ?? '',
      localidad: cols[3]?.trim() ?? '',
      funcion: cols[4]?.trim() ?? '',
      monto_neto: parseNeto(cols[5] ?? ''),
    });
  }
  return { rows, totalFooter };
}

async function getConnection() {
  return mysql.createConnection({
    host: process.env.HOST_DBB1 || process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.USER_DBB1 || process.env.DB_USER,
    password: process.env.PASSWORD_DBB1 || process.env.DB_PASSWORD,
    database:
      process.env.BASE_DESARROLLO_SOCIAL ||
      process.env.DB_NAME_COMEDORES ||
      process.env.DB_NAME,
  });
}

async function applyMigration(conn) {
  const sqlPath = path.join(process.cwd(), 'sql', '004_becario_capital.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await conn.query(stmt);
  }
  console.log('Migración 004_becario_capital aplicada.');
}

async function main() {
  const { csvPath, periodo, shouldMigrate } = parseArgs();
  const { rows, totalFooter } = loadCsv(csvPath);
  const sumRows = rows.reduce((s, r) => s + r.monto_neto, 0);
  console.log(`Filas: ${rows.length}, periodo: ${periodo}`);
  if (totalFooter != null) console.log(`Total CSV: ${totalFooter}`);
  console.log(`Suma parseada: ${sumRows}`);

  const conn = await getConnection();
  try {
    if (shouldMigrate) await applyMigration(conn);
    let insertedLiq = 0;
    let skipped = 0;
    for (const row of rows) {
      await conn.execute(
        `INSERT INTO BECARIO_CAPITAL (codigo_csv, apellido, nombre, localidad, funcion)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           apellido = VALUES(apellido),
           nombre = VALUES(nombre),
           localidad = VALUES(localidad),
           funcion = VALUES(funcion)`,
        [row.codigo_csv, row.apellido, row.nombre, row.localidad || null, row.funcion || null]
      );
      const [ids] = await conn.execute(
        `SELECT becario_id FROM BECARIO_CAPITAL WHERE codigo_csv = ? LIMIT 1`,
        [row.codigo_csv]
      );
      const becarioId = ids[0]?.becario_id;
      if (!becarioId) continue;
      try {
        await conn.execute(
          `INSERT INTO BECARIO_CAPITAL_LIQUIDACION (becario_id, periodo, monto_neto) VALUES (?, ?, ?)`,
          [becarioId, periodo, row.monto_neto]
        );
        insertedLiq++;
      } catch (e) {
        if (e?.code === 'ER_DUP_ENTRY') skipped++;
        else throw e;
      }
    }
    const [ver] = await conn.execute(
      `SELECT COUNT(*) AS n, COALESCE(SUM(monto_neto), 0) AS s
       FROM BECARIO_CAPITAL_LIQUIDACION WHERE periodo = ?`,
      [periodo]
    );
    console.log(`Liquidaciones nuevas: ${insertedLiq}, omitidas: ${skipped}`);
    console.log(`BD: n=${ver[0].n}, sum=${ver[0].s}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
