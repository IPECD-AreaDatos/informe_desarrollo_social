import {
  canonicalPadronId,
  docsDirForPeriodo,
  expandPadronLookupKeys,
  findGlobFile,
  getMapByPadronId,
  padronIdAliases,
  readCsvRows,
} from './rankingRacionesCsv';

export type DependenciaCatalogRow = {
  nombre: string;
  domicilio: string | null;
  responsable: string | null;
  zona: string | null;
  tipoReceptor: string | null;
};

let cachedDir: string | null = null;
let cachedMap = new Map<string, DependenciaCatalogRow>();

function isInteriorPadronId(id: string): boolean {
  const n = parseInt(String(id).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 144;
}

function loadTeknofoodCatalog(dir: string): Map<string, DependenciaCatalogRow> {
  const out = new Map<string, DependenciaCatalogRow>();
  const file = findGlobFile(dir, /^Padron Teknofood\.csv$/i);
  if (!file) return out;

  const rows = readCsvRows(file);
  if (rows.length < 2) return out;
  const hdr = rows[0].map((h) => String(h ?? '').trim().toUpperCase());
  const iId = hdr.indexOf('ID');
  const iNombre = hdr.findIndex((h) => h.includes('DEPENDENCIA') || h.includes('CENTRO'));
  const iZona = hdr.indexOf('ZONA');
  const iDomicilio = hdr.indexOf('DOMICILIO');
  const iResp = hdr.indexOf('RESPONSABLE');
  const iTipo = hdr.findIndex((h) => h.includes('TIPO') && h.includes('RECEPTOR'));

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[iId >= 0 ? iId : 0] ?? '').trim());
    if (!id) continue;
    const nombre = iNombre >= 0 ? String(r[iNombre] ?? '').trim() : '';
    if (!nombre) continue;
    out.set(id, {
      nombre,
      domicilio: iDomicilio >= 0 ? String(r[iDomicilio] ?? '').trim() || null : null,
      responsable: iResp >= 0 ? String(r[iResp] ?? '').trim() || null : null,
      zona: iZona >= 0 ? String(r[iZona] ?? '').trim() || null : null,
      tipoReceptor: iTipo >= 0 ? String(r[iTipo] ?? '').trim() || null : null,
    });
  }
  return out;
}

function loadCapitalHoja1Catalog(dir: string): Map<string, DependenciaCatalogRow> {
  const out = new Map<string, DependenciaCatalogRow>();
  const file = findGlobFile(dir, /^Capital Hoja 1\.csv$/i);
  if (!file) return out;

  const rows = readCsvRows(file);
  const hdrIdx = rows.findIndex((r) => r.some((c) => /nombre dependencia/i.test(String(c))));
  if (hdrIdx < 0) return out;
  const hdr = rows[hdrIdx];
  const iId = hdr.findIndex((h) => /^id$/i.test(String(h).trim()));
  const iNombre = hdr.findIndex((h) => /nombre dependencia/i.test(String(h)));
  const iDomicilio = hdr.findIndex((h) => /domicilio/i.test(String(h)));
  const iResp = hdr.findIndex((h) => /^responsable$/i.test(String(h).trim()));
  if (iId < 0 || iNombre < 0) return out;

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[iId] ?? '').trim());
    const nombre = String(r[iNombre] ?? '').trim();
    if (!id || !nombre) continue;
    out.set(id, {
      nombre,
      domicilio: iDomicilio >= 0 ? String(r[iDomicilio] ?? '').trim() || null : null,
      responsable: iResp >= 0 ? String(r[iResp] ?? '').trim() || null : null,
      zona: 'CAPITAL',
      tipoReceptor: null,
    });
  }
  return out;
}

function loadInteriorHoja1Catalog(dir: string): Map<string, DependenciaCatalogRow> {
  const out = new Map<string, DependenciaCatalogRow>();
  const file = findGlobFile(dir, /^Interior Hoja 1\.csv$/i);
  if (!file) return out;

  const rows = readCsvRows(file);
  if (rows.length < 2) return out;
  const hdr = rows[0];
  const iNum = hdr.findIndex((h) => /^n[º°o\.]/i.test(String(h).trim()));
  const iEntrega = hdr.findIndex((h) => /^centro de entrega$/i.test(String(h).trim()));
  const iDir = hdr.findIndex((h) => /^direcci[oó]n$/i.test(String(h).trim()));
  const iResp = hdr.findIndex((h) => /^responsable$/i.test(String(h).trim()));
  const iLocalidad = hdr.findIndex((h) => /^localidad$/i.test(String(h).trim()));
  if (iNum < 0 || iEntrega < 0) return out;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = canonicalPadronId(String(r[iNum] ?? '').trim());
    const nombre = String(r[iEntrega] ?? '').trim();
    if (!id || !nombre) continue;
    out.set(id, {
      nombre,
      domicilio: iDir >= 0 ? String(r[iDir] ?? '').trim() || null : null,
      responsable: iResp >= 0 ? String(r[iResp] ?? '').trim() || null : null,
      zona: iLocalidad >= 0 ? String(r[iLocalidad] ?? '').trim() || null : null,
      tipoReceptor: null,
    });
  }
  return out;
}

