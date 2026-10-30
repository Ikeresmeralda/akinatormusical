import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { RAW_DIR, rawPath } from './paths';
import { SOURCES } from './sources';

const USER_AGENT = 'AkinatorMusical-pipeline/0.1 (+https://github.com/Ikeresmeralda/akinatormusical)';

/** Descarga las fuentes que falten en data/raw (o todas con --force). */
export async function downloadSources({ force = false } = {}): Promise<void> {
  mkdirSync(RAW_DIR, { recursive: true });
  for (const source of Object.values(SOURCES)) {
    const target = rawPath(source.file);
    if (!force && existsSync(target)) {
      console.log(`✓ ${source.file} (en caché)`);
      continue;
    }
    process.stdout.write(`↓ ${source.file} … `);
    const res = await fetch(source.download, { headers: { 'user-agent': USER_AGENT } });
    if (!res.ok) throw new Error(`No se pudo descargar ${source.download}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(target, buf);
    console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  downloadSources({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
