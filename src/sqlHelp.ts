import type { SqlValue } from 'sql.js';
import type { ResultSet } from './types';

/** Removes comments and replaces string literals with empty ones. */
export function stripLiterals(sql: string): string {
  return stripComments(sql)
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

export function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Tables a query reads from (FROM / JOIN targets), lowercased. */
export function tablesIn(sql: string): string[] {
  const found = new Set<string>();
  for (const m of stripLiterals(sql).matchAll(/\b(?:from|join)\s+["`[]?(\w+)/gi)) found.add(m[1].toLowerCase());
  return [...found];
}

/** Whitespace- and case-insensitive comparison of two queries, ignoring trailing semicolons. */
export function sameQuery(a: string, b: string): boolean {
  const norm = (s: string) => stripComments(s).replace(/;\s*$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(a) === norm(b);
}

/** True for hint text that is a SQL template (vs. plain instructions like "With a plot selected…"). */
export function isSqlTemplate(s: string): boolean {
  return /^(SELECT|WITH|INSERT|UPDATE|DELETE)\s/.test(s.trim());
}

export const BLANK = '___';
export const BLANKS_MESSAGE = 'Replace each `___` blank with the right word before running. The blanks are the bits you fill in!';

const WRITE_WORDS = /\b(insert|update|delete|drop|create|alter|attach|detach|vacuum|pragma|reindex|begin|commit|rollback|savepoint|release)\b/i;

/** True if every statement only reads (SELECT / WITH ... SELECT). */
export function isReadOnly(sql: string): boolean {
  const clean = stripLiterals(sql);
  if (WRITE_WORDS.test(clean)) return false;
  return clean
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .every((s) => /^(select|with)\b/i.test(s));
}

function normalizeValue(v: SqlValue): string {
  if (v === null) return '∅';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (v instanceof Uint8Array) return `blob:${v.length}`;
  return String(v);
}

export interface MatchResult {
  ok: boolean;
  reason?: string;
}

/**
 * Compares a player's result with the expected one. Column order is ignored when
 * the column names line up; row order only matters when `ordered` is true.
 */
export function resultsMatch(player: ResultSet, expected: ResultSet, ordered: boolean): MatchResult {
  if (player.columns.length !== expected.columns.length) {
    return {
      ok: false,
      reason: `Keystone expected ${expected.columns.length} column${expected.columns.length === 1 ? '' : 's'} (${expected.columns.join(', ')}), but your result has ${player.columns.length}.`,
    };
  }

  let rows = player.rows;
  const pLower = player.columns.map((c) => c.toLowerCase());
  const eLower = expected.columns.map((c) => c.toLowerCase());
  const sameSet = [...pLower].sort().join('\u0000') === [...eLower].sort().join('\u0000') && new Set(eLower).size === eLower.length;
  if (sameSet) {
    const idx = eLower.map((c) => pLower.indexOf(c));
    rows = rows.map((r) => idx.map((i) => r[i]));
  }

  const ser = (rs: SqlValue[][]) => rs.map((r) => r.map(normalizeValue).join('\u0001'));
  const p = ser(rows);
  const e = ser(expected.rows);

  if (p.length !== e.length) {
    return {
      ok: false,
      reason: `Your query found ${p.length} row${p.length === 1 ? '' : 's'}, but Keystone expected ${e.length}.`,
    };
  }

  const ps = [...p].sort();
  const es = [...e].sort();
  const sameRows = ps.every((x, i) => x === es[i]);
  if (!sameRows) {
    const eCount = new Map<string, number>();
    for (const x of e) eCount.set(x, (eCount.get(x) ?? 0) + 1);
    let wrong = 0;
    for (const x of p) {
      const n = eCount.get(x) ?? 0;
      if (n > 0) eCount.set(x, n - 1);
      else wrong++;
    }
    return {
      ok: false,
      reason: `Right number of rows, but ${wrong} of them ${wrong === 1 ? "isn't" : "aren't"} what Keystone expected. Check that you picked the right columns and conditions.`,
    };
  }
  if (ordered && !p.every((x, i) => x === e[i])) {
    return { ok: false, reason: 'Right rows, wrong order! This quest is all about ordering.' };
  }
  return { ok: true };
}

export function levenshtein(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Swapped neighbouring letters ("nmae", "FORM") count as one typo.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

function closest(word: string, options: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  const limit = word.length <= 4 ? 1 : 2;
  return bestD <= limit ? best : null;
}

const KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'ORDER', 'BY', 'LIMIT', 'GROUP', 'HAVING', 'AND', 'OR', 'NOT', 'DESC', 'ASC', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'AS'];

export interface SchemaInfo {
  tables: string[];
  columns: string[];
  /** Column names per table, used to say where a column really lives. */
  byTable?: Record<string, string[]>;
}

/** Turns a raw SQLite error into something Keystone would say. */
export function friendlyError(message: string, schema: SchemaInfo): string {
  let m = /no such column: (\S+)/i.exec(message);
  if (m) {
    const name = m[1].replace(/^.*\./, '');
    const owners = Object.entries(schema.byTable ?? {})
      .filter(([, cols]) => cols.some((c) => c.toLowerCase() === name.toLowerCase()))
      .map(([t]) => t);
    if (owners.length) {
      return `\`${name}\` is a real column, but it lives in the \`${owners.join('`, `')}\` table${owners.length > 1 ? 's' : ''}, not the table your query reads from. Check what comes after \`FROM\`.`;
    }
    const guess = closest(name, schema.columns);
    if (guess) return `There's no column called \`${name}\`. Did you mean \`${guess}\`?`;
    return `There's no column called \`${name}\`. If you meant the *text* ${name}, wrap it in single quotes: \`'${name}'\`. Otherwise, check the column names in the Schema panel.`;
  }
  m = /no such table: (\S+)/i.exec(message);
  if (m) {
    const guess = closest(m[1], schema.tables);
    return guess
      ? `There's no table called \`${m[1]}\`. Did you mean \`${guess}\`?`
      : `There's no table called \`${m[1]}\`. The Schema panel lists every table in the Ledger.`;
  }
  m = /near "(.+?)": syntax error/i.exec(message);
  if (m) {
    const token = m[1];
    const kw = closest(token, KEYWORDS);
    if (kw && kw.toLowerCase() !== token.toLowerCase()) return `Keystone tripped over \`${token}\`. Did you mean \`${kw}\`?`;
    if (token === ',') return 'Keystone tripped over a comma. Is there an extra comma, maybe right before `FROM`?';
    return `Keystone got confused near \`${token}\`. Check the spelling, commas and quotes around there.`;
  }
  if (/incomplete input/i.test(message)) {
    return 'Your query stops too early. Is a quote `\'` or bracket `(` left open, or is something missing at the end?';
  }
  if (/unrecognized token/i.test(message)) {
    return "There's a stray character Keystone doesn't recognise. Text values need matching single quotes, like `'Squeal'`.";
  }
  if (/misuse of aggregate/i.test(message)) {
    return 'Aggregates like `COUNT` and `SUM` summarise many rows, so they can’t go in a `WHERE`. (You’ll meet `HAVING` for that later!)';
  }
  if (/ambiguous column name: (\S+)/i.test(message)) {
    return 'That column name exists in more than one table, so say which one you mean, like `creatures.name`.';
  }
  return 'The Ledger rejected that query.';
}

export const READONLY_MESSAGE =
  'The Ledger is read-only for now, so you can only *look* with `SELECT`. Use the farm buttons to make changes. You’ll earn the **Ledger Quill** later, which lets you write changes yourself.';
