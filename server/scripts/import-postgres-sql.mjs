import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, '..', '..');
const files = process.argv.slice(2);
const sqlFiles = files.length ? files : ['database/schema.sql', 'database/seed_mvp.sql'];

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  for (const file of sqlFiles) {
    const absolutePath = resolve(repoRoot, file);
    const sql = readFileSync(absolutePath, 'utf8');
    console.log(`Applying ${file}...`);
    await client.query(sql);
  }
  console.log('PostgreSQL import completed.');
} finally {
  await client.end().catch(() => {});
}
