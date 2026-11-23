# 🐷 Super Squeal

A cozy fantasy farm game for learning SQL from scratch.

You inherit a farm in **Bramblewick Hollow**, a valley full of strange creatures.
The farm's magic Ledger is a real SQLite database. Query it to work out what
your creatures are, what they do, and how to keep the farm thriving.

See [DESIGN.md](DESIGN.md) for the full game design.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
```

## Other commands

```sh
npm test         # unit tests, a full playthrough, and checks that every example,
                 # template and hint query gets helpful feedback
npm run build    # typecheck and build a static site into dist/
npm run preview  # serve the built site
```

## How it's put together

| Path | What's there |
|---|---|
| `src/data/schema.ts` | Ledger tables and seed data |
| `src/data/creatures.ts` | Bestiary: creatures and their hidden traits |
| `src/data/crops.ts` | Crops and market goods |
| `src/data/quests.ts` | Chapters and quests (add new content here) |
| `src/sim.ts` | The night simulation |
| `src/game.ts` | Game engine: actions, quests, hints, saving, rewind |
| `src/sqlHelp.ts` | Result checking, friendly errors, read-only guard |
| `src/ui.ts`, `src/style.css` | The interface |

The whole game runs in the browser with [sql.js](https://sql.js.org) (SQLite
compiled to WebAssembly). Progress is saved in `localStorage`.

## Deployment

Deployed on Vercel: **https://super-squeal.vercel.app**

Every push to the production branch redeploys automatically. Other branches get
their own preview URLs. Build settings live in `vercel.json`.
