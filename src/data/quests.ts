import type { Chapter, Quest, QuestApi } from '../types';
import { SPECIES } from './creatures';
import { plotDistance } from './schema';

export const CHAPTERS: Chapter[] = [
  { n: 1, title: 'Welcome to Bramblewick Hollow', concept: 'SELECT' },
  { n: 2, title: 'Finding What You Need', concept: 'WHERE' },
  { n: 3, title: 'Everything In Its Place', concept: 'ORDER BY & LIMIT' },
  { n: 4, title: 'The Cold Snap', concept: 'COUNT, SUM, AVG & MAX' },
];

function arrive(api: QuestApi, name: string, plot: number, hunger: number, mood: number): string {
  const s = SPECIES[name];
  api.system('INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES (?, ?, ?, ?, ?, ?)', [
    name,
    s.kind,
    s.emoji,
    plot,
    hunger,
    mood,
  ]);
  api.meet(name);
  return `${s.emoji} ${name} has arrived on plot ${plot}!`;
}

const endedDay = (api: QuestApi) => api.day > api.progress.questStart.day;
const hungerOf = (api: QuestApi, name: string) => Number(api.scalar('SELECT hunger FROM creatures WHERE name = ?', [name]) ?? 99);

const where = { pattern: /\bwhere\b/i, message: 'Use `WHERE` to filter the rows for this one.' };

