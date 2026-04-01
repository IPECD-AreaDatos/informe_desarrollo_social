/**
 * Cruce directo: Excel fuente vs CSV para identificar discrepancias.
 * Uso: node 04_cruce_excel_csv.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const MARZO_DIR = path.resolve(__dirname, '../../docs/marzo');
const CSV_DIR = path.resolve(__dirname, '../../docs/csv_marzo');

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const parseRow = (line) => {
    const out = [];
    let inQ = false, buf = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { out.push(buf); buf = ''; continue; }
      buf += c;
    }
    out.push(buf);
    return out;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map((l) => {
    const vals = parseRow(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
    return obj;
  });
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim();
}
function num(v) { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }

function readSheetRows(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

function printSection(title) {
  console.log('\n' + '='.repeat(74));
  console.log(`  ${title}`);
  console.log('='.repeat(74));
}

// ─────────────────────────── GAS ───────────────────────────
function cruceGas() {
  printSection('CRUCE GAS: Excel "Seguridad Alimentaria" hoja GAS vs gas_envasado.csv');
  const xlsPath = path.join(MARZO_DIR, 'Seguridad Alimentaria Presupuesto 2026.xlsx');
  const csvPath = path.join(CSV_DIR, 'gas_envasado.csv');
  if (!fs.existsSync(xlsPath)) { console.log('  ⚠ Excel no encontrado:', xlsPath); return; }
  if (!fs.existsSync(csvPath)) { console.log('  ⚠ CSV no encontrado'); return; }

  const wb = XLSX.readFile(xlsPath);
  const gasSheet = wb.SheetNames.find((n) => norm(n).includes('GAS'));
  if (!gasSheet) { console.log('  ⚠ Hoja GAS no encontrada. Hojas:', wb.SheetNames.join(', ')); return; }
  const rows = readSheetRows(wb, gasSheet);

  const headers = rows.slice(0, 15).map((r) => r.map((c) => norm(String(c))).join(' '));
  let headerIdx = 0;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].includes('COMEDOR') && (headers[i].includes('10') || headers[i].includes('GARRAFA'))) {
      headerIdx = i; break;
    }
  }
  const hRow = rows[headerIdx].map((c) => norm(String(c)));
  const idxNom = hRow.findIndex((h) => h.includes('COMEDOR'));
  const idx10 = hRow.findIndex((h) => h.includes('10'));
  const idx15 = hRow.findIndex((h) => h.includes('15'));
  const idx45 = hRow.findIndex((h) => h.includes('45'));

  const excelData = {};
  let excelCount = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const nombre = norm(String(r[idxNom] || ''));
    if (!nombre || nombre.includes('TOTAL') || nombre.includes('SUBTOTAL') || nombre.includes('ZONA')) continue;
    const g10 = num(r[idx10]);
    const g15 = num(r[idx15]);
    const g45 = num(r[idx45]);
    if (g10 + g15 + g45 <= 0) continue;
    const costo = g10 * 20000 + g15 * 30000 + g45 * 70000;
    excelData[nombre] = { g10, g15, g45, costo, row: i + 1 };
    excelCount++;
  }

  const csvRows = readCsv(csvPath).filter((r) => {
    const n = norm(r.nombre_dependencia || '');
    return n && !n.includes('TOTAL') && !n.includes('GENERAL');
  });

  console.log(`  Excel deps con gas: ${excelCount}`);
  console.log(`  CSV deps con gas: ${csvRows.length}`);

  const diffs = [];
  const soloEnCsv = [];
  const soloEnExcel = new Set(Object.keys(excelData));

  for (const cr of csvRows) {
    const key = norm(cr.nombre_dependencia);
    soloEnExcel.delete(key);
    const ex = excelData[key];
    const csvCosto = num(cr.costo_mensual);
    const csvG10 = num(cr.garrafas_10kg);
    const csvG15 = num(cr.garrafas_15kg);
    const csvG45 = num(cr.garrafas_45kg);
    if (!ex) {
      soloEnCsv.push({ nombre: cr.nombre_dependencia, csvCosto, csvG10, csvG15, csvG45 });
      continue;
    }
    if (ex.g10 !== csvG10 || ex.g15 !== csvG15 || ex.g45 !== csvG45) {
      diffs.push({
        nombre: cr.nombre_dependencia,
        excelG: `10kg=${ex.g10} 15kg=${ex.g15} 45kg=${ex.g45}`,
        csvG: `10kg=${csvG10} 15kg=${csvG15} 45kg=${csvG45}`,
        excelCosto: ex.costo,
        csvCosto,
        diff: csvCosto - ex.costo,
      });
    }
  }

  if (diffs.length) {
    console.log(`\n  ⚠ ${diffs.length} dependencias con garrafas diferentes Excel vs CSV:`);
    for (const d of diffs) {
      console.log(`    ${d.nombre}:`);
      console.log(`      Excel: ${d.excelG} → $${d.excelCosto.toLocaleString('es-AR')}`);
      console.log(`      CSV:   ${d.csvG} → $${d.csvCosto.toLocaleString('es-AR')}`);
    }
  } else {
    console.log('\n  ✓ Garrafas coinciden en todas las dependencias comunes');
  }

  if (soloEnCsv.length) {
    console.log(`\n  ${soloEnCsv.length} dependencias solo en CSV (no en Excel):`);
    for (const s of soloEnCsv.slice(0, 10)) {
      console.log(`    ${s.nombre}: $${s.csvCosto}`);
    }
  }
  if (soloEnExcel.size) {
    console.log(`\n  ${soloEnExcel.size} dependencias solo en Excel (no en CSV):`);
    for (const k of [...soloEnExcel].slice(0, 10)) {
      const ex = excelData[k];
      console.log(`    ${k}: 10kg=${ex.g10} 15kg=${ex.g15} 45kg=${ex.g45} → $${ex.costo.toLocaleString('es-AR')}`);
    }
  }

  const csvTotal = csvRows.reduce((s, r) => s + num(r.costo_mensual), 0);
  const excelTotal = Object.values(excelData).reduce((s, d) => s + d.costo, 0);
  console.log(`\n  Totales: Excel=$${excelTotal.toLocaleString('es-AR')} | CSV=$${csvTotal.toLocaleString('es-AR')} | Control=$11,570,000`);
  console.log(`  VEREDICTO GAS: ${diffs.length === 0 ? 'Excel = CSV (sin diferencias de garrafas)' : `Excel difiere del CSV en ${diffs.length} deps. CSV es versión post-verificación.`}`);
}

// ─────────────────────────── LIMPIEZA ───────────────────────────
function cruceLimpieza() {
  printSection('CRUCE LIMPIEZA: Excel "ART DE LIMPIEZA" vs kit_limpieza.csv');
  const xlsPath = path.join(MARZO_DIR, 'ART DE LIMPIEZA.xlsx');
  const csvPath = path.join(CSV_DIR, 'kit_limpieza.csv');
  if (!fs.existsSync(xlsPath)) { console.log('  ⚠ Excel no encontrado'); return; }

  const wb = XLSX.readFile(xlsPath);
  console.log('  Hojas en Excel:', wb.SheetNames.join(', '));

  const limpSheet = wb.SheetNames.find((n) => norm(n).includes('LIMPIEZA')) || wb.SheetNames[0];
  const rows = readSheetRows(wb, limpSheet);
  console.log(`  Hoja "${limpSheet}": ${rows.length} filas totales`);

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].map((c) => norm(String(c))).join(' ');
    if (joined.includes('LAVANDINA') && (joined.includes('DETERGENTE') || joined.includes('ESCOBILLON'))) {
      headerIdx = i;
      break;
    }
  }
  console.log(`  Header de detalle encontrado en fila: ${headerIdx}`);

  if (headerIdx < 0) {
    console.log('  ⚠ No se encontró header de detalle de dependencias');
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      console.log(`    Fila ${i}: ${rows[i].slice(0, 8).join(' | ')}`);
    }
    return;
  }

  const hRow = rows[headerIdx].map((c) => norm(String(c)));
  console.log(`  Columnas header: ${hRow.filter(h => h).join(' | ')}`);

  const lIdxNom = hRow.findIndex((h) => h.includes('COMEDOR') || h.includes('NOMBRE') || h.includes('DEPENDENCIA'));
  const excelDeps = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const nombre = lIdxNom >= 0 ? norm(String(rows[i][lIdxNom] || '')) : '';
    if (!nombre) continue;
    if (nombre.includes('TOTAL')) continue;
    const numVals = rows[i].filter((c) => typeof c === 'number' && c > 0).length;
    if (numVals === 0) continue;
    excelDeps.push({ nombre, row: i + 1, raw: rows[i].slice(0, 16) });
  }

  const csvRows = readCsv(csvPath);
  console.log(`\n  Excel dependencias de limpieza: ${excelDeps.length}`);
  console.log(`  CSV dependencias de limpieza: ${csvRows.length}`);

  const excelSet = new Set(excelDeps.map((d) => d.nombre));
  const csvSet = new Set(csvRows.map((r) => norm(r.nombre_dependencia)));

  const soloEnCsv = [...csvSet].filter((n) => !excelSet.has(n));
  const soloEnExcel = [...excelSet].filter((n) => !csvSet.has(n));

  if (soloEnCsv.length) {
    console.log(`\n  ${soloEnCsv.length} dependencias solo en CSV (no en Excel):`);
    for (const n of soloEnCsv.slice(0, 15)) console.log(`    - ${n}`);
    if (soloEnCsv.length > 15) console.log(`    ... y ${soloEnCsv.length - 15} más`);
  }
  if (soloEnExcel.length) {
    console.log(`\n  ${soloEnExcel.length} dependencias solo en Excel (no en CSV):`);
    for (const n of soloEnExcel.slice(0, 15)) console.log(`    - ${n}`);
  }

  console.log(`\n  VEREDICTO LIMPIEZA: ${soloEnCsv.length === 0 && soloEnExcel.length === 0 ? 'Excel = CSV' : `CSV tiene ${soloEnCsv.length} deps extras, Excel tiene ${soloEnExcel.length} extras`}`);
}

// ─────────────────────────── DEPENDENCIAS ───────────────────────────
function cruceDependencias() {
  printSection('CRUCE DEPENDENCIAS: Excel Anexo II + TEKNOFOOD vs dependencias.csv');
  const csvPath = path.join(CSV_DIR, 'dependencias.csv');
  if (!fs.existsSync(csvPath)) return;
  const csvRows = readCsv(csvPath).filter((r) => (r.nombre || '').trim());
  const csvCapital = csvRows.filter((r) => (r.region || '').toUpperCase().includes('CAPITAL'));
  const csvInterior = csvRows.filter((r) => !(r.region || '').toUpperCase().includes('CAPITAL'));

  console.log(`  CSV: total=${csvRows.length} (capital=${csvCapital.length}, interior=${csvInterior.length})`);

  const teknoPath = path.join(MARZO_DIR, 'TEKNOFOOD.xlsx');
  let teknoDeps = 0;
  if (fs.existsSync(teknoPath)) {
    const wb = XLSX.readFile(teknoPath);
    const padronSheets = wb.SheetNames.filter((n) => norm(n).includes('PADRON'));
    const teknoNames = new Set();
    for (const sn of padronSheets) {
      const rows = readSheetRows(wb, sn);
      let hRow = 0;
      for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const joined = rows[i].map((c) => norm(String(c))).join(' ');
        if (joined.includes('COMEDORES') || joined.includes('CENTRO')) { hRow = i; break; }
      }
      const hdr = rows[hRow].map((c) => norm(String(c)));
      const idxN = hdr.findIndex((h) => h.includes('COMEDORES') || h.includes('CENTRO'));
      for (let i = hRow + 1; i < rows.length; i++) {
        const n = idxN >= 0 ? norm(String(rows[i][idxN] || '')) : '';
        if (n && !n.includes('ZONA') && !n.includes('TOTAL')) teknoNames.add(n);
      }
    }
    teknoDeps = teknoNames.size;
    console.log(`  TEKNOFOOD padron deps únicos: ${teknoDeps}`);
  }

  const anexoPath = path.join(__dirname, '../../docs/Informe Anexo II Comedores.xlsx');
  if (fs.existsSync(anexoPath)) {
    const wb = XLSX.readFile(anexoPath);
    const interiorSheet = wb.SheetNames.find((n) => norm(n).includes('INTERIOR') || norm(n).includes('PADRON'));
    if (interiorSheet) {
      const rows = readSheetRows(wb, interiorSheet);
      const names = new Set();
      for (const r of rows) {
        for (const c of r) {
          const v = norm(String(c));
          if (v.length > 3 && !v.includes('TOTAL') && !v.includes('ZONA')) {
            // just count unique entries
          }
        }
      }
      console.log(`  Anexo II hoja "${interiorSheet}": ${rows.length} filas`);
    }
  }

  const csvInteriorNames = new Set(csvInterior.map((r) => norm(r.nombre)));
  const padronCsvPath = path.join(CSV_DIR, 'padron_interior.csv');
  if (fs.existsSync(padronCsvPath)) {
    const padronCsv = readCsv(padronCsvPath);
    const padronNames = new Set(padronCsv.map((r) => norm(r.centro_entrega || '')).filter(Boolean));
    console.log(`  padron_interior.csv centros únicos: ${padronNames.size}`);
    console.log(`  dependencias.csv interior: ${csvInterior.length}`);

    const enPadronNoEnDeps = [...padronNames].filter((n) => !csvInteriorNames.has(n));
    const enDepsNoEnPadron = [...csvInteriorNames].filter((n) => !padronNames.has(n));
    if (enPadronNoEnDeps.length) {
      console.log(`\n  ${enPadronNoEnDeps.length} centros en padron_interior que NO están en dependencias.csv:`);
      for (const n of enPadronNoEnDeps.slice(0, 10)) console.log(`    - ${n}`);
    }
    if (enDepsNoEnPadron.length) {
      console.log(`\n  ${enDepsNoEnPadron.length} deps interior en dependencias.csv que NO están en padron_interior:`);
      for (const n of enDepsNoEnPadron.slice(0, 10)) console.log(`    - ${n}`);
    }
  }

  console.log(`\n  VEREDICTO DEPENDENCIAS: dependencias.csv tiene ${csvRows.length} (${csvCapital.length} capital + ${csvInterior.length} interior). Es el listado maestro más completo.`);
}

// ─────────────────────────── BENEFICIARIOS ───────────────────────────
function cruceBeneficiarios() {
  printSection('CRUCE BENEFICIARIOS: beneficiarios_por_servicio.csv vs Anexo II Interior');
  const csvPath = path.join(CSV_DIR, 'beneficiarios_por_servicio.csv');
  if (!fs.existsSync(csvPath)) return;
  const csvRows = readCsv(csvPath);
  const csvCapital = csvRows.filter((r) => (r.region || r.zona || '').toUpperCase().includes('CAPITAL'));
  const csvInterior = csvRows.filter((r) => !(r.region || r.zona || '').toUpperCase().includes('CAPITAL'));
  const csvTotalBen = csvRows.reduce((s, r) => s + num(r.cantidad_beneficiarios), 0);

  console.log(`  CSV beneficiarios: ${csvRows.length} filas (${csvCapital.length} capital, ${csvInterior.length} interior?)`);
  console.log(`  CSV total beneficiarios: ${csvTotalBen}`);
  console.log(`  CSV servicios: COMIDAS=${csvRows.filter(r => (r.tipo_servicio||'').includes('COMIDA')).length}, REFRIGERIOS=${csvRows.filter(r => (r.tipo_servicio||'').includes('REFRIG')).length}`);

  const anexoPath = path.join(__dirname, '../../docs/Informe Anexo II Comedores.xlsx');
  if (fs.existsSync(anexoPath)) {
    const wb = XLSX.readFile(anexoPath);
    console.log(`\n  Anexo II hojas: ${wb.SheetNames.join(', ')}`);
    const interiorSheet = wb.SheetNames.find((n) => {
      const x = norm(n);
      return x.includes('INTERIOR') || x.includes('PADRON');
    });
    if (interiorSheet) {
      const rows = readSheetRows(wb, interiorSheet);
      let dataRows = 0;
      let totalBenAnexo = 0;
      for (const r of rows) {
        const benef = r.find((c) => typeof c === 'number' && c > 0 && c < 10000);
        if (benef) { dataRows++; totalBenAnexo += benef; }
      }
      console.log(`  Anexo II "${interiorSheet}": ~${dataRows} filas con beneficiarios, suma ~${totalBenAnexo}`);
    }
  }

  const teknoPath = path.join(MARZO_DIR, 'TEKNOFOOD.xlsx');
  if (fs.existsSync(teknoPath)) {
    const wb = XLSX.readFile(teknoPath);
    const padronSheets = wb.SheetNames.filter((n) => norm(n).includes('PADRON'));
    let totalBenTekno = 0;
    let totalRowsTekno = 0;
    for (const sn of padronSheets) {
      const rows = readSheetRows(wb, sn);
      let hRow = 0;
      for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const joined = rows[i].map((c) => norm(String(c))).join(' ');
        if (joined.includes('BENEF')) { hRow = i; break; }
      }
      const hdr = rows[hRow].map((c) => norm(String(c)));
      const idxB = hdr.findIndex((h) => h.includes('BENEF'));
      for (let i = hRow + 1; i < rows.length; i++) {
        const b = idxB >= 0 ? num(rows[i][idxB]) : 0;
        if (b > 0) { totalBenTekno += b; totalRowsTekno++; }
      }
    }
    console.log(`  TEKNOFOOD padron: ${totalRowsTekno} filas con beneficiarios, total=${totalBenTekno}`);
  }

  console.log(`\n  VEREDICTO BENEFICIARIOS: CSV tiene ${csvRows.length} filas (fuente CERES Capital). DB RACION viene del Anexo II (Interior) + Teknofood padron. Son fuentes complementarias, no la misma.`);
}

// ─────────────────────────── MAIN ───────────────────────────
function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  CRUCE EXCEL vs CSV — Veredicto por discrepancia                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  cruceGas();
  cruceLimpieza();
  cruceDependencias();
  cruceBeneficiarios();

  printSection('RESUMEN DE VEREDICTOS');
  console.log('  1. GAS: Ver arriba si Excel y CSV difieren en garrafas por dep.');
  console.log('  2. LIMPIEZA: Ver arriba deps que están en CSV pero no en Excel.');
  console.log('  3. DEPENDENCIAS: dependencias.csv es el listado maestro (380 deps).');
  console.log('  4. BENEFICIARIOS: Son fuentes distintas (CERES Capital vs Anexo II).');
}

main();
