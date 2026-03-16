import type { MoneyTransaction } from './storage';

export type StatementFormat = 'csv' | 'tsv' | 'ofx';
export type StatementMappingConfidence = 'high' | 'medium' | 'low';
export type StatementColumnRole = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'direction' | 'reference' | 'balance';

export type StatementColumnMapping = Record<StatementColumnRole, string | null>;

export type ParsedStatementRow = {
  id: string;
  values: Record<string, string>;
};

export type ParsedStatement = {
  format: StatementFormat;
  fileName: string;
  headers: string[];
  rows: ParsedStatementRow[];
  suggestedMapping: StatementColumnMapping;
  mappingConfidence: StatementMappingConfidence;
  warnings: string[];
};

export type StatementPreviewRow = {
  id: string;
  rowIndex: number;
  values: Record<string, string>;
  dateIso: string | null;
  title: string;
  amountCents: number | null;
  kind: 'inflow' | 'outflow' | null;
  category: string;
  categoryConfidence: StatementMappingConfidence;
  warnings: string[];
  duplicate: boolean;
  includeByDefault: boolean;
  reference: string;
};

export type StatementPreview = {
  rows: StatementPreviewRow[];
  readyCount: number;
  needsAttentionCount: number;
  duplicateCount: number;
  missingRequiredCount: number;
  requiresMappingReview: boolean;
};

const HEADER_ALIASES: Record<StatementColumnRole, string[]> = {
  date: ['date', 'posted', 'posting', 'value date', 'transaction date', 'post date'],
  description: ['description', 'details', 'narrative', 'merchant', 'payee', 'beneficiary', 'transaction', 'statement detail', 'particulars'],
  amount: ['amount', 'transaction amount', 'amt', 'zar', 'value'],
  debit: ['debit', 'withdrawal', 'money out', 'payment out', 'debits', 'debit amount', 'spent'],
  credit: ['credit', 'deposit', 'money in', 'payment in', 'credits', 'credit amount', 'received'],
  direction: ['type', 'transaction type', 'debit/credit', 'credit/debit', 'dr/cr', 'cr/dr', 'direction', 'entry type'],
  reference: ['reference', 'ref', 'memo', 'note', 'narration', 'reference number'],
  balance: ['balance', 'running balance', 'available balance', 'closing balance']
};

const CATEGORY_RULES: Array<{ category: string; kind?: 'inflow' | 'outflow'; keywords: string[] }> = [
  { category: 'Groceries', kind: 'outflow', keywords: ['grocery', 'grocer', 'checkers', 'pick n pay', 'shoprite', 'spar', 'woolworths', 'food', 'market'] },
  { category: 'Utilities', kind: 'outflow', keywords: ['municipal', 'electric', 'water', 'rent', 'rates', 'internet', 'wifi', 'vodacom', 'mtn', 'telkom', 'cell c', 'airtime', 'insurance'] },
  { category: 'Transport', kind: 'outflow', keywords: ['uber', 'bolt', 'engen', 'shell', 'fuel', 'petrol', 'diesel', 'taxi', 'transport', 'parking', 'bus'] },
  { category: 'School', kind: 'outflow', keywords: ['school', 'tuition', 'stationery', 'books', 'uniform', 'creche', 'crèche'] },
  { category: 'Entertainment', kind: 'outflow', keywords: ['movie', 'cinema', 'netflix', 'spotify', 'dstv', 'restaurant', 'coffee', 'cafe', 'takeaway', 'gaming', 'play'] },
  { category: 'Health', kind: 'outflow', keywords: ['pharmacy', 'clinic', 'doctor', 'hospital', 'med', 'dischem', 'clicks', 'dentist'] },
  { category: 'Income', kind: 'inflow', keywords: ['salary', 'payroll', 'income', 'refund', 'interest', 'bonus', 'transfer in', 'deposit', 'pay'] }
];

const COMMON_MATCH_WORDS = new Set(['the', 'and', 'from', 'to', 'for', 'card', 'purchase', 'payment', 'transfer', 'bank', 'pos', 'eft', 'fee', 'atm']);

export const createEmptyStatementColumnMapping = (): StatementColumnMapping => ({
  date: null,
  description: null,
  amount: null,
  debit: null,
  credit: null,
  direction: null,
  reference: null,
  balance: null
});

