import { describe, expect, it } from 'vitest';
import { memoryKV, type Action } from '../src/game';
import { QUESTS } from '../src/data/quests';
import { plotDistance } from '../src/data/schema';
import { newGame, SOLVERS } from './helpers';


describe('full playthrough', () => {
  it('every quest can be completed in order', async () => {
    const g = await newGame();
    const seen: string[] = [];
    for (let guard = 0; guard < 100 && g.currentQuest(); guard++) {
      const q = g.currentQuest()!;
      seen.push(q.id);
      if (q.kind === 'query') {
        const out = g.runPlayerQuery(q.expected + ';');
        expect(out.error, `${q.id}: ${out.error}`).toBeUndefined();
        expect(out.feedback?.ok, `${q.id}: ${out.feedback?.message}`).toBe(true);
      } else if (q.kind === 'answer') {
        expect(g.answer(q.correct), q.id).toBe(true);
      } else {
        const solve = SOLVERS[q.id];
        expect(solve, `no solver for ${q.id}`).toBeDefined();
        solve(g);
        expect(g.currentQuest()?.id, `${q.id} did not complete`).not.toBe(q.id);
      }
    }
    expect(seen).toEqual(QUESTS.map((q) => q.id));
    expect(g.progress.badges).toContain('frost_detective');
    expect(g.progress.badges).toContain('hollow_hand');
    expect(g.progress.met).toEqual(['Squeal', 'Henbell', 'Sortoise', 'Chimnius']);
  });

  it('answer quests have evidence in the data when reached', async () => {
    const g = await newGame();
    const evidence: Record<string, string> = {
      'c1-squeal': "SELECT COUNT(*) FROM farm_log WHERE source = 'Squeal' AND event = 'tilled'",
      'c2-henbell': "SELECT COUNT(*) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'",
      'c3-sortoise': "SELECT COUNT(*) FROM farm_log WHERE source = 'Sortoise' AND event = 'found'",
      'c4-warm': "SELECT COUNT(*) FROM plots WHERE warmth >= 0",
      'c4-cough': "SELECT COUNT(*) FROM farm_log WHERE source = 'Henbell' AND event = 'coughed'",
    };
    while (g.currentQuest()) {
      const q = g.currentQuest()!;
      if (q.kind === 'query') g.runPlayerQuery(q.expected);
      else if (q.kind === 'answer') {
        expect(Number(g.scalar(evidence[q.id])), `evidence for ${q.id}`).toBeGreaterThan(0);
        g.answer(q.correct);
      } else SOLVERS[q.id](g);
    }
  });
});

describe('game mechanics', () => {
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
    for (const id of alive) expect(plotDistance(id, 2)).toBeLessThanOrEqual(1);
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
    const g2 = await newGame(kv);
    expect(g2.day).toBe(2);
    expect(g2.progress.questIndex).toBe(g.progress.questIndex);
  });

  it('tracks daily streaks', async () => {
    const kv = memoryKV();
    const g1 = await newGame(kv, '2026-11-23');
    expect(g1.progress.streak.count).toBe(1);
    const g2 = await newGame(kv, '2026-11-24');
    expect(g2.progress.streak.count).toBe(2);
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
