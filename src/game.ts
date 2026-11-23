import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { CROPS, GOODS, itemLabel } from './data/crops';
import { ALL_TRAIT_IDS, SPECIES } from './data/creatures';
import { QUESTS } from './data/quests';
import { schemaSql } from './data/schema';
import { runNight } from './sim';
import {
  BLANK,
  BLANKS_MESSAGE,
  friendlyError,
  isReadOnly,
  READONLY_MESSAGE,
  resultsMatch,
  sameQuery,
  stripComments,
  tablesIn,
  type SchemaInfo,
} from './sqlHelp';
import type { NightReport, Progress, Quest, QuestApi, ResultSet } from './types';

export const SAVE_KEY = 'super-squeal-save-v1';

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserKV: KV = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or blocked: the game still works, it just won't persist */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

export type ToastKind = 'info' | 'success' | 'sql' | 'warn';
export interface Toast {
  kind: ToastKind;
  title: string;
  body?: string;
  sql?: string;
}

export type Action =
  | { type: 'feed'; name: string }
  | { type: 'move'; name: string; plot: number }
  | { type: 'plant'; plot: number; crop: string }
  | { type: 'water'; plot: number }
  | { type: 'harvest'; plot: number }
  | { type: 'buy'; crop: string }
  | { type: 'sell'; item: string; all: boolean };

export interface QueryOutcome {
  result?: ResultSet;
  error?: string;
  rawError?: string;
  feedback?: { ok: boolean; message: string };
}

export const LEVELS = [
  { xp: 0, title: 'Piglet' },
  { xp: 60, title: 'Hog' },
  { xp: 150, title: 'Boss Hog' },
  { xp: 300, title: 'Query Swine 👑' },
];

export const BADGES: { id: string; emoji: string; name: string; desc: string }[] = [
  { id: 'hello_ledger', emoji: '📖', name: 'Hello, Ledger', desc: 'Ran your first query.' },
  { id: 'green_trotters', emoji: '🌱', name: 'Green Trotters', desc: 'Harvested your first crop.' },
  { id: 'critter_ologist', emoji: '🔎', name: 'Critter-ologist', desc: 'Discovered 6 Bestiary traits.' },
  { id: 'frost_detective', emoji: '❄️', name: 'Frost Detective', desc: 'Solved the mystery of the plots that didn’t freeze.' },
  { id: 'hollow_hand', emoji: '🏡', name: 'Hollow Hand', desc: 'Finished every chapter so far.' },
];

const HINT_COSTS = [0, 0, 2, 5];

function defaultProgress(): Progress {
  return {
    version: 1,
    questIndex: 0,
    questStarted: null,
    questStart: { day: 1, sold: 0, harvested: 0 },
    xp: 0,
    discovered: [],
    met: ['Squeal'],
    badges: [],
    hintLevel: {},
    stats: { queries: 0, harvested: 0, sold: 0, fed: 0 },
    streak: { count: 0, last: '' },
    quill: false,
    replayToday: [],
  };
}

