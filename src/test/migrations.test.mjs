import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', 'server', 'db', 'migrations');

test('migrations directory is non-empty and uses .sql files', () => {
  const files = readdirSync(MIGRATIONS_DIR);
  const sql = files.filter((f) => f.endsWith('.sql'));
  assert.ok(sql.length > 0, 'expected at least one .sql migration');
});

test('migration files follow the NNNN_name.sql lexical convention', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  for (const file of files) {
    assert.match(file, /^\d{4}_[a-z0-9_]+\.sql$/, `unexpected migration name: ${file}`);
  }
});

test('migration files are lexically ordered without gaps', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  files.forEach((file, idx) => {
    const expectedPrefix = String(idx + 1).padStart(4, '0');
    assert.ok(
      file.startsWith(expectedPrefix),
      `migration ${file} should start with ${expectedPrefix} (lexical position ${idx})`
    );
  });
});

test('every migration is wrapped in BEGIN/COMMIT', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    assert.ok(/\bBEGIN\b/i.test(sql), `${file} missing BEGIN`);
    assert.ok(/\bCOMMIT\b/i.test(sql), `${file} missing COMMIT`);
  }
});

test('0002_rls.sql enables RLS on every table listed in TENANT_TABLES', async () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0002_rls.sql'), 'utf8');
  const { TENANT_TABLES } = await import('../../server/db/schema.ts');
  for (const table of TENANT_TABLES) {
    assert.ok(sql.includes(`'${table}'`) || sql.includes(`${table} `), `${table} not referenced in 0002_rls.sql`);
  }
});
