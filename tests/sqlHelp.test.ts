import { describe, expect, it } from 'vitest';
import { friendlyError, isReadOnly, resultsMatch } from '../src/sqlHelp';

const schema = { tables: ['creatures', 'plots', 'farm_log'], columns: ['name', 'kind', 'hunger', 'crop'] };

describe('isReadOnly', () => {
  it('allows SELECT and WITH', () => {
    expect(isReadOnly('SELECT * FROM creatures;')).toBe(true);
    expect(isReadOnly('with x as (select 1) select * from x')).toBe(true);
    expect(isReadOnly("SELECT * FROM farm_log WHERE event = 'update'")).toBe(true);
    expect(isReadOnly('SELECT replace(name, "a", "b") FROM creatures')).toBe(true);
  });
  it('blocks writes', () => {
    expect(isReadOnly("UPDATE farm SET coins = 9999")).toBe(false);
    expect(isReadOnly('SELECT 1; DELETE FROM creatures')).toBe(false);
    expect(isReadOnly('DROP TABLE plots')).toBe(false);
    expect(isReadOnly("REPLACE INTO farm VALUES (1, 2)")).toBe(false);
  });
});

describe('resultsMatch', () => {
  const expected = { columns: ['name', 'kind'], rows: [['Squeal', 'mud-beast'], ['Henbell', 'bell-fowl']] };
  it('ignores column order and row order when unordered', () => {
    const player = { columns: ['kind', 'name'], rows: [['bell-fowl', 'Henbell'], ['mud-beast', 'Squeal']] };
    expect(resultsMatch(player, expected, false).ok).toBe(true);
  });
  it('enforces row order when ordered', () => {
    const player = { columns: ['name', 'kind'], rows: [['Henbell', 'bell-fowl'], ['Squeal', 'mud-beast']] };
    const r = resultsMatch(player, expected, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/wrong order/);
  });
  it('explains column count mismatches', () => {
    expect(resultsMatch({ columns: ['name'], rows: [['Squeal']] }, expected, false).reason).toMatch(/2 columns/);
  });
  it('treats AVG floats robustly', () => {
    expect(resultsMatch({ columns: ['a'], rows: [[6.333333333333333]] }, { columns: ['AVG(x)'], rows: [[6.3333333333333]] }, false).ok).toBe(true);
  });
});

describe('friendlyError', () => {
  it('suggests close column names', () => {
    expect(friendlyError('no such column: nmae', schema)).toMatch(/Did you mean `name`/);
  });
  it('says which table a real column belongs to', () => {
    const withTables = { ...schema, byTable: { creatures: ['name', 'hunger'], plots: ['id', 'crop'] } };
    const msg = friendlyError('no such column: hunger', withTables);
    expect(msg).toMatch(/lives in the `creatures` table/);
    expect(msg).not.toMatch(/Did you mean/);
  });
  it('suggests quotes for bare words', () => {
    expect(friendlyError('no such column: Squeal', schema)).toMatch(/'Squeal'/);
  });
  it('suggests table names', () => {
    expect(friendlyError('no such table: creature', schema)).toMatch(/`creatures`/);
  });
  it('catches keyword typos', () => {
    expect(friendlyError('near "FORM": syntax error', schema)).toMatch(/FROM/);
  });
});

describe('tablesIn', () => {
  it('finds real tables but not CTE names or subqueries', async () => {
    const { tablesIn } = await import('../src/sqlHelp');
    expect(tablesIn('SELECT * FROM plots p JOIN creatures c ON c.plot_id = p.id')).toEqual(['plots', 'creatures']);
    expect(tablesIn('WITH f AS (SELECT field FROM plots), g AS (SELECT * FROM f) SELECT * FROM g')).toEqual(['plots']);
    expect(tablesIn('SELECT AVG(n) FROM (SELECT COUNT(*) AS n FROM farm_log GROUP BY source)')).toEqual(['farm_log']);
    expect(tablesIn("SELECT * FROM land WHERE name = 'from x'")).toEqual(['land']);
  });
});