const scoreHeader = (header: string, aliases: string[]) => {
  const normalized = normalizeHeader(header);
  let score = 0;
  for (const alias of aliases) {
    if (normalized === alias) score = Math.max(score, 10);
    else if (normalized.startsWith(alias) || normalized.endsWith(alias)) score = Math.max(score, 8);
    else if (normalized.includes(alias)) score = Math.max(score, 6);
  }
  return score;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');

const normalizeDescriptionForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeDescription = (value: string) =>
  normalizeDescriptionForMatch(value)
    .split(' ')
    .filter((token) => token.length > 2 && !COMMON_MATCH_WORDS.has(token));

const detectFormat = (text: string): StatementFormat => {
  if (/<OFX>|<BANKTRANLIST>|<STMTTRN>/i.test(text)) return 'ofx';
  const sampleLines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8);
  const tabCount = sampleLines.reduce((sum, line) => sum + (line.match(/\t/g)?.length ?? 0), 0);
  if (tabCount > 0) return 'tsv';
  return 'csv';
};

const parseDelimitedTable = (text: string, delimiter: ',' | ';' | '\t') => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) {
        rows.push(row.map((item, itemIndex) => (itemIndex === 0 ? item.replace(/^\uFEFF/, '').trim() : item.trim())));
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((item) => item.trim())) {
      rows.push(row.map((item, itemIndex) => (itemIndex === 0 ? item.replace(/^\uFEFF/, '').trim() : item.trim())));
    }
  }

  return rows;
};

const looksLikeDate = (value: string) =>
  /^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\d{8}|\d{2}\s+[A-Za-z]{3,9}\s+\d{4})/.test(value.trim());

const looksLikeAmount = (value: string) =>
  /^[A-Za-z]{0,3}\s*[\(\-+]?\d[\d\s.,']*(?:\s*(?:CR|DR|DB))?\)?$/.test(value.trim());

const firstRowLooksLikeHeader = (firstRow: string[]) => {
  const signal = firstRow.reduce((sum, value) => {
    const trimmed = value.trim();
    if (!trimmed) return sum;
    if (looksLikeDate(trimmed) || looksLikeAmount(trimmed)) return sum - 1;
    return sum + 1;
  }, 0);
  return signal >= 0;
};

const makeUniqueHeaders = (headers: string[]) => {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
};

const parseDelimitedStatement = (fileName: string, text: string, delimiter: ',' | ';' | '\t', format: StatementFormat): ParsedStatement => {
  const rows = parseDelimitedTable(text, delimiter);
  if (!rows.length) {
    return {
      format,
      fileName,
      headers: [],
      rows: [],
      suggestedMapping: createEmptyStatementColumnMapping(),
      mappingConfidence: 'low',
      warnings: ['No transaction rows were found in that file.']
    };
  }

  const hasHeader = firstRowLooksLikeHeader(rows[0]);
  const rawHeaders = hasHeader ? rows[0] : rows[0].map((_, index) => `Column ${index + 1}`);
  const headers = makeUniqueHeaders(rawHeaders);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const statementRows = dataRows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => ({
      id: `row-${index + 1}`,
      values: Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex]?.trim() ?? '']))
    }));

  const suggestedMapping = inferColumnMapping(headers, statementRows);
  const mappingConfidence = getMappingConfidence(suggestedMapping);
  const warnings = hasHeader ? [] : ['This file did not look like it had headers, so please confirm the column mapping.'];

  return {
    format,
    fileName,
    headers,
    rows: statementRows,
    suggestedMapping,
    mappingConfidence,
    warnings
  };
};

const parseOfxTag = (block: string, tag: string) => block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'))?.[1]?.trim() ?? '';

const parseOfxStatement = (fileName: string, text: string): ParsedStatement => {
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((block) => block.split(/<\/STMTTRN>/i)[0] ?? block);
  const headers = ['Date', 'Description', 'Amount', 'Direction', 'Reference'];
  const rows = blocks
    .map((block, index) => {
      const date = parseOfxTag(block, 'DTPOSTED');
      const name = parseOfxTag(block, 'NAME');
      const memo = parseOfxTag(block, 'MEMO');
      const amount = parseOfxTag(block, 'TRNAMT');
      const type = parseOfxTag(block, 'TRNTYPE');
      const reference = parseOfxTag(block, 'FITID') || memo;
      return {
        id: `row-${index + 1}`,
        values: {
          Date: date,
          Description: name || memo || 'Bank transaction',
          Amount: amount,
          Direction: type,
          Reference: reference
        }
      };
    })
    .filter((row) => Object.values(row.values).some((value) => value.trim()));

  return {
    format: 'ofx',
    fileName,
    headers,
    rows,
    suggestedMapping: {
      ...createEmptyStatementColumnMapping(),
      date: 'Date',
      description: 'Description',
      amount: 'Amount',
      direction: 'Direction',
      reference: 'Reference'
    },
    mappingConfidence: rows.length ? 'high' : 'low',
    warnings: rows.length ? [] : ['No transactions were found in that OFX/QFX file.']
  };
};

