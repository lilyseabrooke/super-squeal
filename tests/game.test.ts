import { describe, expect, it } from 'vitest';
import { Game, memoryKV, type Action } from '../src/game';
import { QUESTS } from '../src/data/quests';
import { SCHEMA_VERSION } from '../src/data/schema';
import { farmDay, newGame, solveCurrent, sql } from './helpers';


describe('full playthrough', () => {
  it('every quest can be completed in order, with free play taking a sensible number of days', async () => {
    const g = await newGame();
    const seen: string[] = [];
    const freeDays: Record<string, number> = {};
    for (let guard = 0; guard < 200 && g.currentQuest(); guard++) {
      const q = g.currentQuest()!;
      seen.push(q.id);
      const days = solveCurrent(g);
      expect(g.currentQuest()?.id, `${q.id} did not complete`).not.toBe(q.id);
      if (q.kind === 'goal') freeDays[q.id] = days;
    }
    // Quests are met in order. An action quest may complete itself when its evidence already
    // exists (e.g. a Snoutroot was already growing where Puddlewump settled), so it can be skipped.
    expect(seen).toEqual(QUESTS.map((q) => q.id).filter((id) => seen.includes(id)));
    const skipped = QUESTS.filter((q) => !seen.includes(q.id));
    for (const q of skipped) expect(q.kind, `${q.id} was skipped`).toBe('action');
    expect(g.progress.questIndex).toBe(QUESTS.length);
    // Free play should be a stretch of days, not instant and not a slog.
    for (const [id, days] of Object.entries(freeDays)) {
      expect(days, `${id} took ${days} days`).toBeGreaterThanOrEqual(3);
      expect(days, `${id} took ${days} days`).toBeLessThanOrEqual(20);
    }
    for (const b of ['frost_detective', 'hollow_hand', 'fair_favourite', 'water_wise', 'ghost_hunter', 'ledger_keeper', 'quill_bearer', 'big_farmer', 'matchmaker', 'lantern_bearer']) {
      expect(g.progress.badges).toContain(b);
    }
    expect(g.progress.met).toEqual(['Squeal', 'Henbell', 'Sortoise', 'Chimnius', 'Puddlewump', 'Nullkin', 'Echolamb', 'Glimmerwick']);
    expect(g.bestiaryProgress.found).toBe(g.bestiaryProgress.total);
  });

  it('answer quests have evidence in the data when reached', async () => {
    const g = await newGame();
    const evidence: Record<string, string> = {
      'c1-squeal': "SELECT COUNT(*) FROM farm_log WHERE source = 'Squeal' AND event = 'tilled'",
      'c2-henbell': "SELECT COUNT(*) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'",
      'c3-sortoise': "SELECT COUNT(*) FROM farm_log WHERE source = 'Sortoise' AND event = 'found'",
      'c4-warm': "SELECT COUNT(*) FROM plots WHERE warmth >= 0",
      'c4-cough': "SELECT COUNT(*) FROM farm_log WHERE source = 'Henbell' AND event = 'coughed'",
      'c5-puddle': "SELECT COUNT(*) FROM farm_log WHERE source = 'Puddlewump' AND event = 'watered'",
      'c5-rot-why': "SELECT COUNT(*) FROM farm_log WHERE event = 'rotted'",
      'c6-nullkin': 'SELECT COUNT(*) FROM farm_log WHERE source IS NULL',
      'c6-echolamb':
        'SELECT COUNT(*) FROM (SELECT day, source, plot_id, event FROM farm_log GROUP BY day, source, plot_id, event HAVING COUNT(*) > 1)',
      'c7-laws': 'SELECT COUNT(*) FROM farm WHERE coins < 9999',
      // Every pollinated plot holds a Sunpuff, and something else was growing that it skipped.
      'c8-pollen': `SELECT (SELECT COUNT(*) FROM farm_log l JOIN plots p ON l.plot_id = p.id WHERE l.event = 'pollinated' AND p.crop != 'sunpuff') = 0
                      AND (SELECT COUNT(*) FROM plots WHERE crop IN ('snoutroot', 'glassberry')) > 0`,
    };
    while (g.currentQuest()) {
      const q = g.currentQuest()!;
      if (q.kind === 'query') g.runPlayerQuery(q.expected);
      else if (q.kind === 'answer') {
        expect(evidence[q.id], `add evidence for answer quest ${q.id}`).toBeDefined();
        expect(Number(g.scalar(evidence[q.id])), `evidence for ${q.id}`).toBeGreaterThan(0);
        g.answer(q.correct);
      } else solveCurrent(g);
    }
  });
});

