import fs from 'fs';
import path from 'path';
import { extractAllGraficos, assertGraficosExactos } from '../src/lib/graficos/extractXlsx';

const OUT_DIR = path.join(process.cwd(), 'src/data/graficos');

function main() {
  const workbooks = extractAllGraficos();
  assertGraficosExactos(workbooks);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const wb of workbooks) {
    const outPath = path.join(OUT_DIR, `${wb.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(wb, null, 2), 'utf8');
    const chartCount = 'tabs' in wb
      ? wb.tabs.reduce((a, t) => a + t.charts.length, 0)
      : wb.charts.length;
    console.log(`✓ ${wb.id}.json (${chartCount} gráficos)`);
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(workbooks.map((w) => ({ id: w.id, titulo: w.titulo })), null, 2),
    'utf8'
  );
  console.log('Listo.');
}

main();
