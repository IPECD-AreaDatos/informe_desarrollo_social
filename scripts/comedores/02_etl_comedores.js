/**
 * ETL Comedores (Opción B): crea esquema, carga catálogos, importa Interior (Anexo II) y Capital (Excel 1).
 * Uso: node 02_etl_comedores.js [--solo-crear] [--excel1 ruta] [--excel2 ruta] [--periodo "Plan Verano 2026"]
 * Requiere: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (o DB_NAME_COMEDORES), y opcionalmente .env
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');

const SCHEMA_PATH = path.join(__dirname, '01_schema_comedores.sql');

function parseArgs() {
  const args = { soloCrear: false, excel1: '', excel2: '', periodo: '', marzoDir: '' };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--solo-crear') args.soloCrear = true;
    else if (process.argv[i] === '--excel1' && process.argv[i + 1]) { args.excel1 = process.argv[++i]; }
    else if (process.argv[i] === '--excel2' && process.argv[i + 1]) { args.excel2 = process.argv[++i]; }
    else if (process.argv[i] === '--periodo' && process.argv[i + 1]) { args.periodo = process.argv[++i]; }
    else if (process.argv[i] === '--marzo-dir' && process.argv[i + 1]) { args.marzoDir = process.argv[++i]; }
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

/** Columnas de desglose Teknofood: migración suave si la tabla venía de un CREATE anterior sin ellas (MySQL no soporta ADD COLUMN IF NOT EXISTS). */
async function ensurePresupuestoTeknofoodColumns(conn, databaseName) {
  const dbName =
    databaseName || conn.config?.database || process.env.DB_NAME_COMEDORES || process.env.DB_NAME || 'informe';
  try {
    const [t] = await conn.query(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'PRESUPUESTO_TEKNOFOOD'`,
      [dbName]
    );
    if (!t[0] || Number(t[0].n) === 0) return;
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'PRESUPUESTO_TEKNOFOOD'`,
      [dbName]
    );
    const names = new Set((cols || []).map((r) => r.COLUMN_NAME));
    if (!names.has('cantidad_comida')) {
      await conn.query(
        'ALTER TABLE PRESUPUESTO_TEKNOFOOD ADD COLUMN cantidad_comida DECIMAL(18,0) NULL AFTER cantidad'
      );
    }
    if (!names.has('cantidad_refrigerio')) {
      await conn.query(
        'ALTER TABLE PRESUPUESTO_TEKNOFOOD ADD COLUMN cantidad_refrigerio DECIMAL(18,0) NULL AFTER cantidad_comida'
      );
    }
    const [cols2] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'PRESUPUESTO_TEKNOFOOD'`,
      [dbName]
    );
    const names2 = new Set((cols2 || []).map((r) => r.COLUMN_NAME));
    try {
      await conn.query(
        'ALTER TABLE PRESUPUESTO_TEKNOFOOD MODIFY COLUMN cantidad DECIMAL(20,0) NULL DEFAULT 0'
      );
      await conn.query(
        'ALTER TABLE PRESUPUESTO_TEKNOFOOD MODIFY COLUMN precio_unitario DECIMAL(18,2) NULL'
      );
      await conn.query('ALTER TABLE PRESUPUESTO_TEKNOFOOD MODIFY COLUMN monto DECIMAL(20,2) NULL DEFAULT 0');
      if (names2.has('cantidad_comida')) {
        await conn.query(
          'ALTER TABLE PRESUPUESTO_TEKNOFOOD MODIFY COLUMN cantidad_comida DECIMAL(18,0) NULL'
        );
        await conn.query(
          'ALTER TABLE PRESUPUESTO_TEKNOFOOD MODIFY COLUMN cantidad_refrigerio DECIMAL(18,0) NULL'
        );
      }
    } catch (e) {
      console.warn('[ETL] Tipos numéricos PRESUPUESTO_TEKNOFOOD:', e.message);
    }
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060) return;
    throw e;
  }
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
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cache en memoria del padrón COMEDOR para resolver por nombre normalizado (misma lógica que normalizeForMatch). */
let comedorLookupCache = null;

function invalidateComedorLookupCache() {
  comedorLookupCache = null;
}

async function buildComedorLookupCache(conn) {
  if (comedorLookupCache) return comedorLookupCache;
  const [rows] = await conn.query(
    `SELECT comedor_id, numero_oficial, nombre, domicilio FROM COMEDOR`
  );
  const byNum = new Map();
  const byNombreNorm = new Map();
  for (const r of rows) {
    const num = r.numero_oficial != null ? String(r.numero_oficial).trim() : '';
    if (num && num.toUpperCase() !== 'S/N' && !byNum.has(num)) {
      byNum.set(num, r.comedor_id);
    }
    const nk = normalizeForMatch(String(r.nombre || ''));
    if (nk) {
      if (!byNombreNorm.has(nk)) byNombreNorm.set(nk, []);
      byNombreNorm.get(nk).push(r);
    }
  }
  comedorLookupCache = { byNum, byNombreNorm };
  return comedorLookupCache;
}

function pickComedorFromNombreNormCandidates(candidates, domicilio) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].comedor_id;
  const domN = normalizeForMatch(String(domicilio || ''));
  if (!domN) {
    console.warn(
      '[resolveComedor] Mismo nombre normalizado en varios comedores; sin domicilio para desambiguar; uso el primero (comedor_id:',
      candidates[0].comedor_id,
      ')'
    );
    return candidates[0].comedor_id;
  }
  const scored = candidates.map((c) => {
    const dn = normalizeForMatch(String(c.domicilio || ''));
    if (!dn) return { id: c.comedor_id, score: 0 };
    if (dn === domN) return { id: c.comedor_id, score: 3 };
    if (dn.includes(domN) || domN.includes(dn)) return { id: c.comedor_id, score: 2 };
    return { id: c.comedor_id, score: 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) return scored[0].id;
  console.warn(
    '[resolveComedor] Mismo nombre en varios comedores; domicilio no coincide; uso el primero (comedor_id:',
    candidates[0].comedor_id,
    ')'
  );
  return candidates[0].comedor_id;
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

  const [delRac] = await conn.query(`DELETE FROM RACION`);
  console.log('[ETL Interior] RACION limpiada: eliminadas', delRac.affectedRows, 'filas previas');

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

    const [existRac] = await conn.query(
      `SELECT racion_id FROM RACION WHERE comedor_id = ? AND tipo_servicio = ? AND plan_ref <=> ? LIMIT 1`,
      [comedorId, tipoServicio, planRef]
    );
    if (existRac.length > 0) {
      await conn.query(
        `UPDATE RACION SET cantidad_beneficiarios = ?, st = ?, observaciones = ? WHERE racion_id = ?`,
        [cantidad, st, observaciones, existRac[0].racion_id]
      );
    } else {
      await conn.query(
        `INSERT INTO RACION (comedor_id, tipo_servicio, cantidad_beneficiarios, plan_ref, st, observaciones, periodo_inicio) VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
        [comedorId, tipoServicio, cantidad, planRef, st, observaciones]
      );
    }
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

function parseDniCell(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    if (Math.abs(val) >= 1e7) return String(Math.round(val));
    return String(Math.trunc(val));
  }
  const s = String(val).trim();
  if (/e/i.test(s)) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? String(Math.round(n)) : null;
  }
  const digits = s.replace(/\D/g, '');
  return digits.length ? digits.slice(0, 24) : null;
}

/** Capital = etiqueta explícita en columna localidad; el resto se considera interior (provincia). */
function inferAmbitoBecario(localidad) {
  const u = normalizeForMatch(String(localidad || ''));
  if (!u) return null;
  if (u === 'CAPITAL') return 'CAPITAL';
  return 'INTERIOR';
}

/**
 * Hoja "BECARIOS CAPITAL E INTERIOR": bloque C–F (área, función, categoría, monto), totales en texto,
 * detalle desde fila con ORD / INTERIOR / DOMICILIO.
 */
