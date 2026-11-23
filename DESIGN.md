# 🐷 Super Squeal — Design

A cozy farm-tycoon game for learning SQL from scratch, set in a strange fantasy
valley full of odd creatures.

## The pitch

You inherit a run-down farm in **Bramblewick Hollow**, a valley full of peculiar
creatures. Nobody left instructions. All you have is the farm's **Ledger**: a
magical record of everything that happens on the farm. The Ledger is a SQL
database.

To figure out what your creatures are, what they eat and what they do to the
farm, you query the Ledger.

> **Core idea: you never get told a creature's traits. You deduce them from the data.**

Some creatures are obvious (Squeal is clearly a pig). Others are not (what on
earth does Chimnius, the walking smokestack, *do*?). Queries are how you find out.

## Audience

Total SQL beginners. The game assumes no prior knowledge and introduces one
concept at a time, always in service of a question the player actually cares
about.

## Core loop (one in-game day)

1. **Morning** — Keystone (a talkative scarecrow) gives you a quest or a mystery.
2. **Investigate** — write `SELECT` queries against the Ledger.
3. **Act** — plant, water, feed, move creatures, buy and sell.
4. **Night** — press *End day*. The simulation runs: creatures do their thing,
   weather happens, crops grow, and new rows appear in `farm_log`.
5. **Repeat** — earn coins and XP, fill in the Bestiary, welcome new creatures.

### Every button shows its SQL

Clicking *Feed* on Squeal pops up a "Ledger whisper":

```sql
UPDATE creatures SET hunger = 0 WHERE name = 'Squeal';
```

As a beginner you see real SQL hundreds of times before you have to write any.
In a later chapter you earn the **Ledger Quill**, which lets you write
`INSERT` / `UPDATE` / `DELETE` yourself. Until then the Ledger is read-only for
typed queries, so a beginner can't accidentally wreck their farm.

## The Bestiary

Each creature's entry starts mostly as `???`. Fields are filled in by:

