import type { Database, SqlValue } from 'sql.js';
import { CROPS, GOODS, itemLabel } from './data/crops';
import { speciesOf } from './data/creatures';
import { stripLiterals } from './sqlHelp';
import type { ResultSet, Stats } from './types';

/**
 * The Ledger Quill (chapter 7): lets players change the farm with INSERT, UPDATE and DELETE.
 *
 * A write runs inside a savepoint. Afterwards the farm is compared with how it was
 * before, and every change must obey the Ledger's laws (you can feed a creature but not
 * starve it, plant but not conjure seeds, trade through `orders` but not write coins).
 * Allowed changes then have their side effects applied (seeds used, harvests banked,
 * coins paid). If any law is broken, the whole write is rolled back.
 */

type Row = Record<string, SqlValue>;
type Snapshot = Map<string, Map<string, Row>>;

/** Each table's identity column, used to match rows before and after a write. */
const KEYS: Record<string, string> = {
  farm: 'rowid',
  creatures: 'id',
  plots: 'id',
  inventory: 'item',
  market: 'item',
  seeds: 'crop',
  weather: 'day',
  farm_log: 'id',
  orders: 'id',
};

/** A write the Ledger refuses. The message is shown to the player as Keystone's explanation. */
export class LawError extends Error {}

export interface QuillHost {
  db: Database;
  readonly day: number;
  progress: { stats: Stats };
  discover(ids: string[]): void;
}

export interface QuillOutcome {
  result: ResultSet | null;
  /** Rows changed by the player's statements. */
  changed: number;
  /** Plain-language summary of what happened on the farm. */
  effects: string[];
}

const STRUCTURE = /\b(drop|create|alter|attach|detach|pragma|vacuum|reindex|begin|commit|rollback|savepoint|release|analyze)\b/i;

export const STRUCTURE_MESSAGE =
  "The Quill changes the farm's *rows*. It can't create, drop or reshape the Ledger's tables. Stick to `INSERT`, `UPDATE`, `DELETE` and `SELECT`.";

function snapshot(db: Database): Snapshot {
  const out: Snapshot = new Map();
  for (const [table, key] of Object.entries(KEYS)) {
    const rows = new Map<string, Row>();
    const st = db.prepare(`SELECT rowid AS __rowid, * FROM ${table}`);
    while (st.step()) {
      const r = st.getAsObject() as Row;
      const id = String(key === 'rowid' ? r.__rowid : r[key]);
      delete r.__rowid;
      rows.set(id, r);
    }
    st.free();
    out.set(table, rows);
  }
  return out;
}

interface TableDiff {
  inserted: Row[];
  deleted: Row[];
  updated: { before: Row; after: Row; changed: string[] }[];
}

function diff(before: Snapshot, after: Snapshot): Map<string, TableDiff> {
  const out = new Map<string, TableDiff>();
  for (const table of Object.keys(KEYS)) {
    const b = before.get(table)!;
    const a = after.get(table)!;
    const d: TableDiff = { inserted: [], deleted: [], updated: [] };
    for (const [id, row] of a) {
      const old = b.get(id);
      if (!old) d.inserted.push(row);
      else {
        const changed = Object.keys(row).filter((k) => row[k] !== old[k]);
        if (changed.length) d.updated.push({ before: old, after: row, changed });
      }
    }
    for (const [id, row] of b) if (!a.has(id)) d.deleted.push(row);
    out.set(table, d);
  }
  return out;
}

const touched = (d: TableDiff) => d.inserted.length + d.deleted.length + d.updated.length > 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Enforced {
  effects: string[];
  /** Updated stats and Bestiary discoveries, kept only if the whole write succeeds. */
  stats: Stats;
  discoveries: string[];
}

