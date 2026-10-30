// Arranca el servidor de la API y Vite a la vez (npm run dev).
import { spawn } from 'node:child_process';

const procs = [
  ['api', 'npm', ['run', 'dev:server']],
  ['web', 'npm', ['run', 'dev', '-w', '@am/web']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const prefix = (chunk) => chunk.toString().split('\n').filter(Boolean).map((l) => `[${name}] ${l}`).join('\n') + '\n';
  p.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  p.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  return p;
});

const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
