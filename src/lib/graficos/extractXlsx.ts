import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import * as XLSX from 'xlsx';
import type { GraficoLinea, GraficoSerie, GraficoWorkbook, TablaHistorico } from './types';

const GRAFICOS_DIR = path.join(process.cwd(), 'docs/graficos');

function normKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findGraficoXlsx(matcher: (k: string) => boolean): string {
  if (!fs.existsSync(GRAFICOS_DIR)) throw new Error(`No existe ${GRAFICOS_DIR}`);
  const seen = new Set<string>();
  for (const name of fs.readdirSync(GRAFICOS_DIR)) {
    if (!name.endsWith('.xlsx')) continue;
    const key = normKey(name.replace('.xlsx', ''));
    if (seen.has(key)) continue;
    seen.add(key);
    if (matcher(key)) return path.join(GRAFICOS_DIR, name);
  }
  throw new Error('No se encontró xlsx en docs/graficos');
}

function readZipEntry(xlsxPath: string, entry: string): string {
  return execSync(`unzip -p ${JSON.stringify(xlsxPath)} ${JSON.stringify(entry)}`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function listChartXmls(xlsxPath: string): string[] {
  const listing = execSync(`unzip -Z1 ${JSON.stringify(xlsxPath)}`, { encoding: 'utf8' });
  return listing
    .split('\n')
    .filter((l) => /^xl\/charts\/chart\d+\.xml$/i.test(l.trim()))
    .sort((a, b) => {
      const na = parseInt(a.match(/chart(\d+)/i)?.[1] ?? '0', 10);
      const nb = parseInt(b.match(/chart(\d+)/i)?.[1] ?? '0', 10);
      return na - nb;
    });
}

type CellRange = { sheet: string; c1: number; r1: number; c2: number; r2: number };

function colLettersToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRange(ref: string): CellRange | null {
  const m = ref.match(/^(?:'([^']+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i);
  if (!m) return null;
  const sheet = (m[1] ?? m[2] ?? '').trim();
  const c1 = colLettersToIndex(m[3]);
  const r1 = parseInt(m[4], 10) - 1;
  const c2 = colLettersToIndex(m[5] ?? m[3]);
  const r2 = parseInt(m[6] ?? m[4], 10) - 1;
  return { sheet, c1, r1, c2, r2 };
}

function sheetRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Hoja no encontrada: ${sheetName}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
}

function cellVal(rows: unknown[][], r: number, c: number): unknown {
  return rows[r]?.[c] ?? '';
}

function readRange(rows: unknown[][], range: CellRange): unknown[] {
  const out: unknown[] = [];
  if (range.c1 === range.c2 && range.r1 === range.r2) {
    return [cellVal(rows, range.r1, range.c1)];
  }
  if (range.c1 === range.c2) {
    for (let r = range.r1; r <= range.r2; r++) out.push(cellVal(rows, r, range.c1));
    return out;
  }
  if (range.r1 === range.r2) {
    for (let c = range.c1; c <= range.c2; c++) out.push(cellVal(rows, range.r1, c));
    return out;
  }
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) out.push(cellVal(rows, r, c));
  }
  return out;
}

function toNumber(v: unknown): number | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!s) return null;
  let n = s;
  if (/,/.test(n)) n = n.replace(/\./g, '').replace(',', '.');
  else n = n.replace(/\./g, '');
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function excelDateLabel(v: unknown): string {
  const n = toNumber(v);
  if (n == null) return String(v ?? '').trim();
  if (n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400000);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
  }
  return String(v ?? '').trim();
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function chartTitleFromXml(xml: string): string {
  const titles = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean);
  const skip = new Set(['Mes', 'Fecha', 'Zona', 'Total de gastos por mes']);
  return titles.find((t) => !skip.has(t) && t.length > 8) ?? titles[0] ?? 'Gráfico';
}

type ParsedSerie = { name: string; catRef: string; valRef: string };

