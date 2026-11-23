import { beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../src/game';
import { farmDay, newGame, quill, quillFarmDay, solveCurrent } from './helpers';

/** A game that has just been handed the Ledger Quill (start of chapter 7's third quest). */
async function withQuill(): Promise<Game> {
  const g = await newGame();
  while (g.currentQuest()?.id !== 'c7-quill') solveCurrent(g);
  expect(g.progress.quill).toBe(true);
  return g;
}

let g: Game;
const n = (sql: string, params: (string | number)[] = []) => Number(g.scalar(sql, params));
/** Runs a write that should be refused, and checks the farm is exactly as it was. */
function refused(sql: string, why: RegExp) {
  const before = g.db.export();
  const statsBefore = JSON.stringify(g.progress.stats);
  const out = g.runPlayerQuery(sql);
  expect(out.error, sql).toMatch(/The Ledger refuses/);
  expect(out.error, sql).toMatch(why);
  expect(g.db.export(), `${sql} must change nothing`).toEqual(before);
  expect(JSON.stringify(g.progress.stats)).toBe(statsBefore);
}

describe('before the Quill', () => {
  it('writes are refused', async () => {
    const early = await newGame();
    expect(early.runPlayerQuery('UPDATE creatures SET hunger = 0').error).toMatch(/read-only/);
  });
});

describe('the Ledger Quill', () => {
  beforeEach(async () => {
    g = await withQuill();
  });

  it('the farm has grown to 48 plots and 14 creatures', () => {
    expect(n('SELECT COUNT(*) FROM plots')).toBe(48);
    expect(n('SELECT COUNT(*) FROM creatures')).toBe(14);
    expect(n('SELECT COUNT(DISTINCT row || \',\' || col) FROM plots')).toBe(48);
  });

  it('feeds everyone with one UPDATE and reports what happened', () => {
    const out = quill(g, 'UPDATE creatures SET hunger = 0;');
    expect(n('SELECT MAX(hunger) FROM creatures')).toBe(0);
    expect(out.write?.changed).toBe(14);
    expect(out.write?.effects.join(' ')).toMatch(/Fed 13 creatures/); // the Nullkin is never hungry
  });

  it('refuses cheats and changes nothing', () => {
    refused('UPDATE farm SET coins = 9999', /coins/);
    refused("UPDATE inventory SET quantity = 99 WHERE item = 'egg'", /orders/);
    refused("UPDATE market SET sell_price = 999 WHERE item = 'egg'", /Prices/);
    refused('UPDATE weather SET temperature = 30', /weather/);
    refused('UPDATE plots SET growth = 100', /grow by themselves/);
    refused('UPDATE plots SET tilled = 1', /tilled/);
    refused('UPDATE creatures SET hunger = 10', /hungrier/);
    refused('UPDATE creatures SET mood = 0', /mood/);
    refused('UPDATE creatures SET plot_id = 99', /no plot 99/);
    refused("INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES ('Gold', 'mud-beast', '🐷', 1, 0, 10)", /arrive on their own/);
    refused('DELETE FROM creatures', /delete a creature/);
    refused("INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (1, 'Henbell', 3, 'laid_egg', 50)", /forged/);
    refused('DROP TABLE farm_log', /shape|create, drop/);
    refused('UPDATE plots SET moisture = 0', /dry it out/);
  });

  it('a law broken late in a batch undoes the whole batch', () => {
    const hunger = n('SELECT SUM(hunger) FROM creatures');
    refused('UPDATE creatures SET hunger = 0; UPDATE farm SET coins = 1;', /coins/);
    expect(n('SELECT SUM(hunger) FROM creatures')).toBe(hunger);
  });

  it('buys seeds and plants them in one write, using up the seeds', () => {
    const coins = g.coins;
    const seeds = n("SELECT quantity FROM inventory WHERE item = 'sunpuff_seed'");
    const out = quill(
      g,
      "INSERT INTO orders (action, item, quantity) VALUES ('buy', 'sunpuff_seed', 4); UPDATE plots SET crop = 'sunpuff', growth = 0 WHERE id IN (25, 26, 27, 28);",
    );
    expect(g.coins).toBe(coins - 4 * 5);
    expect(n("SELECT COUNT(*) FROM plots WHERE crop = 'sunpuff' AND id BETWEEN 25 AND 28")).toBe(4);
    expect(n("SELECT quantity FROM inventory WHERE item = 'sunpuff_seed'")).toBe(seeds); // bought 4, planted 4
    expect(n("SELECT total FROM orders WHERE action = 'buy' ORDER BY id DESC LIMIT 1")).toBe(20);
    expect(out.write?.effects.join(' ')).toMatch(/Planted 4 Sunpuff/);
  });

  it('refuses planting without enough seeds', () => {
    refused("UPDATE plots SET crop = 'glassberry', growth = 0 WHERE crop IS NULL", /needs \d+ seeds/);
    refused("UPDATE plots SET crop = 'gold', growth = 0 WHERE id = 25", /no crop called/);
  });

  it('harvests ripe crops into the barn, and uproots unripe ones', () => {
    quill(g, "INSERT INTO orders (action, item, quantity) VALUES ('buy', 'snoutroot_seed', 2); UPDATE plots SET crop = 'snoutroot', growth = 0 WHERE id IN (25, 26);");
    g.db.run('UPDATE plots SET growth = 100 WHERE id = 25'); // ripen one (as if nights had passed)
    const before = n("SELECT quantity FROM inventory WHERE item = 'snoutroot'");
    const out = quill(g, 'UPDATE plots SET crop = NULL WHERE id IN (25, 26);');
    expect(n("SELECT quantity FROM inventory WHERE item = 'snoutroot'")).toBe(before + 2);
    expect(out.write?.effects.join(' ')).toMatch(/Harvested 2 crops.*Uprooted 1/);
    expect(n('SELECT COUNT(*) FROM plots WHERE id IN (25, 26) AND (crop IS NOT NULL OR growth != 0)')).toBe(0);
    expect(g.progress.stats.harvestedBy.snoutroot).toBeGreaterThanOrEqual(2);
  });

  it('sells through orders, with a subquery for the amount', () => {
    g.db.run("UPDATE inventory SET quantity = 5 WHERE item = 'egg'");
    const coins = g.coins;
    quill(g, "INSERT INTO orders (action, item, quantity) VALUES ('sell', 'egg', (SELECT quantity FROM inventory WHERE item = 'egg'));");
    expect(g.coins).toBe(coins + 5 * 4);
    expect(n("SELECT quantity FROM inventory WHERE item = 'egg'")).toBe(0);
    refused("INSERT INTO orders (action, item, quantity) VALUES ('sell', 'egg', 1)", /only have 0/);
    refused("INSERT INTO orders (action, item, quantity) VALUES ('steal', 'egg', 1)", /buy.*or.*sell/);
    refused('DELETE FROM orders', /final/);
  });

  it('lets you tidy the log with DELETE', () => {
    const rows = n('SELECT COUNT(*) FROM farm_log');
    quill(g, "DELETE FROM farm_log WHERE event = 'rang_bell'");
    expect(n("SELECT COUNT(*) FROM farm_log WHERE event = 'rang_bell'")).toBe(0);
    expect(n('SELECT COUNT(*) FROM farm_log')).toBeLessThan(rows);
  });

  it('a forgotten WHERE can be undone with Rewind', () => {
    quill(g, 'DELETE FROM farm_log');
    expect(n('SELECT COUNT(*) FROM farm_log')).toBe(0);
    g.rewind();
    expect(n('SELECT COUNT(*) FROM farm_log')).toBeGreaterThan(0);
  });

  it('bad SQL gets the usual friendly error and changes nothing', () => {
    const before = g.db.export();
    expect(g.runPlayerQuery('UPDATE creatures SET hungr = 0').error).toMatch(/Did you mean `hunger`/);
    expect(g.db.export()).toEqual(before);
  });
});

describe('the Big Farm', () => {
  it('is a chore with buttons, and a few lines of SQL with the Quill', async () => {
    const reach = async () => {
      const game = await newGame();
      while (game.currentQuest()?.id !== 'f4-big') solveCurrent(game);
      return game;
    };

    // By hand: count every button press.
    const byHand = await reach();
    let presses = 0;
    const act = byHand.act.bind(byHand);
    byHand.act = (a) => (presses++, act(a));
    let handDays = 0;
    while (byHand.currentQuest()?.id === 'f4-big' && handDays < 30) {
      farmDay(byHand);
      handDays++;
    }
    expect(byHand.currentQuest()?.id, 'buttons alone can still finish').not.toBe('f4-big');

    // With the Quill: the routine from the quest's hints.
    const byQuill = await reach();
    let writes = 0;
    let quillDays = 0;
    while (byQuill.currentQuest()?.id === 'f4-big' && quillDays < 30) {
      writes += quillFarmDay(byQuill);
      quillDays++;
    }
    expect(byQuill.currentQuest()?.id, 'the Quill routine finishes').not.toBe('f4-big');

    // Per in-game day, hand farming takes many times more actions than the Quill.
    const handPerDay = presses / handDays;
    const quillPerDay = writes / quillDays;
    expect(handPerDay, `by hand ${handPerDay.toFixed(1)}/day vs Quill ${quillPerDay.toFixed(1)}/day`).toBeGreaterThan(quillPerDay * 5);
  });
});
