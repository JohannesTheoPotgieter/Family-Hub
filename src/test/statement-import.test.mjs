import test from 'node:test';
import assert from 'node:assert/strict';

const detectFormat = (text) => /<OFX>|<BANKTRANLIST>|<STMTTRN>/i.test(text) ? 'ofx' : /\t/.test(text) ? 'tsv' : 'csv';

const normalizeNumberText = (value) => {
  let next = value
    .replace(/\b(?:zar|usd|eur|gbp|cr|dr|db)\b/gi, '')
    .replace(/[^\d,.\-+()']/g, '')
    .replace(/'/g, '');
  const negativeByParens = /^\(.*\)$/.test(next);
  if (negativeByParens) next = next.slice(1, -1);
  const trailingMinus = /-$/.test(next);
  if (trailingMinus) next = next.slice(0, -1);
  const lastComma = next.lastIndexOf(',');
  const lastDot = next.lastIndexOf('.');
  let decimalSeparator = '';
  if (lastComma >= 0 && lastDot >= 0) decimalSeparator = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0 && next.length - lastComma - 1 <= 2) decimalSeparator = ',';
  else if (lastDot >= 0 && next.length - lastDot - 1 <= 2) decimalSeparator = '.';
  if (decimalSeparator === ',') next = next.replace(/\./g, '').replace(/,/g, '.');
  else if (decimalSeparator === '.') next = next.replace(/,/g, '');
  else next = next.replace(/[,.]/g, '');
  if (negativeByParens || trailingMinus) next = `-${next}`;
  return next;
};

const parseMoneyCell = (value) => {
  const parsed = Number.parseFloat(normalizeNumberText(value));
  if (Number.isNaN(parsed)) return { cents: null, kind: null };
  if (/\b(?:credit|cr|deposit|received)\b/i.test(value) || /^\+/.test(value)) return { cents: Math.round(Math.abs(parsed) * 100), kind: 'inflow' };
  if (/\b(?:debit|dr|db|withdrawal|purchase|spent|fee)\b/i.test(value) || /^\s*-/.test(value) || value.includes('(') || value.endsWith('-') || parsed < 0) return { cents: Math.round(Math.abs(parsed) * 100), kind: 'outflow' };
  return { cents: Math.round(Math.abs(parsed) * 100), kind: null };
};

const duplicateKey = (dateIso, cents, title) => `${dateIso}|${cents}|${title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()}`;

test('detects csv, tsv, and ofx statement formats', () => {
  assert.equal(detectFormat('Date,Description,Amount'), 'csv');
  assert.equal(detectFormat('Date\tDescription\tAmount'), 'tsv');
  assert.equal(detectFormat('<OFX><STMTTRN><TRNAMT>-10.00'), 'ofx');
});

test('parses signed and tagged amounts into cents and money direction', () => {
  assert.deepEqual(parseMoneyCell('1 234,56 CR'), { cents: 123456, kind: 'inflow' });
  assert.deepEqual(parseMoneyCell('(250.00)'), { cents: 25000, kind: 'outflow' });
  assert.deepEqual(parseMoneyCell('89.15'), { cents: 8915, kind: null });
});

test('duplicate keys catch repeated statement rows against existing transactions', () => {
  const existing = duplicateKey('2026-03-16', 24500, 'Woolworths');
  const imported = duplicateKey('2026-03-16', 24500, 'WOOLWORTHS');
  const different = duplicateKey('2026-03-17', 24500, 'WOOLWORTHS');
  assert.equal(existing, imported);
  assert.notEqual(existing, different);
});
