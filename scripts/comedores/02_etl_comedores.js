/**
 * ETL Comedores (Opción B): crea esquema, carga catálogos, importa Interior (Anexo II) y Capital (Excel 1).
 * Uso: node 02_etl_comedores.js [--solo-crear] [--excel1 ruta] [--excel2 ruta] [--periodo "Plan Verano 2026"]
 * Requiere: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (o DB_NAME_COMEDORES), y opcionalmente .env
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');

const SCHEMA_PATH = path.join(__dirname, '01_schema_comedores.sql');

function parseArgs() {
  const args = { soloCrear: false, excel1: '', excel2: '', periodo: '' };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--solo-crear') args.soloCrear = true;
    else if (process.argv[i] === '--excel1' && process.argv[i + 1]) { args.excel1 = process.argv[++i]; }
    else if (process.argv[i] === '--excel2' && process.argv[i + 1]) { args.excel2 = process.argv[++i]; }
    else if (process.argv[i] === '--periodo' && process.argv[i + 1]) { args.periodo = process.argv[++i]; }
  }
  return args;
}

function getDbConfig() {
  const dbName = process.env.DB_NAME_COMEDORES || process.env.DB_NAME || 'informe';
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: dbName,
    multipleStatements: true,
  };
}

async function runSchema(conn) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    const u = stmt.toUpperCase().trim();
    if (u.startsWith('CREATE') || u.startsWith('ALTER')) {
      try {
        await conn.query(stmt);
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME' || err.errno === 1061) {
          // UNIQUE key already exists (ej. tabla creada con CREATE que ya lo incluye)
          continue;
        }
        throw err;
      }
    }
  }
  console.log('Esquema ejecutado.');
}

function normalizeHeader(str) {
  if (typeof str !== 'string') return '';
  return str.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalizeForMatch(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .trim();
}

/**
 * Busca la fila de encabezados en data: la primera fila (en las primeras maxRows)
 * donde al menos minMatches de los keywords aparecen en las celdas (normalizadas).
 * Si no se encuentra, devuelve 0.
 */
function findHeaderRow(data, keywords, minMatches = 2, maxRows = 10) {
  const limit = Math.min(maxRows, data.length);
  for (let r = 0; r < limit; r++) {
    const row = (data[r] || []).map((c) => normalizeForMatch(String(c)));
    const matchCount = keywords.filter((kw) => row.some((cell) => cell.includes(normalizeForMatch(kw)))).length;
    if (matchCount >= minMatches) return r;
  }
  return 0;
}

function sheetToArrayOfObjects(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (data.length < 2) return [];
  const headers = data[0].map((h) => normalizeHeader(h));
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    data[i].forEach((val, j) => { row[headers[j]] = val != null ? String(val).trim() : ''; });
    rows.push(row);
  }
  return rows;
}

function sheetToArrayOfObjectsWithHeaderSearch(workbook, sheetName, headerKeywords, log) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    if (log) log('  Hoja no encontrada en libro:', sheetName);
    return { rows: [], headerRowIndex: -1, rawRowCount: 0 };
  }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (log) log('  Filas crudas en hoja:', data.length, '| Primeras celdas fila 0:', (data[0] || []).slice(0, 5).join(' | '));
  if (data.length < 2) return { rows: [], headerRowIndex: -1, rawRowCount: data.length };
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(10, data.length); r++) {
    const row = (data[r] || []).map((c) => normalizeForMatch(String(c)));
    const matchCount = headerKeywords.filter((kw) => row.some((cell) => cell.includes(normalizeForMatch(kw)))).length;
    if (log && r < 3) log('  Fila', r, 'matchCount', matchCount, '| celdas:', row.slice(0, 6).join(', '));
    if (matchCount >= 3) {
      headerRowIndex = r;
      break;
    }
  }
  if (headerRowIndex < 0 && log) log('  AVISO: No se detectó fila de encabezados (ninguna fila con 3+ de:', headerKeywords.join(', ') + ')');
  const headers = (data[headerRowIndex] || []).map((h, j) => normalizeForMatch(String(h)) || 'COL' + j);
  if (log) log('  Fila de encabezados:', headerRowIndex, '| columnas:', headers.slice(0, 10).join(', '));
  const rows = [];
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = {};
    (data[i] || []).forEach((val, j) => { row[headers[j]] = val != null ? String(val).trim() : ''; });
    rows.push(row);
  }
  return { rows, headerRowIndex, rawRowCount: data.length };
}

async function loadCatalogos(conn) {
  const tipos = ['OFICIAL', 'SOLIDARIO', 'INSTITUCIONAL'];
  for (const n of tipos) {
    await conn.query('INSERT IGNORE INTO TIPO_COMEDOR (nombre) VALUES (?)', [n]);
  }
  const subtipos = [
    ['IGLESIA CATOLICA', 3], ['IGLESIA EVANGELICA', 3], ['ONG', 3], ['PRIVADO', null], ['INSTITUCIONAL', 3],
  ];
  for (const [nombre, tipoId] of subtipos) {
    await conn.query(
      'INSERT IGNORE INTO SUBTIPO_COMEDOR (nombre, tipo_id) VALUES (?, ?)',
      [nombre, tipoId]
    );
  }
  console.log('Catálogos TIPO y SUBTIPO cargados.');
}

