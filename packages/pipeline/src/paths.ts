import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const RAW_DIR = join(ROOT, 'data', 'raw');
export const CATALOG_DIR = join(ROOT, 'data', 'catalog');
export const CATALOG_FILE = join(CATALOG_DIR, 'catalog.json.gz');
export const COVERAGE_FILE = join(CATALOG_DIR, 'coverage.json');

export function rawPath(file: string): string {
  return join(RAW_DIR, file);
}
