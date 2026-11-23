import type { Database } from 'sql.js';
import { CROPS, GOODS } from './crops';

export const PLOT_ROWS = 3;
export const PLOT_COLS = 4;
export const STARTING_COINS = 20;
export const WEATHER_DAYS = 365;

/** Bump this and add a step to migrate() whenever the Ledger's shape changes. */
export const SCHEMA_VERSION = 3;

/** `source` and `amount` may be NULL: the Nullkin (chapter 6) erases them. */
const FARM_LOG_TABLE = `CREATE TABLE farm_log (
  id INTEGER PRIMARY KEY,
  day INTEGER NOT NULL,
  source TEXT,
  plot_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  amount INTEGER
);`;

/** Buy and sell orders. Written by the Quill (chapter 7) and by the Barn buttons. */
const ORDERS_TABLE = `CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  day INTEGER,
  action TEXT NOT NULL,
  item TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  total INTEGER
);`;

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Deterministic weather so every new farm sees the same valley. */
export function weatherRows(days = WEATHER_DAYS): { day: number; temperature: number; sky: string }[] {
  let seed = 20261123;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const rows = [];
  for (let day = 1; day <= days; day++) {
    const temperature = 6 + Math.floor(rand() * 12);
    const r = rand();
    const sky = r < 0.2 ? 'rain' : r < 0.5 ? 'cloudy' : 'sunny';
    rows.push({ day, temperature, sky });
  }
  return rows;
}

/** SQL that creates and seeds a brand-new farm. */
export function schemaSql(): string {
  const parts: string[] = [];
  parts.push(`
CREATE TABLE farm (
  day INTEGER NOT NULL,
  coins INTEGER NOT NULL
);
CREATE TABLE creatures (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  emoji TEXT NOT NULL,
  plot_id INTEGER NOT NULL,
  hunger INTEGER NOT NULL,
  mood INTEGER NOT NULL
);
CREATE TABLE plots (
  id INTEGER PRIMARY KEY,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  crop TEXT,
  growth INTEGER NOT NULL,
  moisture INTEGER NOT NULL,
  warmth INTEGER NOT NULL,
  tilled INTEGER NOT NULL
);
CREATE TABLE inventory (
  item TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL
);
CREATE TABLE market (
  item TEXT PRIMARY KEY,
  sell_price INTEGER NOT NULL
);
CREATE TABLE seeds (
  crop TEXT PRIMARY KEY,
  price INTEGER NOT NULL,
  nights_to_grow INTEGER NOT NULL
);
CREATE TABLE weather (
  day INTEGER PRIMARY KEY,
  temperature INTEGER NOT NULL,
  sky TEXT NOT NULL
);
${FARM_LOG_TABLE}
${ORDERS_TABLE}
INSERT INTO farm (day, coins) VALUES (1, ${STARTING_COINS});
INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES ('Squeal', 'mud-beast', '🐷', 6, 7, 6);
`);

  const firstTemp = weatherRows(1)[0].temperature;
  let id = 1;
  for (let r = 0; r < PLOT_ROWS; r++) {
    for (let c = 0; c < PLOT_COLS; c++) {
      parts.push(`INSERT INTO plots VALUES (${id++}, ${r + 1}, ${c + 1}, NULL, 0, 2, ${firstTemp}, 0);`);
    }
  }

  for (const crop of Object.values(CROPS)) {
    parts.push(`INSERT INTO inventory VALUES (${quote(crop.id + '_seed')}, ${crop.id === 'snoutroot' ? 3 : 0});`);
  }
  for (const crop of Object.values(CROPS)) parts.push(`INSERT INTO inventory VALUES (${quote(crop.id)}, 0);`);
  for (const item of Object.keys(GOODS)) parts.push(`INSERT INTO inventory VALUES (${quote(item)}, 0);`);

  for (const crop of Object.values(CROPS)) parts.push(`INSERT INTO market VALUES (${quote(crop.id)}, ${crop.sellPrice});`);
  for (const [item, g] of Object.entries(GOODS)) parts.push(`INSERT INTO market VALUES (${quote(item)}, ${g.sellPrice});`);

  for (const crop of Object.values(CROPS)) {
    parts.push(`INSERT INTO seeds VALUES (${quote(crop.id)}, ${crop.seedPrice}, ${Math.ceil(100 / crop.rate)});`);
  }

  const w = weatherRows();
  parts.push(
    'INSERT INTO weather VALUES ' + w.map((x) => `(${x.day}, ${x.temperature}, ${quote(x.sky)})`).join(',\n') + ';',
  );
  parts.push(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  return parts.join('\n');
}

/** Upgrades a saved Ledger from an older version of the game, in place. */
export function migrate(db: Database): void {
  const version = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
  if (version < 2) {
    db.run(`
      ${FARM_LOG_TABLE.replace('farm_log', 'farm_log_v2')}
      INSERT INTO farm_log_v2 SELECT id, day, source, plot_id, event, amount FROM farm_log;
      DROP TABLE farm_log;
      ALTER TABLE farm_log_v2 RENAME TO farm_log;
    `);
  }
  if (version < 3) db.run(ORDERS_TABLE);
  // New goods are added idempotently so any older save picks them up.
  for (const [item, g] of Object.entries(GOODS)) {
    db.run('INSERT OR IGNORE INTO inventory VALUES (?, 0)', [item]);
    db.run('INSERT OR IGNORE INTO market VALUES (?, ?)', [item, g.sellPrice]);
  }
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export interface PlotPos {
  row: number;
  col: number;
}

/** 0 = same plot, 1 = orthogonally adjacent, larger = further away. */
export function gridDistance(a: PlotPos, b: PlotPos): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/** Plot positions come from the plots table, so the farm can grow beyond its first 12 plots. */
export function plotPositions(db: Database): Map<number, PlotPos> {
  const out = new Map<number, PlotPos>();
  const res = db.exec('SELECT id, row, col FROM plots')[0];
  for (const [id, row, col] of res?.values ?? []) out.set(Number(id), { row: Number(row), col: Number(col) });
  return out;
}

export function plotDistance(db: Database, a: number, b: number): number {
  const pos = plotPositions(db);
  const pa = pos.get(a);
  const pb = pos.get(b);
  return pa && pb ? gridDistance(pa, pb) : Infinity;
}

/** The fields Mayor Thimble grants in chapter 7: east of the home field, and a whole field to the south. */
export const EXPANSION_FIELDS = [
  { name: 'East field', rows: [1, 3], cols: [5, 8] },
  { name: 'South field', rows: [4, 6], cols: [1, 8] },
] as const;

export function fieldName(p: PlotPos): string {
  if (p.row >= 4) return 'South field';
  if (p.col >= 5) return 'East field';
  return 'Home field';
}

export const PLOT_COUNT = PLOT_ROWS * PLOT_COLS;