describe('game mechanics', () => {
  it('debounced saving batches writes but loses nothing', async () => {
    const kv = memoryKV();
    let writes = 0;
    const counting = { ...kv, set: (k: string, v: string) => (writes++, kv.set(k, v)) };
    const g = new Game(await sql(), counting, () => '2026-11-23', 'debounced');
    g.flush();
    writes = 0;
    for (let i = 0; i < 5; i++) g.act({ type: 'water', plot: i + 1 });
    expect(writes).toBe(0);
    g.flush();
    expect(writes).toBe(1);
    expect((await newGame(kv)).scalar('SELECT MIN(moisture) FROM plots WHERE id <= 5')).toBe(3);
  });

  it('blocks writes before the Ledger Quill', async () => {
    const g = await newGame();
    const out = g.runPlayerQuery('UPDATE farm SET coins = 9999');
    expect(out.error).toMatch(/read-only/);
    expect(g.coins).toBeLessThan(9999);
  });

  it('gives friendly errors', async () => {
    const g = await newGame();
    expect(g.runPlayerQuery('SELECT nmae FROM creatures').error).toMatch(/Did you mean `name`/);
  });

  it('returns column names for empty results', async () => {
    const g = await newGame();
    const out = g.runPlayerQuery("SELECT name FROM creatures WHERE name = 'Nobody'");
    expect(out.result).toEqual({ columns: ['name'], rows: [] });
  });

  it('frost kills crops except near Chimnius', async () => {
    const g = await newGame();
    g.db.run("INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES ('Chimnius', 'hearth-walker', '🏭', 2, 0, 8)");
    g.db.run("UPDATE weather SET temperature = -4 WHERE day = 1");
    g.db.run("UPDATE plots SET crop = 'snoutroot', growth = 10");
    g.endDay();
    const alive = g.all<{ id: number }>('SELECT id FROM plots WHERE crop IS NOT NULL ORDER BY id').map((p) => p.id);
    expect(alive).toEqual([1, 2, 3, 6]);
    for (const id of alive) expect(g.plotDistance(id, 2)).toBeLessThanOrEqual(1);
  });

  it('crops grow, and tilled soil grows faster', async () => {
    const g = await newGame();
    g.act({ type: 'feed', name: 'Squeal' });
    g.act({ type: 'plant', plot: 6, crop: 'snoutroot' }); // Squeal's plot
    g.act({ type: 'plant', plot: 1, crop: 'snoutroot' });
    g.endDay(); // Squeal tills tonight; tilling applies to growth the same night
    const growth = (id: number) => Number(g.scalar('SELECT growth FROM plots WHERE id = ?', [id]));
    expect(growth(6)).toBeGreaterThan(growth(1));
    g.endDay();
    g.endDay();
    expect(growth(6)).toBe(100);
    expect(g.act({ type: 'harvest', plot: 6 })).toBe(true);
    expect(Number(g.scalar("SELECT quantity FROM inventory WHERE item = 'snoutroot'"))).toBe(3);
    expect(g.progress.badges).toContain('green_trotters');
  });

  it('rewind undoes actions but keeps quest rewards and arrivals', async () => {
    const g = await newGame();
    g.runPlayerQuery('SELECT * FROM creatures'); // completes quest 1 (+5 coins)
    const coins = g.coins;
    g.act({ type: 'buy', crop: 'snoutroot' });
    expect(g.coins).toBe(coins - 2);
    g.rewind();
    expect(g.coins).toBe(coins);
    expect(Number(g.scalar("SELECT quantity FROM inventory WHERE item = 'snoutroot_seed'"))).toBe(3);
  });

  it('saves and loads', async () => {
    const kv = memoryKV();
    const g = await newGame(kv);
    g.act({ type: 'feed', name: 'Squeal' });
    g.endDay();
    g.flush();
    const g2 = await newGame(kv);
    expect(g2.day).toBe(2);
    expect(g2.progress.questIndex).toBe(g.progress.questIndex);
  });

  it('tracks daily streaks', async () => {
    const kv = memoryKV();
    const g1 = await newGame(kv, '2026-11-23');
    expect(g1.progress.streak.count).toBe(1);
    g1.flush();
    const g2 = await newGame(kv, '2026-11-24');
    expect(g2.progress.streak.count).toBe(2);
    g2.flush();
    const g3 = await newGame(kv, '2026-11-27');
    expect(g3.progress.streak.count).toBe(1);
  });

  it('rejects impossible actions', async () => {
    const g = await newGame();
    const actions: Action[] = [
      { type: 'harvest', plot: 1 },
      { type: 'sell', item: 'egg', all: false },
      { type: 'plant', plot: 1, crop: 'glassberry' },
    ];
    for (const a of actions) expect(g.act(a)).toBe(false);
  });
});

