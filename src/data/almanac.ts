import type { SqlValue } from 'sql.js';

/**
 * Keystone's Almanac: review challenges for concepts the player has already learned.
 *
 * Each concept has a few challenge variants. A variant picks its details (a creature,
 * a field, a threshold) from the farm's live data, so reviewing the same concept twice
 * usually means a different question. Challenges are checked like query quests: by the
 * rows they return, plus a requirement that the answer really uses the concept.
 */

export interface AlmanacChallenge {
  concept: string;
  /** Shown to the player. Supports `code` and **bold**. */
  prompt: string;
  /** Internal SQL whose result the player's query must match. */
  expected: string;
  ordered?: boolean;
  /** The answer must use the concept being reviewed (stored as strings so it can be saved). */
  require?: { pattern: string; message: string };
  /** One hint: a fill-in-the-blank query. */
  hint: string;
}

export interface GenCtx {
  pick<T>(xs: T[]): T;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): T[];
}

type Variant = (ctx: GenCtx) => Omit<AlmanacChallenge, 'concept'> | null;

export interface AlmanacConcept {
  id: string;
  title: string;
  /** Unlocks when this quest has been completed. */
  unlockedBy: string;
  variants: Variant[];
}

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const col = <T>(ctx: GenCtx, sql: string, params: SqlValue[] = []): T[] => ctx.all<{ v: T }>(sql, params).map((r) => r.v);

const need = (pattern: string, message: string) => ({ pattern, message });
const WHERE = need('\\bwhere\\b', 'Use `WHERE` to filter for this one.');
const ORDER = need('\\border\\s+by\\b', 'Use `ORDER BY` (and `LIMIT`) for this one.');
const GROUP = need('\\bgroup\\s+by\\b', 'Use `GROUP BY` for this one.');
const HAVING = need('\\bhaving\\b', 'Use `HAVING` to filter the groups.');
const NULLS = need('\\bis\\s+(not\\s+)?null\\b', 'Use `IS NULL` or `IS NOT NULL` for this one.');
const DISTINCT = need('\\bdistinct\\b', 'Use `DISTINCT` for this one.');
const JOIN = need('\\bjoin\\b', 'Use a `JOIN` for this one.');
const LEFT = need('\\bleft\\s+(outer\\s+)?join\\b', 'Use a `LEFT JOIN` for this one.');
const SUB = need('\\(\\s*select\\b', 'Use a subquery: a `SELECT` inside brackets.');
const WITH = need('^\\s*with\\b', 'Start with `WITH … AS ( … )` for this one.');
const OVER = need('\\bover\\s*\\(', 'Use a window function, with `OVER ( … )`.');
const AGG = need('\\b(count|sum|avg|min|max)\\s*\\(', 'Use an aggregate like `COUNT`, `SUM`, `AVG`, `MIN` or `MAX`.');