function parseSeriesFromChartXml(xml: string): ParsedSerie[] {
  const series: ParsedSerie[] = [];
  const serBlocks = xml.split(/<c:ser>/).slice(1);
  for (const block of serBlocks) {
    const formulas = [...block.matchAll(/<c:f>([^<]+)<\/c:f>/g)].map((m) => m[1].trim());
    if (formulas.length < 2) continue;
    const tx = formulas[0];
    const cat = formulas.find((f, i) => i > 0 && f !== tx && parseRange(f)?.r1 === parseRange(formulas[1])?.r1) ?? formulas[1];
    const val = formulas.find((f) => f !== tx && f !== cat) ?? formulas[formulas.length - 1];
    if (!cat || !val) continue;
    series.push({ name: tx, catRef: cat, valRef: val });
  }
  return series;
}

function seriesNameFromRange(wb: XLSX.WorkBook, nameRef: string, fallback: string): string {
  const r = parseRange(nameRef);
  if (!r) return fallback;
  const rows = sheetRows(wb, r.sheet);
  const vals = readRange(rows, r).map((v) => String(v ?? '').trim()).filter(Boolean);
  return vals.join(' ') || fallback;
}

function buildLineChartFromXml(
  wb: XLSX.WorkBook,
  xml: string,
  id: string,
  opts?: { formatY?: 'ars' | 'number'; xAsDate?: boolean }
): GraficoLinea {
  const titulo = chartTitleFromXml(xml);
  const parsed = parseSeriesFromChartXml(xml);
  if (!parsed.length) throw new Error(`Sin series en chart ${id}`);

  const catRange = parseRange(parsed[0].catRef);
  if (!catRange) throw new Error(`Rango inválido ${parsed[0].catRef}`);

  const catRows = sheetRows(wb, catRange.sheet);
  const categories = readRange(catRows, catRange).map((v) =>
    opts?.xAsDate ? excelDateLabel(v) : String(v ?? '').trim()
  );

  const series: GraficoSerie[] = [];
  const data: Record<string, string | number>[] = categories.map((x) => ({ x }));

  parsed.forEach((ps, si) => {
    const valRange = parseRange(ps.valRef);
    if (!valRange) return;
    const valRows = sheetRows(wb, valRange.sheet);
    const values = readRange(valRows, valRange);
    const name = seriesNameFromRange(wb, ps.name, `Serie ${si + 1}`);
    const dataKey = `s${si}`;
    series.push({ name, dataKey });
    values.forEach((v, i) => {
      if (!data[i]) data[i] = { x: categories[i] ?? String(i) };
      const n = toNumber(v);
      if (n != null) data[i][dataKey] = n;
    });
  });

  return {
    id,
    titulo,
    series,
    data: data.filter((row) => row.x !== ''),
    formatY: opts?.formatY ?? 'number',
  };
}

function extractSimpleWorkbook(
  fileMatcher: (k: string) => boolean,
  id: string,
  titulo: string,
  opts?: { formatY?: 'ars' | 'number'; xAsDate?: boolean }
): GraficoWorkbook {
  const xlsxPath = findGraficoXlsx(fileMatcher);
  const wb = XLSX.readFile(xlsxPath);
  const charts = listChartXmls(xlsxPath).map((entry, i) => {
    const xml = readZipEntry(xlsxPath, entry);
    return buildLineChartFromXml(wb, xml, `${id}-${i + 1}`, opts);
  });
  return { id, titulo, charts };
}