const inferColumnMapping = (headers: string[], rows: ParsedStatementRow[]): StatementColumnMapping => {
  const mapping = createEmptyStatementColumnMapping();
  const used = new Set<string>();
  const sample = rows.slice(0, 5);

  const pickBest = (role: StatementColumnRole) => {
    let bestHeader: string | null = null;
    let bestScore = 0;
    for (const header of headers) {
      if (used.has(header)) continue;
      let score = scoreHeader(header, HEADER_ALIASES[role]);
      if (sample.length) {
        const values = sample.map((row) => row.values[header] ?? '');
        if (role === 'date' && values.every((value) => !value || looksLikeDate(value))) score += 3;
        if ((role === 'amount' || role === 'debit' || role === 'credit' || role === 'balance') && values.every((value) => !value || looksLikeAmount(value))) score += 2;
        if (role === 'description' && values.some((value) => /[A-Za-z]/.test(value) && !looksLikeAmount(value))) score += 2;
      }
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    }
    if (bestHeader && bestScore >= 5) {
      mapping[role] = bestHeader;
      used.add(bestHeader);
    }
  };

  pickBest('date');
  pickBest('description');
  pickBest('amount');
  pickBest('debit');
  pickBest('credit');
  pickBest('direction');
  pickBest('reference');
  pickBest('balance');

  if (!mapping.description && headers.length) {
    const fallback = headers.find((header) => header !== mapping.date && header !== mapping.amount) ?? headers[0];
    if (fallback) mapping.description = fallback;
  }

  return mapping;
};

const getMappingConfidence = (mapping: StatementColumnMapping): StatementMappingConfidence => {
  if (mapping.date && mapping.description && (mapping.amount || mapping.debit || mapping.credit)) {
    if (mapping.amount || (mapping.debit && mapping.credit)) return 'high';
    return 'medium';
  }
  if (mapping.date || mapping.description || mapping.amount || mapping.debit || mapping.credit) return 'medium';
  return 'low';
};

const safeIsoDate = (year: number, month: number, day: number) => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return candidate.toISOString().slice(0, 10);
};

