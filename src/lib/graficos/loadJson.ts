import fs from 'fs';
import path from 'path';
import type { GraficoWorkbook } from './types';

const DATA_DIR = path.join(process.cwd(), 'src/data/graficos');

export function listGraficosIndex(): { id: string; titulo: string }[] {
  const indexPath = path.join(DATA_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) return [];
  return JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { id: string; titulo: string }[];
}

export function loadGraficoWorkbook(id: string): GraficoWorkbook | null {
  const safe = id.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(DATA_DIR, `${safe}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as GraficoWorkbook;
}

export function loadAllGraficoWorkbooks(): GraficoWorkbook[] {
  return listGraficosIndex()
    .map((item) => loadGraficoWorkbook(item.id))
    .filter((w): w is GraficoWorkbook => w != null);
}