export const QUESTS: Quest[] = [
  // ───────────────────────── Chapter 1: SELECT ─────────────────────────
  {
    id: 'c1-meet',
    chapter: 1,
    kind: 'query',
    title: 'Who lives here?',
    story:
      "Oh! A visitor! I'm **Keystone**, the scarecrow. This farm's yours now. Everything that happens here gets written in the **Ledger**, a magic book of tables. You read it by asking questions in a language called SQL.\n\nLet's start simple. Who lives on this farm?",
    task: 'Show every column of every row in the `creatures` table.',
    concept: {
      title: 'SELECT … FROM …',
      body: '`SELECT` says *what* you want to see. `FROM` says *which table* to look in. The star `*` means "every column".',
      example: 'SELECT * FROM plots;',
    },
    hints: {
      nudge: 'You want everything (`*`) from the table called `creatures`.',
      blank: 'SELECT ___ FROM ___;',
    },
    expected: 'SELECT * FROM creatures',
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-columns',
    chapter: 1,
    kind: 'query',
    title: 'Just the names, please',
    story: "That's a lot of columns. Squeal doesn't care about its own `id` number. Sometimes you only want a couple of columns.",
    task: 'Show only the `name` and `kind` columns from `creatures`.',
    concept: {
      title: 'Choosing columns',
      body: 'Instead of `*`, list the columns you want, separated by commas.',
      example: 'SELECT name, hunger FROM creatures;',
    },
    hints: {
      nudge: 'Replace the `*` with the two column names, with a comma between them.',
      blank: 'SELECT name, ___ FROM creatures;',
    },
    expected: 'SELECT name, kind FROM creatures',
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-plots',
    chapter: 1,
    kind: 'query',
    title: 'Survey the land',
    story: "You've got twelve plots of soil. They look empty, but let's check what the Ledger says.",
    task: 'Show the `id`, `crop` and `growth` of every row in the `plots` table.',
    hints: {
      nudge: 'Same pattern as before, but with three columns and a different table.',
      blank: 'SELECT id, ___, ___ FROM plots;',
    },
    expected: 'SELECT id, crop, growth FROM plots',
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-feed',
    chapter: 1,
    kind: 'action',
    title: 'A hungry snout',
    story:
      "Did you see Squeal's `hunger`? It's 7 out of 10! Hungry creatures get grumpy and stop working.\n\nYou can't change the Ledger by writing SQL yet. Use the farm buttons instead, and watch: every button shows you the SQL spell it casts.",
    task: 'Feed Squeal using the **Feed** button in the Creatures panel.',
    hints: {
      nudge: "Look for Squeal's card in the Creatures panel on the left.",
      blank: 'Press the 🍽️ Feed button on the card.',
      answer: 'Creatures panel → Squeal → 🍽️ Feed. Then read the SQL that pops up.',
    },
    check: (api) => hungerOf(api, 'Squeal') < 3,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-plant',
    chapter: 1,
    kind: 'action',
    title: 'Plant something',
    story: 'You have three **Snoutroot** seeds in the barn. Snoutroot is a cheerful little root that grows almost anywhere.',
    task: 'Click any empty plot, then plant a Snoutroot.',
    hints: {
      nudge: 'Click a plot in the Farm grid to select it.',
      blank: 'With a plot selected, press "Plant 🥕 Snoutroot".',
      answer: "Farm → click any plot → Plant 🥕 Snoutroot. Tip: Squeal's plot (6) might be a lucky spot…",
    },
    check: (api) => Number(api.scalar("SELECT COUNT(*) FROM plots WHERE crop = 'snoutroot'")) > 0,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-night',
    chapter: 1,
    kind: 'action',
    title: 'Your first night',
    story: 'The sun is setting over the Hollow. Strange things happen here at night. The Ledger will record all of it.',
    task: 'Press **End day** to sleep until morning.',
    hints: { nudge: 'The 🌙 End day button is at the top.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day at the top of the screen.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-squeal',
    chapter: 1,
    kind: 'answer',
    title: 'What did Squeal do?',
    story:
      "Good morning! The Ledger has a table called `farm_log`. Every creature's night-time doings get written there. Let's find out what Squeal got up to.",
    task: 'Read the whole `farm_log` table, then answer: **what did Squeal do last night?**',
    hints: {
      nudge: 'Use the same query shape as your very first quest, but on `farm_log`.',
      blank: 'SELECT * FROM ___;',
      answer: 'Run `SELECT * FROM farm_log;` and look at the `event` column for Squeal.',
    },
    choices: ['It laid an egg', 'It tilled the soil on its plot', 'It ate all the snoutroot'],
    correct: 1,
    discovers: ['squeal_work'],
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────────────── Chapter 2: WHERE ─────────────────────────
  {
    id: 'c2-hungry',
    chapter: 2,
    kind: 'query',
    title: 'Somebody’s hungry',
    onStart: (api) => arrive(api, 'Henbell', 3, 8, 6),
    story:
      "*Jingle jingle.* Oh, a newcomer! A **Henbell** wandered in at dawn. Once your farm has lots of creatures, you'll want to find just the ones that need you.",
    task: 'Show every column, but only for creatures whose `hunger` is greater than 5.',
    concept: {
      title: 'WHERE',
      body: '`WHERE` keeps only the rows that match a condition. You can compare with `=`, `>`, `<`, `>=`, `<=` and `!=`.',
      example: 'SELECT * FROM plots WHERE growth > 50;',
    },
    hints: {
      nudge: 'Add a `WHERE` after the table name, followed by a condition on `hunger`.',
      blank: 'SELECT * FROM creatures WHERE hunger ___ 5;',
    },
    expected: 'SELECT * FROM creatures WHERE hunger > 5',
    mustInclude: [where],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c2-text',
    chapter: 2,
    kind: 'query',
    title: 'Words need quotes',
    story: "Numbers are easy to compare. Text is a little fussier: it has to wear single quotes, like `'Squeal'`. Otherwise the Ledger thinks you're naming a column.",
    task: "Show every column of the plots where `crop` is `'snoutroot'`.",
    concept: {
      title: 'Text values',
      body: "Wrap text in single quotes. `WHERE name = 'Squeal'` works. `WHERE name = Squeal` makes the Ledger look for a column called Squeal.",
      example: "SELECT * FROM creatures WHERE name = 'Henbell';",
    },
    hints: {
      nudge: "Filter `plots` with `WHERE crop = …` and remember the quotes.",
      blank: "SELECT * FROM plots WHERE crop = '___';",
    },
    expected: "SELECT * FROM plots WHERE crop = 'snoutroot'",
    mustInclude: [where, { pattern: /'snoutroot'/i, message: "Compare `crop` to the text `'snoutroot'` (in quotes)." }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c2-feed',
    chapter: 2,
    kind: 'action',
    title: 'Breakfast for Henbell',
    story: "Henbell's hunger is 8. That's grumpy territory. Hungry creatures don't do their night work.",
    task: 'Feed Henbell.',
    hints: { nudge: "Find Henbell's card in the Creatures panel.", blank: 'Press 🍽️ Feed on Henbell.', answer: 'Creatures → Henbell → 🍽️ Feed.' },
    check: (api) => hungerOf(api, 'Henbell') < 3,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c2-night',
    chapter: 2,
    kind: 'action',
    title: 'Sleep on it',
    story: "Let's see what a Henbell does when nobody's watching.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c2-henbell',
    chapter: 2,
    kind: 'answer',
    title: 'What is a Henbell?',
    story: "The log is getting long. Use `WHERE` to show only Henbell's entries, and we'll work out what it does.",
    task: "Filter `farm_log` to rows where `source` is `'Henbell'`. **What does Henbell do?**",
    hints: {
      nudge: "Filter `farm_log` on the `source` column. Remember quotes around 'Henbell'.",
      blank: "SELECT * FROM farm_log WHERE source = '___';",
      answer: "Run `SELECT * FROM farm_log WHERE source = 'Henbell';` and look at the events.",
    },
    choices: ['It tills the soil', 'It lays an egg at night and rings its bell at dawn', 'It eats snoutroot seedlings'],
    correct: 1,
    discovers: ['henbell_eggs', 'henbell_bell'],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c2-and',
    chapter: 2,
    kind: 'query',
    title: 'Two conditions at once',
    story: "That bell rings every morning no matter what, but you mostly care about the eggs. You can stack conditions together.",
    task: "Show `farm_log` rows where `source` is `'Henbell'` **and** `event` is `'laid_egg'`.",
    concept: {
      title: 'AND / OR',
      body: '`AND` keeps rows where *both* conditions are true. `OR` keeps rows where *either* is true.',
      example: "SELECT * FROM creatures WHERE hunger > 5 AND mood < 5;",
    },
    hints: {
      nudge: 'Write two conditions after `WHERE`, joined with `AND`.',
      blank: "SELECT * FROM farm_log WHERE source = 'Henbell' AND event = '___';",
    },
    expected: "SELECT * FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'",
    mustInclude: [where, { pattern: /\band\b/i, message: 'Combine both conditions with `AND`.' }],
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────────── Chapter 3: ORDER BY & LIMIT ─────────────────────
  {
    id: 'c3-market',
    chapter: 3,
    kind: 'query',
    title: 'What sells best?',
    onStart: (api) => arrive(api, 'Sortoise', 12, 3, 7),
    story:
      "A **Sortoise** has shuffled up from the riverbank. It says (very slowly) that the market is a mess, and things should be *in order*. Let's look at the `market` table, priciest first.",
    task: 'Show everything in `market`, sorted by `sell_price` from highest to lowest.',
    concept: {
      title: 'ORDER BY',
      body: '`ORDER BY column` sorts the result. It sorts smallest-first (`ASC`) by default. Add `DESC` for biggest-first.',
      example: 'SELECT * FROM creatures ORDER BY hunger DESC;',
    },
    hints: {
      nudge: 'Add `ORDER BY sell_price` at the end, plus the word that means "biggest first".',
      blank: 'SELECT * FROM market ORDER BY sell_price ___;',
    },
    expected: 'SELECT * FROM market ORDER BY sell_price DESC',
    ordered: true,
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c3-top3',
    chapter: 3,
    kind: 'query',
    title: 'The top three',
    story: 'The Sortoise is pleased. Very pleased. It would like you to know that you rarely need *every* row. Usually you just want the top few.',
    task: 'Show the 3 most valuable items in `market`.',
    concept: {
      title: 'LIMIT',
      body: '`LIMIT n` keeps only the first `n` rows. It goes at the very end, after `ORDER BY`.',
      example: 'SELECT * FROM plots ORDER BY growth DESC LIMIT 1;',
    },
    hints: {
      nudge: 'Take your last query and add `LIMIT` at the end.',
      blank: 'SELECT * FROM market ORDER BY sell_price DESC LIMIT ___;',
    },
    expected: 'SELECT * FROM market ORDER BY sell_price DESC LIMIT 3',
    ordered: true,
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c3-sell',
    chapter: 3,
    kind: 'action',
    title: 'Market day',
    story: "Now you know what's worth what. Time to make some coin! Eggs, roots, anything in the barn will do.",
    task: 'Sell at least one item from the Barn.',
    hints: {
      nudge: 'The Barn panel lists what you own.',
      blank: 'Press "Sell 1" next to anything you have.',
      answer: "Barn → Sell 1 next to an egg. If you have nothing, end a day or two and Henbell will lay some.",
    },
    check: (api) => api.progress.stats.sold > api.progress.questStart.sold,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c3-night',
    chapter: 3,
    kind: 'action',
    title: 'A slow night',
    story: "Let's see what a Sortoise gets up to. Very, very slowly.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c3-sortoise',
    chapter: 3,
    kind: 'answer',
    title: 'Sortoise’s secret',
    story: 'Find what Sortoise did. Newest entries first would be handy, since the log only grows.',
    task: "Look at `farm_log` rows for `'Sortoise'`. **What does Sortoise do at night?** (Check the Barn too!)",
    hints: {
      nudge: "Filter `farm_log` by `source`, and sort by `day` with `DESC` to see the newest first.",
      blank: "SELECT * FROM farm_log WHERE source = 'Sortoise' ORDER BY day ___;",
      answer: "Run `SELECT * FROM farm_log WHERE source = 'Sortoise' ORDER BY day DESC;`. Then check what new item appeared in the Barn.",
    },
    choices: ['It warms the soil', 'It lays eggs', 'It digs up shiny pebbles'],
    correct: 2,
    discovers: ['sortoise_dig'],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c3-latest',
    chapter: 3,
    kind: 'query',
    title: 'Latest news',
    story: 'Every row in `farm_log` has an `id` that counts up. The biggest `id` is the newest entry. Here’s a handy trick for the morning.',
    task: 'Show the 5 newest rows of `farm_log` (highest `id` first).',
    hints: {
      nudge: 'Sort by `id`, biggest first, then keep 5.',
      blank: 'SELECT * FROM farm_log ORDER BY id ___ LIMIT ___;',
    },
    expected: 'SELECT * FROM farm_log ORDER BY id DESC LIMIT 5',
    ordered: true,
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────────── Chapter 4: aggregates ─────────────────────
  {
    id: 'c4-count',
    chapter: 4,
    kind: 'query',
    title: 'A strange visitor',
    onStart: (api) => {
      const msg = arrive(api, 'Chimnius', 2, 2, 8);
      api.system("UPDATE weather SET temperature = -4, sky = 'frost' WHERE day IN (?, ?)", [api.day, api.day + 1]);
      return `${msg} ❄️ The Almanac warns: a cold snap is coming tonight!`;
    },
    story:
      "*Clomp. Clomp. Hummmm.* A brick smokestack on legs just walked into the farm and sat down on plot 2. It's warm. It's humming. I have no idea what it is. The townsfolk call it a **Chimnius**.\n\nWorse news: the Almanac says a **cold snap** is coming. Let's take stock. How big is your farm family now?",
    task: 'Count the rows in `creatures`.',
    concept: {
      title: 'COUNT',
      body: "`COUNT(*)` doesn't show rows. It counts them and gives back a single number.",
      example: 'SELECT COUNT(*) FROM plots;',
    },
    hints: {
      nudge: 'Put `COUNT(*)` where you would normally put `*`.',
      blank: 'SELECT ___(*) FROM creatures;',
    },
    expected: 'SELECT COUNT(*) FROM creatures',
    mustInclude: [{ pattern: /\bcount\s*\(/i, message: 'Use `COUNT(*)` to count the rows.' }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c4-sum',
    chapter: 4,
    kind: 'query',
    title: 'Stocktake',
    story: 'Before the cold comes, how many things are stored in your barn, all added together?',
    task: 'Add up the `quantity` column of `inventory`.',
    concept: {
      title: 'SUM, AVG, MAX, MIN',
      body: 'These **aggregate** a column into one number: `SUM` adds, `AVG` averages, `MAX` finds the biggest and `MIN` the smallest.',
      example: 'SELECT MAX(growth) FROM plots;',
    },
    hints: { nudge: 'Use `SUM(quantity)`.', blank: 'SELECT ___(quantity) FROM inventory;' },
    expected: 'SELECT SUM(quantity) FROM inventory',
    mustInclude: [{ pattern: /\bsum\s*\(/i, message: 'Use `SUM(quantity)` to add them up.' }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c4-frost',
    chapter: 4,
    kind: 'action',
    title: 'Brace for frost',
    story: "Nothing for it. The cold is coming whether we like it or not. If you have crops planted, some may not survive. Let's see what happens.",
    task: 'End the day and let the frost come.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: (api) => Number(api.scalar("SELECT COUNT(*) FROM farm_log WHERE event = 'frost'")) > 0,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c4-frostcount',
    chapter: 4,
    kind: 'query',
    title: 'Counting the damage',
    story: "Brrr. The `Frost` wrote itself into the log, one row per frozen plot. You can combine `COUNT` with `WHERE` to count only certain rows.",
    task: "Count the rows in `farm_log` where `event` is `'frost'`.",
    hints: {
      nudge: 'Use `COUNT(*)`, plus a `WHERE` that keeps only frost events.',
      blank: "SELECT COUNT(*) FROM farm_log WHERE event = '___';",
    },
    expected: "SELECT COUNT(*) FROM farm_log WHERE event = 'frost'",
    mustInclude: [{ pattern: /\bcount\s*\(/i, message: 'Use `COUNT(*)`.' }, where],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c4-warm',
    chapter: 4,
    kind: 'answer',
    title: 'The plots that didn’t freeze',
    story:
      "Here's a mystery. Not every plot froze. Some stayed toasty warm. Compare the plots' `warmth` with where your creatures are standing (`creatures.plot_id`).",
    task: '**Why did some plots escape the frost?**',
    hints: {
      nudge: 'Sort plots by warmth, warmest first. Then check which creature stands nearby.',
      blank: 'SELECT id, warmth FROM plots ORDER BY warmth ___;',
      answer:
        'Run `SELECT id, row, col, warmth FROM plots ORDER BY warmth DESC;` and `SELECT name, plot_id FROM creatures;`. The warmest plot is the one Chimnius stands on, and its neighbours come next.',
    },
    choices: ["Squeal's tilling keeps the frost out", 'Chimnius warms its own plot and the plots next to it', 'Those plots were just lucky'],
    correct: 1,
    discovers: ['chimnius_warm'],
    reward: { coins: 15, xp: 30 },
  },
  {
    id: 'c4-mood',
    chapter: 4,
    kind: 'query',
    title: 'Something’s off',
    story: "Chimnius is a hero! But I've heard grumbling around the farm. Let's check how everyone's feeling on average.",
    task: 'Find the average `mood` of all creatures.',
    hints: { nudge: 'Use `AVG(mood)`.', blank: 'SELECT ___(mood) FROM creatures;' },
    expected: 'SELECT AVG(mood) FROM creatures',
    mustInclude: [{ pattern: /\bavg\s*\(/i, message: 'Use `AVG(mood)`.' }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c4-cough',
    chapter: 4,
    kind: 'answer',
    title: 'A cough in the night',
    story: 'Listen… *hack, hack, jingle*. Someone has been coughing. Search the log for it.',
    task: "Find `farm_log` rows where `event` is `'coughed'`. **Who is coughing, and why?**",
    hints: {
      nudge: "Filter `farm_log` by `event = 'coughed'`, then look at where everyone stands.",
      blank: "SELECT * FROM farm_log WHERE event = '___';",
      answer:
        "Run `SELECT * FROM farm_log WHERE event = 'coughed';`. It's Henbell, on plot 3, right next to Chimnius on plot 2.",
    },
    choices: [
      'Squeal: it ate too many scraps',
      "Henbell: Chimnius's smoke drifts onto its plot",
      "Sortoise: it's allergic to pebbles",
    ],
    correct: 1,
    discovers: ['chimnius_smoke', 'henbell_smoke'],
    reward: { coins: 15, xp: 30 },
  },
  {
    id: 'c4-move',
    chapter: 4,
    kind: 'action',
    title: 'Fresh air',
    story: "Poor Henbell. A grumpy Henbell won't lay eggs. Let's find it a spot away from the smoke. (Chimnius warms the plots *next* to it, so the smoke reaches those too.)",
    task: 'Move Henbell (or Chimnius!) so they are not on the same plot or on neighbouring plots.',
    hints: {
      nudge: 'Each creature card has a "Move to plot" picker.',
      blank: 'Pick a plot for Henbell that is not next to Chimnius.',
      answer: 'Creatures → Henbell → Move to plot 12 (far corner).',
    },
    check: (api) => {
      const h = Number(api.scalar("SELECT plot_id FROM creatures WHERE name = 'Henbell'"));
      const c = Number(api.scalar("SELECT plot_id FROM creatures WHERE name = 'Chimnius'"));
      return plotDistance(h, c) > 1;
    },
    reward: { coins: 20, xp: 40 },
  },
];

export function chapterOf(q: Quest): Chapter {
  return CHAPTERS.find((c) => c.n === q.chapter) ?? CHAPTERS[0];
}