function extractBecados(): GraficoWorkbook {
  const xlsxPath = findGraficoXlsx((k) => k.includes('becados'));
  const wb = XLSX.readFile(xlsxPath);
  const rows = sheetRows(wb, 'MONTOS Y CANTIDAD');
  const charts: GraficoLinea[] = [];

  const capitalData: Record<string, string | number>[] = [];
  const interiorData: Record<string, string | number>[] = [];
  for (let r = 2; r < rows.length; r++) {
    const mesCap = String(rows[r][5] ?? '').trim();
    const valCap = toNumber(rows[r][6]);
    if (mesCap && valCap != null) capitalData.push({ x: mesCap, s0: valCap });
    const mesInt = String(rows[r][8] ?? '').trim();
    const valInt = toNumber(rows[r][9]);
    if (mesInt && valInt != null) interiorData.push({ x: mesInt, s0: valInt });
  }

  charts.push({
    id: 'becados-capital',
    titulo: 'Evolución del gasto en becados de Capital',
    series: [{ name: 'Evolución del gasto en becados de Capital', dataKey: 's0' }],
    data: capitalData,
    formatY: 'ars',
  });
  charts.push({
    id: 'becados-interior',
    titulo: 'Evolución de gasto en becados del interior',
    series: [{ name: 'Evolución de gasto en becados del interior', dataKey: 's0' }],
    data: interiorData,
    formatY: 'ars',
  });

  return { id: 'becados', titulo: 'Evolución gasto en becados', charts };
}

function extractLimpieza(): GraficoWorkbook {
  const xlsxPath = findGraficoXlsx((k) => k.includes('limpieza'));
  const wb = XLSX.readFile(xlsxPath);
  const rows = sheetRows(wb, '01');
  const data: Record<string, string | number>[] = [];
  for (let r = 0; r < rows.length; r++) {
    const mes = String(rows[r][5] ?? '').trim();
    const val = toNumber(rows[r][6]);
    if (mes && /^[A-Za-zÁÉÍÓÚáéíóú]+/.test(mes) && val != null) {
      data.push({ x: mes, s0: val });
    }
  }
  return {
    id: 'limpieza',
    titulo: 'Evolución Precios limpieza',
    charts: [
      {
        id: 'limpieza-1',
        titulo: 'Evolución del gasto en limpieza',
        series: [{ name: 'Evolución del gasto en limpieza', dataKey: 's0' }],
        data,
        formatY: 'ars',
      },
    ],
  };
}

function extractHistoricoTablas(wb: XLSX.WorkBook, sheetName: string, productCols: string[]): TablaHistorico[] {
  const rows = sheetRows(wb, sheetName);
  const tablas: TablaHistorico[] = [];
  for (let i = 0; i < rows.length; i++) {
    const titulo = String(rows[i][1] ?? '').trim();
    if (!titulo || !/ENE-FEB|FEB-MAR|MAR-ABR|ABR-MAY|MAY-JUN|ENERO|FEBRERO|MARZO|ABRIL|MAYO|CARNES|FRUTAS/i.test(titulo))
      continue;
    const headerRow = rows[i + 1];
    if (!headerRow || String(headerRow[1] ?? '').trim().toLowerCase() !== 'zona') continue;
    const columnas = productCols;
    const filas: (string | number)[][] = [];
    for (let r = i + 2; r < rows.length; r++) {
      const zona = String(rows[r][1] ?? '').trim();
      if (!zona) break;
      const fila: (string | number)[] = [zona];
      for (let c = 0; c < productCols.length; c++) {
        const v = rows[r][c + 2];
        const n = toNumber(v);
        fila.push(n != null ? n : String(v ?? '').trim());
      }
      filas.push(fila);
    }
    if (filas.length) tablas.push({ titulo, columnas: ['Zona', ...columnas], filas });
  }
  return tablas;
}