async function etlInterior(conn, excel2Path, periodo) {
  console.log('[ETL Interior] Ruta recibida:', excel2Path, '| existe:', !!excel2Path && fs.existsSync(excel2Path));
  if (!excel2Path || !fs.existsSync(excel2Path)) {
    console.warn('ETL Interior: archivo no indicado o no existe:', excel2Path);
    return;
  }
  const wb = XLSX.readFile(excel2Path);
  console.log('[ETL Interior] Hojas en el libro:', wb.SheetNames.join(', '));
  const sheetName =
    wb.SheetNames.find(
      (n) => normalizeForMatch(n).includes('PADRON') && normalizeForMatch(n).includes('INTERIOR')
    ) || wb.SheetNames.find((n) => normalizeForMatch(n).includes('INTERIOR')) || 'PADRON INTERIOR';
  console.log('[ETL Interior] Hoja seleccionada:', sheetName);
  const headerKeywords = ['ZONA', 'CENTRO', 'LOCALIDAD', 'DIRECCION', 'BENEF', 'ORGANISMO'];
  const { rows } = sheetToArrayOfObjectsWithHeaderSearch(wb, sheetName, headerKeywords, (msg, ...rest) => console.log('[ETL Interior]', msg, ...rest));
  if (rows.length === 0) {
    console.warn('ETL Interior: no se encontraron filas de datos en', sheetName);
    return;
  }
  console.log('[ETL Interior] Filas de datos a procesar:', rows.length);

  const firstRow = rows[0];
  const keys = Object.keys(firstRow || {});
  console.log('[ETL Interior] Columnas detectadas (primeras 12):', keys.slice(0, 12).join(', '));
  const get = (row, ...candidates) => {
    const k = keys.find((key) => candidates.some((c) => key.includes(c) || key === c));
    return (row[k] != null ? row[k] : '').toString().trim();
  };

  let insertedZonas = 0;
  let insertedComedores = 0;
  let insertedRaciones = 0;
  let skipped = 0;

  for (const row of rows) {
    const zona = get(row, 'ZONA');
    const centroDist = get(row, 'CENTRO DE DISTRIBUCION', 'CENTRO DISTRIBUCIÓN');
    const centroEntrega = get(row, 'CENTRO DE ENTREGA', 'CENTRO ENTREGA');
    const direccion = get(row, 'DIRECCION', 'DIRECCIÓN');
    const telefono = get(row, 'TELEFONO');
    const departamento = get(row, 'DEPARTAMENTO');
    const localidad = get(row, 'LOCALIDAD');
    const benef = get(row, 'BENEF');
    const organismo = get(row, 'ORGANISMO');
    const detalleServ = get(row, 'DETALLE SERV', 'DETALLE SERV.');
    const stVal = get(row, 'ST');
    const observacionesVal = get(row, 'OBS', 'OBSERVACIONES');
    const observaciones = observacionesVal ? String(observacionesVal).trim().slice(0, 2000) || null : null;
    const planRef = periodo || null;

    if (!centroEntrega && !localidad && !zona) {
      skipped++;
      continue;
    }

    const ambito = 'INTERIOR';
    const codigo = (zona || '').slice(0, 10) || null;
    const nombreZona = zona || localidad || 'Sin nombre';

    const [zonaRows] = await conn.query(
      `SELECT zona_id FROM ZONA WHERE ambito = ? AND (codigo <=> ?) AND (departamento <=> ?) AND (localidad <=> ?) AND (centro_distribucion <=> ?) LIMIT 1`,
      [ambito, codigo || null, departamento || null, localidad || null, (centroDist || centroEntrega) || null]
    );
    let zonaId;
    if (zonaRows.length > 0) {
      zonaId = zonaRows[0].zona_id;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO ZONA (codigo, nombre, ambito, departamento, localidad, centro_distribucion) VALUES (?, ?, ?, ?, ?, ?)`,
        [codigo, nombreZona, ambito, departamento || null, localidad || null, (centroDist || centroEntrega) || null]
      );
      zonaId = ins.insertId;
      insertedZonas++;
    }

    let organismoId = null;
    if (organismo) {
      const [orgRows] = await conn.query('SELECT organismo_id FROM ORGANISMO WHERE nombre = ? LIMIT 1', [organismo]);
      if (orgRows.length > 0) organismoId = orgRows[0].organismo_id;
      else {
        const [oIns] = await conn.query('INSERT INTO ORGANISMO (nombre) VALUES (?)', [organismo]);
        organismoId = oIns.insertId;
      }
    }

    const nombreComedor = centroEntrega || centroDist || localidad || 'Sin nombre';
    const [comedorRows] = await conn.query(
      'SELECT comedor_id FROM COMEDOR WHERE nombre = ? AND zona_id = ? AND domicilio <=> ? LIMIT 1',
      [nombreComedor, zonaId, direccion || null]
    );
    let comedorId;
    if (comedorRows.length > 0) {
      comedorId = comedorRows[0].comedor_id;
    } else {
      const tel = (telefono && String(telefono).trim()) ? String(telefono).trim().slice(0, 200) : null;
      const [cIns] = await conn.query(
        `INSERT INTO COMEDOR (numero_oficial, nombre, domicilio, telefono, zona_id, organismo_id) VALUES (NULL, ?, ?, ?, ?, ?)`,
        [(nombreComedor || '').slice(0, 200), (direccion || '').slice(0, 200), tel, zonaId, organismoId]
      );
      comedorId = cIns.insertId;
      insertedComedores++;
    }

    let tipoServicio = 'AMBOS';
    if (detalleServ.toUpperCase().includes('COMIDA') && !detalleServ.toUpperCase().includes('REFRIGERIO')) tipoServicio = 'COMIDA';
    else if (detalleServ.toUpperCase().includes('REFRIGERIO') && !detalleServ.toUpperCase().includes('COMIDA')) tipoServicio = 'REFRIGERIO';
    const cantidad = parseInt(benef, 10) || null;
    let st = stVal ? parseFloat(String(stVal).replace(',', '.')) : null;
    if (st != null && Number.isNaN(st)) st = null;

    await conn.query(
      `INSERT INTO RACION (comedor_id, tipo_servicio, cantidad_beneficiarios, plan_ref, st, observaciones, periodo_inicio) VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [comedorId, tipoServicio, cantidad, planRef, st, observaciones]
    );
    insertedRaciones++;
  }

  console.log('ETL Interior: zonas +', insertedZonas, ', comedores +', insertedComedores, ', raciones +', insertedRaciones, '| filas omitidas (sin centro/localidad/zona):', skipped);
}

