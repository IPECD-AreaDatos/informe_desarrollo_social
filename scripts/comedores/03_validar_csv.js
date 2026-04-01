/**
 * Validación cruzada: CSV fuente de verdad vs base de datos.
 * Uso: node 03_validar_csv.js [--csv-dir <ruta>]
 * Requiere: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (o DB_NAME_COMEDORES), y opcionalmente .env
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const mysql = require('mysql2/promise');

function parseArgs() {
  let csvDir = path.resolve(__dirname, '../../docs/csv_marzo');
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--csv-dir' && process.argv[i + 1]) csvDir = path.resolve(process.argv[++i]);
  }
  return { csvDir };
}

function getDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_COMEDORES || process.env.DB_NAME || 'informe',
  };
}

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

function num(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function pct(a, b) {
  if (!b) return 'N/A';
  return ((a / b) * 100).toFixed(2) + '%';
}

function printSection(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function printResult(label, csvVal, dbVal, ok) {
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${label}: CSV=${csvVal} | DB=${dbVal} ${ok ? '' : ' ← DISCREPANCIA'}`);
}

async function main() {
  const { csvDir } = parseArgs();
  const conn = await mysql.createConnection(getDbConfig());
  let totalChecks = 0, passed = 0, failed = 0;

  function check(label, csvVal, dbVal, tolerance = 0.01) {
    totalChecks++;
    const cv = num(csvVal), dv = num(dbVal);
    const ok = Math.abs(cv - dv) <= Math.max(tolerance, Math.abs(cv) * 0.001);
    if (ok) passed++; else failed++;
    printResult(label, cv, dv, ok);
    return ok;
  }

  function checkCount(label, csvCount, dbCount) {
    totalChecks++;
    const ok = csvCount === dbCount;
    if (ok) passed++; else failed++;
    printResult(label, csvCount, dbCount, ok);
    return ok;
  }

  // ───────────── 1. RESUMEN DASHBOARD ─────────────
  printSection('1. RESUMEN DASHBOARD vs PRESUPUESTO_TEKNOFOOD / PRESUPUESTO_RESUMEN');
  const resumenPath = path.join(csvDir, 'resumen_dashboard.csv');
  if (fs.existsSync(resumenPath)) {
    const csvRows = readCsv(resumenPath);
    const csvMap = {};
    csvRows.forEach((r) => { csvMap[r.indicador] = num(r.valor); });

    const [racionesDia] = await conn.execute(
      `SELECT cantidad FROM PRESUPUESTO_TEKNOFOOD WHERE escala='DIARIO' AND concepto='raciones_diarias' LIMIT 1`
    );
    check('Total raciones/día', csvMap['TOTAL RACIONES / DÍA'] || 0, racionesDia[0]?.cantidad || 0);

    const [racionesMes] = await conn.execute(
      `SELECT monto FROM PRESUPUESTO_TEKNOFOOD WHERE escala='MENSUAL' AND concepto='raciones_mensuales' LIMIT 1`
    );
    check('Costo raciones mensual', csvMap['COSTO RACIONES MENSUAL (30 días)'] || 0, racionesMes[0]?.monto || 0);

    const [gasRes] = await conn.execute(
      `SELECT monto_total FROM PRESUPUESTO_RESUMEN WHERE rubro='otros_recursos' AND subrubro='gas' ORDER BY resumen_id DESC LIMIT 1`
    );
    check('Costo gas mensual', csvMap['COSTO GAS MENSUAL'] || 0, gasRes[0]?.monto_total || 0);

    const [limpRes] = await conn.execute(
      `SELECT monto_total FROM PRESUPUESTO_RESUMEN WHERE rubro='otros_recursos' AND subrubro='limpieza' ORDER BY resumen_id DESC LIMIT 1`
    );
    check('Costo limpieza bimestral', csvMap['COSTO LIMPIEZA BIMESTRAL'] || 0, limpRes[0]?.monto_total || 0);

    const [fumigRes] = await conn.execute(
      `SELECT monto_total FROM PRESUPUESTO_RESUMEN WHERE rubro='otros_recursos' AND subrubro='fumigacion' ORDER BY resumen_id DESC LIMIT 1`
    );
    check('Costo fumigación trimestral', csvMap['COSTO FUMIGACIÓN TRIMESTRAL'] || 0, fumigRes[0]?.monto_total || 0);

    const [carneRes] = await conn.execute(
      `SELECT monto_total FROM PRESUPUESTO_RESUMEN WHERE rubro='carnes' AND subrubro='carne' ORDER BY resumen_id DESC LIMIT 1`
    );
    check('Inversión carne mensual', csvMap['INVERSIÓN CARNE MENSUAL (TOTAL)'] || 0, carneRes[0]?.monto_total || 0);

    const [depCap] = await conn.execute(
      `SELECT COUNT(*) AS c FROM COMEDOR c JOIN ZONA z ON c.zona_id=z.zona_id WHERE z.ambito='CAPITAL'`
    );
    const [depInt] = await conn.execute(
      `SELECT COUNT(*) AS c FROM COMEDOR c JOIN ZONA z ON c.zona_id=z.zona_id WHERE z.ambito='INTERIOR'`
    );
    check('Dependencias capital', csvMap['DEPENDENCIAS CAPITAL'] || 0, depCap[0]?.c || 0);
    check('Dependencias interior', csvMap['DEPENDENCIAS INTERIOR'] || 0, depInt[0]?.c || 0);

    const [becCapRes] = await conn.execute(
      `SELECT COALESCE(cantidad_total,0) AS c FROM PRESUPUESTO_RESUMEN WHERE rubro='becados' AND subrubro='capital' ORDER BY resumen_id DESC LIMIT 1`
    );
    const [becIntRes] = await conn.execute(
      `SELECT COALESCE(cantidad_total,0) AS c FROM PRESUPUESTO_RESUMEN WHERE rubro='becados' AND subrubro='interior' ORDER BY resumen_id DESC LIMIT 1`
    );
    check('Becarios capital (RESUMEN)', csvMap['BECARIOS CAPITAL'] || 0, becCapRes[0]?.c || 0);
    check('Becarios interior (RESUMEN)', csvMap['BECARIOS INTERIOR'] || 0, becIntRes[0]?.c || 0);

    const [becCapPer] = await conn.execute(
      `SELECT COUNT(*) AS c FROM BECARIO_LINEA WHERE tipo_linea='PERSONA' AND ambito='CAPITAL'`
    );
    const [becIntPer] = await conn.execute(
      `SELECT COUNT(*) AS c FROM BECARIO_LINEA WHERE tipo_linea='PERSONA' AND ambito='INTERIOR'`
    );
    console.log(`  ℹ BECARIO_LINEA personas: capital=${becCapPer[0]?.c || 0}, interior=${becIntPer[0]?.c || 0} (detalle individual, puede ser menor al total)`);
  } else {
    console.log('  ⚠ resumen_dashboard.csv no encontrado');
  }

  // ───────────── 2. DEPENDENCIAS ─────────────
  printSection('2. DEPENDENCIAS (dependencias.csv vs COMEDOR)');
  const depPath = path.join(csvDir, 'dependencias.csv');
  if (fs.existsSync(depPath)) {
    const csvDeps = readCsv(depPath).filter((r) => (r.nombre || '').trim());
    const csvCapital = csvDeps.filter((r) => (r.region || r.zona || '').toUpperCase().includes('CAPITAL'));
    const csvInterior = csvDeps.filter((r) => !(r.region || r.zona || '').toUpperCase().includes('CAPITAL'));
    console.log(`  CSV: total=${csvDeps.length} (capital=${csvCapital.length}, interior=${csvInterior.length})`);
    const [dbDeps] = await conn.execute(`SELECT COUNT(*) AS c FROM COMEDOR`);
    const [dbCapDeps] = await conn.execute(`SELECT COUNT(*) AS c FROM COMEDOR c JOIN ZONA z ON c.zona_id=z.zona_id WHERE z.ambito='CAPITAL'`);
    const [dbIntDeps] = await conn.execute(`SELECT COUNT(*) AS c FROM COMEDOR c JOIN ZONA z ON c.zona_id=z.zona_id WHERE z.ambito='INTERIOR'`);
    console.log(`  DB: total=${dbDeps[0]?.c || 0} (capital=${dbCapDeps[0]?.c || 0}, interior=${dbIntDeps[0]?.c || 0})`);
    check('Total dependencias', csvDeps.length, dbDeps[0]?.c || 0, 50);
  }

  // ───────────── 3. CARNE SEMANAL ─────────────
  printSection('3. CARNE SEMANAL (carne_semanal.csv vs PRESUPUESTO_DEPENDENCIA rubro=carnes)');
  const carnePath = path.join(csvDir, 'carne_semanal.csv');
  if (fs.existsSync(carnePath)) {
    const csvCarneRaw = readCsv(carnePath);
    const csvCarne = csvCarneRaw.filter((r) => {
      const n = (r.nombre_dependencia || '').toUpperCase().trim();
      return n && !n.includes('TOTAL') && !n.includes('SUBTOTAL') && !n.includes('PRECIO') && !n.includes('INVERSIÓN') && !n.includes('INVERSION');
    });
    console.log(`  CSV filas (sin totales): ${csvCarne.length} (raw: ${csvCarneRaw.length})`);
    const [dbCarne] = await conn.execute(
      `SELECT COUNT(DISTINCT comedor_id) AS c, COALESCE(SUM(cantidad),0) AS kg, COALESCE(SUM(monto),0) AS m FROM PRESUPUESTO_DEPENDENCIA WHERE rubro='carnes'`
    );
    checkCount('Dependencias con carne', csvCarne.length, dbCarne[0]?.c || 0);
    const csvTotalKg = csvCarne.reduce((s, r) => s + num(r.total_kg_sem), 0);
    check('Total kg/semana', csvTotalKg, dbCarne[0]?.kg || 0, 1);
    check('Monto total carnes', 137123110.8, dbCarne[0]?.m || 0, 1);

    const [dbCarneRows] = await conn.execute(
      `SELECT pd.dependencia_nombre AS nombre, pd.cantidad, pd.monto
       FROM PRESUPUESTO_DEPENDENCIA pd WHERE pd.rubro='carnes' ORDER BY pd.monto DESC LIMIT 5`
    );
    console.log('\n  Top 5 dependencias por monto (DB):');
    for (const r of dbCarneRows) {
      console.log(`    ${r.nombre}: ${r.cantidad} kg, $${Number(r.monto).toLocaleString('es-AR')}`);
    }
  }

  // ───────────── 4. GAS ENVASADO ─────────────
  printSection('4. GAS ENVASADO (gas_envasado.csv vs PRESUPUESTO_DEPENDENCIA subrubro=gas)');
  const gasPath = path.join(csvDir, 'gas_envasado.csv');
  if (fs.existsSync(gasPath)) {
    const csvGasRaw = readCsv(gasPath);
    const csvGas = csvGasRaw.filter((r) => {
      const n = (r.nombre_dependencia || '').toUpperCase().trim();
      return n && !n.includes('TOTAL') && !n.includes('SUBTOTAL') && !n.includes('GENERAL');
    });
    console.log(`  CSV filas (sin totales): ${csvGas.length} (raw: ${csvGasRaw.length})`);
    const [dbGas] = await conn.execute(
      `SELECT COUNT(DISTINCT comedor_id) AS c, COALESCE(SUM(monto),0) AS m FROM PRESUPUESTO_DEPENDENCIA WHERE rubro='otros_recursos' AND subrubro='gas'`
    );
    checkCount('Dependencias con gas', csvGas.length, dbGas[0]?.c || 0);
    const csvTotalMonto = csvGas.reduce((s, r) => s + num(r.costo_mensual), 0);
    check('Monto total gas (CSV sin TOTAL)', csvTotalMonto, dbGas[0]?.m || 0, 5);

    const diffs = [];
    const [dbGasRows] = await conn.execute(
      `SELECT pd.dependencia_nombre, pd.monto FROM PRESUPUESTO_DEPENDENCIA pd WHERE pd.rubro='otros_recursos' AND pd.subrubro='gas'`
    );
    const dbGasMap = {};
    dbGasRows.forEach((r) => { dbGasMap[r.dependencia_nombre.toUpperCase().trim()] = Number(r.monto); });
    for (const r of csvGas) {
      const key = r.nombre_dependencia.toUpperCase().trim();
      const csvM = num(r.costo_mensual);
      const dbM = dbGasMap[key] || 0;
      if (Math.abs(csvM - dbM) > 1) diffs.push({ nombre: r.nombre_dependencia, csvM, dbM, diff: csvM - dbM });
    }
    diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (diffs.length) {
      console.log(`\n  Top ${Math.min(5, diffs.length)} discrepancias monto por dep:`);
      for (const d of diffs.slice(0, 5)) {
        console.log(`    ${d.nombre}: CSV=$${d.csvM} DB=$${d.dbM} diff=$${d.diff.toFixed(2)}`);
      }
    } else {
      console.log('  Sin discrepancias de monto por dependencia');
    }
  }

  // ───────────── 5. KIT LIMPIEZA ─────────────
  printSection('5. KIT LIMPIEZA (kit_limpieza.csv vs PRESUPUESTO_DEPENDENCIA subrubro=limpieza)');
  const limpPath = path.join(csvDir, 'kit_limpieza.csv');
  if (fs.existsSync(limpPath)) {
    const csvLimp = readCsv(limpPath);
    const [dbLimp] = await conn.execute(
      `SELECT COUNT(DISTINCT dependencia_nombre) AS c, COALESCE(SUM(monto),0) AS m FROM PRESUPUESTO_DEPENDENCIA WHERE rubro='otros_recursos' AND subrubro='limpieza'`
    );
    checkCount('Dependencias con limpieza', csvLimp.length, dbLimp[0]?.c || 0);
    check('Monto total limpieza', 13311798, dbLimp[0]?.m || 0, 1);

    const csvTotalUnits = csvLimp.reduce((s, r) => s + num(r.total_unidades), 0);
    const [dbLimpUnits] = await conn.execute(
      `SELECT COALESCE(SUM(cantidad),0) AS u FROM PRESUPUESTO_DEPENDENCIA WHERE rubro='otros_recursos' AND subrubro='limpieza'`
    );
    check('Total unidades limpieza', csvTotalUnits, dbLimpUnits[0]?.u || 0, 1);
  }

  // ───────────── 6. FRUTAS/VERDURAS ─────────────
  printSection('6. FRUTAS/VERDURAS (frutas_verduras_semanal.csv vs PRESUPUESTO_DEPENDENCIA rubro=refrigerio_comida)');
  const fvPath = path.join(csvDir, 'frutas_verduras_semanal.csv');
  if (fs.existsSync(fvPath)) {
    const csvFv = readCsv(fvPath);
    const [dbFv] = await conn.execute(
      `SELECT COUNT(DISTINCT comedor_id) AS c FROM PRESUPUESTO_DEPENDENCIA WHERE rubro='refrigerio_comida'`
    );
    checkCount('Dependencias con frutas/verduras', csvFv.length, dbFv[0]?.c || 0);
  }

  // ───────────── 7. BENEFICIARIOS POR SERVICIO ─────────────
  printSection('7. BENEFICIARIOS (beneficiarios_por_servicio.csv vs RACION)');
  const benPath = path.join(csvDir, 'beneficiarios_por_servicio.csv');
  if (fs.existsSync(benPath)) {
    const csvBen = readCsv(benPath);
    const [dbRac] = await conn.execute(`SELECT COUNT(*) AS c FROM RACION`);
    checkCount('Filas beneficiarios/servicio', csvBen.length, dbRac[0]?.c || 0);
    const csvTotalBen = csvBen.reduce((s, r) => s + num(r.cantidad_beneficiarios), 0);
    const [dbBen] = await conn.execute(`SELECT COALESCE(SUM(cantidad_beneficiarios),0) AS t FROM RACION`);
    check('Total beneficiarios', csvTotalBen, dbBen[0]?.t || 0, 1);
  }

  // ───────────── 8. BECARIOS ─────────────
  printSection('8. BECARIOS (becarios.csv vs BECARIO_LINEA tipo=PERSONA)');
  const becPath = path.join(csvDir, 'becarios.csv');
  if (fs.existsSync(becPath)) {
    const csvBec = readCsv(becPath);
    const csvBecCount = csvBec.filter((r) => r.apellido && r.apellido.trim()).length;
    const [dbBec] = await conn.execute(`SELECT COUNT(*) AS c FROM BECARIO_LINEA WHERE tipo_linea='PERSONA'`);
    console.log(`  CSV becarios (personas con datos): ${csvBecCount}`);
    console.log(`  DB BECARIO_LINEA tipo=PERSONA: ${dbBec[0]?.c || 0}`);
    console.log(`  Nota: CSV contiene solo muestra de ${csvBecCount} personas; DB tiene ${dbBec[0]?.c || 0} (cargados desde Excel completo)`);
  }

  // ───────────── 9. PADRON INTERIOR ─────────────
  printSection('9. PADRON INTERIOR (padron_interior.csv vs COMEDOR ambito=INTERIOR)');
  const intPath = path.join(csvDir, 'padron_interior.csv');
  if (fs.existsSync(intPath)) {
    const csvInt = readCsv(intPath);
    const [dbInt] = await conn.execute(
      `SELECT COUNT(*) AS c FROM COMEDOR c JOIN ZONA z ON c.zona_id=z.zona_id WHERE z.ambito='INTERIOR'`
    );
    console.log(`  CSV padron_interior filas: ${csvInt.length}`);
    console.log(`  DB comedores INTERIOR: ${dbInt[0]?.c || 0}`);
    console.log(`  Nota: CSV tiene filas duplicadas (mismo comedor, distinto servicio COMIDA/REFRIGERIO)`);
    const uniqueNames = new Set(csvInt.map((r) => (r.centro_entrega || '').toUpperCase().trim()));
    checkCount('Centros de entrega únicos INTERIOR', uniqueNames.size, dbInt[0]?.c || 0);
  }

  // ───────────── 10. PRESUPUESTO POR PROGRAMA ─────────────
  printSection('10. PRESUPUESTO POR PROGRAMA (presupuesto_programas.csv)');
  const ppPath = path.join(csvDir, 'presupuesto_programas.csv');
  if (fs.existsSync(ppPath)) {
    const csvPP = readCsv(ppPath);
    for (const r of csvPP) {
      console.log(`  ${r.programa}: monto_mensual=$${num(r.monto_mensual).toLocaleString('es-AR')}`);
    }
  }

  // ───────────── RESUMEN FINAL ─────────────
  printSection('RESUMEN FINAL');
  console.log(`  Total checks: ${totalChecks}`);
  console.log(`  Pasaron: ${passed}  (${pct(passed, totalChecks)})`);
  console.log(`  Fallaron: ${failed}  (${pct(failed, totalChecks)})`);
  if (failed > 0) console.log('  ⚠ Hay discrepancias. Revisar secciones marcadas con ✗.');
  else console.log('  ✓ Todos los checks pasaron correctamente.');

  await conn.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
