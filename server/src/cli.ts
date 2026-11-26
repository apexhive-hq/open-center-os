#!/usr/bin/env node
import { join } from 'node:path';
import { createOpenCenterServer } from './app.js';
import { OpenCenterDb } from './db.js';
import { seedDemoData } from './seed.js';

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function main() {
  const args = process.argv.slice(2);
  const sub = args[0];

  if (sub === 'help' || sub === '--help' || sub === '-h') {
    console.log(`open-center-os — Free MIT Multi-Branch Operations Server

Usage:
  open-center-os serve [--host 127.0.0.1] [--port 3800] [--data-dir ./data] [--seed] [--admin-password <pw>]
`);
    return;
  }

  const host = readFlag(args, '--host') || '127.0.0.1';
  const port = Number(readFlag(args, '--port') || (sub === 'serve' ? '3800' : '3000'));
  const dataDir = readFlag(args, '--data-dir') || './data';
  const shouldSeed = args.includes('--seed');
  const adminPassword = readFlag(args, '--admin-password') || process.env.OPENCENTER_ADMIN_PASSWORD;
  const dbPath = join(dataDir, 'open-center.sqlite');

  const db = new OpenCenterDb(dbPath);
  if (shouldSeed) {
    seedDemoData(db);
  }
  const server = createOpenCenterServer({ db, adminPassword });

  server.listen(port, host, () => {
    console.log(
      `open-center-os MIT server listening on http://${host}:${port} (db: ${dbPath}${shouldSeed ? ', seeded' : ''})`
    );
    if (server.generatedPasswordUsed) {
      console.log(`Generated one-time Admin password (set OPENCENTER_ADMIN_PASSWORD to override): ${server.adminPassword}`);
    }
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
