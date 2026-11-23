import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { Game, memoryKV, type KV } from '../src/game';

let SQL: SqlJsStatic | null = null;
export async function sql(): Promise<SqlJsStatic> {
  return (SQL ??= await initSqlJs({ useOldExtensionFunctions: false }));
}

export async function newGame(kv: KV = memoryKV(), today = '2026-11-23'): Promise<Game> {
  return new Game(await sql(), kv, () => today);
}