- **Feeding** a creature (you learn what it eats), and
- **Deduction quests** — Keystone asks a question ("What did Squeal do last
  night?"), you investigate with queries, then answer. Your query is the proof.

| Creature | Obviousness | What it really does |
|---|---|---|
| **Squeal** 🐷 | Obvious | A pig. Tills the plot it sleeps on (+growth). |
| **Henbell** 🐔 | Obvious | A hen with a bell. Lays eggs; rings at dawn, cheering everyone up. |
| **Sortoise** 🐢 | Medium | A tidy tortoise. Digs up shiny pebbles. The `ORDER BY` tutor. |
| **Chimnius** 🏭 | Not obvious | A walking smokestack. Warms nearby plots (frost protection), but its smoke makes Henbell cough. |
| **Puddlewump** 💧 | Medium | A walking puddle. Waters neighbours, but rots root crops if left too long. |
| **Glimmerwick** 🕯️ | Not obvious | A candle-moth. Each night it flies off to pollinate Sunpuffs, and only Sunpuffs. |
| **Tumblecrag** 🪨 | Medium | A rolling boulder. Tills for free, sometimes flattens fences. |
| **Mossgrandle** 🌿 | Very hidden | Sleeps 6 days, then fertilises everything in one burst. |
| **Moolump** 🐄 | Fairly obvious | A cow-shaped grassy mound. Gives milk; becomes a hill if never moved. |

### Creatures that are SQL concepts in disguise

- **Nullkin** 👻 — a tiny ghost that eats labels, leaving `NULL`s in the log.
  You can't catch it until you learn `IS NULL`.
- **Echolamb** 🐑 — repeats yesterday, filling the log with duplicate rows.
  Teaches `DISTINCT`.
- **Twinnet** 🐟 — pond koi that only thrive in bonded pairs. First self-join.
- **Sortoise** 🐢 — only reveals things in order. `ORDER BY` / `LIMIT`.

### Strange crops

| Crop | Notes |
|---|---|
| Snoutroot 🥕 | Cheap, reliable, 3 nights. |
| Sunpuff 🌼 | Mid-price, 4 nights. |
| Glassberry 🫐 | Expensive and valuable, 5 nights. |
| Moonbeet (later) | Only grows on full-moon nights (`WHERE` on weather). |
| Shrieking Gourd (later) | Lowers nearby creatures' mood. |

## Learning path

| Ch. | SQL concept | Story beat |
|---|---|---|
| 1 | `SELECT *`, choosing columns | Arrive, meet Squeal. "Who lives here?" |
| 2 | `WHERE`, `AND` | Who's hungry? Henbell arrives. |
| 3 | `ORDER BY`, `LIMIT` | Sortoise shows you the market. |
| 4 | `COUNT`, `SUM`, `AVG`, `MAX` | Chimnius arrives with a cold snap — the frost mystery. |
| 🌻 | Free play | **The Autumn Fair** — get the farm fair-ready; answer the judges. |
| 5 | `GROUP BY`, `HAVING` | Puddlewump arrives: what does it water, and why do roots rot? |
| 🌻 | Free play | **The Dry Spell** — a week without rain; answer the Water Board. |
| 6 | `NULL`, `IS NULL`, `DISTINCT`, `COUNT(DISTINCT …)` | Haunted logs: Nullkin and Echolamb. |
| 🌻 | Free play | **The Ledger Audit** — impress a stern heron auditor. |
| 7 | `UPDATE`, `INSERT`, `DELETE` | The farm grows to 48 plots and 14 creatures; the Ledger Quill makes running it bearable. |
| 🌻 | Free play | **The Big Farm** — 30 plots growing at once, 40 harvests, 300 coins. |
| 8 | `JOIN … ON`, aliases, `JOIN` + aggregates, `LEFT JOIN` | Glimmerwick's log only says *where* it went; joining to `plots` reveals *what* it visits. |
| 🌻 | Free play | **Lantern Night** — Sunpuff garlands; the trap of counting rows after a join. |
| 9+ | Subqueries, CTEs, window functions | Seasonal trends, Mossgrandle's sleep cycle. |

## The Ledger Quill (chapter 7)

Chapter 7 first makes manual farming a chore, then hands over the tool that fixes
it. Mayor Thimble grants the **East field** (plots 13–24) and **South field**
(25–48), and seven creatures arrive with them (three Henbells, two Squeals, a
Puddlewump and a Sortoise). The first quest has you feed all fourteen by hand;
the night passes; they're hungry again; *then* you get the Quill and do it with
`UPDATE creatures SET hunger = 0;`. Measured with the test bots, running the Big
Farm takes about 61 button presses a day by hand versus about 5 Quill writes.

With the Quill, typed SQL can change the farm, but only within **the Ledger's
laws** (`src/quill.ts`). A write runs inside a savepoint; the farm is compared
before and after; any broken law rolls back the *whole* write, and Keystone
explains which law it broke.

| Table | Allowed | Refused (examples) |
|---|---|---|
| `creatures` | lower `hunger` (feed), change `plot_id` (move) | raising hunger, changing mood, adding or deleting creatures |
| `plots` | raise `moisture` up to 3 (water); `crop` NULL→crop with `growth = 0` (plant, uses a seed); crop→NULL (harvest if ripe, otherwise uproot) | writing `growth`, `tilled`, `warmth`; swapping one crop for another |
| `orders` | `INSERT` buy (`'sunpuff_seed'`) and sell orders, filled immediately | editing or deleting past orders, buying what you can't afford, selling what you don't have |
| `farm_log` | `DELETE` (tidy up) | inserting or updating (forging history) |
| `farm`, `inventory`, `market`, `seeds`, `weather` | nothing directly | writing coins, items, prices or weather |

Side effects are applied in a fixed order (buys → plantings → harvests → sells), so
one write can buy seeds and plant them, or harvest and sell. Structural SQL
(`CREATE`, `DROP`, `PRAGMA`, transactions…) is always refused. ⏪ Rewind undoes
a regretted `DELETE`.

The Barn buttons also record their trades in `orders`, so the table tells the
whole story.

## Free play

After the basics, lessons alternate with **free-play interludes**: a broad,
loose objective reached however the player likes, using everything learned so
far. There is no prescribed query and no failure state.

- **Goal quests** show a checklist with progress bars ("Earn 80 coins from
  selling", "Harvest 3 Glassberries", "Every creature in a good mood at the same
  time"). Goals count progress *since the interlude started*, and each interlude
  is themed around a farm event (a fair, a dry spell, an audit) that shapes the
  strategy. The Dry Spell also lasts a set week, so it's a real stretch of play.
- **Report quests** follow each goal quest: a character asks a question
  ("How many eggs has Henbell laid since you arrived?") and the player types in the
  answer, found with *any* query they like. Answers are checked against live data
  when submitted, so they stay correct as the farm changes; ties are all accepted.
- Hints in free play are strategy tips rather than queries, except the final
  hint of a report, which shows one query that works.

## Beginner safety nets

- **Keystone the scarecrow** explains each concept with a short concept card.
- **Hint ladder**: nudge (free) → fill-in-the-blank (2 coins) → full answer
  (5 coins). If you're broke, Keystone takes pity. You're never stuck.
- **Friendly errors**: `no such column: nmae` → *"There's no column called
  `nmae`. Did you mean `name`?"*. Unquoted text values get a "wrap it in single
  quotes" hint.
- **Answer checking by result set**, not query text — any query that produces
  the right rows counts. Column order doesn't matter; row order only matters
  when the quest is about ordering.
- **Rewind the day**: restores the farm to the start of the day.
- **Schema panel**: always visible, with sample rows per table.

## Gamification

- **XP and levels**: Piglet → Hog → Boss Hog → Query Swine → Truffle Hunter → Grand Grunter → Hollow Legend → Ledger Mythic → Keeper of Connections 👑
- **Coins** from selling harvests, eggs and pebbles, plus quest rewards.
- **Bestiary completion** as the long-term collection goal.
- **Badges**: Hello, Ledger · Green Trotters · Critter-ologist · Frost Detective · Hollow Hand · Fair Favourite · Water Wise · Ghost Hunter · Ledger Keeper
- **Streak**: consecutive real-world days played, with a small coin bonus.

## Data model (the Ledger)

| Table | Columns |
|---|---|
| `farm` | `day`, `coins` (one row) |
| `creatures` | `id`, `name`, `kind`, `emoji`, `plot_id`, `hunger` (0–10), `mood` (0–10) |
| `plots` | `id`, `row`, `col`, `crop`, `growth` (0–100), `moisture`, `warmth`, `tilled` |
| `inventory` | `item`, `quantity` |
| `market` | `item`, `sell_price` |
| `seeds` | `crop`, `price`, `nights_to_grow` |
| `weather` | `day`, `temperature`, `sky` |
| `farm_log` | `id`, `day`, `source`, `plot_id`, `event`, `amount` |
| `orders` | `id`, `day`, `action` (`buy`/`sell`), `item`, `quantity`, `total` |

Creature traits and quest answers live in game code, *not* in the database, so
they can't be looked up — only deduced.

`NULL` is deliberately avoided in early-chapter data (except empty plots'
`crop`) so it can be introduced properly in chapter 6, where the Nullkin starts
leaving `NULL` sources and amounts in `farm_log`.

The database has a schema version (`PRAGMA user_version`). `migrate()` in
`src/data/schema.ts` upgrades older saves on load (v1 → v2 relaxed `farm_log`'s
`NOT NULL` columns and added Echo wool; v2 → v3 added `orders`), so players
never lose progress.

Plot positions come from each plot's `row` and `col` (not its id), so the farm
can grow. Creatures are matched to their species by `kind`, so there can be
several of one species. Saves are batched (at most every 400 ms, and flushed
when the tab is hidden) so a big farm stays fast.

## Night simulation rules (MVP)

- Every creature gets 2 hungrier. A creature **works** only if
  `hunger < 8` and `mood > 3`.
- Hungry creatures (`hunger >= 8`) grumble and lose 1 mood; well-fed ones
  (`hunger < 5`) gain 1 mood.
- **Squeal**: tills its plot (+10 growth/night for crops there).
- **Henbell**: lays an egg; always rings its bell (+1 mood to everyone else).
- **Sortoise**: digs up a shiny pebble.
- **Chimnius**: +8 warmth on its plot, +5 on adjacent plots; creatures
  that dislike smoke on/next to it cough (−2 mood).
- **Puddlewump**: waters its own and adjacent plots (moisture 3). Its own plot
  is always soggy: Snoutroot there loses 15 growth per night instead of growing.
- **Echolamb**: grows Echo wool; copies the previous night's creature log rows
  as exact duplicates (new `id`s), which is what makes `DISTINCT` necessary.
- **Glimmerwick**: flies anywhere on the farm to the three least-grown Sunpuffs
  (+15 growth each) and logs `pollinated` with only the `plot_id`, so finding out
  what it visits takes a `JOIN` to `plots`. The night report just says "something
  glowing visited plots 4, 7 and 25".
- **Nullkin**: never hungry. Writes its own `nibbled` rows with a `NULL`
  source, and erases (`NULL`s) the `amount` of one other entry each night.
- **Plots**: `warmth = temperature + bonuses`. Below 0 → frost, crop lost.
  Otherwise crops grow by their rate (halved if `moisture = 0`), +10 if tilled.
  Rain sets moisture to 3; otherwise it drops by 1.

## Tech

- **Vite + TypeScript**, no UI framework.
- **sql.js** (SQLite compiled to WebAssembly) — real SQL in the browser, no server.
- **The game state is the database.** Saving = exporting the SQLite file
  (base64) to `localStorage`, alongside a small progress JSON.
- **Rewind** = restore the start-of-day snapshot, then replay the day's
  "system" events (arrivals, quest rewards, hint purchases).
- **Quests and creatures are data** (`src/data/`), so adding content doesn't
  need engine changes.
- **Emoji art** to start; can be swapped for SVG or pixel art later.

## Current scope

- Chapters 1–8 plus five free-play interludes: 76 quests, 8 species (15 creatures on the Big Farm).
- Chapter 9 (subqueries and CTEs) is next.

## Original MVP scope

- Chapters 1–4 (27 quests) with Squeal, Henbell, Sortoise and Chimnius,
  including the frost mystery and the "why is Henbell coughing?" mystery.
- 12-plot farm grid, day/night cycle, weather, three crops, market and seed shop.
- Bestiary with `???` entries, hint ladder, friendly errors, SQL-revealing
  buttons, rewind, XP/levels, badges and streaks.
- An automated test that plays through every quest to make sure the game is
  completable.