describe('free play and reports', () => {
  it('report answers accept the right value (loosely typed) and reject wrong ones', async () => {
    const g = await newGame();
    while (g.currentQuest()?.id !== 'f1-eggs') solveCurrent(g);
    const eggs = Number(g.scalar("SELECT SUM(amount) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'"));
    expect(g.submitReport(String(eggs + 1))).toBe(false);
    expect(g.submitReport('lots')).toBe(false);
    expect(g.currentQuest()?.id).toBe('f1-eggs');
    expect(g.submitReport(`  ${eggs} `)).toBe(true);
    expect(g.currentQuest()?.id).toBe('f1-cold');
  });

  it('text report answers ignore case and quotes', async () => {
    const g = await newGame();
    while (g.currentQuest()?.id !== 'f2-busiest') solveCurrent(g);
    const top = String(
      g.scalar('SELECT event FROM farm_log GROUP BY event HAVING COUNT(*) = (SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM farm_log GROUP BY event))'),
    );
    expect(g.submitReport(`'${top.toUpperCase()}'`)).toBe(true);
  });

  it('goals track progress since the free play started, not lifetime totals', async () => {
    const g = await newGame();
    while (g.currentQuest()?.id !== 'f1-fair') solveCurrent(g);
    const q = g.currentQuest()!;
    if (q.kind !== 'goal') throw new Error('expected a goal quest');
    const earned = g.goalStatus(q).find((s) => s.label.startsWith('Earn'))!;
    expect(earned.have).toBe(0);
  });
});

describe('old saves', () => {
  it('upgrades a v1 save so the Nullkin can leave NULLs, keeping all data', async () => {
    const kv = memoryKV();
    const g1 = await newGame(kv);
    g1.act({ type: 'feed', name: 'Squeal' });
    g1.endDay();
    // Turn this save back into the original v1 shape: NOT NULL log columns, no echo wool, version 0.
    const toV1 = (db: typeof g1.db) => {
      db.run(`
        CREATE TABLE old_log (id INTEGER PRIMARY KEY, day INTEGER NOT NULL, source TEXT NOT NULL, plot_id INTEGER NOT NULL, event TEXT NOT NULL, amount INTEGER NOT NULL);
        INSERT INTO old_log SELECT * FROM farm_log; DROP TABLE farm_log; ALTER TABLE old_log RENAME TO farm_log;
        DELETE FROM inventory WHERE item = 'echo_wool'; DELETE FROM market WHERE item = 'echo_wool';
        DROP TABLE orders;
        DROP TABLE land;
        CREATE TABLE old_plots (id INTEGER PRIMARY KEY, row INTEGER NOT NULL, col INTEGER NOT NULL, crop TEXT, growth INTEGER NOT NULL, moisture INTEGER NOT NULL, warmth INTEGER NOT NULL, tilled INTEGER NOT NULL);
        INSERT INTO old_plots SELECT id, row, col, crop, growth, moisture, warmth, tilled FROM plots; DROP TABLE plots; ALTER TABLE old_plots RENAME TO plots;
        PRAGMA user_version = 0;`);
    };
    toV1(g1.db);
    const snap = new (await sql()).Database(g1.snapshot);
    toV1(snap);
    g1.snapshot = snap.export();
    g1.flush();
    const rowsBefore = Number(g1.scalar('SELECT COUNT(*) FROM farm_log'));

    const g2 = await newGame(kv);
    expect(Number(g2.scalar('PRAGMA user_version'))).toBe(SCHEMA_VERSION);
    expect(Number(g2.scalar('SELECT COUNT(*) FROM farm_log'))).toBe(rowsBefore);
    expect(Number(g2.scalar('SELECT COUNT(*) FROM orders'))).toBe(0);
    expect(Number(g2.scalar("SELECT COUNT(*) FROM inventory WHERE item = 'echo_wool'"))).toBe(1);
    expect(Number(g2.scalar('SELECT COUNT(*) FROM land WHERE owned = 0'))).toBe(6);
    expect(g2.all('SELECT DISTINCT field FROM plots').map((r) => r.field)).toEqual(['Home field']);
    g2.db.run("INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (1, NULL, 1, 'nibbled', NULL)");
    g2.rewind(); // the snapshot was upgraded too
    expect(Number(g2.scalar('PRAGMA user_version'))).toBe(SCHEMA_VERSION);
    expect(Number(g2.scalar('SELECT COUNT(*) FROM orders'))).toBe(0);
    expect(g2.progress.stats.earned).toBe(0);
  });
});

describe('night report', () => {
  it('groups a big farm into one line per kind of event', async () => {
    const g = await newGame();
    while (g.currentQuest()?.id !== 'c7-quill') solveCurrent(g);
    g.runPlayerQuery('UPDATE creatures SET hunger = 0;');
    const lines = g.endDay().lines;
    expect(lines.filter((l) => l.startsWith('🥚'))).toHaveLength(1);
    expect(lines.find((l) => l.startsWith('🥚'))).toMatch(/^🥚 4 eggs laid \(Henbell, Clang, Dingle and Peal\)\.$/);
    expect(lines.filter((l) => l.startsWith('🐷'))).toHaveLength(1);
  });
});