async function etlBecariosAnexoII(conn, excel2Path, periodo) {
  if (!excel2Path || !fs.existsSync(excel2Path)) {
    console.warn('[ETL Becarios] Archivo no indicado o no existe:', excel2Path);
    return;
  }
  const sourceFile = path.basename(excel2Path);
  const wb = XLSX.readFile(excel2Path);
  await conn.query(`DELETE FROM BECARIO_LINEA`);
  await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'becados'`);
  await conn.query(`DELETE FROM PRESUPUESTO_RESUMEN WHERE rubro = 'becados'`);
  console.log('[ETL Becarios] Limpieza: eliminadas filas stale de becarios en BL, PD, PR');
  const sheetName = wb.SheetNames.find((n) => normalizeForMatch(n).includes('BECARIO'));
  if (!sheetName) {
    console.warn('[ETL Becarios] No se encontró hoja de becarios en', sourceFile);
    return;
  }
  const rows = readSheetRows(wb, sheetName, true);
  const corteId = await ensureCorte(conn, {
    planRef: periodo || 'PLAN 1 2026',
    anio: 2026,
    escala: 'MENSUAL',
    observaciones: 'Becarios Anexo II',
  });

  let idxArea = -1;
  let idxFuncion = -1;
  let idxCat = -1;
  let idxMonto = -1;
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    const map = {};
    for (let j = 0; j < row.length; j++) {
      const h = normalizeForMatch(String(row[j] || ''));
      if (h === 'AREA' || h.includes('AREA')) map.area = j;
      if (h.includes('FUNCION')) map.funcion = j;
      if (h.includes('CATEGORIA')) map.categoria = j;
      if (h.includes('MONTO')) map.monto = j;
    }
    if (map.area != null && map.monto != null) {
      headerRow = i;
      idxArea = map.area;
      idxFuncion = map.funcion != null ? map.funcion : idxArea + 1;
      idxCat = map.categoria != null ? map.categoria : idxArea + 2;
      idxMonto = map.monto;
      break;
    }
  }
  let sumaMontos = 0;
  if (headerRow >= 0) {
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const c0 = normalizeForMatch(String(row[idxArea] || ''));
      if (c0.includes('BECARIO') && (c0.includes('CONTAMOS') || c0.includes('INTERIOR'))) break;
      const monto = toDec(row[idxMonto]);
      if (monto <= 0 && !String(row[idxArea] || '').trim()) continue;
      if (monto <= 0) continue;
      const area = String(row[idxArea] || '').trim().slice(0, 200);
      const funcion = String(row[idxFuncion] || '').trim().slice(0, 120);
      const categoria = String(row[idxCat] || '').trim().slice(0, 40);
      sumaMontos += monto;
      await upsertBecarioLinea(conn, {
        corteId,
        tipoLinea: 'AREA_FUNCION',
        area,
        funcion,
        categoria,
        montoLinea: monto,
        sourceFile,
        sheetName,
        sourceHash: hashSource(sourceFile, sheetName, 'AREA_FUNCION', area, funcion, categoria, monto),
      });
    }
  }

  let becariosCapital = 0;
  let becariosInterior = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = row.map((c) => String(c != null ? c : '')).join(' ');
    const norm = normalizeForMatch(line);
    let mCap = line.match(/CONTAMOS\s+(\d+)\s*BECARIO/i);
    if (mCap) becariosCapital = Math.max(becariosCapital, parseInt(mCap[1], 10));
    const mInt = line.match(/INTERIOR\s+(\d+)\s*BECARIO/i);
    if (mInt) becariosInterior = Math.max(becariosInterior, parseInt(mInt[1], 10));
    if (!mCap && norm.includes('CAPITAL') && norm.includes('CONTAMOS') && norm.includes('BECARIO')) {
      const nums = line.match(/\d+/g);
      if (nums) {
        for (const ns of nums) {
          const v = parseInt(ns, 10);
          if (v >= 200 && v <= 50000) becariosCapital = Math.max(becariosCapital, v);
        }
      }
    }
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (typeof cell === 'number' && Number.isFinite(cell) && cell >= 200 && cell <= 50000) {
        const ctx = [
          String(row[j - 1] || ''),
          String(row[j] || ''),
          String(row[j + 1] || ''),
        ].join(' ');
        if (normalizeForMatch(ctx).includes('CAPITAL') || normalizeForMatch(ctx).includes('CONTAMOS')) {
          becariosCapital = Math.max(becariosCapital, Math.round(cell));
        }
      }
    }
    const colC = String(row[2] != null ? row[2] : '').trim();
    const nc = normalizeForMatch(colC);
    if (nc.includes('CAPITAL') && nc.includes('BECARIO')) {
      const mc = colC.match(/CONTAMOS\s+(\d+)/i) || colC.match(/(\d{3,5})\s*BECARIO/i);
      if (mc) {
        const v = parseInt(mc[1], 10);
        if (v >= 200 && v <= 50000) becariosCapital = Math.max(becariosCapital, v);
      }
    }
  }

  const detHeaders = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const joined = row.map((c) => normalizeForMatch(String(c || ''))).join(' ');
    if (joined.includes('ORD') && (joined.includes('DOMICILIO') || joined.includes('COMEDOR') || joined.includes('INTERIOR') || joined.includes('APELLIDO'))) {
      detHeaders.push(i);
    }
  }
  const colOrd = 2;
  const colNum = 3;
  const colComedor = 4;
  const colDom = 5;
  const colApe = 6;
  const colNom = 7;
  const colLoc = 8;
  const colDni = 9;
  const colArPer = 10;
  const colFnPer = 11;
  const colCatPer = 12;

  let personasCargadas = 0;
  for (const detHeader of detHeaders) {
    const endRow = detHeaders.find((h) => h > detHeader) || rows.length;
    for (let i = detHeader + 1; i < endRow; i++) {
      const row = rows[i];
      const nombre = colNom >= 0 ? String(row[colNom] || '').trim() : '';
      const apellido = colApe >= 0 ? String(row[colApe] || '').trim() : '';
      if (!nombre && !apellido) continue;
      const lineCheck = row.map((c) => normalizeForMatch(String(c != null ? c : ''))).join(' ');
      if (lineCheck.includes('TOTAL') || lineCheck.includes('CONTAMOS') || lineCheck.includes('SUBTOTAL')) continue;
      personasCargadas += 1;
      const localidad = colLoc >= 0 ? String(row[colLoc] || '').trim() : '';
      const ambito = inferAmbitoBecario(localidad);
      await upsertBecarioLinea(conn, {
        corteId,
        tipoLinea: 'PERSONA',
        orden: row[colOrd] != null ? String(row[colOrd]).trim() : null,
        numeroOficial: colNum >= 0 ? String(row[colNum] || '').trim().slice(0, 20) : null,
        comedorNombre: colComedor >= 0 ? String(row[colComedor] || '').trim().slice(0, 200) : null,
        domicilio: colDom >= 0 ? String(row[colDom] || '').trim().slice(0, 200) : null,
        apellido: apellido ? apellido.slice(0, 120) : null,
        nombre: nombre ? nombre.slice(0, 200) : null,
        localidad: localidad ? localidad.slice(0, 120) : null,
        dni: parseDniCell(colDni >= 0 ? row[colDni] : null),
        ambito,
        areaPersonal: colArPer >= 0 ? String(row[colArPer] || '').trim().slice(0, 200) : null,
        funcionPersonal: colFnPer >= 0 ? String(row[colFnPer] || '').trim().slice(0, 120) : null,
        categoriaPersonal: colCatPer >= 0 ? String(row[colCatPer] || '').trim().slice(0, 20) : null,
        sourceFile,
        sheetName,
        sourceHash: hashSource(sourceFile, sheetName, 'PERSONA', i, apellido, nombre, localidad, colDni >= 0 ? row[colDni] : ''),
      });
    }
  }
  console.log('[ETL Becarios] Secciones de detalle encontradas:', detHeaders.length, 'Personas cargadas:', personasCargadas);

  let totalCant = becariosCapital + becariosInterior;
  if (totalCant <= 0 && personasCargadas > 0) totalCant = personasCargadas;
  await upsertResumen(conn, {
    corteId,
    rubro: 'becados',
    subrubro: 'totales',
    montoTotal: sumaMontos,
    cantidadTotal: totalCant,
    unidad: 'ARS',
    sourceFile,
    sheetName,
    sourceHash: hashSource(sourceFile, sheetName, 'RESUMEN', 'totales', sumaMontos, totalCant),
  });
  if (becariosCapital > 0) {
    await upsertResumen(conn, {
      corteId,
      rubro: 'becados',
      subrubro: 'capital',
      montoTotal: 0,
      cantidadTotal: becariosCapital,
      unidad: 'becarios',
      sourceFile,
      sheetName,
      sourceHash: hashSource(sourceFile, sheetName, 'RESUMEN', 'capital', becariosCapital),
    });
  }
  if (becariosInterior > 0) {
    await upsertResumen(conn, {
      corteId,
      rubro: 'becados',
      subrubro: 'interior',
      montoTotal: 0,
      cantidadTotal: becariosInterior,
      unidad: 'becarios',
      sourceFile,
      sheetName,
      sourceHash: hashSource(sourceFile, sheetName, 'RESUMEN', 'interior', becariosInterior),
    });
  }

  console.log('[ETL Becarios] Monto total áreas:', sumaMontos, 'Capital:', becariosCapital, 'Interior:', becariosInterior);
}

function toDec(val) {
  if (val == null || val === '') return 0;
  // Valores ya numéricos de Excel (sheet_to_json raw:true): no pasar por reglas de miles/decimales locales.
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function hashSource(...parts) {
  return crypto.createHash('sha256').update(parts.map((p) => String(p ?? '')).join('||')).digest('hex');
}

async function ensureCorte(conn, { planRef, anio, mes, escala, fechaRef = null, observaciones = null }) {
  await conn.query(
    `INSERT INTO PRESUPUESTO_CORTE (plan_ref, anio, mes, escala, fecha_ref, observaciones)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE observaciones = COALESCE(VALUES(observaciones), observaciones)`,
    [planRef || null, anio || null, mes || null, escala, fechaRef, observaciones]
  );
  const [rows] = await conn.query(
    `SELECT corte_id FROM PRESUPUESTO_CORTE
     WHERE (plan_ref <=> ?) AND (anio <=> ?) AND (mes <=> ?) AND escala = ? AND (fecha_ref <=> ?)
     LIMIT 1`,
    [planRef || null, anio || null, mes || null, escala, fechaRef]
  );
  return rows[0]?.corte_id || null;
}

async function upsertResumen(conn, payload) {
  await conn.query(
    `INSERT INTO PRESUPUESTO_RESUMEN (corte_id, rubro, subrubro, monto_total, cantidad_total, unidad, source_file, sheet_name, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       monto_total = VALUES(monto_total),
       cantidad_total = VALUES(cantidad_total),
       unidad = VALUES(unidad),
       corte_id = VALUES(corte_id)`,
    [
      payload.corteId || null,
      payload.rubro,
      payload.subrubro || null,
      payload.montoTotal || 0,
      payload.cantidadTotal || 0,
      payload.unidad || null,
      payload.sourceFile,
      payload.sheetName,
      payload.sourceHash,
    ]
  );
}

async function upsertDependencia(conn, payload) {
  await conn.query(
    `INSERT INTO PRESUPUESTO_DEPENDENCIA
      (corte_id, comedor_id, dependencia_nombre, dependencia_tipo, ambito, rubro, subrubro, servicio, beneficiarios, cantidad, unidad, precio_unitario, monto, source_file, sheet_name, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       comedor_id = COALESCE(VALUES(comedor_id), comedor_id),
       dependencia_tipo = COALESCE(VALUES(dependencia_tipo), dependencia_tipo),
       ambito = COALESCE(VALUES(ambito), ambito),
       servicio = COALESCE(VALUES(servicio), servicio),
       beneficiarios = COALESCE(VALUES(beneficiarios), beneficiarios),
       cantidad = VALUES(cantidad),
       unidad = VALUES(unidad),
       precio_unitario = COALESCE(VALUES(precio_unitario), precio_unitario),
       monto = VALUES(monto),
       corte_id = VALUES(corte_id)`,
    [
      payload.corteId || null,
      payload.comedorId || null,
      payload.dependenciaNombre,
      payload.dependenciaTipo || null,
      payload.ambito || null,
      payload.rubro,
      payload.subrubro || null,
      payload.servicio || null,
      payload.beneficiarios || null,
      payload.cantidad || 0,
      payload.unidad || null,
      payload.precioUnitario || null,
      payload.monto || 0,
      payload.sourceFile,
      payload.sheetName,
      payload.sourceHash,
    ]
  );
  const [rows] = await conn.query(`SELECT presupuesto_dep_id FROM PRESUPUESTO_DEPENDENCIA WHERE source_hash = ? LIMIT 1`, [payload.sourceHash]);
  return rows[0]?.presupuesto_dep_id || null;
}

async function upsertItem(conn, payload) {
  await conn.query(
    `INSERT INTO PRESUPUESTO_ITEM
      (corte_id, presupuesto_dep_id, comedor_id, rubro, subrubro, item_nombre, cantidad, unidad, precio_unitario, monto, metrica_tipo, source_file, sheet_name, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cantidad = VALUES(cantidad),
       unidad = VALUES(unidad),
       precio_unitario = COALESCE(VALUES(precio_unitario), precio_unitario),
       monto = VALUES(monto),
       metrica_tipo = VALUES(metrica_tipo),
       presupuesto_dep_id = COALESCE(VALUES(presupuesto_dep_id), presupuesto_dep_id),
       comedor_id = COALESCE(VALUES(comedor_id), comedor_id),
       corte_id = VALUES(corte_id)`,
    [
      payload.corteId || null,
      payload.presupuestoDepId || null,
      payload.comedorId || null,
      payload.rubro,
      payload.subrubro || null,
      payload.itemNombre,
      payload.cantidad || 0,
      payload.unidad || null,
      payload.precioUnitario || null,
      payload.monto || 0,
      payload.metricaTipo || null,
      payload.sourceFile,
      payload.sheetName,
      payload.sourceHash,
    ]
  );
}

async function upsertBecarioLinea(conn, payload) {
  await conn.query(
    `INSERT INTO BECARIO_LINEA
      (corte_id, tipo_linea, area, funcion, categoria, monto_linea, orden, numero_oficial, comedor_nombre, domicilio,
       apellido, nombre, localidad, dni, ambito, area_personal, funcion_personal, categoria_personal, source_file, sheet_name, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       monto_linea = VALUES(monto_linea),
       area = VALUES(area),
       funcion = VALUES(funcion),
       categoria = VALUES(categoria),
       orden = VALUES(orden),
       numero_oficial = VALUES(numero_oficial),
       comedor_nombre = VALUES(comedor_nombre),
       domicilio = VALUES(domicilio),
       apellido = VALUES(apellido),
       nombre = VALUES(nombre),
       localidad = VALUES(localidad),
       dni = VALUES(dni),
       ambito = VALUES(ambito),
       area_personal = VALUES(area_personal),
       funcion_personal = VALUES(funcion_personal),
       categoria_personal = VALUES(categoria_personal),
       corte_id = VALUES(corte_id)`,
    [
      payload.corteId || null,
      payload.tipoLinea,
      payload.area || null,
      payload.funcion || null,
      payload.categoria || null,
      payload.montoLinea != null ? payload.montoLinea : null,
      payload.orden != null ? String(payload.orden) : null,
      payload.numeroOficial || null,
      payload.comedorNombre || null,
      payload.domicilio || null,
      payload.apellido || null,
      payload.nombre || null,
      payload.localidad || null,
      payload.dni || null,
      payload.ambito || null,
      payload.areaPersonal || null,
      payload.funcionPersonal || null,
      payload.categoriaPersonal || null,
      payload.sourceFile,
      payload.sheetName,
      payload.sourceHash,
    ]
  );
}

async function upsertTekno(conn, payload) {
  await conn.query(
    `INSERT INTO PRESUPUESTO_TEKNOFOOD
      (corte_id, concepto, servicio, escala, cantidad, cantidad_comida, cantidad_refrigerio, precio_unitario, monto, source_file, sheet_name, source_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cantidad = VALUES(cantidad),
       cantidad_comida = VALUES(cantidad_comida),
       cantidad_refrigerio = VALUES(cantidad_refrigerio),
       precio_unitario = COALESCE(VALUES(precio_unitario), precio_unitario),
       monto = VALUES(monto),
       corte_id = VALUES(corte_id)`,
    [
      payload.corteId || null,
      payload.concepto,
      payload.servicio || 'N/A',
      payload.escala,
      payload.cantidad || 0,
      payload.cantidadComida != null ? payload.cantidadComida : null,
      payload.cantidadRefrigerio != null ? payload.cantidadRefrigerio : null,
      payload.precioUnitario || null,
      payload.monto || 0,
      payload.sourceFile,
      payload.sheetName,
      payload.sourceHash,
    ]
  );
}

async function resolveComedorByKeys(conn, numero, nombre, domicilio) {
  const { byNum, byNombreNorm } = await buildComedorLookupCache(conn);
  const num = numero != null ? String(numero).trim() : '';
  if (num && num.toUpperCase() !== 'S/N') {
    if (byNum.has(num)) return byNum.get(num);
    const [byNumSql] = await conn.query(`SELECT comedor_id FROM COMEDOR WHERE numero_oficial = ? LIMIT 1`, [num]);
    if (byNumSql.length) return byNumSql[0].comedor_id;
  }
  const nom = (nombre || '').toString().trim();
  const dom = (domicilio || '').toString().trim();
  if (nom) {
    const [byName] = await conn.query(
      `SELECT comedor_id FROM COMEDOR WHERE TRIM(nombre) = ? AND (? = '' OR domicilio IS NULL OR TRIM(domicilio) = ?) LIMIT 1`,
      [nom, dom, dom]
    );
    if (byName.length) return byName[0].comedor_id;
    const nk = normalizeForMatch(nom);
    if (nk) {
      const candidates = byNombreNorm.get(nk);
      const picked = pickComedorFromNombreNormCandidates(candidates, domicilio);
      if (picked != null) return picked;
    }
  }
  return null;
}

/** Zona Capital (I, II, III, N) desde texto de celda tipo "ZONA I (CAPITAL)" */
async function resolveZonaCapitalFromCell(conn, zonaCellText) {
  const m = String(zonaCellText || '').match(/ZONA\s*(I|II|III|NORTE|N)\b/i);
  const cod = m ? (m[1].toUpperCase() === 'NORTE' ? 'N' : m[1].toUpperCase()) : null;
  if (!cod) return null;
  const [r] = await conn.query('SELECT zona_id FROM ZONA WHERE ambito = ? AND codigo = ? LIMIT 1', ['CAPITAL', cod]);
  return r.length ? r[0].zona_id : null;
}

async function resolveZonaFallbackCapital(conn) {
  const [r] = await conn.query(`SELECT zona_id FROM ZONA WHERE ambito = 'CAPITAL' AND codigo = 'I' LIMIT 1`);
  return r.length ? r[0].zona_id : null;
}

/** Resuelve tipo_id / subtipo_id desde texto DEPENDENCIA (catálogo real, no IDs fijos). */
async function resolveTipoIdsFromDependencia(conn, dep) {
  const d = normalizeForMatch(String(dep || ''));
  let tipoNombre = null;
  if (d.includes('OFICIAL')) tipoNombre = 'OFICIAL';
  else if (d.includes('SOLIDARIO')) tipoNombre = 'SOLIDARIO';
  else if (d.includes('INSTITUCIONAL')) tipoNombre = 'INSTITUCIONAL';
  let tipoId = null;
  if (tipoNombre) {
    const [r] = await conn.query('SELECT tipo_id FROM TIPO_COMEDOR WHERE nombre = ? LIMIT 1', [tipoNombre]);
    if (r.length) tipoId = r[0].tipo_id;
  }
  let subtipoNombre = null;
  if (d.includes('IGLESIA EVANGELICA') || d.includes('IGLESIA EVANGÉLICA')) subtipoNombre = 'IGLESIA EVANGELICA';
  else if (d.includes('IGLESIA CATOLICA') || d.includes('IGLESIA CATÓLICA') || (d.includes('IGLESIA') && d.includes('CATOL'))) subtipoNombre = 'IGLESIA CATOLICA';
  else if (d.includes('ONG')) subtipoNombre = 'ONG';
  else if (d.includes('PRIVADO')) subtipoNombre = 'PRIVADO';
  let subtipoId = null;
  if (subtipoNombre) {
    const [r] = await conn.query('SELECT subtipo_id FROM SUBTIPO_COMEDOR WHERE nombre = ? LIMIT 1', [subtipoNombre]);
    if (r.length) subtipoId = r[0].subtipo_id;
  }
  return { tipoId, subtipoId };
}

/**
 * Busca comedor por Nº/nombre; si no existe y hay zona Capital, inserta con tipo desde DEPENDENCIA.
 * Si existe, actualiza tipo/subtipo cuando el Excel los trae.
 */
async function ensureComedorMarzoCapital(conn, { numero, nombre, domicilio, dependencia, zonaId, skipInsert }) {
  const nom = (nombre || '').toString().trim();
  if (!nom || normalizeForMatch(nom).startsWith('ZONA')) return null;
  let cid = await resolveComedorByKeys(conn, numero, nombre, domicilio);
  const { tipoId, subtipoId } = await resolveTipoIdsFromDependencia(conn, dependencia);
  if (cid) {
    if (tipoId != null || subtipoId != null) {
      await conn.query(
        'UPDATE COMEDOR SET tipo_id = COALESCE(?, tipo_id), subtipo_id = COALESCE(?, subtipo_id) WHERE comedor_id = ?',
        [tipoId, subtipoId, cid]
      );
    }
    return cid;
  }
  if (skipInsert) return null;
  let zid = zonaId;
  if (!zid) zid = await resolveZonaFallbackCapital(conn);
  if (!zid) {
    console.warn('[ETL Marzo] Sin zona Capital para alta:', nom);
    return null;
  }
  const num =
    numero != null && String(numero).trim() !== '' && String(numero).toUpperCase() !== 'S/N'
      ? String(numero).trim().slice(0, 10)
      : null;
  try {
    const [ins] = await conn.query(
      `INSERT INTO COMEDOR (numero_oficial, nombre, domicilio, zona_id, tipo_id, subtipo_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [num, nom.slice(0, 200), (domicilio || '').toString().slice(0, 200), zid, tipoId, subtipoId]
    );
    invalidateComedorLookupCache();
    return ins.insertId;
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      invalidateComedorLookupCache();
      const again = await resolveComedorByKeys(conn, numero, nombre, domicilio);
      if (again && (tipoId != null || subtipoId != null)) {
        await conn.query(
          'UPDATE COMEDOR SET tipo_id = COALESCE(?, tipo_id), subtipo_id = COALESCE(?, subtipo_id) WHERE comedor_id = ?',
          [tipoId, subtipoId, again]
        );
      }
      return again;
    }
    throw e;
  }
}

function readSheetRows(wb, sheetName, raw = false) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw });
}