function toB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b: string): Uint8Array {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

export class Game implements QuestApi {
  db!: Database;
  snapshot!: Uint8Array;
  progress!: Progress;
  lastNight: NightReport | null = null;
  private pendingToasts: Toast[] = [];
  onToast: (t: Toast) => void = (t) => void this.pendingToasts.push(t);
  private listeners = new Set<() => void>();
  private completing = false;

  constructor(
    private SQL: SqlJsStatic,
    private kv: KV = browserKV,
    private today: () => string = () => localDate(),
  ) {
    if (!this.load()) this.fresh();
    this.touchStreak();
    this.ensureQuestStarted();
    this.save();
  }

  // ───────────── persistence ─────────────

  private fresh() {
    this.db = new this.SQL.Database();
    this.db.run(schemaSql());
    this.progress = defaultProgress();
    this.snapshot = this.db.export();
    this.lastNight = null;
  }

  private load(): boolean {
    const raw = this.kv.get(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      this.db = new this.SQL.Database(fromB64(data.db));
      this.snapshot = fromB64(data.snapshot);
      this.progress = { ...defaultProgress(), ...data.progress };
      this.lastNight = data.lastNight ?? null;
      return true;
    } catch {
      return false;
    }
  }

  save() {
    this.kv.set(
      SAVE_KEY,
      JSON.stringify({ db: toB64(this.db.export()), snapshot: toB64(this.snapshot), progress: this.progress, lastNight: this.lastNight }),
    );
  }

  reset() {
    this.kv.remove(SAVE_KEY);
    this.db.close();
    this.fresh();
    this.touchStreak();
    this.ensureQuestStarted();
    this.save();
    this.emit();
  }

  /** Attaches the UI's toast handler and flushes anything that happened before it existed. */
  setToastHandler(fn: (t: Toast) => void) {
    this.onToast = fn;
    for (const t of this.pendingToasts.splice(0)) fn(t);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  // ───────────── query helpers ─────────────

  all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
    const st = this.db.prepare(sql);
    st.bind(params);
    const out: T[] = [];
    while (st.step()) out.push(st.getAsObject() as T);
    st.free();
    return out;
  }

  scalar(sql: string, params: SqlValue[] = []): SqlValue {
    const st = this.db.prepare(sql);
    st.bind(params);
    const v = st.step() ? st.get()[0] : null;
    st.free();
    return v;
  }

  /** Runs SQL and returns the last statement's result, including column names for empty results. */
  execResult(sql: string): ResultSet {
    let last: ResultSet = { columns: [], rows: [] };
    for (const st of this.db.iterateStatements(sql)) {
      const columns = st.getColumnNames();
      const rows: SqlValue[][] = [];
      while (st.step()) rows.push(st.get());
      if (columns.length) last = { columns, rows };
    }
    return last;
  }

  get day(): number {
    return Number(this.scalar('SELECT day FROM farm'));
  }

  get coins(): number {
    return Number(this.scalar('SELECT coins FROM farm'));
  }

  schemaInfo(): SchemaInfo & { byTable: Record<string, string[]> } {
    const tables = this.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(
      (t) => t.name,
    );
    const byTable: Record<string, string[]> = {};
    for (const t of tables) byTable[t] = this.all<{ name: string }>(`PRAGMA table_info(${sqlStr(t)})`).map((c) => c.name);
    return { tables, columns: [...new Set(Object.values(byTable).flat())], byTable };
  }

  /** A change made by the game itself (arrivals, rewards). Replayed after a rewind. */
  system(sql: string, params: SqlValue[] = []) {
    this.db.run(sql, params);
    this.progress.replayToday.push({ sql, params });
  }

  meet(name: string) {
    if (!this.progress.met.includes(name)) this.progress.met.push(name);
  }

  // ───────────── progress, quests, rewards ─────────────

  currentQuest(): Quest | null {
    return QUESTS[this.progress.questIndex] ?? null;
  }

  get level(): { n: number; title: string; xpInto: number; xpNeeded: number | null } {
    let n = 0;
    for (let i = 0; i < LEVELS.length; i++) if (this.progress.xp >= LEVELS[i].xp) n = i;
    const next = LEVELS[n + 1];
    return {
      n: n + 1,
      title: LEVELS[n].title,
      xpInto: this.progress.xp - LEVELS[n].xp,
      xpNeeded: next ? next.xp - LEVELS[n].xp : null,
    };
  }

  private touchStreak() {
    const today = this.today();
    const s = this.progress.streak;
    if (s.last === today) return;
    const y = new Date(today + 'T12:00:00');
    y.setDate(y.getDate() - 1);
    s.count = s.last === localDate(y) ? s.count + 1 : 1;
    s.last = today;
    if (s.count > 1) {
      const bonus = Math.min(s.count, 5);
      this.system('UPDATE farm SET coins = coins + ?', [bonus]);
      this.onToast({ kind: 'success', title: `🔥 ${s.count}-day streak!`, body: `Keystone found ${bonus} bonus coins in the hay.` });
    }
  }

  private ensureQuestStarted() {
    const q = this.currentQuest();
    if (!q || this.progress.questStarted === q.id) return;
    this.progress.questStarted = q.id;
    this.progress.questStart = { day: this.day, sold: this.progress.stats.sold, harvested: this.progress.stats.harvested };
    const msg = q.onStart?.(this);
    if (msg) this.onToast({ kind: 'info', title: 'Something stirs in the Hollow…', body: msg });
  }

  discover(ids: string[]) {
    for (const id of ids) {
      if (this.progress.discovered.includes(id)) continue;
      this.progress.discovered.push(id);
      const sp = Object.values(SPECIES).find((s) => s.traits.some((t) => t.id === id));
      const trait = sp?.traits.find((t) => t.id === id);
      if (sp && trait) this.onToast({ kind: 'success', title: `📔 Bestiary updated: ${sp.emoji} ${sp.name}`, body: `${trait.label}: ${trait.value}` });
    }
  }

  private completeQuest() {
    const q = this.currentQuest();
    if (!q) return;
    this.system('UPDATE farm SET coins = coins + ?', [q.reward.coins]);
    const before = this.level.n;
    this.progress.xp += q.reward.xp;
    this.onToast({ kind: 'success', title: `✅ Quest complete: ${q.title}`, body: `+${q.reward.coins} coins · +${q.reward.xp} XP` });
    if (q.discovers) this.discover(q.discovers);
    if (this.level.n > before) this.onToast({ kind: 'success', title: `🎉 Level up! You're now a ${this.level.title}` });
    this.progress.questIndex++;
    this.ensureQuestStarted();
  }

  /** Re-checks action quests and badges, then saves and redraws. */
  private afterChange() {
    if (!this.completing) {
      this.completing = true;
      try {
        let q = this.currentQuest();
        while (q && q.kind === 'action' && q.check(this)) {
          this.completeQuest();
          q = this.currentQuest();
        }
      } finally {
        this.completing = false;
      }
    }
    this.checkBadges();
    this.save();
    this.emit();
  }

  private checkBadges() {
    const has = (id: string) => this.progress.badges.includes(id);
    const award = (id: string) => {
      if (has(id)) return;
      this.progress.badges.push(id);
      const b = BADGES.find((x) => x.id === id);
      if (b) this.onToast({ kind: 'success', title: `${b.emoji} Badge earned: ${b.name}`, body: b.desc });
    };
    const done = (questId: string) => QUESTS.findIndex((q) => q.id === questId) < this.progress.questIndex;
    if (this.progress.stats.queries > 0) award('hello_ledger');
    if (this.progress.stats.harvested > 0) award('green_trotters');
    if (this.progress.discovered.length >= 6) award('critter_ologist');
    if (done('c4-warm')) award('frost_detective');
    if (this.progress.questIndex >= QUESTS.length) award('hollow_hand');
  }

  get bestiaryProgress(): { found: number; total: number } {
    return { found: this.progress.discovered.length, total: ALL_TRAIT_IDS.length };
  }

  // ───────────── player queries ─────────────

  runPlayerQuery(sql: string): QueryOutcome {
    if (!stripComments(sql).trim()) return { error: 'Type a query into the Ledger first!' };
    if (!this.progress.quill && !isReadOnly(sql)) return { error: READONLY_MESSAGE };
    if (sql.includes(BLANK)) return { error: BLANKS_MESSAGE };

    let result: ResultSet;
    try {
      result = this.execResult(sql);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      return { error: friendlyError(raw, this.schemaInfo()), rawError: raw };
    }
    this.progress.stats.queries++;

    let feedback: QueryOutcome['feedback'];
    const q = this.currentQuest();
    if (q && q.kind === 'query') {
      const missing = (q.mustInclude ?? []).find((m) => !m.pattern.test(stripComments(sql)));
      const expected = this.execResult(q.expected);
      const match = resultsMatch(result, expected, !!q.ordered);
      if (match.ok && !missing) {
        feedback = { ok: true, message: 'That’s exactly it!' };
        this.completeQuest();
      } else if (match.ok && missing) {
        feedback = { ok: false, message: `Right answer, but this quest is practising something specific. ${missing.message}` };
      } else {
        feedback = { ok: false, message: this.explainMismatch(q, sql, match.reason) };
      }
    }
    this.afterChange();
    return { result, feedback };
  }

  /** Says *why* a query isn't what the quest wants, in the most useful terms available. */
  private explainMismatch(q: Quest & { kind: 'query' }, sql: string, reason?: string): string {
    const want = tablesIn(q.expected);
    const got = tablesIn(sql);
    if (q.concept?.example && sameQuery(sql, q.concept.example)) {
      return `That's the example from the spell card. It shows how **${q.concept.title}** works using a different table, so it isn't the answer. Now use the same idea for your task: ${q.task}`;
    }
    if (want.length && !want.every((t) => got.includes(t))) {
      const from = got.length ? `reads from \`${got.join('`, `')}\`` : "doesn't read from any table";
      return `This quest is about the \`${want[0]}\` table, but your query ${from}. Try \`FROM ${want[0]}\`.`;
    }
    return reason ?? 'Not quite what Keystone is after.';
  }

  answer(choice: number): boolean {
    const q = this.currentQuest();
    if (!q || q.kind !== 'answer') return false;
    if (choice === q.correct) {
      this.completeQuest();
      this.afterChange();
      return true;
    }
    this.onToast({ kind: 'warn', title: 'Hmm, not quite.', body: 'Keystone scratches its straw head. Take another look at the data.' });
    return false;
  }

  hintLevel(questId: string): number {
    return this.progress.hintLevel[questId] ?? 0;
  }

  nextHintCost(questId: string): number | null {
    const next = this.hintLevel(questId) + 1;
    return next < HINT_COSTS.length ? HINT_COSTS[next] : null;
  }

  buyHint() {
    const q = this.currentQuest();
    if (!q) return;
    const cost = this.nextHintCost(q.id);
    if (cost === null) return;
    if (cost > 0) {
      if (this.coins >= cost) this.system('UPDATE farm SET coins = coins - ?', [cost]);
      else this.onToast({ kind: 'info', title: 'Keystone takes pity on your empty purse.', body: 'This hint is on the house.' });
    }
    this.progress.hintLevel[q.id] = this.hintLevel(q.id) + 1;
    this.afterChange();
  }

  // ───────────── farm actions ─────────────

  /** Builds the SQL for an action, or returns an error message if it isn't possible. */
  private planAction(a: Action): { sql: string[]; label: string; after?: () => void } | string {
    switch (a.type) {
      case 'feed': {
        const sp = SPECIES[a.name];
        return {
          label: `${sp?.emoji ?? ''} ${a.name} gobbles up some ${sp?.food ?? 'food'}.`,
          sql: [`UPDATE creatures SET hunger = 0 WHERE name = ${sqlStr(a.name)};`],
          after: () => {
            this.progress.stats.fed++;
            const plot = Number(this.scalar('SELECT plot_id FROM creatures WHERE name = ?', [a.name]));
            this.db.run('INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, ?, ?, ?, 1)', [this.day, a.name, plot, 'ate']);
            const eats = sp?.traits.find((t) => t.discover === 'feed');
            if (eats) this.discover([eats.id]);
          },
        };
      }
      case 'move':
        return {
          label: `${a.name} wanders over to plot ${a.plot}.`,
          sql: [`UPDATE creatures SET plot_id = ${a.plot} WHERE name = ${sqlStr(a.name)};`],
        };
      case 'plant': {
        const crop = CROPS[a.crop];
        if (!crop) return 'Unknown crop.';
        const seeds = Number(this.scalar('SELECT quantity FROM inventory WHERE item = ?', [crop.id + '_seed']));
        if (seeds < 1) return `You don't have any ${crop.label} seeds. Buy some in the Barn.`;
        if (this.scalar('SELECT crop FROM plots WHERE id = ?', [a.plot]) !== null) return 'Something is already growing there.';
        return {
          label: `${crop.emoji} Planted ${crop.label} on plot ${a.plot}.`,
          sql: [
            `UPDATE plots SET crop = ${sqlStr(crop.id)}, growth = 0 WHERE id = ${a.plot};`,
            `UPDATE inventory SET quantity = quantity - 1 WHERE item = ${sqlStr(crop.id + '_seed')};`,
          ],
          after: () => this.db.run("INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, 'Farmer', ?, 'planted', 1)", [this.day, a.plot]),
        };
      }
      case 'water':
        return { label: `💧 Watered plot ${a.plot}.`, sql: [`UPDATE plots SET moisture = 3 WHERE id = ${a.plot};`] };
      case 'harvest': {
        const p = this.all<{ crop: string | null; growth: number; tilled: number }>('SELECT crop, growth, tilled FROM plots WHERE id = ?', [a.plot])[0];
        if (!p?.crop || p.growth < 100) return "That crop isn't ready yet.";
        const crop = CROPS[p.crop];
        const n = (crop?.yield ?? 1) + (p.tilled ? 1 : 0);
        return {
          label: `${crop?.emoji ?? ''} Harvested ${n} ${crop?.label ?? p.crop}${p.tilled ? ' (tilled soil bonus!)' : ''}.`,
          sql: [
            `UPDATE inventory SET quantity = quantity + ${n} WHERE item = ${sqlStr(p.crop)};`,
            `UPDATE plots SET crop = NULL, growth = 0, tilled = 0 WHERE id = ${a.plot};`,
          ],
          after: () => {
            this.progress.stats.harvested += n;
            this.db.run("INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, 'Farmer', ?, 'harvested', ?)", [this.day, a.plot, n]);
          },
        };
      }
      case 'buy': {
        const crop = CROPS[a.crop];
        if (!crop) return 'Unknown seed.';
        if (this.coins < crop.seedPrice) return `You need ${crop.seedPrice} coins for that.`;
        return {
          label: `🌱 Bought a ${crop.label} seed.`,
          sql: [
            `UPDATE farm SET coins = coins - ${crop.seedPrice};`,
            `UPDATE inventory SET quantity = quantity + 1 WHERE item = ${sqlStr(crop.id + '_seed')};`,
          ],
        };
      }
      case 'sell': {
        const price = CROPS[a.item]?.sellPrice ?? GOODS[a.item]?.sellPrice;
        if (price === undefined) return "The market doesn't buy that.";
        const have = Number(this.scalar('SELECT quantity FROM inventory WHERE item = ?', [a.item]));
        if (have < 1) return `You don't have any ${itemLabel(a.item)}.`;
        const n = a.all ? have : 1;
        const sql = a.all
          ? [
              `UPDATE farm SET coins = coins + ${price} * (SELECT quantity FROM inventory WHERE item = ${sqlStr(a.item)});`,
              `UPDATE inventory SET quantity = 0 WHERE item = ${sqlStr(a.item)};`,
            ]
          : [`UPDATE inventory SET quantity = quantity - 1 WHERE item = ${sqlStr(a.item)};`, `UPDATE farm SET coins = coins + ${price};`];
        return {
          label: `🪙 Sold ${n} ${itemLabel(a.item)} for ${n * price} coins.`,
          sql,
          after: () => {
            this.progress.stats.sold += n;
          },
        };
      }
    }
  }

  act(a: Action): boolean {
    const plan = this.planAction(a);
    if (typeof plan === 'string') {
      this.onToast({ kind: 'warn', title: plan });
      return false;
    }
    for (const s of plan.sql) this.db.run(s);
    plan.after?.();
    this.onToast({ kind: 'sql', title: plan.label, sql: plan.sql.join('\n') });
    this.afterChange();
    return true;
  }

  endDay(): NightReport {
    const report = runNight(this.db);
    this.lastNight = report;
    this.progress.replayToday = [];
    this.snapshot = this.db.export();
    this.onToast({ kind: 'info', title: `☀️ Day ${this.day} begins`, body: report.lines.join('\n') });
    this.afterChange();
    return report;
  }

  /** Puts the farm back to how it was at the start of today. Quest progress is kept. */
  rewind() {
    const events = this.progress.replayToday;
    this.db.close();
    this.db = new this.SQL.Database(this.snapshot);
    this.progress.replayToday = [];
    for (const e of events) this.system(e.sql, e.params);
    this.onToast({ kind: 'info', title: '⏪ Rewound to the start of the day', body: 'The Ledger quietly un-writes itself.' });
    this.afterChange();
  }
}
