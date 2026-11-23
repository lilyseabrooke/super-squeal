import { CROPS, GOODS } from './crops';

export const PLOT_ROWS = 3;
export const PLOT_COLS = 4;
export const STARTING_COINS = 20;
export const WEATHER_DAYS = 365;

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
CREATE TABLE farm_log (
  id INTEGER PRIMARY KEY,
  day INTEGER NOT NULL,
  source TEXT NOT NULL,
  plot_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  amount INTEGER NOT NULL
);
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
  return parts.join('\n');
}

export function plotPos(id: number): { row: number; col: number } {
  return { row: Math.floor((id - 1) / PLOT_COLS) + 1, col: ((id - 1) % PLOT_COLS) + 1 };
}

/** 0 = same plot, 1 = orthogonally adjacent, larger = further away. */
export function plotDistance(a: number, b: number): number {
  const pa = plotPos(a);
  const pb = plotPos(b);
  return Math.abs(pa.row - pb.row) + Math.abs(pa.col - pb.col);
}

export const PLOT_COUNT = PLOT_ROWS * PLOT_COLS;