const parseDateCell = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return safeIsoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));

  const yearFirst = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (yearFirst) return safeIsoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  const dayFirst = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dayFirst) return safeIsoDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));

  const verbose = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (verbose) {
    const parsed = new Date(`${verbose[1]} ${verbose[2]} ${verbose[3]} 00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) return null;
  return fallback.toISOString().slice(0, 10);
};

const normalizeNumberText = (value: string) => {
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

  if (decimalSeparator === ',') {
    next = next.replace(/\./g, '').replace(/,/g, '.');
  } else if (decimalSeparator === '.') {
    next = next.replace(/,/g, '');
  } else {
    next = next.replace(/[,.]/g, '');
  }

  if (negativeByParens || trailingMinus) next = `-${next}`;
  return next;
};

const parseMoneyCell = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return { amountCents: null, explicitKind: null as 'inflow' | 'outflow' | null, hasDirection: false };

  const lower = trimmed.toLowerCase();
  const parsed = Number.parseFloat(normalizeNumberText(trimmed));
  if (Number.isNaN(parsed)) return { amountCents: null, explicitKind: null as 'inflow' | 'outflow' | null, hasDirection: false };

  let explicitKind: 'inflow' | 'outflow' | null = null;
  let hasDirection = false;

  if (/\b(?:credit|cr|deposit|received)\b/i.test(lower)) {
    explicitKind = 'inflow';
    hasDirection = true;
  }

  if (/\b(?:debit|dr|db|withdrawal|purchase|spent|fee)\b/i.test(lower)) {
    explicitKind = 'outflow';
    hasDirection = true;
  }

  if (/^\+/.test(trimmed)) {
    explicitKind = 'inflow';
    hasDirection = true;
  }

  if (/^\s*-/.test(trimmed) || trimmed.includes('(') || trimmed.endsWith('-') || parsed < 0) {
    explicitKind = 'outflow';
    hasDirection = true;
  }

  return {
    amountCents: Math.round(Math.abs(parsed) * 100),
    explicitKind,
    hasDirection
  };
};

const parseDirectionCell = (value: string): 'inflow' | 'outflow' | null => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/\b(?:credit|cr|deposit|incoming|income|received|payment in|transfer in)\b/.test(trimmed)) return 'inflow';
  if (/\b(?:debit|dr|db|withdrawal|outgoing|payment out|purchase|fee|transfer out)\b/.test(trimmed)) return 'outflow';
  return null;
};

const resolveAmountAndKind = (values: Record<string, string>, mapping: StatementColumnMapping) => {
  const warnings: string[] = [];

  const debitRaw = mapping.debit ? values[mapping.debit] ?? '' : '';
  const creditRaw = mapping.credit ? values[mapping.credit] ?? '' : '';
  const amountRaw = mapping.amount ? values[mapping.amount] ?? '' : '';
  const directionRaw = mapping.direction ? values[mapping.direction] ?? '' : '';

  const debit = parseMoneyCell(debitRaw);
  const credit = parseMoneyCell(creditRaw);
  const amount = parseMoneyCell(amountRaw);
  const mappedDirection = parseDirectionCell(directionRaw);

  if (mapping.debit || mapping.credit) {
    const debitValue = debit.amountCents ?? 0;
    const creditValue = credit.amountCents ?? 0;
    if (debitValue > 0 && creditValue > 0) {
      warnings.push('Both debit and credit columns have values on this row.');
      return { amountCents: null, kind: null as 'inflow' | 'outflow' | null, warnings };
    }
    if (debitValue > 0) return { amountCents: debitValue, kind: 'outflow' as const, warnings };
    if (creditValue > 0) return { amountCents: creditValue, kind: 'inflow' as const, warnings };
  }

  if (amount.amountCents === null) return { amountCents: null, kind: null as 'inflow' | 'outflow' | null, warnings };
  if (amount.explicitKind) return { amountCents: amount.amountCents, kind: amount.explicitKind, warnings };
  if (mappedDirection) return { amountCents: amount.amountCents, kind: mappedDirection, warnings };

  warnings.push('Check whether this was money in or money out.');
  return { amountCents: amount.amountCents, kind: null as 'inflow' | 'outflow' | null, warnings };
};

const bestExistingCategoryMatch = (
  description: string,
  kind: 'inflow' | 'outflow',
  existingTransactions: MoneyTransaction[]
) => {
  const targetTokens = tokenizeDescription(description);
  if (!targetTokens.length) return null;

  let best: { category: string; score: number } | null = null;
  for (const transaction of existingTransactions) {
    if (transaction.kind !== kind) continue;
    const comparisonTokens = tokenizeDescription(transaction.title);
    const overlap = comparisonTokens.filter((token) => targetTokens.includes(token)).length;
    if (!overlap) continue;
    const score = overlap / Math.max(targetTokens.length, comparisonTokens.length, 1);
    if (!best || score > best.score) {
      best = { category: transaction.category, score };
    }
  }

  if (!best) return null;
  if (best.score >= 0.75) return { category: best.category, confidence: 'high' as const };
  if (best.score >= 0.45) return { category: best.category, confidence: 'medium' as const };
  return null;
};

const chooseAvailableCategory = (desired: string, availableCategories: string[]) => {
  if (!availableCategories.length) return desired;
  return availableCategories.includes(desired) ? desired : desired;
};

const inferCategory = (
  description: string,
  kind: 'inflow' | 'outflow',
  availableCategories: string[],
  existingTransactions: MoneyTransaction[]
) => {
  if (kind === 'inflow') {
    const existing = bestExistingCategoryMatch(description, kind, existingTransactions);
    if (existing) return { category: existing.category, confidence: existing.confidence };
  }

  const normalized = normalizeDescriptionForMatch(description);
  const keywordMatch = CATEGORY_RULES.find((rule) =>
    (!rule.kind || rule.kind === kind) &&
    rule.keywords.some((keyword) => normalized.includes(keyword))
  );
  if (keywordMatch) {
    return {
      category: chooseAvailableCategory(keywordMatch.category, availableCategories),
      confidence: keywordMatch.kind === kind ? 'high' as const : 'medium' as const
    };
  }

  const existing = bestExistingCategoryMatch(description, kind, existingTransactions);
  if (existing) return { category: existing.category, confidence: existing.confidence };

  if (kind === 'inflow') {
    const incomeCategory = availableCategories.includes('Income') ? 'Income' : availableCategories.includes('Other') ? 'Other' : availableCategories[0] ?? 'Income';
    return { category: incomeCategory, confidence: 'medium' as const };
  }

  return {
    category: availableCategories.includes('Other') ? 'Other' : availableCategories[0] ?? 'Other',
    confidence: 'low' as const
  };
};

const buildDuplicateKey = (dateIso: string | null, amountCents: number | null, title: string) => {
  if (!dateIso || amountCents === null || !title.trim()) return null;
  return `${dateIso}|${amountCents}|${normalizeDescriptionForMatch(title).slice(0, 80)}`;
};

const rowNeedsAttention = (row: StatementPreviewRow) =>
  row.duplicate || row.warnings.length > 0 || row.categoryConfidence === 'low';

export const parseStatementText = (fileName: string, text: string): ParsedStatement => {
  const format = detectFormat(text);
  if (format === 'ofx') return parseOfxStatement(fileName, text);

  const delimiter = format === 'tsv' ? '\t' : text.includes(';') && !text.includes(',') ? ';' : ',';
  return parseDelimitedStatement(fileName, text, delimiter, format);
};

export const buildStatementPreview = (
  parsed: ParsedStatement,
  mapping: StatementColumnMapping,
  existingTransactions: MoneyTransaction[],
  availableCategories: string[]
): StatementPreview => {
  const duplicateKeys = new Set(
    existingTransactions
      .map((transaction) => buildDuplicateKey(transaction.dateIso, transaction.amountCents, transaction.title))
      .filter((value): value is string => Boolean(value))
  );
  const importedKeys = new Set<string>();

  const rows = parsed.rows.map((row, index) => {
    const dateValue = mapping.date ? row.values[mapping.date] ?? '' : '';
    const descriptionValue = mapping.description ? row.values[mapping.description] ?? '' : '';
    const referenceValue = mapping.reference ? row.values[mapping.reference] ?? '' : '';

    const dateIso = parseDateCell(dateValue);
    const title = (descriptionValue || referenceValue || 'Bank transaction').replace(/\s+/g, ' ').trim();
    const resolved = resolveAmountAndKind(row.values, mapping);
    const warnings = [...resolved.warnings];

    if (!dateIso) warnings.push('Date could not be read.');
    if (!title) warnings.push('Description could not be read.');
    if (resolved.amountCents === null) warnings.push('Amount could not be read.');

    const categorySuggestion =
      resolved.kind && title
        ? inferCategory(title, resolved.kind, availableCategories, existingTransactions)
        : {
            category: availableCategories.includes('Other') ? 'Other' : availableCategories[0] ?? 'Other',
            confidence: 'low' as const
          };

    if (categorySuggestion.confidence === 'low' && resolved.kind === 'outflow') {
      warnings.push('Category may need a quick check.');
    }

    const duplicateKey = buildDuplicateKey(dateIso, resolved.amountCents, title);
    const duplicate = Boolean(duplicateKey && (duplicateKeys.has(duplicateKey) || importedKeys.has(duplicateKey)));
    if (duplicateKey) importedKeys.add(duplicateKey);
    if (duplicate) warnings.push('Looks like a duplicate of a transaction already in your ledger.');

    const includeByDefault = !duplicate && Boolean(dateIso && title && resolved.amountCents !== null && resolved.kind);

    return {
      id: row.id,
      rowIndex: index,
      values: row.values,
      dateIso,
      title,
      amountCents: resolved.amountCents,
      kind: resolved.kind,
      category: categorySuggestion.category,
      categoryConfidence: categorySuggestion.confidence,
      warnings,
      duplicate,
      includeByDefault,
      reference: referenceValue
    } satisfies StatementPreviewRow;
  });

  return {
    rows,
    readyCount: rows.filter((row) => row.includeByDefault).length,
    needsAttentionCount: rows.filter(rowNeedsAttention).length,
    duplicateCount: rows.filter((row) => row.duplicate).length,
    missingRequiredCount: rows.filter((row) => !row.dateIso || !row.title || row.amountCents === null || !row.kind).length,
    requiresMappingReview:
      !mapping.date ||
      !mapping.description ||
      (!mapping.amount && !mapping.debit && !mapping.credit) ||
      parsed.mappingConfidence === 'low' ||
      rows.some((row) => !row.dateIso || row.amountCents === null || !row.kind)
  };
};

export const buildStatementImportNote = (fileName: string, row: Pick<StatementPreviewRow, 'reference'>) => {
  const parts = [`Imported from ${fileName}`];
  if (row.reference) parts.push(`Reference: ${row.reference}`);
  return parts.join('. ');
};
