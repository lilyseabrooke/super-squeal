import initSqlJs, { type SqlJsStatic } from 'sql.js';
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
};

/** Completes the current quest the intended way. */
export function solveCurrent(g: Game) {
  const q = g.currentQuest()!;
  if (q.kind === 'query') g.runPlayerQuery(q.expected);
  else if (q.kind === 'answer') g.answer(q.correct);
  else SOLVERS[q.id](g);
}