function findTotalInRows(rows) {
  let maxTotal = 0;
  for (const row of rows) {
    const upper = row.map((v) => normalizeForMatch(String(v)));
    if (upper.some((v) => v.includes('TOTAL'))) {
      for (const n of row.map((v) => toDec(v))) {
        if (n > maxTotal) maxTotal = n;
      }
    }
  }
  return maxTotal;
}

/** Totales de control presupuesto marzo (ART DE LIMPIEZA / Seguridad Alimentaria / Fumigación) */
const PRESUP_LIMPIEZA_MONTO = 13311798;
const PRESUP_LIMPIEZA_CANT = 155;
const PRESUP_GAS_MONTO = 11570000;
const PRESUP_GAS_CANT = 481;
const PRESUP_FUMIG_MONTO = 2600000;

async function etlMarzoLimpieza(conn, filePath, periodo) {
  const sourceFile = path.basename(filePath);
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => normalizeForMatch(n).includes('LIMPIEZA'));
  if (!sheetName) return;
  await conn.query(`DELETE FROM PRESUPUESTO_ITEM WHERE rubro = 'otros_recursos' AND subrubro = 'limpieza'`);
  await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'otros_recursos' AND subrubro = 'limpieza'`);
  console.log('[ETL Marzo Limpieza] Limpieza: eliminadas filas stale de limpieza en PD y PI');
  const rows = readSheetRows(wb, sheetName);
  const corteId = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'MENSUAL', observaciones: 'Carga marzo limpieza' });
  const totalParsed = findTotalInRows(rows);
  console.log('[ETL Marzo Limpieza] Total detectado en hoja:', totalParsed, '| control presupuesto:', PRESUP_LIMPIEZA_MONTO, 'cant:', PRESUP_LIMPIEZA_CANT);
  await upsertResumen(conn, {
    corteId,
    rubro: 'otros_recursos',
    subrubro: 'limpieza',
    montoTotal: PRESUP_LIMPIEZA_MONTO,
    cantidadTotal: PRESUP_LIMPIEZA_CANT,
    unidad: 'unidades',
    sourceFile,
    sheetName,
    sourceHash: hashSource(sourceFile, sheetName, 'TOTAL_LIMPIEZA', PRESUP_LIMPIEZA_MONTO, PRESUP_LIMPIEZA_CANT),
  });

  const tipoTargets = [
    { key: 'COMEDORES CAPITAL', item: 'comedores_capital' },
    { key: 'COMEDORES INTERIOR', item: 'comedores_interior' },
    { key: 'MERENDEROS CAPITAL', item: 'merenderos_capital' },
    { key: 'TOTAL', item: 'dependencias_total' },
  ];
  for (const row of rows) {
    const joined = normalizeForMatch(row.join(' '));
    for (const t of tipoTargets) {
      if (joined.includes(normalizeForMatch(t.key))) {
        const val = row.map((v) => toDec(v)).find((n) => n > 0) || 0;
        if (val > 0) {
          await upsertItem(conn, {
            corteId,
            rubro: 'otros_recursos',
            subrubro: 'limpieza',
            itemNombre: t.item,
            cantidad: val,
            unidad: 'dependencias',
            monto: 0,
            metricaTipo: 'conteo',
            sourceFile,
            sheetName,
            sourceHash: hashSource(sourceFile, sheetName, t.item, val),
          });
        }
      }
    }
  }

  const comboItems = ['LAVANDINA', 'DETERGENTE', 'DESENGRASANTE', 'TRAPO DE PISO', 'TRAPO REJILLA', 'VIRULANA', 'ESPONJA', 'ESCOBILLON', 'ESCURRIDOR'];
  const comboEntries = [];
  for (const row of rows) {
    const rowText = normalizeForMatch(row.join(' '));
    for (const item of comboItems) {
      if (rowText.includes(normalizeForMatch(item))) {
        const qty = row.map((v) => toDec(v)).find((n) => n > 0) || 0;
        if (qty > 0) {
          comboEntries.push({
            itemNombre: item.toLowerCase().replace(/\s+/g, '_'),
            qty,
            sourceHash: hashSource(sourceFile, sheetName, item, qty),
          });
        }
      }
    }
  }
  const sumComboQty = comboEntries.reduce((s, e) => s + e.qty, 0);
  let accLimpMonto = 0;
  for (let li = 0; li < comboEntries.length; li++) {
    const e = comboEntries[li];
    const montoLimp =
      li === comboEntries.length - 1
        ? Math.round((PRESUP_LIMPIEZA_MONTO - accLimpMonto) * 100) / 100
        : sumComboQty > 0
          ? Math.round(((PRESUP_LIMPIEZA_MONTO * e.qty) / sumComboQty) * 100) / 100
          : 0;
    accLimpMonto += montoLimp;
    await upsertItem(conn, {
      corteId,
      rubro: 'otros_recursos',
      subrubro: 'limpieza',
      itemNombre: e.itemNombre,
      cantidad: e.qty,
      unidad: 'unidades',
      monto: montoLimp,
      metricaTipo: 'combo',
      sourceFile,
      sheetName,
      sourceHash: e.sourceHash,
    });
  }

  let limpHeaderRow = findHeaderRow(rows, ['COMEDOR', 'LAVANDINA', 'DETERGENTE', 'ESCOBILLON'], 3, rows.length);
  if (limpHeaderRow <= 0) {
    limpHeaderRow = findHeaderRow(rows, ['LAVANDINA', 'DETERGENTE', 'ESPONJA'], 2, rows.length);
  }
  if (limpHeaderRow <= 0) {
    for (let r = 0; r < rows.length; r++) {
      const joined = (rows[r] || []).map((c) => normalizeForMatch(String(c))).join(' ');
      if (joined.includes('LAVANDINA') && (joined.includes('DETERGENTE') || joined.includes('ESCOBILLON'))) {
        limpHeaderRow = r;
        break;
      }
    }
  }
  console.log('[ETL Marzo Limpieza] limpHeaderRow detected at:', limpHeaderRow);
  if (limpHeaderRow > 0) {
    const lHeaders = (rows[limpHeaderRow] || []).map((h) => normalizeForMatch(String(h)));
    const lIdxInstitucion = lHeaders.findIndex((h) => h.includes('INSTITUCION'));
    const lIdxNom = lIdxInstitucion >= 0
      ? lIdxInstitucion
      : lHeaders.findIndex((h) => h.includes('COMEDOR') || h.includes('NOMBRE') || h.includes('DEPENDENCIA'));
    const lIdxResp = lHeaders.findIndex((h) => h.includes('RESPONSABLE'));
    const lIdxDni = lHeaders.findIndex((h) => h.includes('DNI'));
    const lIdxLav = lHeaders.findIndex((h) => h.includes('LAVANDINA'));
    const lIdxDet = lHeaders.findIndex((h) => h.includes('DETERGENTE'));
    const lIdxDes = lHeaders.findIndex((h) => h.includes('DESENGRASANTE'));
    const lIdxTP = lHeaders.findIndex((h) => h.includes('TRAPO') && h.includes('PISO'));
    const lIdxTR = lHeaders.findIndex((h) => h.includes('TRAPO') && h.includes('REJILLA'));
    const lIdxVir = lHeaders.findIndex((h) => h.includes('VIRULANA') || h.includes('LANA'));
    const lIdxEsp = lHeaders.findIndex((h) => h.includes('ESPONJA'));
    const lIdxEsc = lHeaders.findIndex((h) => h.includes('ESCOBILLON'));
    const lIdxEsr = lHeaders.findIndex((h) => h.includes('ESCURRIDOR'));
    const limpDeps = [];
    for (let i = limpHeaderRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const nombre = lIdxNom >= 0 ? String(row[lIdxNom] || '').trim() : '';
      if (!nombre) continue;
      const line = normalizeForMatch(row.join(' '));
      if (line.includes('TOTAL') || line.includes('FUNDACION UNIDOS') || line.includes('LIBRES DEL SUR') || line.includes('MTL') || line.includes('CCC')) {
        if (line.includes('TOTAL')) continue;
      }
      const items = {
        lavandina: Math.round(toDec(lIdxLav >= 0 ? row[lIdxLav] : 0)),
        detergente: Math.round(toDec(lIdxDet >= 0 ? row[lIdxDet] : 0)),
        desengrasante: Math.round(toDec(lIdxDes >= 0 ? row[lIdxDes] : 0)),
        trapo_piso: Math.round(toDec(lIdxTP >= 0 ? row[lIdxTP] : 0)),
        trapo_rejilla: Math.round(toDec(lIdxTR >= 0 ? row[lIdxTR] : 0)),
        virulana: Math.round(toDec(lIdxVir >= 0 ? row[lIdxVir] : 0)),
        esponja: Math.round(toDec(lIdxEsp >= 0 ? row[lIdxEsp] : 0)),
        escobillon: Math.round(toDec(lIdxEsc >= 0 ? row[lIdxEsc] : 0)),
        escurridor: Math.round(toDec(lIdxEsr >= 0 ? row[lIdxEsr] : 0)),
      };
      const totalUn = Object.values(items).reduce((a, b) => a + b, 0);
      if (totalUn <= 0) continue;
      const domicilio = '';
      limpDeps.push({ nombre, domicilio, items, totalUn, rowIdx: i });
    }
    const sumUnits = limpDeps.reduce((s, d) => s + d.totalUn, 0);
    const limpMontoDeps = limpDeps.map((d) => ({
      ...d,
      montoDep: sumUnits > 0 ? Math.round(((PRESUP_LIMPIEZA_MONTO * d.totalUn) / sumUnits) * 100) / 100 : 0,
    }));
    let sumLimpDep = limpMontoDeps.reduce((s, x) => s + x.montoDep, 0);
    if (limpMontoDeps.length && Math.abs(PRESUP_LIMPIEZA_MONTO - sumLimpDep) > 0.02) {
      limpMontoDeps[limpMontoDeps.length - 1].montoDep =
        Math.round((limpMontoDeps[limpMontoDeps.length - 1].montoDep + (PRESUP_LIMPIEZA_MONTO - sumLimpDep)) * 100) / 100;
    }
    console.log('[ETL Marzo Limpieza] Dependencias parseadas:', limpMontoDeps.length, '| sumUnits:', sumUnits);
    for (const d of limpMontoDeps) {
      const comedorId = await resolveComedorByKeys(conn, null, d.nombre, d.domicilio);
      await upsertDependencia(conn, {
        corteId,
        comedorId,
        dependenciaNombre: d.nombre,
        dependenciaTipo: null,
        ambito: 'CAPITAL',
        rubro: 'otros_recursos',
        subrubro: 'limpieza',
        cantidad: d.totalUn,
        unidad: 'unidades',
        monto: d.montoDep,
        sourceFile,
        sheetName,
        sourceHash: hashSource(sourceFile, sheetName, 'LIMPDEP', d.nombre, d.totalUn, d.rowIdx),
      });
    }
  }
}

async function etlMarzoFumigacion(conn, filePath, periodo) {
  const sourceFile = path.basename(filePath);
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => normalizeForMatch(n).includes('FUMIG'));
  if (!sheetName) return;
  await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'otros_recursos' AND subrubro = 'fumigacion'`);
  console.log('[ETL Marzo Fumigación] Limpieza: eliminadas filas stale de fumigacion en PD');
  const rows = readSheetRows(wb, sheetName);
  const corteId = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'MENSUAL', observaciones: 'Carga marzo fumigacion' });
  const totalParsed = findTotalInRows(rows);
  console.log('[ETL Marzo Fumigación] Total detectado en hoja:', totalParsed, '| control presupuesto:', PRESUP_FUMIG_MONTO);

  const headerRow = findHeaderRow(rows, ['Nº', 'COMEDOR', 'DOMICILIO', 'RESPONSABLE', 'DNI', 'DEPENDENCIA'], 3, 40);
  const headers = (rows[headerRow] || []).map((h) => normalizeForMatch(String(h)));
  const idxNum = headers.findIndex((h) => h.includes('Nº') || h === 'N' || h.includes('NUMERO'));
  const idxComedor = headers.findIndex((h) => h.includes('COMEDOR'));
  const idxDom = headers.findIndex((h) => h.includes('DOMICILIO'));
  const idxResp = headers.findIndex((h) => h.includes('RESPONSABLE'));
  const idxDep = headers.findIndex((h) => h.includes('DEPENDENCIA'));
  const fumigPending = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const nombre = idxComedor >= 0 ? String(row[idxComedor] || '').trim() : '';
    if (!nombre) continue;
    const numero = idxNum >= 0 ? row[idxNum] : null;
    const domicilio = idxDom >= 0 ? String(row[idxDom] || '').trim() : '';
    const depTipo = idxDep >= 0 ? String(row[idxDep] || '').trim() : null;
    const resp = idxResp >= 0 ? String(row[idxResp] || '').trim() : null;
    const ambito = /INTERIOR/i.test(depTipo || '') ? 'INTERIOR' : 'CAPITAL';
    fumigPending.push({ numero, nombre, domicilio, depTipo, resp, ambito });
  }
  const fumigServicios = fumigPending.length;
  const montoBaseFum =
    fumigServicios > 0 ? Math.floor((PRESUP_FUMIG_MONTO / fumigServicios) * 100) / 100 : 0;
  let accFum = 0;
  for (let fi = 0; fi < fumigPending.length; fi++) {
    const fp = fumigPending[fi];
    const montoFila =
      fi === fumigPending.length - 1 ? Math.round((PRESUP_FUMIG_MONTO - accFum) * 100) / 100 : montoBaseFum;
    accFum += montoFila;
    const comedorId = await resolveComedorByKeys(conn, fp.numero, fp.nombre, fp.domicilio);
    await upsertDependencia(conn, {
      corteId,
      comedorId,
      dependenciaNombre: fp.nombre,
      dependenciaTipo: fp.depTipo,
      ambito: fp.ambito,
      rubro: 'otros_recursos',
      subrubro: 'fumigacion',
      cantidad: 1,
      unidad: 'servicio',
      monto: montoFila,
      sourceFile,
      sheetName,
      sourceHash: hashSource(sourceFile, sheetName, 'FUMI', fp.numero, fp.nombre, fp.domicilio, fp.resp),
    });
  }
  await upsertResumen(conn, {
    corteId,
    rubro: 'otros_recursos',
    subrubro: 'fumigacion',
    montoTotal: PRESUP_FUMIG_MONTO,
    cantidadTotal: fumigServicios,
    unidad: 'servicios',
    sourceFile,
    sheetName,
    sourceHash: hashSource(sourceFile, sheetName, 'TOTAL_FUMIGACION', PRESUP_FUMIG_MONTO, fumigServicios),
  });
}