describe('chapter 8', () => {
  async function withMoth() {
    const g = await newGame();
    g.db.run("INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES ('Glimmerwick', 'candle-moth', '🕯️', 7, 0, 8)");
    // Five Sunpuffs at different stages, plus other crops it should ignore.
    g.db.run(`UPDATE plots SET crop = 'sunpuff', growth = CASE id WHEN 1 THEN 50 WHEN 2 THEN 10 WHEN 3 THEN 30 WHEN 4 THEN 0 ELSE 20 END WHERE id IN (1, 2, 3, 4, 5)`);
    g.db.run("UPDATE plots SET crop = 'snoutroot', growth = 0 WHERE id IN (9, 10)");
    return g;
  }
  const visited = (g: Awaited<ReturnType<typeof newGame>>) =>
    g.all<{ plot_id: number }>("SELECT plot_id FROM farm_log WHERE event = 'pollinated' ORDER BY plot_id").map((r) => r.plot_id);

  it('Glimmerwick pollinates the three least-grown Sunpuffs, and nothing else', async () => {
    const g = await withMoth();
    g.endDay();
    expect(visited(g)).toEqual([2, 4, 5]); // growth 10, 0 and 20
    expect(Number(g.scalar("SELECT COUNT(*) FROM farm_log l JOIN plots p ON l.plot_id = p.id WHERE l.event = 'pollinated' AND p.crop != 'sunpuff'"))).toBe(0);
    expect(Number(g.scalar("SELECT MIN(amount) FROM farm_log WHERE event = 'pollinated'"))).toBe(15);
  });

  it('pollinated Sunpuffs grow 15 more than unvisited ones', async () => {
    const a = await withMoth();
    const b = await withMoth();
    b.db.run("DELETE FROM creatures WHERE name = 'Glimmerwick'");
    a.endDay();
    b.endDay();
    const growth = (g: typeof a) => Number(g.scalar('SELECT growth FROM plots WHERE id = 4'));
    expect(growth(a) - growth(b)).toBe(15);
  });

  it('a hungry Glimmerwick does not work', async () => {
    const g = await withMoth();
    g.db.run("UPDATE creatures SET hunger = 9 WHERE name = 'Glimmerwick'");
    g.endDay();
    expect(visited(g)).toEqual([]);
  });

  it('an unqualified column in a join gets a "say which table" hint', async () => {
    const g = await newGame();
    const out = g.runPlayerQuery('SELECT id FROM creatures JOIN plots ON creatures.plot_id = plots.id');
    expect(out.error).toMatch(/more than one table/);
  });
});

describe('Lantern Night', () => {
  it("counts each pollination once, even though Echolamb echoes the moth's log entries", async () => {
    const g = await newGame();
    while (g.currentQuest()?.id !== 'f5-lantern') solveCurrent(g);
    const q = g.currentQuest()!;
    if (q.kind !== 'goal') throw new Error('expected a goal quest');
    const start = g.day;
    for (let i = 0; i < 3; i++) farmDay(g);
    if (g.currentQuest()?.id !== 'f5-lantern') return; // finished early: nothing to check
    const counted = g.goalStatus(q).find((x) => x.label.startsWith('Glimmerwick'))!.have;
    const nights = g.day - start;
    expect(counted).toBeLessThanOrEqual(3 * nights);
    const raw = Number(g.scalar("SELECT COUNT(*) FROM farm_log WHERE event = 'pollinated' AND day >= ?", [start]));
    expect(raw).toBeGreaterThan(counted); // the echoes are really there
  });
});

describe('v4 upgrade of a chapter 7 farm', () => {
  it('puts the East and South field plots in the right fields', async () => {
    const kv = memoryKV();
    const g = await newGame(kv);
    while (g.currentQuest()?.id !== 'c7-morning') solveCurrent(g);
    // Pretend this farm predates the field column.
    g.db.run(`CREATE TABLE p3 AS SELECT id, row, col, crop, growth, moisture, warmth, tilled FROM plots; DROP TABLE plots; ALTER TABLE p3 RENAME TO plots; DROP TABLE land; PRAGMA user_version = 3;`);
    g.flush();
    const g2 = await newGame(kv);
    const counts = Object.fromEntries(g2.all<{ field: string; n: number }>('SELECT field, COUNT(*) AS n FROM plots GROUP BY field').map((r) => [r.field, r.n]));
    expect(counts).toEqual({ 'East field': 12, 'Home field': 12, 'South field': 24 });
  });
});