function extractWorkbookConTabs(
  fileMatcher: (k: string) => boolean,
  id: string,
  titulo: string,
  productCols: string[],
  sheetHistorico: string
): GraficoWorkbook {
  const xlsxPath = findGraficoXlsx(fileMatcher);
  const wb = XLSX.readFile(xlsxPath);
  const chartEntries = listChartXmls(xlsxPath);
  const charts = chartEntries.map((entry, i) => {
    const xml = readZipEntry(xlsxPath, entry);
    const ct = chartTitleFromXml(xml);
    const xAsDate = /evoluci[oó]n precio/i.test(ct) || xml.includes('numRef');
    return buildLineChartFromXml(wb, xml, `${id}-chart-${i + 1}`, { xAsDate, formatY: 'number' });
  });

  const tablas = extractHistoricoTablas(wb, sheetHistorico, productCols);

  const historicoCharts = charts.filter(
    (c) =>
      c.titulo.toLowerCase().includes('total de gastos') ||
      c.titulo.toLowerCase().includes('gasto en carnes') ||
      c.titulo.toLowerCase().includes('gastos en frutas')
  );
  const evolucionCharts = charts.filter((c) => /evoluci[oó]n precio/i.test(c.titulo));
  const zonaCharts = charts.filter((c) => /precios por zona/i.test(c.titulo));

  return {
    id,
    titulo,
    tabs: [
      { id: 'historico', label: 'Histórico', charts: historicoCharts, tablas },
      { id: 'evolucion-precio', label: 'Evolución precio', charts: evolucionCharts },
      { id: 'precio-zona', label: 'Precio por zona', charts: zonaCharts },
    ],
  };
}

export function extractAllGraficos(): GraficoWorkbook[] {
  return [
    extractSimpleWorkbook((k) => k.includes('teknofood'), 'teknofood', 'Evolución de Gasto en Teknofood', {
      formatY: 'ars',
    }),
    extractBecados(),
    extractSimpleWorkbook(
      (k) => k.includes('preciosgas') || (k.includes('gas') && !k.includes('gasto')),
      'gas',
      'Evolución precios Gas',
      { formatY: 'ars' }
    ),
    extractSimpleWorkbook((k) => k.includes('fumigacion'), 'fumigacion', 'Evolución precios fumigación', {
      formatY: 'ars',
    }),
    extractLimpieza(),
    extractWorkbookConTabs(
      (k) => k.includes('frutas'),
      'frutas-verduras',
      'Evolución precios Frutas y Verduras',
      ['Cebolla kg', 'Zanahoria kg', 'Zapallo kg', 'Papa kg', 'Acelga kg', 'Frutas Un.'],
      'Histórico'
    ),
    extractWorkbookConTabs(
      (k) => k.includes('carne'),
      'carne',
      'Evolución precios carne',
      ['Carne Vacuna kg', 'Pollo kg', 'Cerdo kg'],
      'Histórico'
    ),
  ];
}

/** ponytail: asserts mínimos para detectar drift del xlsx */
export function assertGraficosExactos(workbooks: GraficoWorkbook[]): void {
  const tekno = workbooks.find((w) => w.id === 'teknofood');
  if (!tekno || 'tabs' in tekno) throw new Error('teknofood missing');
  const enero = tekno.charts[0]?.data.find((d) => d.x === 'Enero');
  if (Number(enero?.s0) !== 100734400) throw new Error(`teknofood Enero: ${enero?.s0}`);

  const gas = workbooks.find((w) => w.id === 'gas');
  if (!gas || 'tabs' in gas) throw new Error('gas missing');
  const abril = gas.charts[0]?.data.find((d) => d.x === 'Abril');
  if (Number(abril?.s0) !== 14230000) throw new Error(`gas Abril: ${abril?.s0}`);

  const bec = workbooks.find((w) => w.id === 'becados');
  if (!bec || 'tabs' in bec) throw new Error('becados missing');
  const cap = bec.charts[0]?.data.find((d) => d.x === 'Enero');
  if (Math.abs(Number(cap?.s0) - 130546084.9) > 0.01) throw new Error(`becados capital: ${cap?.s0}`);

  const frutas = workbooks.find((w) => w.id === 'frutas-verduras');
  if (!frutas || !('tabs' in frutas)) throw new Error('frutas missing');
  if (frutas.tabs[0].charts.length < 1) throw new Error('frutas historico chart missing');
  if (frutas.tabs[1].charts.length < 9) throw new Error(`frutas evolucion: ${frutas.tabs[1].charts.length}`);
}