function parseDependencia(dep) {
  const d = (dep || '').toUpperCase();
  let tipoId = null;
  let subtipoId = null;
  if (d.includes('OFICIAL')) tipoId = 1;
  else if (d.includes('SOLIDARIO')) tipoId = 2;
  else if (d.includes('INSTITUCIONAL')) tipoId = 3;
  if (d.includes('IGLESIA EVANGELICA')) subtipoId = 2;
  else if (d.includes('IGLESIA CATOLICA') || d.includes('IGLESIA CATÓLICA')) subtipoId = 1;
  else if (d.includes('ONG')) subtipoId = 3;
  return { tipoId, subtipoId };
}

function parseCoord(val) {
  if (val == null || String(val).trim() === '') return null;
  const n = parseFloat(String(val).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

function isValidLat(n) { return n != null && n >= -90 && n <= 90; }
function isValidLng(n) { return n != null && n >= -180 && n <= 180; }

function parseLink(val) {
  if (val == null || String(val).trim() === '') return null;
  const s = String(val).trim();
  if (/^https?:\/\//i.test(s)) return s.slice(0, 2048);
  return null;
}

async function etlCapital(conn, excel1Path, periodo) {
  console.log('[ETL Capital] Ruta recibida:', excel1Path, '| existe:', !!excel1Path && fs.existsSync(excel1Path));
  if (!excel1Path || !fs.existsSync(excel1Path)) {
    console.warn('ETL Capital: archivo no indicado o no existe:', excel1Path);
    return;
  }
  const wb = XLSX.readFile(excel1Path);
  console.log('[ETL Capital] Hojas:', wb.SheetNames.join(', '));

  const zonasCapital = [
    { codigo: 'I', nombre: 'ZONA I (CAPITAL)' },
    { codigo: 'II', nombre: 'ZONA II (CAPITAL)' },
    { codigo: 'III', nombre: 'ZONA III (CAPITAL)' },
    { codigo: 'N', nombre: 'ZONA NORTE (CAPITAL)' },
  ];
  for (const z of zonasCapital) {
    const [ex] = await conn.query('SELECT zona_id FROM ZONA WHERE ambito = ? AND codigo = ? LIMIT 1', ['CAPITAL', z.codigo]);
    if (ex.length === 0) {
      await conn.query(
        'INSERT INTO ZONA (codigo, nombre, ambito) VALUES (?, ?, ?)',
        [z.codigo, z.nombre, 'CAPITAL']
      );
    }
  }

  const getSheetRows = (name) => {
    const sheet = wb.Sheets[name];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  };

  const resolveZonaId = async (nombreZona) => {
    const m = (nombreZona || '').match(/ZONA\s*(I|II|III|NORTE|N)/i);
    const cod = m ? (m[1].toUpperCase() === 'NORTE' ? 'N' : m[1].toUpperCase()) : null;
    if (!cod) return null;
    const [r] = await conn.query('SELECT zona_id FROM ZONA WHERE ambito = ? AND codigo = ? LIMIT 1', ['CAPITAL', cod]);
    return r.length ? r[0].zona_id : null;
  };

  const resolveOrInsertComedor = async (numeroOficial, nombre, domicilio, zonaId, tipoId, subtipoId, responsable, dni) => {
    const num = (numeroOficial != null && String(numeroOficial).trim() !== '' && String(numeroOficial).toUpperCase() !== 'S/N')
      ? String(numeroOficial).trim()
      : null;
    if (num) {
      const [ex] = await conn.query('SELECT comedor_id FROM COMEDOR WHERE numero_oficial = ? LIMIT 1', [num]);
      if (ex.length > 0) return ex[0].comedor_id;
    }
    const [ins] = await conn.query(
      `INSERT INTO COMEDOR (numero_oficial, nombre, domicilio, zona_id, tipo_id, subtipo_id, responsable_nombre, responsable_dni) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [num, (nombre || 'Sin nombre').slice(0, 120), (domicilio || '').slice(0, 200), zonaId, tipoId, subtipoId, (responsable || '').slice(0, 120) || null, (dni || '').slice(0, 15) || null]
    );
    return ins.insertId;
  };

  let zonaIdActual = null;
  const comedoresByNum = new Map();

  const sheetFv = wb.SheetNames.find((n) => n.toUpperCase().includes('FRUTAS') && n.toUpperCase().includes('VERDURAS'));
  const isHeaderLike = (cell) => /^(Nº|COMEDOR|NUMERO|N|DOMICILIO)$/i.test(String(cell || '').trim());
  if (sheetFv) {
    const data = getSheetRows(sheetFv);
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const firstCell = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (firstCell.startsWith('ZONA') && (firstCell.includes('CAPITAL') || firstCell.includes('I') || firstCell.includes('II') || firstCell.includes('III') || firstCell.includes('NORTE'))) {
        zonaIdActual = await resolveZonaId(firstCell);
        continue;
      }
      if (isHeaderLike(row[0]) || isHeaderLike(row[1])) continue;
      const numComedor = row[1];
      const nombre = row[2];
      const domicilio = row[3];
      if (nombre && (numComedor !== undefined || nombre !== '')) {
        const num = numComedor != null ? String(numComedor).trim() : null;
        const key = num || `n-${(nombre || '').slice(0, 50)}-${(domicilio || '').slice(0, 50)}`;
        if (!comedoresByNum.has(key) && zonaIdActual) {
          const id = await resolveOrInsertComedor(num, nombre, domicilio, zonaIdActual, null, null, null, null);
          comedoresByNum.set(key, id);
        }
      }
    }
  }

  const getComedorId = (numComedor, nombre, domicilio) => {
    const num = numComedor != null && String(numComedor).trim() !== '' && String(numComedor).toUpperCase() !== 'S/N' ? String(numComedor).trim() : null;
    const key = num || `n-${(nombre || '').slice(0, 50)}-${(domicilio || '').slice(0, 50)}`;
    return comedoresByNum.get(key) || null;
  };

  const sheetCarne = wb.SheetNames.find((n) => n.toUpperCase().includes('CARNE'));
  if (sheetCarne) {
    const data = getSheetRows(sheetCarne);
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const firstCell = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (firstCell.startsWith('ZONA')) {
        zonaIdActual = await resolveZonaId(firstCell);
        continue;
      }
      if (isHeaderLike(row[0]) || isHeaderLike(row[1])) continue;
      const numComedor = row[1];
      const nombre = row[2];
      const domicilio = row[3];
      if (nombre && zonaIdActual) {
        const num = numComedor != null ? String(numComedor).trim() : null;
        const key = num || `n-${(nombre || '').slice(0, 50)}-${(domicilio || '').slice(0, 50)}`;
        if (!comedoresByNum.has(key)) {
          const id = await resolveOrInsertComedor(num, nombre, domicilio, zonaIdActual, null, null, null, null);
          comedoresByNum.set(key, id);
        }
      }
    }
  }

  const toNum = (v) => (v === '' || v == null ? 0 : parseInt(v, 10) || parseFloat(String(v).replace(',', '.')) || 0);

  if (sheetFv) {
    const data = getSheetRows(sheetFv);
    zonaIdActual = null;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const firstCell = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (firstCell.startsWith('ZONA')) {
        zonaIdActual = await resolveZonaId(firstCell);
        continue;
      }
      if (isHeaderLike(row[0]) || isHeaderLike(row[1])) continue;
      const numComedor = row[1];
      const nombre = row[2];
      const domicilio = row[3];
      const cid = getComedorId(numComedor, nombre, domicilio);
      if (!cid || !zonaIdActual) continue;
      const cebolla = toNum(row[4]);
      const zanahoria = toNum(row[5]);
      const zapallo = toNum(row[6]);
      const papa = toNum(row[7]);
      const acelga = toNum(row[8]);
      const frutas = toNum(row[9]);
      if (cebolla || zanahoria || zapallo || papa || acelga || frutas) {
        await conn.query(
          `INSERT INTO BENEFICIO_FRESCOS (comedor_id, cebolla_kg, zanahoria_kg, zapallo_kg, papa_kg, acelga_kg, frutas_unidades, periodo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE cebolla_kg = VALUES(cebolla_kg), zanahoria_kg = VALUES(zanahoria_kg), zapallo_kg = VALUES(zapallo_kg), papa_kg = VALUES(papa_kg), acelga_kg = VALUES(acelga_kg), frutas_unidades = VALUES(frutas_unidades)`,
          [cid, cebolla, zanahoria, zapallo, papa, acelga, frutas, periodo || null]
        );
      }
    }
  }

  if (sheetCarne) {
    const data = getSheetRows(sheetCarne);
    zonaIdActual = null;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const firstCell = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (firstCell.startsWith('ZONA')) {
        zonaIdActual = await resolveZonaId(firstCell);
        continue;
      }
      if (isHeaderLike(row[0]) || isHeaderLike(row[1])) continue;
      const numComedor = row[1];
      const nombre = row[2];
      const domicilio = row[3];
      const cid = getComedorId(numComedor, nombre, domicilio);
      if (!cid) continue;
      const vacuno = toNum(row[4]);
      const pollo = toNum(row[5]);
      const cerdo = toNum(row[6]);
      if (vacuno || pollo || cerdo) {
        await conn.query(
          `INSERT INTO BENEFICIO_FRESCOS (comedor_id, carne_vacuna_kg, pollo_kg, cerdo_kg, periodo)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE carne_vacuna_kg = VALUES(carne_vacuna_kg), pollo_kg = VALUES(pollo_kg), cerdo_kg = VALUES(cerdo_kg)`,
          [cid, vacuno, pollo, cerdo, periodo || null]
        );
      }
    }
  }

  const sheetGas = wb.SheetNames.find((n) => n.toUpperCase() === 'GAS');
  if (sheetGas) {
    const data = getSheetRows(sheetGas);
    const gasKeywords = ['Nº', 'NUMERO', 'COMEDOR', '10', '15', '45', 'GARRAFA'];
    const headerRowGas = findHeaderRow(data, gasKeywords, 2);
    const headers = (data[headerRowGas] || []).map((h) => normalizeHeader(String(h)));
    const idxNum = headers.findIndex((h) => h.includes('Nº') || h === 'N' || h.includes('NUMERO'));
    const idxComedor = headers.findIndex((h) => h.includes('COMEDOR'));
    const idx10 = headers.findIndex((h) => h.includes('10'));
    const idx15 = headers.findIndex((h) => h.includes('15'));
    const idx45 = headers.findIndex((h) => h.includes('45'));
    const idxDomicilioGas = headers.findIndex((h) => h.includes('DOMICILIO'));
    const idxResponsableGas = headers.findIndex((h) => h.includes('RESPONSABLE'));
    const idxDniGas = headers.findIndex((h) => h.includes('DNI'));
    const idxDependenciaGas = headers.findIndex((h) => h.includes('DEPENDENCIA'));
    const idxLinkGas = headers.findIndex((h) => /LINK|MAPS|URL|GOOGLE|ENLACE/i.test(h));
    const idxLatGas = headers.findIndex((h) => /^LAT$|LATITUD|COORDENADAS/i.test(h));
    const idxLngGas = headers.findIndex((h) => /^LNG$|LONG|LONGITUD/i.test(h));
    for (let i = headerRowGas + 1; i < data.length; i++) {
      const row = data[i];
      const num = idxNum >= 0 ? row[idxNum] : row[1];
      const nombre = idxComedor >= 0 ? row[idxComedor] : row[2];
      const cid = getComedorId(num, nombre, idxDomicilioGas >= 0 ? row[idxDomicilioGas] : row[3]);
      if (!cid) continue;
      const responsable = (idxResponsableGas >= 0 ? row[idxResponsableGas] : null) != null ? String(row[idxResponsableGas]).trim().slice(0, 200) || null : null;
      const dni = (idxDniGas >= 0 ? row[idxDniGas] : null) != null ? String(row[idxDniGas]).trim().slice(0, 15) || null : null;
      const dep = idxDependenciaGas >= 0 ? row[idxDependenciaGas] : null;
      if (responsable || dni) {
        await conn.query(
          'UPDATE COMEDOR SET responsable_nombre = COALESCE(?, responsable_nombre), responsable_dni = COALESCE(?, responsable_dni) WHERE comedor_id = ?',
          [responsable || null, dni || null, cid]
        );
      }
      if (dep != null && String(dep).trim() !== '') {
        const { tipoId, subtipoId } = parseDependencia(String(dep));
        if (tipoId != null || subtipoId != null) {
          await conn.query(
            'UPDATE COMEDOR SET tipo_id = COALESCE(?, tipo_id), subtipo_id = COALESCE(?, subtipo_id) WHERE comedor_id = ?',
            [tipoId, subtipoId, cid]
          );
        }
      }
      const linkGas = idxLinkGas >= 0 ? parseLink(row[idxLinkGas]) : null;
      const latGas = idxLatGas >= 0 ? parseCoord(row[idxLatGas]) : null;
      const lngGas = idxLngGas >= 0 ? parseCoord(row[idxLngGas]) : null;
      if (linkGas || (isValidLat(latGas) && isValidLng(lngGas))) {
        await conn.query(
          'UPDATE COMEDOR SET link_google_maps = COALESCE(?, link_google_maps), coordenadas_lat = COALESCE(?, coordenadas_lat), coordenadas_lng = COALESCE(?, coordenadas_lng) WHERE comedor_id = ?',
          [linkGas, isValidLat(latGas) ? latGas : null, isValidLng(lngGas) ? lngGas : null, cid]
        );
      }
      const g10 = toNum(idx10 >= 0 ? row[idx10] : null);
      const g15 = toNum(idx15 >= 0 ? row[idx15] : null);
      const g45 = toNum(idx45 >= 0 ? row[idx45] : null);
      if (g10 || g15 || g45) {
        await conn.query(
          `INSERT INTO BENEFICIO_GAS (comedor_id, garrafas_10kg, garrafas_15kg, garrafas_45kg, periodo) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE garrafas_10kg = VALUES(garrafas_10kg), garrafas_15kg = VALUES(garrafas_15kg), garrafas_45kg = VALUES(garrafas_45kg)`,
          [cid, g10, g15, g45, periodo || null]
        );
      }
    }
  }

  const sheetLimp = wb.SheetNames.find((n) => n.toUpperCase().includes('LIMPIEZA') && n.toUpperCase().includes('ART'));
  if (sheetLimp) {
    const data = getSheetRows(sheetLimp);
    const limpKeywords = ['LAVANDINA', 'DETERGENTE', 'DESENGRASANTE', 'TRAPO', 'REJILLA', 'VIRULANA', 'ESPONJA', 'ESCOBILLON', 'ESCURRIDOR'];
    const headerRowLimp = findHeaderRow(data, limpKeywords, 2);
    const headersLimp = (data[headerRowLimp] || []).map((h) => normalizeHeader(String(h)));
    let idxNum = headersLimp.findIndex((h) => (h.includes('Nº') || h === 'N' || h.includes('NUMERO')) && h.includes('COMEDOR'));
    if (idxNum < 0) idxNum = headersLimp.findIndex((h) => h.includes('Nº') || h === 'N' || h.includes('NUMERO'));
    let idxComedorName = headersLimp.findIndex((h) => h.includes('COMEDOR') && !h.includes('Nº'));
    if (idxComedorName < 0) idxComedorName = headersLimp.findIndex((h) => h.includes('COMEDOR'));
    const idxLav = headersLimp.findIndex((h) => h.includes('LAVANDINA'));
    const idxDet = headersLimp.findIndex((h) => h.includes('DETERGENTE'));
    const idxDes = headersLimp.findIndex((h) => h.includes('DESENGRASANTE'));
    const idxTrapoPiso = headersLimp.findIndex((h) => h.includes('TRAPO') && h.includes('PISO'));
    const idxRejilla = headersLimp.findIndex((h) => h.includes('REJILLA'));
    const idxVir = headersLimp.findIndex((h) => h.includes('VIRULANA'));
    const idxEsp = headersLimp.findIndex((h) => h.includes('ESPONJA'));
    const idxEscb = headersLimp.findIndex((h) => h.includes('ESCOBILLON'));
    const idxEscur = headersLimp.findIndex((h) => h.includes('ESCURRIDOR'));
    const idxDomicilioLimp = headersLimp.findIndex((h) => h.includes('DOMICILIO'));
    const capNum = (v, max = 10000) => (v > max ? 0 : v);
    for (let i = headerRowLimp + 1; i < data.length; i++) {
      const row = data[i];
      const num = idxNum >= 0 ? row[idxNum] : row[1];
      const nombre = (idxComedorName >= 0 ? row[idxComedorName] : row[2]) || row[1];
      const cid = getComedorId(num, nombre, idxDomicilioLimp >= 0 ? row[idxDomicilioLimp] : row[3]);
      if (!cid) continue;
      const lav = capNum(toNum(idxLav >= 0 ? row[idxLav] : null));
      const det = capNum(toNum(idxDet >= 0 ? row[idxDet] : null));
      const des = capNum(toNum(idxDes >= 0 ? row[idxDes] : null));
      const tp = capNum(toNum(idxTrapoPiso >= 0 ? row[idxTrapoPiso] : null));
      const tr = capNum(toNum(idxRejilla >= 0 ? row[idxRejilla] : null));
      const vir = capNum(toNum(idxVir >= 0 ? row[idxVir] : null));
      const esp = capNum(toNum(idxEsp >= 0 ? row[idxEsp] : null));
      const escb = capNum(toNum(idxEscb >= 0 ? row[idxEscb] : null));
      const escur = capNum(toNum(idxEscur >= 0 ? row[idxEscur] : null));
      if (lav || det || des || tp || tr || vir || esp || escb || escur) {
        await conn.query(
          `INSERT INTO BENEFICIO_LIMPIEZA (comedor_id, lavandina_4lt, detergente_45lt, desengrasante_5lt, trapo_piso, trapo_rejilla, virulana, esponja, escobillon, escurridor, periodo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE lavandina_4lt = VALUES(lavandina_4lt), detergente_45lt = VALUES(detergente_45lt), desengrasante_5lt = VALUES(desengrasante_5lt), trapo_piso = VALUES(trapo_piso), trapo_rejilla = VALUES(trapo_rejilla), virulana = VALUES(virulana), esponja = VALUES(esponja), escobillon = VALUES(escobillon), escurridor = VALUES(escurridor)`,
          [cid, lav, det, des, tp, tr, vir, esp, escb, escur, periodo || null]
        );
      }
    }
  }

  const sheetFum = wb.SheetNames.find((n) => n.toUpperCase().includes('FUMIGACION'));
  if (sheetFum) {
    const data = getSheetRows(sheetFum);
    const fumKeywords = ['Nº', 'NUMERO', 'COMEDOR', 'RESPONSABLE', 'DNI', 'DEPENDENCIA'];
    const headerRowFum = findHeaderRow(data, fumKeywords, 2);
    const headersFum = (data[headerRowFum] || []).map((h) => normalizeHeader(String(h)));
    const idxNum = headersFum.findIndex((h) => h.includes('Nº') || h === 'N' || h.includes('NUMERO'));
    const idxComedor = headersFum.findIndex((h) => h.includes('COMEDOR'));
    const idxDomicilioFum = headersFum.findIndex((h) => h.includes('DOMICILIO'));
    const idxResponsable = headersFum.findIndex((h) => h.includes('RESPONSABLE'));
    const idxDni = headersFum.findIndex((h) => h.includes('DNI'));
    const idxDependencia = headersFum.findIndex((h) => h.includes('DEPENDENCIA'));
    const idxLinkFum = headersFum.findIndex((h) => /LINK|MAPS|URL|GOOGLE|ENLACE/i.test(h));
    const idxLatFum = headersFum.findIndex((h) => /^LAT$|LATITUD|COORDENADAS/i.test(h));
    const idxLngFum = headersFum.findIndex((h) => /^LNG$|LONG|LONGITUD/i.test(h));
    for (let i = headerRowFum + 1; i < data.length; i++) {
      const row = data[i];
      const num = idxNum >= 0 ? row[idxNum] : row[1];
      const nombre = idxComedor >= 0 ? row[idxComedor] : row[2];
      const cid = getComedorId(num, nombre, idxDomicilioFum >= 0 ? row[idxDomicilioFum] : row[3]);
      if (!cid) continue;
      const responsable = (idxResponsable >= 0 ? row[idxResponsable] : null) != null ? String(row[idxResponsable]).trim().slice(0, 200) || null : null;
      const dni = (idxDni >= 0 ? row[idxDni] : null) != null ? String(row[idxDni]).trim().slice(0, 15) || null : null;
      const dep = idxDependencia >= 0 ? row[idxDependencia] : null;
      if (responsable || dni) {
        await conn.query(
          'UPDATE COMEDOR SET responsable_nombre = COALESCE(?, responsable_nombre), responsable_dni = COALESCE(?, responsable_dni) WHERE comedor_id = ?',
          [responsable || null, dni || null, cid]
        );
      }
      if (dep != null && String(dep).trim() !== '') {
        const { tipoId, subtipoId } = parseDependencia(String(dep));
        if (tipoId != null || subtipoId != null) {
          await conn.query(
            'UPDATE COMEDOR SET tipo_id = COALESCE(?, tipo_id), subtipo_id = COALESCE(?, subtipo_id) WHERE comedor_id = ?',
            [tipoId, subtipoId, cid]
          );
        }
      }
      const linkFum = idxLinkFum >= 0 ? parseLink(row[idxLinkFum]) : null;
      const latFum = idxLatFum >= 0 ? parseCoord(row[idxLatFum]) : null;
      const lngFum = idxLngFum >= 0 ? parseCoord(row[idxLngFum]) : null;
      if (linkFum || (isValidLat(latFum) && isValidLng(lngFum))) {
        await conn.query(
          'UPDATE COMEDOR SET link_google_maps = COALESCE(?, link_google_maps), coordenadas_lat = COALESCE(?, coordenadas_lat), coordenadas_lng = COALESCE(?, coordenadas_lng) WHERE comedor_id = ?',
          [linkFum, isValidLat(latFum) ? latFum : null, isValidLng(lngFum) ? lngFum : null, cid]
        );
      }
      await conn.query(
        `INSERT INTO BENEFICIO_FUMIGACION (comedor_id, periodo) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE periodo = VALUES(periodo)`,
        [cid, periodo || null]
      );
    }
  }

  console.log('ETL Capital: comedores en mapa', comedoresByNum.size);
}

/**
 * Carga enlace Google Maps y coordenadas desde la hoja PADRON CAPITAL del Excel Anexo II (excel2).
 * Actualiza COMEDOR para comedores Capital que coincidan por nombre/domicilio.
 */
async function etlPadronCapital(conn, excel2Path) {
  if (!excel2Path || !fs.existsSync(excel2Path)) {
    console.warn('[ETL Padrón Capital] Archivo no indicado o no existe:', excel2Path);
    return;
  }
  const wb = XLSX.readFile(excel2Path);
  const sheetName =
    wb.SheetNames.find(
      (n) => normalizeForMatch(n).includes('PADRON') && normalizeForMatch(n).includes('CAPITAL')
    ) || wb.SheetNames.find((n) => normalizeForMatch(n).includes('CAPITAL')) || 'PADRON CAPITAL';
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.warn('[ETL Padrón Capital] No se encontró hoja:', sheetName);
    return;
  }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const keywords = ['COMEDOR', 'CENTRO', 'DIRECCION', 'DOMICILIO', 'ENLACE', 'GOOGLE', 'MAPS', 'COORDENADAS'];
  const headerRow = findHeaderRow(data, keywords, 2, 15);
  const headers = (data[headerRow] || []).map((h) => normalizeForMatch(String(h)));
  const getIdx = (patterns) => {
    for (const p of patterns) {
      const q = normalizeForMatch(String(p));
      const i = headers.findIndex((h) => h.includes(q) || h === q);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idxNombre = getIdx(['COMEDOR', 'CENTRO DE ENTREGA', 'CENTRO ENTREGA', 'CENTRO', 'NOMBRE']);
  const idxDomicilio = getIdx(['DIRECCION', 'DIRECCIÓN', 'DOMICILIO']);
  const idxLink = getIdx(['ENLACE GOOGLE MAPS', 'ENLANCE GOOGLE MAPS', 'ENLACE', 'LINK', 'MAPS', 'GOOGLE', 'URL']);
  const idxCoordenadas = getIdx(['COORDENADAS']);
  function parseCoordenadas(val) {
    if (val == null || String(val).trim() === '') return null;
    const s = String(val).replace(/,/g, ' ').replace(/;/g, ' ').trim();
    const parts = s.split(/\s+/).filter((p) => p !== '');
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0].replace(',', '.'));
    const lng = parseFloat(parts[1].replace(',', '.'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }
  let updated = 0;
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    const nombre = (row[idxNombre] != null ? String(row[idxNombre]).trim() : '').slice(0, 200);
    if (!nombre) continue;
    const domicilio = idxDomicilio >= 0 && row[idxDomicilio] != null ? String(row[idxDomicilio]).trim().slice(0, 200) || null : null;
    const link = idxLink >= 0 ? parseLink(row[idxLink]) : null;
    const coord = idxCoordenadas >= 0 ? parseCoordenadas(row[idxCoordenadas]) : null;
    const lat = coord ? coord.lat : null;
    const lng = coord ? coord.lng : null;
    if (!link && !(isValidLat(lat) && isValidLng(lng))) continue;
    const [comedores] = await conn.query(
      `SELECT c.comedor_id FROM COMEDOR c
       INNER JOIN ZONA z ON z.zona_id = c.zona_id
       WHERE z.ambito = 'CAPITAL'
         AND TRIM(c.nombre) = ?
       LIMIT 1`,
      [nombre]
    );
    if (comedores.length === 0 && domicilio) {
      const [byDom] = await conn.query(
        `SELECT c.comedor_id FROM COMEDOR c
         INNER JOIN ZONA z ON z.zona_id = c.zona_id
         WHERE z.ambito = 'CAPITAL'
           AND (TRIM(c.domicilio) = ? OR c.domicilio LIKE ?)
         LIMIT 1`,
        [domicilio, `%${domicilio.slice(0, 50)}%`]
      );
      if (byDom.length > 0) {
        await conn.query(
          'UPDATE COMEDOR SET link_google_maps = COALESCE(?, link_google_maps), coordenadas_lat = COALESCE(?, coordenadas_lat), coordenadas_lng = COALESCE(?, coordenadas_lng) WHERE comedor_id = ?',
          [link || null, isValidLat(lat) ? lat : null, isValidLng(lng) ? lng : null, byDom[0].comedor_id]
        );
        updated++;
      }
      continue;
    }
    if (comedores.length > 0) {
      await conn.query(
        'UPDATE COMEDOR SET link_google_maps = COALESCE(?, link_google_maps), coordenadas_lat = COALESCE(?, coordenadas_lat), coordenadas_lng = COALESCE(?, coordenadas_lng) WHERE comedor_id = ?',
        [link || null, isValidLat(lat) ? lat : null, isValidLng(lng) ? lng : null, comedores[0].comedor_id]
      );
      updated++;
    }
  }
  console.log('[ETL Padrón Capital] Comedores actualizados con enlace/coordenadas:', updated);
}

async function logResumen(conn) {
  const tablas = ['TIPO_COMEDOR', 'SUBTIPO_COMEDOR', 'ORGANISMO', 'ZONA', 'COMEDOR', 'RACION', 'BENEFICIO_GAS', 'BENEFICIO_LIMPIEZA', 'BENEFICIO_FUMIGACION', 'BENEFICIO_FRESCOS'];
  console.log('\n--- Resumen en BD (filas por tabla) ---');
  for (const t of tablas) {
    try {
      const [r] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      console.log('  ', t + ':', r[0].n);
    } catch (e) {
      console.log('  ', t + ': (tabla no existe o error)', e.message);
    }
  }
  console.log('--- Fin resumen ---\n');
}

async function main() {
  const args = parseArgs();
  const config = getDbConfig();
  if (!config.user || !config.password) {
    console.error('Faltan DB_USER y DB_PASSWORD en el entorno (o .env).');
    process.exit(1);
  }

  const conn = await mysql.createConnection(config);
  try {
    await runSchema(conn);
    if (args.soloCrear) {
      console.log('Modo --solo-crear: solo se ejecutó el esquema.');
      return;
    }
    await loadCatalogos(conn);
    const excel2Path = path.isAbsolute(args.excel2) ? args.excel2 : path.resolve(process.cwd(), args.excel2 || '');
    const excel1Path = path.isAbsolute(args.excel1) ? args.excel1 : path.resolve(process.cwd(), args.excel1 || '');
    if (args.excel2) await etlInterior(conn, excel2Path, args.periodo);
    if (args.excel1) await etlCapital(conn, excel1Path, args.periodo);
    if (args.excel2) await etlPadronCapital(conn, excel2Path);
    await logResumen(conn);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