async function etlMarzoGas(conn, filePath, periodo) {
  const sourceFile = path.basename(filePath);
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => normalizeForMatch(n).includes('GAS'));
  if (!sheetName) return;
  const rows = readSheetRows(wb, sheetName);
  const corteId = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'MENSUAL', observaciones: 'Carga marzo gas' });
  const totalParsed = findTotalInRows(rows);
  console.log('[ETL Marzo Gas] Total detectado en hoja:', totalParsed, '| control presupuesto:', PRESUP_GAS_MONTO, 'garrafas:', PRESUP_GAS_CANT);
  await upsertResumen(conn, {
    corteId,
    rubro: 'otros_recursos',
    subrubro: 'gas',
    montoTotal: PRESUP_GAS_MONTO,
    cantidadTotal: PRESUP_GAS_CANT,
    unidad: 'garrafas',
    sourceFile,
    sheetName,
    sourceHash: hashSource(sourceFile, sheetName, 'TOTAL_GAS', PRESUP_GAS_MONTO, PRESUP_GAS_CANT),
  });

  await conn.query(`DELETE FROM PRESUPUESTO_ITEM WHERE rubro = 'otros_recursos' AND subrubro = 'gas'`);
  await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'otros_recursos' AND subrubro = 'gas'`);
  console.log('[ETL Marzo Gas] Limpieza: eliminadas filas stale de gas en PD y PI');

  const headerRow = findHeaderRow(rows, ['ORD', 'Nº', 'COMEDOR', '10 KG', '15', '45', 'DEPENDENCIA'], 3, 30);
  const headers = (rows[headerRow] || []).map((h) => normalizeForMatch(String(h)));
  const idxNum = headers.findIndex((h) => h.includes('Nº') || h.includes('NUMERO') || h === 'N');
  const idxComedor = headers.findIndex((h) => h.includes('COMEDOR'));
  const idxDom = headers.findIndex((h) => h.includes('DOMICILIO'));
  const idx10 = headers.findIndex((h) => h.includes('10'));
  const idx15 = headers.findIndex((h) => h.includes('15'));
  const idx45 = headers.findIndex((h) => h.includes('45'));
  const idxDep = headers.findIndex((h) => h.includes('DEPENDENCIA'));

  let zonaGas = null;
  const gasPending = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const c0 = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
    if (c0.startsWith('ZONA')) {
      zonaGas = await resolveZonaCapitalFromCell(conn, row[0]);
      continue;
    }
    const nombre = idxComedor >= 0 ? String(row[idxComedor] || '').trim() : '';
    if (!nombre) continue;
    const lineProbeGas = row.map((c) => normalizeForMatch(String(c != null ? c : ''))).join(' ');
    if (lineProbeGas.includes('TOTAL') || lineProbeGas.includes('SUBTOTAL') || lineProbeGas.includes('GENERAL')) {
      continue;
    }
    const numero = idxNum >= 0 ? row[idxNum] : null;
    const domicilio = idxDom >= 0 ? String(row[idxDom] || '').trim() : '';
    const depStr = idxDep >= 0 ? String(row[idxDep] || '').trim() : '';
    const g10 = toDec(idx10 >= 0 ? row[idx10] : 0);
    const g15 = toDec(idx15 >= 0 ? row[idx15] : 0);
    const g45 = toDec(idx45 >= 0 ? row[idx45] : 0);
    const ambito = /INTERIOR/i.test(depStr) ? 'INTERIOR' : 'CAPITAL';
    const rowG = g10 + g15 + g45;
    if (rowG <= 0) continue;
    gasPending.push({
      numero,
      nombre,
      domicilio,
      depStr,
      ambito,
      zonaGas,
      g10,
      g15,
      g45,
      rowG,
    });
  }
  const PRECIO_GARRAFA_10 = 20000;
  const PRECIO_GARRAFA_15 = 30000;
  const PRECIO_GARRAFA_45 = 70000;
  const montoDepsGas = gasPending.map((p) => {
    const costoCalc = p.g10 * PRECIO_GARRAFA_10 + p.g15 * PRECIO_GARRAFA_15 + p.g45 * PRECIO_GARRAFA_45;
    return { ...p, montoDep: costoCalc };
  });
  const sumMontosGasCalc = montoDepsGas.reduce((s, x) => s + x.montoDep, 0);
  const scaleGas = sumMontosGasCalc > 0 ? PRESUP_GAS_MONTO / sumMontosGasCalc : 0;
  for (const p of montoDepsGas) {
    p.montoDep = Math.round(p.montoDep * scaleGas * 100) / 100;
  }
  let sumMontosGas = montoDepsGas.reduce((s, x) => s + x.montoDep, 0);
  if (montoDepsGas.length && Math.abs(PRESUP_GAS_MONTO - sumMontosGas) > 0.02) {
    montoDepsGas[montoDepsGas.length - 1].montoDep =
      Math.round((montoDepsGas[montoDepsGas.length - 1].montoDep + (PRESUP_GAS_MONTO - sumMontosGas)) * 100) / 100;
  }
  for (const p of montoDepsGas) {
    const comedorId = await ensureComedorMarzoCapital(conn, {
      numero: p.numero,
      nombre: p.nombre,
      domicilio: p.domicilio,
      dependencia: p.depStr,
      zonaId: p.zonaGas,
    });
    const depId = await upsertDependencia(conn, {
      corteId,
      comedorId,
      dependenciaNombre: p.nombre,
      dependenciaTipo: p.depStr || null,
      ambito: p.ambito,
      rubro: 'otros_recursos',
      subrubro: 'gas',
      cantidad: p.rowG,
      unidad: 'garrafas',
      monto: p.montoDep,
      sourceFile,
      sheetName,
      sourceHash: hashSource(sourceFile, sheetName, 'GASDEP', p.numero, p.nombre, p.domicilio, p.g10, p.g15, p.g45),
    });
    const itemPrecios = { garrafa_10kg: PRECIO_GARRAFA_10, garrafa_15kg: PRECIO_GARRAFA_15, garrafa_45kg: PRECIO_GARRAFA_45 };
    for (const [item, qty] of [
      ['garrafa_10kg', p.g10],
      ['garrafa_15kg', p.g15],
      ['garrafa_45kg', p.g45],
    ]) {
      if (qty > 0) {
        const rawItem = qty * itemPrecios[item];
        const rawTotal = p.g10 * PRECIO_GARRAFA_10 + p.g15 * PRECIO_GARRAFA_15 + p.g45 * PRECIO_GARRAFA_45;
        const mItem = rawTotal > 0 ? Math.round((p.montoDep * rawItem / rawTotal) * 100) / 100 : 0;
        await upsertItem(conn, {
          corteId,
          presupuestoDepId: depId,
          comedorId,
          rubro: 'otros_recursos',
          subrubro: 'gas',
          itemNombre: item,
          cantidad: qty,
          unidad: 'garrafas',
          monto: mItem,
          metricaTipo: 'desglose',
          sourceFile,
          sheetName,
          sourceHash: hashSource(sourceFile, sheetName, item, p.numero, p.nombre, qty),
        });
      }
    }
  }
}

function findMarzoSheetFrutasVerduras(wb) {
  for (const n of wb.SheetNames) {
    const x = normalizeForMatch(n);
    if (x.includes('FRUTAS') || x.includes('VERDURAS')) return n;
  }
  return null;
}

/** No usar la hoja de frutas/verduras aunque el título mencione “sin carne”, etc. */
function findMarzoSheetCarnes(wb) {
  const out = [];
  for (const n of wb.SheetNames) {
    const x = normalizeForMatch(n);
    if (x.includes('FRUTAS') || x.includes('VERDURAS')) continue;
    if (x.includes('CARNE') || x.includes('CARNES') || (x.includes('POLLO') && x.includes('CERDO'))) out.push(n);
  }
  return out[0] || null;
}

function detectCarnesHeaderRow(rows) {
  for (let r = 0; r < Math.min(50, rows.length); r++) {
    const headers = (rows[r] || []).map((h) => normalizeForMatch(String(h)));
    const { idxVac, idxPol, idxCer } = carnesColumnIndexes(headers);
    if (idxPol >= 0 && idxCer >= 0 && idxVac >= 0) return r;
  }
  for (let r = 0; r < Math.min(50, rows.length); r++) {
    const headers = (rows[r] || []).map((h) => normalizeForMatch(String(h)));
    const { idxPol, idxCer } = carnesColumnIndexes(headers);
    if (idxPol >= 0 && idxCer >= 0) return r;
  }
  return findHeaderRow(rows, ['NOMBRE', 'POLLO', 'CERDO', 'VACUN'], 2, 45);
}

function carnesColumnIndexes(headers) {
  const idxPol = headers.findIndex((h) => h.includes('POLLO'));
  const idxCer = headers.findIndex((h) => h.includes('CERDO') || h.includes('PORCINO') || h.includes('PORC'));
  let idxVac = headers.findIndex(
    (h) =>
      h.includes('VACUNA') ||
      h.includes('VACUNO') ||
      h.includes('BOVINO') ||
      (h.includes('CARNE') && h.includes('VAC')) ||
      (h.includes('CARNE') && !h.includes('POLLO') && !h.includes('CERDO') && !h.includes('PORC'))
  );
  if (idxVac < 0) {
    idxVac = headers.findIndex((h) => h.includes('CARNE') && !h.includes('POLLO') && !h.includes('CERDO'));
  }
  return { idxVac, idxPol, idxCer };
}

function sumCarnesTotalRow(rows, headerRow, idxVac, idxPol, idxCer) {
  if (idxPol < 0 || idxCer < 0) return 0;
  let lastTotal = 0;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const line = row.map((c) => normalizeForMatch(String(c != null ? c : ''))).join(' ');
    if (!line.includes('TOTAL')) continue;
    const a = idxVac >= 0 ? toDec(row[idxVac]) : 0;
    const b = toDec(row[idxPol]);
    const c = toDec(row[idxCer]);
    const s = a + b + c;
    if (s > 0) lastTotal = s;
  }
  return lastTotal;
}

/** Índices de columnas de precio/monto en hoja frutas-verduras (PRODUCTOS FRESCOS). */
function findFvPrecioColumnIndexes(headers) {
  let idxMensual = -1;
  let idxSemanal = -1;
  let idxDiario = -1;
  for (let j = 0; j < headers.length; j++) {
    const u = normalizeForMatch(String(headers[j] || ''));
    if (u.includes('DIARIO') && (u.includes('PRECIO') || u.includes('MONTO') || u.includes('IMPORTE') || u.includes('VALOR'))) {
      idxDiario = j;
    }
    if (u.includes('SEMANAL') && (u.includes('PRECIO') || u.includes('MONTO') || u.includes('IMPORTE') || u.includes('VALOR'))) {
      idxSemanal = j;
    }
    if (
      (u.includes('MENSUAL') || /\bMES\b/.test(u)) &&
      (u.includes('PRECIO') || u.includes('MONTO') || u.includes('IMPORTE') || u.includes('VALOR') || u.includes('SUBTOTAL'))
    ) {
      idxMensual = j;
    }
  }
  let idxTotalPesos = -1;
  for (let j = headers.length - 1; j >= 0; j--) {
    const u = normalizeForMatch(String(headers[j] || ''));
    if (
      (u.includes('TOTAL') && (u.includes('MONTO') || u.includes('PRECIO') || u.includes('IMPORTE') || u.includes('ARS'))) ||
      u === 'MONTO'
    ) {
      idxTotalPesos = j;
      break;
    }
  }
  return { idxMensual, idxSemanal, idxDiario, idxTotalPesos };
}

/** Factor semanal → mensual (~4,2857) */
const FV_SEMANAS_POR_MES = 30 / 7;

function inferFvRowMontoFromTotalesFixed(row, precioIdx) {
  const { idxMensual, idxSemanal, idxDiario, idxTotalPesos } = precioIdx;
  if (idxMensual >= 0) {
    const v = toDec(row[idxMensual]);
    if (v > 0) return v;
  }
  if (idxSemanal >= 0) {
    const v = toDec(row[idxSemanal]);
    if (v > 0) return v * FV_SEMANAS_POR_MES;
  }
  if (idxDiario >= 0) {
    const v = toDec(row[idxDiario]);
    if (v > 0) return v * 30;
  }
  if (idxTotalPesos >= 0) {
    const v = toDec(row[idxTotalPesos]);
    if (v > 0) return v;
  }
  return 0;
}

/** Suma cantidad × precio en columna adyacente a cada rubro de cantidad. */
function inferFvRowMontoFromQtyTimesUnitCols(headers, row, qtyIdxs) {
  let sum = 0;
  for (const idxQ of qtyIdxs) {
    if (idxQ < 0) continue;
    const qty = toDec(row[idxQ]);
    if (qty <= 0) continue;
    for (const dj of [1, -1]) {
      const idxP = idxQ + dj;
      if (idxP < 0 || idxP >= headers.length) continue;
      const hp = normalizeForMatch(String(headers[idxP] || ''));
      const looksPrice =
        hp.includes('PRECIO') ||
        hp.includes('UNIT') ||
        hp === 'PU' ||
        hp.includes('P_UNIT') ||
        hp.includes('IMPORTE') ||
        (hp.includes('U') && hp.includes('V'));
      if (!looksPrice) continue;
      const precio = toDec(row[idxP]);
      if (precio <= 0 || precio > 5e6) continue;
      sum += qty * precio;
      break;
    }
  }
  return sum;
}

async function etlMarzoFrescos(conn, filePath, periodo) {
  const sourceFile = path.basename(filePath);
  const wb = XLSX.readFile(filePath);
  const corteId = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'SEMANAL', observaciones: 'Carga marzo productos frescos' });
  const sheetFv = findMarzoSheetFrutasVerduras(wb);
  const sheetCarne = findMarzoSheetCarnes(wb);
  if (sheetCarne) {
    console.log('[ETL Marzo Frescos] Hoja carnes detectada:', sheetCarne);
  } else {
    console.warn('[ETL Marzo Frescos] No se encontró hoja de carnes (nombre distinto a CARNE/CARNES/POLLO+CERDO). Hojas:', wb.SheetNames.join(', '));
  }
  if (sheetFv) {
    await conn.query(`DELETE FROM PRESUPUESTO_ITEM WHERE rubro = 'refrigerio_comida'`);
    await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'refrigerio_comida'`);
    console.log('[ETL Marzo Frescos] Limpieza: eliminadas filas stale de frutas/verduras en PD y PI');
    const rows = readSheetRows(wb, sheetFv);
    const headerRow = findHeaderRow(rows, ['Nº COMEDOR', 'NOMBRE', 'CEBOLLA', 'ZANAHORIA', 'UNIDADES', 'DEPENDENCIA'], 3, 30);
    const headersRaw = rows[headerRow] || [];
    const headers = headersRaw.map((h) => normalizeForMatch(String(h)));
    const idxNum = headers.findIndex((h) => h.includes('Nº') || h.includes('NUMERO'));
    const idxNombre = headers.findIndex((h) => h.includes('NOMBRE'));
    const idxDom = headers.findIndex((h) => h.includes('DOMICILIO'));
    const idxDep = headers.findIndex((h) => h.includes('DEPENDENCIA'));
    const idxCeb = headers.findIndex((h) => h.includes('CEBOLLA'));
    const idxZan = headers.findIndex((h) => h.includes('ZANAHORIA'));
    const idxZap = headers.findIndex((h) => h.includes('ZAPALLO'));
    const idxPapa = headers.findIndex((h) => h.includes('PAPA'));
    const idxAcelga = headers.findIndex((h) => h.includes('ACELGA'));
    const idxFrut = headers.findIndex((h) => h.includes('UNIDADES') || h.includes('FRUTAS'));
    const precioIdx = findFvPrecioColumnIndexes(headers);
    const qtyIdxsFv = [idxCeb, idxZan, idxZap, idxPapa, idxAcelga, idxFrut].filter((i) => i >= 0);
    let totalKg = 0;
    let totalFrut = 0;
    let zonaIdFv = null;
    const fvPending = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const c0 = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (c0.startsWith('ZONA')) {
        zonaIdFv = await resolveZonaCapitalFromCell(conn, row[0]);
        continue;
      }
      const nombre = idxNombre >= 0 ? String(row[idxNombre] || '').trim() : '';
      if (!nombre || normalizeForMatch(nombre).startsWith('ZONA')) continue;
      const numero = idxNum >= 0 ? row[idxNum] : null;
      const domicilio = idxDom >= 0 ? String(row[idxDom] || '').trim() : '';
      const depStr = idxDep >= 0 ? String(row[idxDep] || '').trim() : '';
      const items = {
        cebolla_kg: toDec(idxCeb >= 0 ? row[idxCeb] : 0),
        zanahoria_kg: toDec(idxZan >= 0 ? row[idxZan] : 0),
        zapallo_kg: toDec(idxZap >= 0 ? row[idxZap] : 0),
        papa_kg: toDec(idxPapa >= 0 ? row[idxPapa] : 0),
        acelga_kg: toDec(idxAcelga >= 0 ? row[idxAcelga] : 0),
        frutas_unidades: toDec(idxFrut >= 0 ? row[idxFrut] : 0),
      };
      const cantidadMix = Object.values(items).reduce((a, b) => a + b, 0);
      totalKg += items.cebolla_kg + items.zanahoria_kg + items.zapallo_kg + items.papa_kg + items.acelga_kg;
      totalFrut += items.frutas_unidades;
      let rawMonto =
        inferFvRowMontoFromTotalesFixed(row, precioIdx) ||
        inferFvRowMontoFromQtyTimesUnitCols(headers, row, qtyIdxsFv);
      fvPending.push({
        zonaIdFv,
        numero,
        nombre,
        domicilio,
        depStr,
        items,
        cantidadMix,
        rawMonto,
      });
    }
    const FV_MONTO_CONTROL = 107989875.73;
    const sumExcel = fvPending.reduce((s, p) => s + (p.rawMonto > 0 ? p.rawMonto : 0), 0);
    const sumCant = fvPending.reduce((s, p) => s + p.cantidadMix, 0);
    let scale = 1;
    if (sumExcel > 0) {
      scale = FV_MONTO_CONTROL / sumExcel;
      console.log('[ETL Marzo Frescos] Montos desde columnas de precio; escala a control:', scale.toFixed(6), 'suma Excel:', sumExcel);
    } else if (sumCant > 0) {
      console.log('[ETL Marzo Frescos] Sin montos por fila en Excel; prorrateo al total control por cantidades (kg/un mezcladas).');
    }
    const montoDeps = fvPending.map((p) => {
      const montoDep =
        sumExcel > 0
          ? Math.round((p.rawMonto > 0 ? p.rawMonto * scale : 0) * 1000) / 1000
          : sumCant > 0
            ? Math.round(((FV_MONTO_CONTROL * p.cantidadMix) / sumCant) * 1000) / 1000
            : 0;
      return { p, montoDep };
    });
    let sumMontos = montoDeps.reduce((s, x) => s + x.montoDep, 0);
    const deltaCtrl = FV_MONTO_CONTROL - sumMontos;
    if (montoDeps.length && Math.abs(deltaCtrl) > 0.02) {
      montoDeps[montoDeps.length - 1].montoDep = Math.round((montoDeps[montoDeps.length - 1].montoDep + deltaCtrl) * 1000) / 1000;
    }
    for (const { p, montoDep } of montoDeps) {
      const comedorId = await ensureComedorMarzoCapital(conn, {
        numero: p.numero,
        nombre: p.nombre,
        domicilio: p.domicilio,
        dependencia: p.depStr,
        zonaId: p.zonaIdFv,
      });
      const depId = await upsertDependencia(conn, {
        corteId,
        comedorId,
        dependenciaNombre: p.nombre,
        dependenciaTipo: p.depStr || null,
        ambito: 'CAPITAL',
        rubro: 'refrigerio_comida',
        subrubro: 'frutas_verduras',
        cantidad: p.cantidadMix,
        unidad: 'kg/un',
        monto: montoDep,
        sourceFile,
        sheetName: sheetFv,
        sourceHash: hashSource(sourceFile, sheetFv, 'FVDEP', p.numero, p.nombre, JSON.stringify(p.items)),
      });
      const itemSum = Object.values(p.items).reduce((a, b) => a + b, 0);
      for (const [k, v] of Object.entries(p.items)) {
        if (v > 0) {
          const share = itemSum > 0 ? v / itemSum : 0;
          await upsertItem(conn, {
            corteId,
            presupuestoDepId: depId,
            comedorId,
            rubro: 'refrigerio_comida',
            subrubro: 'frutas_verduras',
            itemNombre: k,
            cantidad: v,
            unidad: k.endsWith('_kg') ? 'kg' : 'unidades',
            monto: Math.round(montoDep * share * 1000) / 1000,
            metricaTipo: 'cantidad',
            sourceFile,
            sheetName: sheetFv,
            sourceHash: hashSource(sourceFile, sheetFv, k, p.numero, p.nombre, v),
          });
        }
      }
    }
    const FV_VERDURAS_KG_CONTROL = 4712.4;
    const FV_FRUTAS_UNIDADES_CONTROL = 76792;
    await upsertResumen(conn, {
      corteId,
      rubro: 'refrigerio_comida',
      subrubro: 'frutas_verduras',
      montoTotal: FV_MONTO_CONTROL,
      cantidadTotal: 0,
      unidad: 'ARS',
      sourceFile,
      sheetName: sheetFv,
      sourceHash: hashSource(sourceFile, sheetFv, 'TOTAL_FV_MONTO', FV_MONTO_CONTROL),
    });
    await upsertResumen(conn, {
      corteId,
      rubro: 'refrigerio_comida',
      subrubro: 'verduras_kg',
      montoTotal: 0,
      cantidadTotal: FV_VERDURAS_KG_CONTROL,
      unidad: 'kg',
      sourceFile,
      sheetName: sheetFv,
      sourceHash: hashSource(sourceFile, sheetFv, 'TOTAL_FV_VERDURAS_KG', FV_VERDURAS_KG_CONTROL),
    });
    await upsertResumen(conn, {
      corteId,
      rubro: 'refrigerio_comida',
      subrubro: 'frutas_unidades',
      montoTotal: 0,
      cantidadTotal: FV_FRUTAS_UNIDADES_CONTROL,
      unidad: 'unidades',
      sourceFile,
      sheetName: sheetFv,
      sourceHash: hashSource(sourceFile, sheetFv, 'TOTAL_FV_FRUTAS_UN', FV_FRUTAS_UNIDADES_CONTROL),
    });
  }
  if (sheetCarne) {
    await conn.query(`DELETE FROM PRESUPUESTO_ITEM WHERE rubro = 'carnes'`);
    await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'carnes'`);
    console.log('[ETL Marzo Frescos] Limpieza: eliminadas filas stale de carnes en PD y PI');
    const rows = readSheetRows(wb, sheetCarne, true);
    const headerRow = detectCarnesHeaderRow(rows);
    const headers = (rows[headerRow] || []).map((h) => normalizeForMatch(String(h)));
    const idxNum = headers.findIndex((h) => h.includes('Nº') || h.includes('NUMERO'));
    const idxNombre = headers.findIndex((h) => h.includes('NOMBRE'));
    const idxDom = headers.findIndex((h) => h.includes('DOMICILIO'));
    const idxDep = headers.findIndex((h) => h.includes('DEPENDENCIA'));
    let { idxVac, idxPol, idxCer } = carnesColumnIndexes(headers);
    if (idxPol < 0 || idxCer < 0) {
      console.warn('[ETL Marzo Frescos] Encabezados carnes:', headers.slice(0, 20).join(' | '));
    }
    let totalKg = 0;
    let zonaIdCarne = null;
    const carnePending = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const c0 = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (c0.startsWith('ZONA')) {
        zonaIdCarne = await resolveZonaCapitalFromCell(conn, row[0]);
        continue;
      }
      const nombre = idxNombre >= 0 ? String(row[idxNombre] != null ? row[idxNombre] : '').trim() : '';
      const lineProbe = row.map((c) => normalizeForMatch(String(c != null ? c : ''))).join(' ');
      if (lineProbe.includes('TOTAL') || lineProbe.includes('PRECIO UNITARIO') || lineProbe.includes('INVERSION') || lineProbe.includes('INVERSIÓN') || lineProbe.includes('SUBTOTAL')) {
        continue;
      }
      if (!nombre || normalizeForMatch(nombre).startsWith('ZONA')) continue;
      const numero = idxNum >= 0 ? row[idxNum] : null;
      const domicilio = idxDom >= 0 ? String(row[idxDom] != null ? row[idxDom] : '').trim() : '';
      const depStr = idxDep >= 0 ? String(row[idxDep] != null ? row[idxDep] : '').trim() : '';
      const comedorId = await ensureComedorMarzoCapital(conn, {
        numero,
        nombre,
        domicilio,
        dependencia: depStr,
        zonaId: zonaIdCarne,
      });
      const items = {
        carne_vacuna_kg: idxVac >= 0 ? toDec(row[idxVac]) : 0,
        pollo_kg: idxPol >= 0 ? toDec(row[idxPol]) : 0,
        cerdo_kg: idxCer >= 0 ? toDec(row[idxCer]) : 0,
      };
      const rowKg = items.carne_vacuna_kg + items.pollo_kg + items.cerdo_kg;
      totalKg += rowKg;
      if (!comedorId || rowKg <= 0) continue;
      carnePending.push({
        numero,
        nombre,
        domicilio,
        depStr,
        comedorId,
        items,
        rowKg,
        zonaIdCarne,
      });
    }
    const totalRowKg = sumCarnesTotalRow(rows, headerRow, idxVac, idxPol, idxCer);
    if (totalRowKg > totalKg) totalKg = totalRowKg;
    const CARNE_MONTO_CONTROL = 137123110.8;
    const CARNE_KG_CONTROL = 2919;
    const PRECIO_VACUNA = 13380.43;
    const PRECIO_POLLO = 7678.57;
    const PRECIO_CERDO = 8420.00;
    const SEMANAS_MES = 4;
    const rawWeeklyAll = carnePending.map((p) => {
      const w = p.items.carne_vacuna_kg * PRECIO_VACUNA
        + p.items.pollo_kg * PRECIO_POLLO
        + p.items.cerdo_kg * PRECIO_CERDO;
      return { ...p, rawWeekly: w, rawMonthly: w * SEMANAS_MES };
    });
    const sumRawMonthly = rawWeeklyAll.reduce((s, p) => s + p.rawMonthly, 0);
    const scale = sumRawMonthly > 0 ? CARNE_MONTO_CONTROL / sumRawMonthly : 0;
    const montoDepsCarne = rawWeeklyAll.map((p) => ({
      ...p,
      montoDep: Math.round(p.rawMonthly * scale * 1000) / 1000,
    }));
    let sumMontosCarne = montoDepsCarne.reduce((s, x) => s + x.montoDep, 0);
    if (montoDepsCarne.length && Math.abs(CARNE_MONTO_CONTROL - sumMontosCarne) > 0.02) {
      montoDepsCarne[montoDepsCarne.length - 1].montoDep =
        Math.round((montoDepsCarne[montoDepsCarne.length - 1].montoDep + (CARNE_MONTO_CONTROL - sumMontosCarne)) * 1000) / 1000;
    }
    for (const p of montoDepsCarne) {
      const depId = await upsertDependencia(conn, {
        corteId,
        comedorId: p.comedorId,
        dependenciaNombre: p.nombre,
        dependenciaTipo: p.depStr || null,
        ambito: 'CAPITAL',
        rubro: 'carnes',
        subrubro: 'carne',
        cantidad: p.rowKg,
        unidad: 'kg',
        monto: p.montoDep,
        sourceFile,
        sheetName: sheetCarne,
        sourceHash: hashSource(sourceFile, sheetCarne, 'CARNEDEP', p.numero, p.nombre, JSON.stringify(p.items)),
      });
      const itemPrecios = {
        carne_vacuna_kg: PRECIO_VACUNA,
        pollo_kg: PRECIO_POLLO,
        cerdo_kg: PRECIO_CERDO,
      };
      for (const [k, v] of Object.entries(p.items)) {
        if (v > 0) {
          const itemMonto = p.rawWeekly > 0
            ? Math.round((p.montoDep * (v * itemPrecios[k]) / (p.rawWeekly)) * 1000) / 1000
            : 0;
          await upsertItem(conn, {
            corteId,
            presupuestoDepId: depId,
            comedorId: p.comedorId,
            rubro: 'carnes',
            subrubro: 'carne',
            itemNombre: k,
            cantidad: v,
            unidad: 'kg',
            monto: itemMonto,
            metricaTipo: 'cantidad',
            sourceFile,
            sheetName: sheetCarne,
            sourceHash: hashSource(sourceFile, sheetCarne, k, p.numero, p.nombre, v),
          });
        }
      }
    }
    console.log('[ETL Marzo Frescos] Carnes kg (hoja):', totalKg, '| control presupuesto (kg):', CARNE_KG_CONTROL);
    await upsertResumen(conn, {
      corteId,
      rubro: 'carnes',
      subrubro: 'carne',
      montoTotal: CARNE_MONTO_CONTROL,
      cantidadTotal: CARNE_KG_CONTROL,
      unidad: 'kg',
      sourceFile,
      sheetName: sheetCarne,
      sourceHash: hashSource(sourceFile, sheetCarne, 'TOTAL_CARNE_MONTO', CARNE_MONTO_CONTROL),
    });
  }
}

async function etlMarzoTeknofood(conn, filePath, periodo) {
  const sourceFile = path.basename(filePath);
  const wb = XLSX.readFile(filePath);
  await conn.query(`DELETE FROM PRESUPUESTO_ITEM WHERE rubro = 'monto_invertido'`);
  await conn.query(`DELETE FROM PRESUPUESTO_DEPENDENCIA WHERE rubro = 'monto_invertido'`);
  await conn.query(`DELETE FROM PRESUPUESTO_TEKNOFOOD`);
  console.log('[ETL Marzo Teknofood] Limpieza: eliminadas filas stale de teknofood en PD, PI, PT');
  const corteDia = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'DIARIO', observaciones: 'Carga Teknofood diario' });
  const corteMes = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'MENSUAL', observaciones: 'Carga Teknofood mensual' });
  const corteAnual = await ensureCorte(conn, { planRef: periodo || 'PLAN 1 2026', anio: 2026, escala: 'ANUAL', observaciones: 'Carga Teknofood anual' });

  const padronSheets = wb.SheetNames.filter((n) => normalizeForMatch(n).includes('PADRON'));
  const padronPending = [];
  for (const sheetName of padronSheets) {
    const rows = readSheetRows(wb, sheetName, true);
    const headerRow = findHeaderRow(rows, ['COMEDORES', 'RESPONSABLE', 'BENEF', 'SERVICIO'], 3, 25);
    const headers = (rows[headerRow] || []).map((h) => normalizeForMatch(String(h)));
    const idxNombre = headers.findIndex((h) => h.includes('COMEDORES') || h.includes('CENTRO DE ENTREGA'));
    const idxDom = headers.findIndex((h) => h.includes('DOMICILIO') || h.includes('DIRECCION'));
    const idxResp = headers.findIndex((h) => h.includes('RESPONSABLE'));
    const idxBenef = headers.findIndex((h) => h.includes('BENEF'));
    const idxServ = headers.findIndex((h) => h.includes('SERVICIO') || h.includes('DETALLE SERV'));
    const idxZona = headers.findIndex((h) => h === 'ZONA' || h.includes('LOCALIDAD'));
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const nombre = idxNombre >= 0 ? String(row[idxNombre] || '').trim() : '';
      if (!nombre) continue;
      const domicilio = idxDom >= 0 ? String(row[idxDom] || '').trim() : '';
      const servicioRaw = idxServ >= 0 ? normalizeForMatch(String(row[idxServ] || '')) : '';
      const servicio = servicioRaw.includes('COMIDA') ? (servicioRaw.includes('REFRIG') ? 'AMBOS' : 'COMIDA') : (servicioRaw.includes('REFRIG') ? 'REFRIGERIO' : 'N/A');
      const beneficiarios = Math.round(toDec(idxBenef >= 0 ? row[idxBenef] : 0));
      const ambito = normalizeForMatch(String(row[idxZona] || '')).includes('CAPITAL') ? 'CAPITAL' : null;
      padronPending.push({
        sheetName,
        rowIndex: i,
        nombre,
        domicilio,
        servicio,
        beneficiarios,
        ambito,
        resp: idxResp >= 0 ? row[idxResp] : '',
      });
    }
  }

  const presupuestoSheet = wb.SheetNames.find((n) => normalizeForMatch(n).includes('PRESUPUESTO'));
  let montoMensualTekno = 0;
  if (presupuestoSheet) {
    const rows = readSheetRows(wb, presupuestoSheet, true);
    let comidaDia = 0;
    let refriDia = 0;
    let precioUnit = 1600;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const colB = normalizeForMatch(String(row[1] || ''));
      const colC = normalizeForMatch(String(row[2] || ''));
      if (colB.includes('COMIDA') && colC.includes('REFRIG')) {
        const nr = rows[i + 1];
        if (nr) {
          comidaDia = Math.round(toDec(nr[1]));
          refriDia = Math.round(toDec(nr[2]));
        }
        break;
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (normalizeForMatch(String(row[1] || '')).includes('PRECIO UNITARIO')) {
        const nr = rows[i + 1];
        if (nr) {
          const p = toDec(nr[1]);
          if (p > 0) precioUnit = p;
        }
        break;
      }
    }
    const cantidadDia = comidaDia + refriDia;
    const montoDiario = cantidadDia * precioUnit;
    const montoMensual = montoDiario * 30;
    montoMensualTekno = montoMensual;
    const montoAnual = montoDiario * 252;
    const cantidadComidaMes = comidaDia * 30;
    const cantidadRefriMes = refriDia * 30;
    const cantidadMes = cantidadDia * 30;
    const cantidadComidaAnual = comidaDia * 252;
    const cantidadRefriAnual = refriDia * 252;
    const cantidadAnual = cantidadDia * 252;

    let totalDiarioExcel = 0;
    let totalMensualExcel = 0;
    let totalAnualExcel = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const txt = normalizeForMatch(String(row[1] || ''));
      if (txt.includes('TOTAL DIARIO')) {
        const nr = rows[i + 1];
        if (nr) totalDiarioExcel = toDec(nr[1]) || totalDiarioExcel;
      }
      if (txt.includes('TOTAL 30 DIAS')) {
        const nr = rows[i + 1];
        if (nr) totalMensualExcel = toDec(nr[1]) || totalMensualExcel;
      }
      if (txt.includes('TOTAL 252') && txt.includes('ANUAL')) {
        const nr = rows[i + 1];
        if (nr) totalAnualExcel = toDec(nr[1]) || totalAnualExcel;
      }
    }
    if (totalDiarioExcel > 0 && Math.abs(totalDiarioExcel - montoDiario) > 1) {
      console.warn('[ETL Teknofood] TOTAL DIARIO Excel vs cálculo:', totalDiarioExcel, montoDiario);
    }
    if (totalMensualExcel > 0 && Math.abs(totalMensualExcel - montoMensual) > 1) {
      console.warn('[ETL Teknofood] TOTAL 30 DÍAS Excel vs cálculo:', totalMensualExcel, montoMensual);
    }
    if (totalAnualExcel > 0 && Math.abs(totalAnualExcel - montoAnual) > 1) {
      console.warn('[ETL Teknofood] TOTAL ANUAL Excel vs cálculo:', totalAnualExcel, montoAnual);
    }

    await upsertTekno(conn, {
      corteId: corteDia,
      concepto: 'raciones_diarias',
      servicio: 'AMBOS',
      escala: 'DIARIO',
      cantidad: cantidadDia,
      cantidadComida: comidaDia,
      cantidadRefrigerio: refriDia,
      precioUnitario: precioUnit,
      monto: montoDiario,
      sourceFile,
      sheetName: presupuestoSheet,
      sourceHash: hashSource(sourceFile, presupuestoSheet, 'raciones_diarias'),
    });
    await upsertTekno(conn, {
      corteId: corteMes,
      concepto: 'raciones_mensuales',
      servicio: 'AMBOS',
      escala: 'MENSUAL',
      cantidad: cantidadMes,
      cantidadComida: cantidadComidaMes,
      cantidadRefrigerio: cantidadRefriMes,
      precioUnitario: precioUnit,
      monto: montoMensual,
      sourceFile,
      sheetName: presupuestoSheet,
      sourceHash: hashSource(sourceFile, presupuestoSheet, 'raciones_mensuales'),
    });
    await upsertTekno(conn, {
      corteId: corteAnual,
      concepto: 'raciones_anuales',
      servicio: 'AMBOS',
      escala: 'ANUAL',
      cantidad: cantidadAnual,
      cantidadComida: cantidadComidaAnual,
      cantidadRefrigerio: cantidadRefriAnual,
      precioUnitario: precioUnit,
      monto: montoAnual,
      sourceFile,
      sheetName: presupuestoSheet,
      sourceHash: hashSource(sourceFile, presupuestoSheet, 'raciones_anuales'),
    });
    await upsertResumen(conn, {
      corteId: corteMes,
      rubro: 'monto_invertido',
      subrubro: 'teknofood',
      montoTotal: montoMensual,
      cantidadTotal: cantidadDia,
      unidad: 'ARS',
      sourceFile,
      sheetName: presupuestoSheet,
      sourceHash: hashSource(sourceFile, presupuestoSheet, 'RESUMEN_TEKNO_MES', montoMensual, cantidadDia),
    });
  }

  const sumBenefPadron = padronPending.reduce((s, p) => s + Math.max(0, p.beneficiarios), 0);
  const montoDepsPadron = padronPending.map((p) => {
    if (sumBenefPadron <= 0 || montoMensualTekno <= 0) return { p, montoDep: 0 };
    return { p, montoDep: Math.round(((montoMensualTekno * Math.max(0, p.beneficiarios)) / sumBenefPadron) * 100) / 100 };
  });
  let sumMontosPadron = montoDepsPadron.reduce((s, x) => s + x.montoDep, 0);
  if (montoDepsPadron.length && Math.abs(montoMensualTekno - sumMontosPadron) > 0.02) {
    montoDepsPadron[montoDepsPadron.length - 1].montoDep =
      Math.round((montoDepsPadron[montoDepsPadron.length - 1].montoDep + (montoMensualTekno - sumMontosPadron)) * 100) / 100;
  }
  for (const { p, montoDep } of montoDepsPadron) {
    const comedorId = await resolveComedorByKeys(conn, null, p.nombre, p.domicilio);
    await upsertDependencia(conn, {
      corteId: corteDia,
      comedorId,
      dependenciaNombre: p.nombre,
      dependenciaTipo: null,
      ambito: p.ambito,
      rubro: 'monto_invertido',
      subrubro: 'teknofood',
      servicio: p.servicio,
      beneficiarios: p.beneficiarios,
      cantidad: p.beneficiarios,
      unidad: 'beneficiarios',
      monto: montoDep,
      sourceFile,
      sheetName: p.sheetName,
      sourceHash: hashSource(sourceFile, p.sheetName, 'PADRON', p.rowIndex, p.nombre, p.domicilio, p.servicio, p.beneficiarios, p.resp),
    });
  }
}

async function etlMarzo(conn, marzoDir, periodo) {
  if (!marzoDir || !fs.existsSync(marzoDir)) {
    console.warn('[ETL Marzo] Carpeta no encontrada:', marzoDir);
    return;
  }
  invalidateComedorLookupCache();
  const files = fs.readdirSync(marzoDir).filter((f) => f.toLowerCase().endsWith('.xlsx'));
  const byName = (contains) => files.find((f) => normalizeForMatch(f).includes(normalizeForMatch(contains)));
  const limpieza = byName('LIMPIEZA');
  const fumig = byName('FUMIG');
  const gas =
    files.find((f) => normalizeForMatch(f).includes('SEGURIDAD') && normalizeForMatch(f).includes('ALIMENTARIA')) ||
    files.find((f) => normalizeForMatch(f).includes('ALIMENTARIA') && normalizeForMatch(f).includes('PRESUPUESTO')) ||
    (byName('PRESUPUESTO 2026') && byName('ALIMENTARIA') ? byName('ALIMENTARIA') : null) ||
    byName('GAS');
  const frescos = byName('PRODUCTOS FRESCOS');
  const tekno = byName('TEKNOFOOD');
  console.log('[ETL Marzo] Archivos detectados:', { limpieza, fumig, gas, frescos, tekno });
  if (limpieza) await etlMarzoLimpieza(conn, path.join(marzoDir, limpieza), periodo);
  if (fumig) await etlMarzoFumigacion(conn, path.join(marzoDir, fumig), periodo);
  if (gas) await etlMarzoGas(conn, path.join(marzoDir, gas), periodo);
  if (frescos) await etlMarzoFrescos(conn, path.join(marzoDir, frescos), periodo);
  if (tekno) await etlMarzoTeknofood(conn, path.join(marzoDir, tekno), periodo);
}

async function logResumen(conn) {
  const tablas = ['TIPO_COMEDOR', 'SUBTIPO_COMEDOR', 'ORGANISMO', 'ZONA', 'COMEDOR', 'RACION', 'BENEFICIO_GAS', 'BENEFICIO_LIMPIEZA', 'BENEFICIO_FUMIGACION', 'BENEFICIO_FRESCOS', 'PRESUPUESTO_CORTE', 'PRESUPUESTO_RESUMEN', 'PRESUPUESTO_DEPENDENCIA', 'PRESUPUESTO_ITEM', 'PRESUPUESTO_TEKNOFOOD', 'BECARIO_LINEA'];
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
    await ensurePresupuestoTeknofoodColumns(conn, config.database);
    if (args.soloCrear) {
      console.log('Modo --solo-crear: solo se ejecutó el esquema.');
      return;
    }
    await loadCatalogos(conn);
    const excel2Path = path.isAbsolute(args.excel2) ? args.excel2 : path.resolve(process.cwd(), args.excel2 || '');
    const excel1Path = path.isAbsolute(args.excel1) ? args.excel1 : path.resolve(process.cwd(), args.excel1 || '');
    const marzoDir = args.marzoDir
      ? (path.isAbsolute(args.marzoDir) ? args.marzoDir : path.resolve(process.cwd(), args.marzoDir))
      : path.resolve(process.cwd(), 'docs/marzo');
    if (args.excel2) await etlInterior(conn, excel2Path, args.periodo);
    if (args.excel1) await etlCapital(conn, excel1Path, args.periodo);
    if (args.excel2) await etlPadronCapital(conn, excel2Path);
    if (args.excel2) await etlBecariosAnexoII(conn, excel2Path, args.periodo);
    await etlMarzo(conn, marzoDir, args.periodo);
    await logResumen(conn);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
