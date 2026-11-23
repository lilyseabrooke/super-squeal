import type { Database } from 'sql.js';
import { CROPS, GOODS } from './crops';
import { SPECIES } from './creatures';

export const PLOT_ROWS = 3;
export const PLOT_COLS = 4;
export const STARTING_COINS = 20;
export const WEATHER_DAYS = 365;

/** Bump this and add a step to migrate() whenever the Ledger's shape changes. */
export const SCHEMA_VERSION = 4;

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

/** Land for sale at Mayor Thimble's land office (chapter 9). */
const LAND_TABLE = `CREATE TABLE land (
  name TEXT PRIMARY KEY,
  plots INTEGER NOT NULL,
  price INTEGER NOT NULL,
  owned INTEGER NOT NULL
);`;

export interface Parcel {
  name: string;
  price: number;
  /** Top-left corner on the farm's grid. Parcels are 8×8 and never touch each other. */
  row: number;
  col: number;
  /** Creatures that live there: [name, species, row offset, col offset]. */
  residents: [string, string, number, number][];
}

export const PARCEL_SIZE = 8;

export const LAND_PARCELS: Parcel[] = [
  { name: 'Mossy Hollow', price: 400, row: 1, col: 10, residents: [['Bramble', 'Squeal', 2, 2], ['Hazel', 'Squeal', 5, 5], ['Drizzle', 'Puddlewump', 2, 6], ['Tinkle', 'Henbell', 6, 1]] },
  { name: 'Lantern Ridge', price: 700, row: 10, col: 1, residents: [['Ember', 'Chimnius', 1, 1], ['Flicker', 'Glimmerwick', 2, 1], ['Chime', 'Henbell', 6, 6], ['Jingle', 'Henbell', 7, 3]] },
  { name: 'Old Orchard', price: 1000, row: 10, col: 10, residents: [['Acorn', 'Squeal', 3, 3], ['Pebble', 'Sortoise', 6, 6], ['Fleece', 'Echolamb', 1, 6]] },
  { name: 'Far Meadows', price: 1500, row: 1, col: 19, residents: [['Gong', 'Henbell', 1, 1], ['Peep', 'Henbell', 1, 6], ['Toll', 'Henbell', 6, 1], ['Mudge', 'Squeal', 4, 4]] },
  { name: 'Thistle Downs', price: 2200, row: 10, col: 19, residents: [['Brook', 'Puddlewump', 3, 3], ['Spark', 'Glimmerwick', 6, 6], ['Root', 'Squeal', 1, 5]] },
  { name: 'Glasswater', price: 3000, row: 19, col: 1, residents: [['Shelly', 'Sortoise', 1, 1], ['Bellamy', 'Henbell', 6, 2], ['Wallow', 'Squeal', 3, 5], ['Mizzle', 'Puddlewump', 6, 6]] },
];

function landRowsSql(): string {
  return LAND_PARCELS.map((p) => `INSERT INTO land VALUES ('${p.name}', ${PARCEL_SIZE * PARCEL_SIZE}, ${p.price}, 0);`).join('\n');
}

/** Adds a parcel's plots and resident creatures to the farm and marks it owned. */
export function buyLand(db: Database, name: string, day: number): Parcel {
  const parcel = LAND_PARCELS.find((p) => p.name === name);
  if (!parcel) throw new Error(`No parcel called ${name}`);
  let id = Number(db.exec('SELECT COALESCE(MAX(id), 0) FROM plots')[0].values[0][0]) + 1;
  const temp = Number(db.exec('SELECT temperature FROM weather WHERE day = ?', [day])[0]?.values[0]?.[0] ?? 10);
  const idAt = new Map<string, number>();
  for (let r = 0; r < PARCEL_SIZE; r++) {
    for (let c = 0; c < PARCEL_SIZE; c++) {
      idAt.set(`${r},${c}`, id);
      db.run('INSERT INTO plots VALUES (?, ?, ?, NULL, 0, 2, ?, 0, ?)', [id++, parcel.row + r, parcel.col + c, temp, parcel.name]);
    }
  }
  for (const [who, species, r, c] of parcel.residents) {
    const sp = SPECIES[species];
    db.run('INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES (?, ?, ?, ?, 7, 6)', [who, sp.kind, sp.emoji, idAt.get(`${r},${c}`)!]);
  }
  db.run('UPDATE land SET owned = 1 WHERE name = ?', [name]);
  return parcel;
}

/** What the farm panel shows at once: the original three fields together, then each parcel on its own. */
export function areaOf(field: string): string {
  return ['Home field', 'East field', 'South field'].includes(field) ? 'Home farm' : field;
}

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
  tilled INTEGER NOT NULL,
  field TEXT NOT NULL
);
${LAND_TABLE}
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
      parts.push(`INSERT INTO plots VALUES (${id++}, ${r + 1}, ${c + 1}, NULL, 0, 2, ${firstTemp}, 0, 'Home field');`);
    }
  }

  parts.push(landRowsSql());
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
  if (version < 4) {
    db.run(`
      ALTER TABLE plots ADD COLUMN field TEXT NOT NULL DEFAULT 'Home field';
      UPDATE plots SET field = CASE WHEN row >= 4 THEN 'South field' WHEN col >= 5 THEN 'East field' ELSE 'Home field' END;
      ${LAND_TABLE}
      ${landRowsSql()}
    `);
  }
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