/** Catálogo por ID: Teknofood (capital) → Interior Hoja 1 (Nº ≥ 144) → Capital Hoja 1. */
export function loadDependenciaCatalogForDir(dir: string): Map<string, DependenciaCatalogRow> {
  if (cachedDir === dir && cachedMap.size > 0) return cachedMap;

  const tekno = loadTeknofoodCatalog(dir);
  const capital = loadCapitalHoja1Catalog(dir);
  const interior = loadInteriorHoja1Catalog(dir);
  const out = new Map<string, DependenciaCatalogRow>();

  for (const [id, row] of capital) {
    if (!isInteriorPadronId(id)) out.set(id, row);
  }
  for (const [id, row] of tekno) {
    if (!isInteriorPadronId(id)) out.set(id, row);
  }
  for (const [id, row] of interior) {
    if (isInteriorPadronId(id)) out.set(id, row);
  }

  cachedDir = dir;
  cachedMap = out;
  return out;
}

export function loadDependenciaCatalogForPeriodo(
  periodo: string
): Map<string, DependenciaCatalogRow> | null {
  const dir = docsDirForPeriodo(periodo);
  if (!dir) return null;
  return loadDependenciaCatalogForDir(dir);
}

/** Matcheo estricto por ID (sin alias por nombre). */
export function lookupDependenciaCatalogFromMap(
  padronId: string,
  catalog: Map<string, DependenciaCatalogRow>,
  _aliasMap?: Map<string, Set<string>>
): DependenciaCatalogRow | null {
  for (const key of padronIdAliases(padronId)) {
    const hit = catalog.get(canonicalPadronId(key));
    if (hit) return hit;
  }
  return catalog.get(canonicalPadronId(padronId)) ?? null;
}

export function lookupDependenciaCatalogCsv(
  periodo: string,
  comedorId: string,
  numeroOficial?: string | null,
  aliasMap?: Map<string, Set<string>>
): DependenciaCatalogRow | null {
  const catalog = loadDependenciaCatalogForPeriodo(periodo);
  if (!catalog?.size) return null;
  for (const rawId of [comedorId, numeroOficial ?? '']) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const hit = lookupDependenciaCatalogFromMap(id, catalog, aliasMap);
    if (hit) return hit;
  }
  return null;
}

export function loadDependenciaNombresForDir(dir: string): Map<string, string> {
  const catalog = loadDependenciaCatalogForDir(dir);
  const out = new Map<string, string>();
  for (const [id, row] of catalog) out.set(id, row.nombre);
  return out;
}

export function loadDependenciaNombresForPeriodo(periodo: string): Map<string, string> | null {
  const catalog = loadDependenciaCatalogForPeriodo(periodo);
  if (!catalog) return null;
  const out = new Map<string, string>();
  for (const [id, row] of catalog) out.set(id, row.nombre);
  return out;
}

export function lookupDependenciaNombreFromMap(
  padronId: string,
  catalog: Map<string, string>,
  aliasMap?: Map<string, Set<string>>,
  ...fallbacks: (string | null | undefined)[]
): string | null {
  const fromCatalog = aliasMap
    ? getMapByPadronId(catalog, padronId, aliasMap)
    : undefined;
  if (fromCatalog) return fromCatalog;
  for (const key of expandPadronLookupKeys(padronId, aliasMap)) {
    const hit = catalog.get(key);
    if (hit) return hit;
  }
  for (const key of padronIdAliases(padronId)) {
    const hit = catalog.get(key);
    if (hit) return hit;
  }
  for (const fb of fallbacks) {
    const s = String(fb ?? '').trim();
    if (s) return s;
  }
  return null;
}

export function lookupDependenciaNombreCsv(
  periodo: string,
  comedorId: string,
  numeroOficial?: string | null,
  aliasMap?: Map<string, Set<string>>
): string | null {
  return lookupDependenciaCatalogCsv(periodo, comedorId, numeroOficial, aliasMap)?.nombre ?? null;
}
