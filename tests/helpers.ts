import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { CROPS } from '../src/data/crops';
import { plotDistance } from '../src/data/schema';
import { Game, memoryKV, type KV } from '../src/game';

let SQL: SqlJsStatic | null = null;
export async function sql(): Promise<SqlJsStatic> {
  return (SQL ??= await initSqlJs({ useOldExtensionFunctions: false }));
}

export async function newGame(kv: KV = memoryKV(), today = '2026-11-23'): Promise<Game> {
  return new Game(await sql(), kv, () => today);
}

/** Does whatever a sensible player would do for each action quest. */
export const SOLVERS: Record<string, (g: Game) => void> = {
  'c1-feed': (g) => g.act({ type: 'feed', name: 'Squeal' }),
  'c1-plant': (g) => g.act({ type: 'plant', plot: 6, crop: 'snoutroot' }),
  'c1-night': (g) => g.endDay(),
  'c2-feed': (g) => g.act({ type: 'feed', name: 'Henbell' }),
  'c2-night': (g) => g.endDay(),
  'c3-sell': (g) => g.act({ type: 'sell', item: 'egg', all: false }),
  'c3-night': (g) => g.endDay(),
  'c4-frost': (g) => g.endDay(),
  'c4-move': (g) => g.act({ type: 'move', name: 'Henbell', plot: 12 }),
  'c5-night': (g) => g.endDay(),
  'c5-rot': (g) => {
    const plot = Number(g.scalar("SELECT plot_id FROM creatures WHERE name = 'Puddlewump'"));
    if (g.scalar('SELECT crop FROM plots WHERE id = ?', [plot]) === null) {
      if (Number(g.scalar("SELECT quantity FROM inventory WHERE item = 'snoutroot_seed'")) < 1) g.act({ type: 'buy', crop: 'snoutroot' });
      g.act({ type: 'plant', plot, crop: 'snoutroot' });
    }
    g.endDay();
  },
  'c6-shimmer': (g) => g.endDay(),
  'c6-echo': (g) => g.endDay(),
};

/**
 * Plays one in-game day the way a sensible (not perfect) player would:
 * feed everyone, keep Henbell out of the smoke, harvest, sell, water, plant, sleep.
 */
export function farmDay(g: Game, prefer: string[] = ['glassberry', 'sunpuff', 'snoutroot']) {
  const creatures = g.all<{ name: string; plot_id: number }>('SELECT name, plot_id FROM creatures');
  for (const c of creatures) g.act({ type: 'feed', name: c.name });
  const chim = creatures.find((c) => c.name === 'Chimnius');
  const hen = creatures.find((c) => c.name === 'Henbell');
  if (chim && hen && plotDistance(chim.plot_id, hen.plot_id) <= 1) g.act({ type: 'move', name: 'Henbell', plot: 12 });

  for (const p of g.all<{ id: number }>('SELECT id FROM plots WHERE crop IS NOT NULL AND growth >= 100')) g.act({ type: 'harvest', plot: p.id });
  for (const i of g.all<{ item: string }>("SELECT item FROM inventory WHERE quantity > 0 AND item NOT LIKE '%_seed'")) {
    g.act({ type: 'sell', item: i.item, all: true });
  }
  for (const p of g.all<{ id: number }>('SELECT id FROM plots WHERE crop IS NOT NULL AND moisture = 0')) g.act({ type: 'water', plot: p.id });

  const puddle = Number(g.scalar("SELECT plot_id FROM creatures WHERE name = 'Puddlewump'") ?? 0);
  for (const p of g.all<{ id: number }>('SELECT id FROM plots WHERE crop IS NULL')) {
    // Plant a mix: each plot prefers a different crop, falling back to whatever is affordable.
    const order = [...prefer.slice(p.id % prefer.length), ...prefer.slice(0, p.id % prefer.length)];
    const crop = order.find((c) => CROPS[c].seedPrice <= g.coins && !(c === 'snoutroot' && p.id === puddle));
    if (!crop) break;
    g.act({ type: 'buy', crop });
    g.act({ type: 'plant', plot: p.id, crop });
  }
  g.endDay();
}

/** Answers a report quest using the query its own final hint suggests. */
export function solveReport(g: Game) {
  const q = g.currentQuest()!;
  if (q.kind !== 'report') throw new Error('not a report quest');
  const sql = /`(SELECT[^`]+)`/i.exec(q.hints.answer ?? '')?.[1];
  if (!sql) throw new Error(`${q.id}: final hint has no query`);
  const value = g.execResult(sql).rows[0]?.[0];
  return g.submitReport(String(value));
}

/** Completes the current quest the intended way. Returns the in-game days it took. */
export function solveCurrent(g: Game): number {
  const q = g.currentQuest()!;
  const start = g.day;
  if (q.kind === 'query') g.runPlayerQuery(q.expected);
  else if (q.kind === 'answer') g.answer(q.correct);
  else if (q.kind === 'report') solveReport(g);
  else if (q.kind === 'goal') {
    for (let i = 0; i < 60 && g.currentQuest()?.id === q.id; i++) farmDay(g);
  } else SOLVERS[q.id](g);
  return g.day - start;
}
