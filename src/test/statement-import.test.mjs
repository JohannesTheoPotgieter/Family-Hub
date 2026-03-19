import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatementPreview, parseStatementText } from '../lib/family-hub/statementImport.ts';

test('detects csv, tsv, and ofx statement formats', () => {
  assert.equal(parseStatementText('statement.csv', 'Date,Description,Amount').format, 'csv');
  assert.equal(parseStatementText('statement.tsv', 'Date\tDescription\tAmount').format, 'tsv');
  assert.equal(parseStatementText('statement.ofx', '<OFX><STMTTRN><TRNAMT>-10.00').format, 'ofx');
});

test('parses signed and tagged amounts into cents and money direction', () => {
  const parsed = parseStatementText('statement.csv', 'Date,Description,Amount\n2026-03-16,Salary,"1 234,56 CR"\n2026-03-17,Coffee,(250.00)\n2026-03-18,Unknown,89.15');
  const preview = buildStatementPreview(parsed, parsed.suggestedMapping, [], ['Income', 'Entertainment', 'Other']);
  assert.equal(preview.rows[0].amountCents, 123456);
  assert.equal(preview.rows[0].kind, 'inflow');
  assert.equal(preview.rows[1].amountCents, 25000);
  assert.equal(preview.rows[1].kind, 'outflow');
});

test('duplicate keys catch repeated statement rows against existing transactions', () => {
  const parsed = parseStatementText('statement.csv', 'Date,Description,Amount\n2026-03-16,Woolworths,-245.00');
  const preview = buildStatementPreview(
    parsed,
    parsed.suggestedMapping,
    [{ id: 'existing', title: 'WOOLWORTHS', amountCents: 24500, dateIso: '2026-03-16', kind: 'outflow', category: 'Groceries', source: 'manual' }],
    ['Groceries', 'Other']
  );
  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.rows[0].duplicate, true);
});