/** Checks every change against the Ledger's laws, then applies side effects. Throws LawError. */
function enforce(host: QuillHost, changes: Map<string, TableDiff>): Enforced {
  const { db } = host;
  const effects: string[] = [];
  const stats: Stats = structuredClone(host.progress.stats);
  const discoveries: string[] = [];
  const get = (t: string) => changes.get(t)!;

  if (touched(get('farm'))) throw new LawError("🪙 The Ledger won't let you write your own coins, or change the day. Coins come from trading: add a row to `orders`.");
  if (touched(get('market')) || touched(get('seeds'))) throw new LawError('Prices are set by the Hollow’s market, not by you. Nice try!');
  if (touched(get('weather'))) throw new LawError('Not even the Quill can change the weather.');
  if (touched(get('inventory'))) {
    throw new LawError('The barn changes by itself when you plant, harvest or trade. To buy or sell, add a row to `orders` instead.');
  }

  // ── farm_log: you may tidy it (DELETE), but not forge it ──
  const log = get('farm_log');
  if (log.inserted.length || log.updated.length) {
    throw new LawError('History can’t be forged: `farm_log` only records what really happened. You *can* `DELETE` rows to tidy it up.');
  }
  if (log.deleted.length) effects.push(`🧹 Tidied away ${plural(log.deleted.length, 'log row')}.`);

  // ── creatures: feed (lower hunger) and move (plot_id) only ──
  const cr = get('creatures');
  if (cr.inserted.length) throw new LawError('New creatures arrive on their own. You can’t write one into being!');
  if (cr.deleted.length) throw new LawError('You can’t delete a creature! Imagine how Squeal would feel.');
  const plotIds = new Set([...(db.exec('SELECT id FROM plots')[0]?.values ?? [])].map((r) => Number(r[0])));
  let fed = 0;
  let moved = 0;
  for (const u of cr.updated) {
    const bad = u.changed.find((k) => k !== 'hunger' && k !== 'plot_id');
    if (bad) throw new LawError(`You can feed creatures (\`hunger\`) and move them (\`plot_id\`), but you can’t change their \`${bad}\`.`);
    if (u.changed.includes('hunger')) {
      const h = u.after.hunger;
      if (typeof h !== 'number' || !Number.isInteger(h) || h < 0) throw new LawError('`hunger` has to be a whole number from 0 to 10.');
      if (h > Number(u.before.hunger)) throw new LawError(`You can feed ${u.after.name} (lower its hunger), but not make it *hungrier*. That would be mean!`);
      fed++;
      const eats = speciesOf(u.after as { kind: string })?.traits.find((t) => t.discover === 'feed');
      if (eats) discoveries.push(eats.id);
    }
    if (u.changed.includes('plot_id')) {
      if (!plotIds.has(Number(u.after.plot_id))) throw new LawError(`There's no plot ${String(u.after.plot_id)} for ${u.after.name} to move to.`);
      moved++;
    }
  }
  if (fed) effects.push(`🍽️ Fed ${plural(fed, 'creature')}.`);
  if (moved) effects.push(`🚶 Moved ${plural(moved, 'creature')}.`);

  // ── plots: water (raise moisture), plant (NULL → crop), harvest/clear (crop → NULL) ──
  const pl = get('plots');
  if (pl.inserted.length || pl.deleted.length) throw new LawError('The land is the land: you can’t add or remove plots by writing.');
  const plantings: { id: number; crop: string }[] = [];
  const clearings: Row[] = [];
  let watered = 0;
  for (const u of pl.updated) {
    const bad = u.changed.find((k) => !['crop', 'growth', 'moisture'].includes(k));
    if (bad) throw new LawError(`Only nature changes a plot's \`${bad}\`. You can change \`crop\`, \`growth\` (to 0, when planting or clearing) and \`moisture\`.`);
    if (u.changed.includes('moisture')) {
      const m = u.after.moisture;
      if (typeof m !== 'number' || !Number.isInteger(m) || m > 3) throw new LawError('`moisture` goes from 0 to 3. Watering sets it to 3 at most.');
      if (m < Number(u.before.moisture)) throw new LawError('You can water a plot (raise its moisture), but not dry it out.');
      watered++;
    }
    const oldCrop = u.before.crop as string | null;
    const newCrop = u.after.crop as string | null;
    if (oldCrop === newCrop) {
      if (u.changed.includes('growth')) throw new LawError('Crops grow by themselves overnight. Not even the Quill can hurry them along!');
      continue;
    }
    if (oldCrop !== null && newCrop !== null) {
      throw new LawError(`Plot ${u.after.id} already has ${itemLabel(oldCrop)} growing. Harvest or clear it (set \`crop\` to NULL) before planting something else.`);
    }
    if (newCrop !== null) {
      if (!CROPS[newCrop]) throw new LawError(`There's no crop called '${newCrop}'. The \`seeds\` table lists what you can plant.`);
      if (u.after.growth !== 0) throw new LawError('Newly planted crops start at `growth = 0`.');
      plantings.push({ id: Number(u.after.id), crop: newCrop });
    } else {
      clearings.push(u.before);
    }
  }
  if (watered) effects.push(`💧 Watered ${plural(watered, 'plot')}.`);

  const qty = (item: string) => Number(db.exec('SELECT quantity FROM inventory WHERE item = ?', [item])[0]?.values[0]?.[0] ?? 0);
  const coins = () => Number(db.exec('SELECT coins FROM farm')[0].values[0][0]);
  const addItem = (item: string, n: number) => db.run('UPDATE inventory SET quantity = quantity + ? WHERE item = ?', [n, item]);

  // ── orders: new rows only. Buys first (so seeds can be planted in the same write), sells last. ──
  const ord = get('orders');
  if (ord.updated.length || ord.deleted.length) throw new LawError('Orders are final once placed. You can only add new ones.');
  const orders = ord.inserted.map((o) => {
    const action = String(o.action ?? '').toLowerCase();
    const n = o.quantity;
    if (action !== 'buy' && action !== 'sell') throw new LawError("An order's `action` must be `'buy'` or `'sell'`.");
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new LawError("An order's `quantity` must be a whole number, 1 or more.");
    return { id: Number(o.id), action, item: String(o.item ?? ''), n };
  });
  for (const o of orders.filter((x) => x.action === 'buy')) {
    const crop = CROPS[o.item.replace(/_seed$/, '')];
    if (!crop) throw new LawError(`The market only sells seeds. Try an item like \`'sunpuff_seed'\` (the \`seeds\` table lists them).`);
    const cost = crop.seedPrice * o.n;
    if (cost > coins()) throw new LawError(`That order costs ${cost} coins, but you only have ${coins()}.`);
    db.run('UPDATE farm SET coins = coins - ?', [cost]);
    addItem(crop.id + '_seed', o.n);
    db.run('UPDATE orders SET item = ?, action = ?, day = ?, total = ? WHERE id = ?', [crop.id + '_seed', 'buy', host.day, cost, o.id]);
    effects.push(`🛒 Bought ${plural(o.n, crop.label + ' seed')} for ${cost} coins.`);
  }

  // Plant: each new crop uses a seed from the barn.
  const byCrop = new Map<string, number>();
  for (const p of plantings) byCrop.set(p.crop, (byCrop.get(p.crop) ?? 0) + 1);
  for (const [crop, n] of byCrop) {
    const have = qty(crop + '_seed');
    if (n > have) {
      throw new LawError(
        `Planting ${n} ${CROPS[crop].label} needs ${plural(n, 'seed')}, but your barn has ${have}. Buy more with an order first. You can do it in the same write!`,
      );
    }
    addItem(crop + '_seed', -n);
    effects.push(`🌱 Planted ${n} ${CROPS[crop].label} (${plural(n, 'seed')} used).`);
  }
  for (const p of plantings) {
    db.run("INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, 'Farmer', ?, 'planted', 1)", [host.day, p.id]);
  }

  // Clear: ripe crops are harvested into the barn; unripe ones are uprooted and lost.
  let harvested = 0;
  let uprooted = 0;
  for (const p of clearings) {
    const crop = CROPS[String(p.crop)];
    if (Number(p.growth) >= 100 && crop) {
      const n = crop.yield + (Number(p.tilled) ? 1 : 0);
      addItem(crop.id, n);
      harvested += n;
      stats.harvested += n;
      stats.harvestedBy[crop.id] = (stats.harvestedBy[crop.id] ?? 0) + n;
      db.run("INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, 'Farmer', ?, 'harvested', ?)", [host.day, p.id, n]);
    } else {
      uprooted++;
    }
    db.run('UPDATE plots SET growth = 0, tilled = 0 WHERE id = ?', [p.id]);
  }
  if (harvested) effects.push(`✨ Harvested ${plural(harvested, 'crop')}.`);
  if (uprooted) effects.push(`🪓 Uprooted ${plural(uprooted, 'unripe crop')} (they were lost).`);

  for (const o of orders.filter((x) => x.action === 'sell')) {
    const price = CROPS[o.item]?.sellPrice ?? GOODS[o.item]?.sellPrice;
    if (price === undefined) throw new LawError(`The market doesn't buy '${o.item}'. The \`market\` table lists what it buys.`);
    const have = qty(o.item);
    if (o.n > have) throw new LawError(`You tried to sell ${o.n} ${itemLabel(o.item)}, but you only have ${have}.`);
    const total = price * o.n;
    addItem(o.item, -o.n);
    db.run('UPDATE farm SET coins = coins + ?', [total]);
    db.run("UPDATE orders SET action = 'sell', day = ?, total = ? WHERE id = ?", [host.day, total, o.id]);
    stats.sold += o.n;
    stats.earned += total;
    stats.soldBy[o.item] = (stats.soldBy[o.item] ?? 0) + o.n;
    effects.push(`🪙 Sold ${o.n} ${itemLabel(o.item)} for ${total} coins.`);
  }

  // Remember what kinds of thing the Quill has done, for quests.
  const q = (stats.quill ??= {});
  const bump = (k: string, n: number) => n && (q[k] = (q[k] ?? 0) + n);
  bump('fed', fed);
  bump('moved', moved);
  bump('watered', watered);
  bump('planted', plantings.length);
  bump('harvested', harvested);
  bump('uprooted', uprooted);
  bump('deleted', log.deleted.length);
  bump('bought', orders.filter((o) => o.action === 'buy').length);
  bump('sold', orders.filter((o) => o.action === 'sell').length);
  stats.writes = (stats.writes ?? 0) + 1;
  return { effects, stats, discoveries };
}

/** Runs a write with the Quill. Throws LawError (refused) or a SQLite error (bad SQL); either way nothing changes. */
export function quillWrite(host: QuillHost, sql: string): QuillOutcome {
  if (STRUCTURE.test(stripLiterals(sql))) throw new LawError(STRUCTURE_MESSAGE);
  const { db } = host;
  const before = snapshot(db);
  db.run('SAVEPOINT quill');
  try {
    let result: ResultSet | null = null;
    let changed = 0;
    for (const st of db.iterateStatements(sql)) {
      const columns = st.getColumnNames();
      const rows: SqlValue[][] = [];
      while (st.step()) rows.push(st.get());
      if (columns.length) result = { columns, rows };
      // sqlite's change counter only means something right after a write statement.
      if (/^\s*(insert|update|delete|replace)\b/i.test(stripLiterals(st.getSQL()))) changed += db.getRowsModified();
    }
    const done = enforce(host, diff(before, snapshot(db)));
    db.run('RELEASE quill');
    host.progress.stats = done.stats;
    host.discover(done.discoveries);
    return { result, changed, effects: done.effects };
  } catch (e) {
    db.run('ROLLBACK TO quill');
    db.run('RELEASE quill');
    throw e;
  }
}
