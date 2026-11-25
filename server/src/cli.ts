#!/usr/bin/env node
import { join } from 'node:path';
import { createOpenCenterServer } from './app.js';
import { OpenCenterDb } from './db.js';
import { loadActiveLicense, saveActivatedLicense } from './license.js';
import { seedDemoData } from './seed.js';

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function main() {
  const args = process.argv.slice(2);
  const sub = args[0];

  if (sub === 'activate' || (sub === 'license' && args[1] === 'activate')) {
    const token = readFlag(args, '--token') || (sub === 'license' ? args[2] : args[1]);
    if (!token || token.startsWith('--')) {
      console.error('Usage: open-center-os activate --token <OPENCEN-PRO-v1...>');
      process.exit(2);
    }
    const { filePath, verification } = saveActivatedLicense(token);
    console.log(JSON.stringify({ ok: true, tier: verification.payload?.tier, filePath }, null, 2));
    return;
  }

  if (sub === 'license-status') {
    const status = loadActiveLicense();
    console.log(JSON.stringify(status ?? { valid: false, reason: 'Single-branch MIT mode ($0 unrestricted).' }, null, 2));
    return;
  }

  const host = readFlag(args, '--host') || '127.0.0.1';
  const port = Number(readFlag(args, '--port') || (sub === 'serve' ? '3800' : '3000'));
  const dataDir = readFlag(args, '--data-dir') || './data';
  const shouldSeed = args.includes('--seed');
  const dbPath = join(dataDir, 'open-center.sqlite');

  const db = new OpenCenterDb(dbPath);
  if (shouldSeed) {
    seedDemoData(db);
  }
  const server = createOpenCenterServer({ db });

  server.listen(port, host, () => {
    console.log(`open-center-os MIT server listening on http://${host}:${port} (db: ${dbPath}${shouldSeed ? ', seeded' : ''})`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