export const ALMANAC: AlmanacConcept[] = [
  {
    id: 'columns',
    title: 'Choosing columns',
    unlockedBy: 'c1-columns',
    variants: [
      (ctx) => {
        const c = ctx.pick(['hunger', 'mood', 'plot_id', 'kind']);
        return {
          prompt: `Show just the \`name\` and \`${c}\` of every creature.`,
          expected: `SELECT name, ${c} FROM creatures`,
          hint: `SELECT name, ___ FROM creatures;`,
        };
      },
      () => ({ prompt: 'Show the `item` and `quantity` of everything in the barn (`inventory`).', expected: 'SELECT item, quantity FROM inventory', hint: 'SELECT ___, ___ FROM inventory;' }),
      () => ({ prompt: 'Show each `crop` in the `seeds` table with its `price`.', expected: 'SELECT crop, price FROM seeds', hint: 'SELECT crop, ___ FROM seeds;' }),
    ],
  },
  {
    id: 'where',
    title: 'Filtering with WHERE',
    unlockedBy: 'c2-hungry',
    variants: [
      (ctx) => {
        const m = ctx.pick(col<number>(ctx, 'SELECT DISTINCT mood AS v FROM creatures'));
        return {
          prompt: `Show every column of the creatures whose \`mood\` is **${m} or more**.`,
          expected: `SELECT * FROM creatures WHERE mood >= ${m}`,
          require: WHERE,
          hint: `SELECT * FROM creatures WHERE mood >= ___;`,
        };
      },
      (ctx) => {
        const p = ctx.pick(col<number>(ctx, 'SELECT DISTINCT sell_price AS v FROM market'));
        return {
          prompt: `Show every \`market\` item that sells for **more than ${p}** coins.`,
          expected: `SELECT * FROM market WHERE sell_price > ${p}`,
          require: WHERE,
          hint: `SELECT * FROM market WHERE sell_price > ___;`,
        };
      },
      (ctx) => {
        const t = ctx.pick([5, 8, 10, 12, 15]);
        return {
          prompt: `Show the \`day\` and \`temperature\` of every day in \`weather\` colder than **${t}°**.`,
          expected: `SELECT day, temperature FROM weather WHERE temperature < ${t}`,
          require: WHERE,
          hint: `SELECT day, temperature FROM weather WHERE temperature < ___;`,
        };
      },
    ],
  },
  {
    id: 'text',
    title: 'Text values in quotes',
    unlockedBy: 'c2-text',
    variants: [
      (ctx) => {
        const k = ctx.pick(col<string>(ctx, 'SELECT DISTINCT kind AS v FROM creatures'));
        return {
          prompt: `Show the \`name\` of every creature whose \`kind\` is \`'${k}'\`.`,
          expected: `SELECT name FROM creatures WHERE kind = ${q(k)}`,
          require: WHERE,
          hint: `SELECT name FROM creatures WHERE kind = '___';`,
        };
      },
      (ctx) => {
        const names = col<string>(ctx, 'SELECT DISTINCT source AS v FROM farm_log WHERE source IN (SELECT name FROM creatures)');
        if (!names.length) return null;
        const n = ctx.pick(names);
        return {
          prompt: `Show every \`farm_log\` row written by **${n}**.`,
          expected: `SELECT * FROM farm_log WHERE source = ${q(n)}`,
          require: WHERE,
          hint: `SELECT * FROM farm_log WHERE source = '___';`,
        };
      },
    ],
  },
  {
    id: 'and_or',
    title: 'AND and OR',
    unlockedBy: 'c2-and',
    variants: [
      (ctx) => {
        const pairs = ctx.all<{ source: string; event: string }>(
          'SELECT DISTINCT source, event FROM farm_log WHERE source IN (SELECT name FROM creatures)',
        );
        if (!pairs.length) return null;
        const p = ctx.pick(pairs);
        return {
          prompt: `Show the \`farm_log\` rows where the \`source\` is **${p.source}** *and* the \`event\` is \`'${p.event}'\`.`,
          expected: `SELECT * FROM farm_log WHERE source = ${q(p.source)} AND event = ${q(p.event)}`,
          require: need('\\band\\b', 'Combine both conditions with `AND`.'),
          hint: `SELECT * FROM farm_log WHERE source = '${p.source}' AND event = '___';`,
        };
      },
      (ctx) => {
        const [a, b] = [ctx.pick(['egg', 'shiny_pebble']), ctx.pick(['sunpuff', 'glassberry'])];
        return {
          prompt: `Show the \`inventory\` rows for \`'${a}'\` *or* \`'${b}'\`.`,
          expected: `SELECT * FROM inventory WHERE item = ${q(a)} OR item = ${q(b)}`,
          require: need('\\bor\\b|\\bin\\s*\\(', 'Use `OR` to allow either item.'),
          hint: `SELECT * FROM inventory WHERE item = '${a}' OR item = '___';`,
        };
      },
    ],
  },
  {
    id: 'order',
    title: 'ORDER BY and LIMIT',
    unlockedBy: 'c3-top3',
    variants: [
      (ctx) => {
        const n = ctx.pick([3, 4, 5]);
        return {
          prompt: `Show the \`day\` and \`temperature\` of the **${n} warmest** days in \`weather\`, warmest first. (Break ties by the earliest \`day\`.)`,
          expected: `SELECT day, temperature FROM weather ORDER BY temperature DESC, day LIMIT ${n}`,
          ordered: true,
          require: ORDER,
          hint: `SELECT day, temperature FROM weather ORDER BY temperature DESC, day LIMIT ___;`,
        };
      },
      (ctx) => {
        const n = ctx.pick([2, 3]);
        return {
          prompt: `Show the **${n} cheapest** seeds (\`crop\` and \`price\`), cheapest first.`,
          expected: `SELECT crop, price FROM seeds ORDER BY price LIMIT ${n}`,
          ordered: true,
          require: ORDER,
          hint: `SELECT crop, price FROM seeds ORDER BY ___ LIMIT ${n};`,
        };
      },
      () => ({
        prompt: 'Show every creature’s `name` and `hunger`, hungriest first. (Break ties alphabetically by `name`.)',
        expected: 'SELECT name, hunger FROM creatures ORDER BY hunger DESC, name',
        ordered: true,
        require: ORDER,
        hint: 'SELECT name, hunger FROM creatures ORDER BY hunger ___, name;',
      }),
    ],
  },
  {
    id: 'aggregates',
    title: 'COUNT, SUM, AVG, MIN & MAX',
    unlockedBy: 'c4-mood',
    variants: [
      () => ({ prompt: 'What is the **average `hunger`** of all your creatures?', expected: 'SELECT AVG(hunger) FROM creatures', require: AGG, hint: 'SELECT ___(hunger) FROM creatures;' }),
      () => ({
        prompt: 'What is the **highest `temperature`** in the whole `weather` table?',
        expected: 'SELECT MAX(temperature) FROM weather',
        require: AGG,
        hint: 'SELECT ___(temperature) FROM weather;',
      }),
      (ctx) => {
        const c = ctx.pick(['snoutroot', 'sunpuff', 'glassberry']);
        return {
          prompt: `**How many** plots have \`'${c}'\` growing on them right now?`,
          expected: `SELECT COUNT(*) FROM plots WHERE crop = ${q(c)}`,
          require: AGG,
          hint: `SELECT COUNT(*) FROM plots WHERE crop = '___';`,
        };
      },
    ],
  },
  {
    id: 'group_by',
    title: 'GROUP BY',
    unlockedBy: 'c5-group',
    variants: [
      () => ({ prompt: 'Show each creature `kind` and **how many** creatures of that kind you have.', expected: 'SELECT kind, COUNT(*) FROM creatures GROUP BY kind', require: GROUP, hint: 'SELECT kind, COUNT(*) FROM creatures GROUP BY ___;' }),
      () => ({ prompt: 'Show each `crop` on your plots and **how many** plots have it (empty plots will be one group).', expected: 'SELECT crop, COUNT(*) FROM plots GROUP BY crop', require: GROUP, hint: 'SELECT crop, COUNT(*) FROM plots GROUP BY ___;' }),
      () => ({ prompt: 'Show each `sky` in the `weather` table and its **average** `temperature`.', expected: 'SELECT sky, AVG(temperature) FROM weather GROUP BY sky', require: GROUP, hint: 'SELECT sky, ___(temperature) FROM weather GROUP BY sky;' }),
    ],
  },
  {
    id: 'having',
    title: 'HAVING',
    unlockedBy: 'c5-having',
    variants: [
      (ctx) => {
        const counts = col<number>(ctx, 'SELECT COUNT(*) AS v FROM farm_log GROUP BY event');
        const n = ctx.pick(counts.filter((c) => c > 1).length ? counts.filter((c) => c > 1) : [1]) - 1;
        return {
          prompt: `Show each \`event\` in \`farm_log\` that happened **more than ${n} times**, with its count.`,
          expected: `SELECT event, COUNT(*) FROM farm_log GROUP BY event HAVING COUNT(*) > ${n}`,
          require: HAVING,
          hint: `SELECT event, COUNT(*) FROM farm_log GROUP BY event HAVING COUNT(*) > ___;`,
        };
      },
      () => ({
        prompt: 'Show each creature `kind` that has **at least 2** creatures, with its count.',
        expected: 'SELECT kind, COUNT(*) FROM creatures GROUP BY kind HAVING COUNT(*) >= 2',
        require: HAVING,
        hint: 'SELECT kind, COUNT(*) FROM creatures GROUP BY kind HAVING ___ >= 2;',
      }),
    ],
  },
  {
    id: 'nulls',
    title: 'NULL and IS NULL',
    unlockedBy: 'c6-notnull',
    variants: [
      (ctx) => {
        const f = ctx.pick(col<string>(ctx, 'SELECT DISTINCT field AS v FROM plots'));
        return {
          prompt: `Show the \`id\` of every plot in **${f}** with **nothing growing** on it.`,
          expected: `SELECT id FROM plots WHERE field = ${q(f)} AND crop IS NULL`,
          require: NULLS,
          hint: `SELECT id FROM plots WHERE field = '${f}' AND crop IS ___;`,
        };
      },
      () => ({ prompt: '**How many** `farm_log` rows are missing their `amount`?', expected: 'SELECT COUNT(*) FROM farm_log WHERE amount IS NULL', require: NULLS, hint: 'SELECT COUNT(*) FROM farm_log WHERE amount IS ___;' }),
      () => ({ prompt: '**How many** plots have *something* growing on them?', expected: 'SELECT COUNT(*) FROM plots WHERE crop IS NOT NULL', require: NULLS, hint: 'SELECT COUNT(*) FROM plots WHERE crop IS ___ NULL;' }),
    ],
  },
  {
    id: 'distinct',
    title: 'DISTINCT',
    unlockedBy: 'c6-count-distinct',
    variants: [
      () => ({ prompt: 'List each **different** `event` in `farm_log`, once each.', expected: 'SELECT DISTINCT event FROM farm_log', require: DISTINCT, hint: 'SELECT ___ event FROM farm_log;' }),
      (ctx) => {
        const names = col<string>(ctx, 'SELECT DISTINCT source AS v FROM farm_log WHERE source IN (SELECT name FROM creatures)');
        if (!names.length) return null;
        const n = ctx.pick(names);
        return {
          prompt: `On **how many different days** has **${n}** written in the log?`,
          expected: `SELECT COUNT(DISTINCT day) FROM farm_log WHERE source = ${q(n)}`,
          require: DISTINCT,
          hint: `SELECT COUNT(DISTINCT ___) FROM farm_log WHERE source = '${n}';`,
        };
      },
      () => ({ prompt: 'List each **different** crop growing on your farm right now (leave out empty plots).', expected: 'SELECT DISTINCT crop FROM plots WHERE crop IS NOT NULL', require: DISTINCT, hint: 'SELECT ___ crop FROM plots WHERE crop IS NOT NULL;' }),
    ],
  },
  {
    id: 'join',
    title: 'JOIN',
    unlockedBy: 'c8-meet',
    variants: [
      () => ({
        prompt: 'Show each creature’s `name` next to the `field` of the plot it stands on.',
        expected: 'SELECT creatures.name, plots.field FROM creatures JOIN plots ON creatures.plot_id = plots.id',
        require: JOIN,
        hint: 'SELECT creatures.name, plots.field FROM creatures JOIN plots ON creatures.plot_id = ___;',
      }),
      () => ({
        prompt: 'Show each barn `item` with its `quantity` and its market `sell_price` (only items the market buys).',
        expected: 'SELECT inventory.item, inventory.quantity, market.sell_price FROM inventory JOIN market ON inventory.item = market.item',
        require: JOIN,
        hint: 'SELECT inventory.item, inventory.quantity, market.sell_price FROM inventory JOIN market ON inventory.item = ___;',
      }),
      (ctx) => {
        const k = ctx.pick(col<string>(ctx, 'SELECT DISTINCT kind AS v FROM creatures'));
        return {
          prompt: `For every creature of kind \`'${k}'\`, show its \`name\` and the \`crop\` on its plot.`,
          expected: `SELECT creatures.name, plots.crop FROM creatures JOIN plots ON creatures.plot_id = plots.id WHERE creatures.kind = ${q(k)}`,
          require: JOIN,
          hint: `SELECT creatures.name, plots.crop FROM creatures JOIN plots ON creatures.plot_id = plots.id WHERE creatures.kind = '___';`,
        };
      },
    ],
  },
  {
    id: 'left_join',
    title: 'LEFT JOIN',
    unlockedBy: 'c8-empty',
    variants: [
      () => ({
        prompt: 'Show every `market` item that has **never** appeared in `orders`.',
        expected: 'SELECT market.item FROM market LEFT JOIN orders ON orders.item = market.item WHERE orders.id IS NULL',
        require: LEFT,
        hint: 'SELECT market.item FROM market LEFT JOIN orders ON orders.item = market.item WHERE orders.id IS ___;',
      }),
      (ctx) => {
        const f = ctx.pick(col<string>(ctx, 'SELECT DISTINCT field AS v FROM plots'));
        return {
          prompt: `Show the \`id\` of every plot in **${f}** with **no creature** standing on it.`,
          expected: `SELECT plots.id FROM plots LEFT JOIN creatures ON creatures.plot_id = plots.id WHERE plots.field = ${q(f)} AND creatures.id IS NULL`,
          require: LEFT,
          hint: `SELECT plots.id FROM plots LEFT JOIN creatures ON creatures.plot_id = plots.id WHERE plots.field = '${f}' AND creatures.id IS ___;`,
        };
      },
    ],
  },
  {
    id: 'subquery',
    title: 'Subqueries',
    unlockedBy: 'c9-in',
    variants: [
      () => ({
        prompt: 'Show every `market` item that sells for **more than the average** `sell_price`.',
        expected: 'SELECT item FROM market WHERE sell_price > (SELECT AVG(sell_price) FROM market)',
        require: SUB,
        hint: 'SELECT item FROM market WHERE sell_price > (SELECT ___(sell_price) FROM market);',
      }),
      (ctx) => {
        const f = ctx.pick(col<string>(ctx, 'SELECT DISTINCT field AS v FROM plots'));
        return {
          prompt: `Show the \`name\` of every creature standing in **${f}**, using \`IN (SELECT …)\`.`,
          expected: `SELECT name FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE field = ${q(f)})`,
          require: SUB,
          hint: `SELECT name FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE field = '___');`,
        };
      },
      () => ({
        prompt: 'Show the `name` and `hunger` of every creature **hungrier than average**.',
        expected: 'SELECT name, hunger FROM creatures WHERE hunger > (SELECT AVG(hunger) FROM creatures)',
        require: SUB,
        hint: 'SELECT name, hunger FROM creatures WHERE hunger > (SELECT AVG(___) FROM creatures);',
      }),
    ],
  },
  {
    id: 'cte',
    title: 'WITH (CTEs)',
    unlockedBy: 'c9-cte',
    variants: [
      (ctx) => {
        const n = ctx.pick([1, 2, 3]);
        return {
          prompt: `Using \`WITH\`, make a table of each creature \`kind\` and its count \`n\`, then show the kinds with **more than ${n}**.`,
          expected: `WITH k AS (SELECT kind, COUNT(*) AS n FROM creatures GROUP BY kind) SELECT kind, n FROM k WHERE n > ${n}`,
          require: WITH,
          hint: `WITH k AS (SELECT kind, COUNT(*) AS n FROM creatures GROUP BY kind) SELECT kind, n FROM k WHERE n > ___;`,
        };
      },
      () => ({
        prompt: 'Using `WITH`, make a table of each `field` and how many plots in it are planted (`COUNT(crop)` as `planted`), then show the field(s) with the **most** planted plots.',
        expected: 'WITH f AS (SELECT field, COUNT(crop) AS planted FROM plots GROUP BY field) SELECT field, planted FROM f WHERE planted = (SELECT MAX(planted) FROM f)',
        require: WITH,
        hint: 'WITH f AS (SELECT field, COUNT(crop) AS planted FROM plots GROUP BY field) SELECT field, planted FROM f WHERE planted = (SELECT ___(planted) FROM f);',
      }),
    ],
  },
  {
    id: 'window',
    title: 'Window functions',
    unlockedBy: 'c10-lag',
    variants: [
      () => ({
        prompt: 'Rank the `market` items by `sell_price`, most valuable first, using `RANK()`. Show `item`, `sell_price` and the rank.',
        expected: 'SELECT item, sell_price, RANK() OVER (ORDER BY sell_price DESC) FROM market',
        require: OVER,
        hint: 'SELECT item, sell_price, RANK() OVER (ORDER BY sell_price ___) FROM market;',
      }),
      (ctx) => {
        const n = ctx.pick([7, 10, 14]);
        return {
          prompt: `For days 1 to ${n} of \`weather\`, show each \`day\`, its \`temperature\`, and the **change** from the day before (use \`LAG\`).`,
          expected: `SELECT day, temperature, temperature - LAG(temperature) OVER (ORDER BY day) FROM weather WHERE day <= ${n}`,
          require: OVER,
          hint: `SELECT day, temperature, temperature - ___(temperature) OVER (ORDER BY day) FROM weather WHERE day <= ${n};`,
        };
      },
      () => ({
        prompt: 'Number the creatures **within each `kind`**, alphabetically by `name` (1, 2, 3… restarting for every kind). Show `kind`, `name` and the number.',
        expected: 'SELECT kind, name, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY name) FROM creatures',
        require: OVER,
        hint: 'SELECT kind, name, ROW_NUMBER() OVER (PARTITION BY ___ ORDER BY name) FROM creatures;',
      }),
    ],
  },
];

/** Days until a concept is due again, after a clean success that leaves it with this many stars (1–5). */
export const REVIEW_INTERVALS = [1, 3, 6, 10, 15];
export const MAX_STARS = REVIEW_INTERVALS.length;
/** Challenges offered per in-game day (more on request, as extra practice). */
export const DAILY_CHALLENGES = 3;

/** A small deterministic RNG, so a day's challenges don't change on reload. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds one challenge for a concept, trying variants in a seeded order until one fits the farm's data. */
export function makeChallenge(concept: AlmanacConcept, seed: string, all: GenCtx['all']): AlmanacChallenge {
  const rng = seededRandom(seed);
  const ctx: GenCtx = { pick: (xs) => xs[Math.floor(rng() * xs.length)], all };
  const order = concept.variants.map((v) => ({ v, k: rng() })).sort((a, b) => a.k - b.k);
  for (const { v } of order) {
    const c = v(ctx);
    if (c) return { concept: concept.id, ...c };
  }
  // Every concept has at least one variant that needs no data, so this is never reached in practice.
  const c = concept.variants[0](ctx)!;
  return { concept: concept.id, ...c };
}
