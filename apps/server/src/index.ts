import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const { app } = await buildApp({
  catalogPath: process.env.CATALOG_PATH ?? `${root}data/catalog/catalog.json.gz`,
  dbPath: process.env.DB_PATH ?? `${root}data/state/akinator.sqlite`,
  staticDir: process.env.STATIC_DIR ?? `${root}apps/web/dist`,
  logger: true,
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
