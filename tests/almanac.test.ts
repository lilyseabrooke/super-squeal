import { describe, expect, it } from 'vitest';
import { ALMANAC, DAILY_CHALLENGES, makeChallenge, REVIEW_INTERVALS, seededRandom, type GenCtx } from '../src/data/almanac';
import { QUESTS } from '../src/data/quests';
import type { Game } from '../src/game';
import { memoryKV } from '../src/game';
import { newGame, solveCurrent } from './helpers';

/** Turns "SELECT ___ FROM ___;" into a regex that matches any way of filling the blanks. */
function templateRegex(template: string): RegExp {
  const norm = template.replace(/;\s*$/, '').trim();
  const parts = norm.split('___').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return new RegExp('^' + parts.join('(.+?)') + '$', 'i');
}

async function playTo(questId: string | null): Promise<Game> {
  const g = await newGame();
  while (g.currentQuest() && g.currentQuest()!.id !== questId) solveCurrent(g);
  return g;
}

/** Answers the active (or given) Almanac challenge with its own expected query. */
function solveAlmanac(g: Game, index: number) {
  g.almanacStart(index);
  return g.runPlayerQuery(g.progress.almanac.today[index].challenge.expected);
}

describe('Almanac challenge library', () => {
  it('every concept unlocks from a real quest, and has variants', () => {
    for (const c of ALMANAC) {
      expect(QUESTS.some((q) => q.id === c.unlockedBy), `${c.id} unlockedBy ${c.unlockedBy}`).toBe(true);
      expect(c.variants.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every variant, across many random picks, runs, and its hint fills in to the exact answer', async () => {
    const g = await playTo(null); // a finished, data-rich farm
    const problems: string[] = [];
    for (const concept of ALMANAC) {
      concept.variants.forEach((variant, vi) => {
        for (let seed = 0; seed < 8; seed++) {
          const rng = seededRandom(`${concept.id}:${vi}:${seed}`);
          const ctx: GenCtx = { pick: (xs) => xs[Math.floor(rng() * xs.length)], all: (sql, p) => g.all(sql, p) };
          const c = variant(ctx);
          if (!c) continue;
          const where = `${concept.id}#${vi} (${c.expected})`;
          try {
            g.execResult(c.expected);
          } catch (e) {
            problems.push(`${where}: expected SQL fails: ${e}`);
            continue;
          }
          if (!c.hint.includes('___')) problems.push(`${where}: hint has no blanks`);
          if (!templateRegex(c.hint).test(c.expected.trim())) problems.push(`${where}: hint "${c.hint}" can't become the answer`);
          if (c.require && !new RegExp(c.require.pattern, 'i').test(c.expected)) problems.push(`${where}: the answer fails its own requirement`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('every concept can make a solvable challenge the moment it unlocks', async () => {
    const g = await newGame();
    const checked = new Set<string>();
    const problems: string[] = [];
    while (g.currentQuest()) {
      solveCurrent(g);
      for (const id of g.almanacUnlocked()) {
        if (checked.has(id)) continue;
        checked.add(id);
        const c = makeChallenge(ALMANAC.find((x) => x.id === id)!, `unlock:${id}`, (sql, p) => g.all(sql, p));
        try {
          g.execResult(c.expected);
        } catch (e) {
          problems.push(`${id}: ${e}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect([...checked].sort()).toEqual(ALMANAC.map((c) => c.id).sort());
  });
});

describe('Almanac reviews', () => {
  it('opens after the first concept is learned, with up to three challenges a day', async () => {
    const early = await newGame();
    expect(early.almanacUnlocked()).toEqual([]);
    expect(early.progress.almanac.today).toEqual([]);
    const g = await playTo('c5-group'); // several concepts learned by now
    expect(g.almanacUnlocked().length).toBeGreaterThan(DAILY_CHALLENGES);
    expect(g.progress.almanac.today).toHaveLength(DAILY_CHALLENGES);
    expect(g.almanacOpenCount()).toBe(DAILY_CHALLENGES);
  });

  it('a clean solve earns a star, coins, and a longer wait before the next review', async () => {
    const g = await playTo('c5-group');
    const concept = g.progress.almanac.today[0].challenge.concept;
    const coins = g.coins;
    const out = solveAlmanac(g, 0);
    expect(out.almanac?.ok).toBe(true);
    const r = g.progress.almanac.concepts[concept];
    expect(r.stars).toBe(1);
    expect(r.due).toBe(g.day + REVIEW_INTERVALS[0]);
    expect(g.coins).toBe(coins + 10);
    expect(g.progress.almanac.today[0].status).toBe('solved');
    expect(g.progress.almanac.active).toBeNull();
  });

  it('intervals grow with each clean solve (1, 3, 6, 10, 15 days) for a player who does every daily challenge', async () => {
    const g = await playTo('c5-group');
    const concept = g.progress.almanac.today[0].challenge.concept;
    const gaps: number[] = [];
    for (let guard = 0; guard < 150 && gaps.length < 5; guard++) {
      g.progress.almanac.today.forEach((t, i) => {
        if (t.status !== 'open') return;
        solveAlmanac(g, i);
        if (t.challenge.concept === concept) gaps.push(g.progress.almanac.concepts[concept].due - g.day);
      });
      g.endDay();
    }
    expect(gaps).toEqual(REVIEW_INTERVALS);
  });

  it('the most overdue concepts are reviewed first', async () => {
    const g = await playTo('c5-group');
    const ids = g.almanacUnlocked();
    // Make the last concept very overdue and everything else due today.
    for (const id of ids) g.progress.almanac.concepts[id].due = g.day;
    g.progress.almanac.concepts[ids[ids.length - 1]].due = g.day - 10;
    g.endDay();
    expect(g.progress.almanac.today[0].challenge.concept).toBe(ids[ids.length - 1]);
  });

  it('a hinted solve earns no star and comes back tomorrow; giving up loses a star', async () => {
    const g = await playTo('c5-group');
    const [a, b] = g.progress.almanac.today.map((t) => t.challenge.concept);
    g.progress.almanac.concepts[b].stars = 2;
    g.almanacHint(0);
    expect(solveAlmanac(g, 0).almanac?.message).toMatch(/with a hint/);
    expect(g.progress.almanac.concepts[a]).toMatchObject({ stars: 0, due: g.day + 1 });
    g.almanacGiveUp(1);
    expect(g.progress.almanac.concepts[b]).toMatchObject({ stars: 1, due: g.day + 1, lapses: 1 });
    expect(g.progress.almanac.today[1].status).toBe('given_up');
  });

  it('wrong answers, and right rows that skip the concept, are not accepted', async () => {
    const g = await playTo('c5-having');
    // Every market price is above 0, so leaving out the WHERE gives the same rows.
    g.progress.almanac.today = [
      {
        challenge: {
          concept: 'where',
          prompt: 'Market items selling for more than 0.',
          expected: 'SELECT * FROM market WHERE sell_price > 0',
          require: { pattern: '\\bwhere\\b', message: 'Use `WHERE` to filter for this one.' },
          hint: 'SELECT * FROM market WHERE sell_price > ___;',
        },
        status: 'open',
        hinted: false,
      },
    ];
    g.almanacStart(0);
    const wrongTable = g.runPlayerQuery('SELECT * FROM land').almanac;
    expect(wrongTable?.ok).toBe(false);
    expect(wrongTable?.message).toMatch(/`market` table/);
    const dodged = g.runPlayerQuery('SELECT * FROM market').almanac;
    expect(dodged?.ok).toBe(false);
    expect(dodged?.message).toMatch(/Right rows!.*Filtering with WHERE/);
    expect(g.runPlayerQuery('SELECT * FROM market WHERE sell_price > 0').almanac?.ok).toBe(true);
  });

  it('only gives a review a fresh challenge on a new day, and skips concepts that are not due', async () => {
    const g = await playTo('c5-group');
    for (let i = 0; i < DAILY_CHALLENGES; i++) solveAlmanac(g, i);
    expect(g.almanacOpenCount()).toBe(0);
    g.endDay();
    const today = g.progress.almanac.today.map((t) => t.challenge.concept);
    expect(today.length).toBeLessThanOrEqual(DAILY_CHALLENGES);
    for (const id of today) expect(g.progress.almanac.concepts[id].due).toBeLessThanOrEqual(g.day);
    expect(g.almanacOpenCount()).toBe(today.length);
  });

  it('extra practice adds one more challenge and makes it active', async () => {
    const g = await playTo('c5-group');
    const before = g.progress.almanac.today.length;
    g.almanacExtra();
    expect(g.progress.almanac.today).toHaveLength(before + 1);
    expect(g.progress.almanac.today[before].extra).toBe(true);
    expect(g.progress.almanac.active).toBe(before);
  });

  it('does not get in the way of the main quest', async () => {
    const g = await playTo('c5-sum');
    g.almanacStart(0);
    const q = g.currentQuest()!;
    if (q.kind !== 'query') throw new Error('expected a query quest');
    const out = g.runPlayerQuery(q.expected);
    expect(out.feedback?.ok).toBe(true);
    expect(g.currentQuest()?.id).not.toBe('c5-sum');
    expect(out.almanac?.ok).toBe(false); // a different question, so not solved
  });

  it('is saved and loaded, and old saves without an Almanac still load', async () => {
    const kv = memoryKV();
    const g = await newGame(kv);
    while (g.currentQuest()?.id !== 'c5-group') solveCurrent(g);
    solveAlmanac(g, 0);
    g.flush();
    const g2 = await newGame(kv);
    expect(g2.progress.almanac.solved).toBe(1);
    expect(g2.progress.almanac.today[0].status).toBe('solved');

    // Strip the Almanac from the save, as an older version of the game would have written it.
    const raw = JSON.parse(kv.get('super-squeal-save-v1')!);
    delete raw.progress.almanac;
    kv.set('super-squeal-save-v1', JSON.stringify(raw));
    const g3 = await newGame(kv);
    expect(g3.almanacUnlocked().length).toBeGreaterThan(0);
    expect(g3.progress.almanac.today.length).toBe(DAILY_CHALLENGES);
  });
});
