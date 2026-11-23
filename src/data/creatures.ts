export interface Trait {
  id: string;
  label: string;
  value: string;
  /** 'feed' traits are learned the first time you feed the creature; 'quest' traits via deduction quests. */
  discover: 'feed' | 'quest';
}

export interface Species {
  name: string;
  emoji: string;
  kind: string;
  food: string;
  blurb: string;
  /** Takes a mood hit when standing on or next to Chimnius. */
  dislikesSmoke?: boolean;
  /** Never gets hungry (and so never grumbles). */
  ethereal?: boolean;
  traits: Trait[];
}

export const SPECIES: Record<string, Species> = {
  Squeal: {
    name: 'Squeal',
    emoji: '🐷',
    kind: 'mud-beast',
    food: 'kitchen scraps',
    blurb: 'A round, pink, snuffling thing. It looks like a pig. It squeals like a pig. Surely it is just a pig?',
    traits: [
      { id: 'squeal_eats', label: 'Eats', value: 'Kitchen scraps', discover: 'feed' },
      { id: 'squeal_work', label: 'Night work', value: 'Roots up and tills the plot it sleeps on (+10 crop growth per night)', discover: 'quest' },
    ],
  },
  Henbell: {
    name: 'Henbell',
    emoji: '🐔',
    kind: 'bell-fowl',
    food: 'bellseed',
    blurb: 'A plump hen with a small brass bell where its wattle should be. It jingles when it walks.',
    dislikesSmoke: true,
    traits: [
      { id: 'henbell_eats', label: 'Eats', value: 'Bellseed', discover: 'feed' },
      { id: 'henbell_eggs', label: 'Night work', value: 'Lays one egg each night, if fed and happy', discover: 'quest' },
      { id: 'henbell_bell', label: 'At dawn', value: 'Rings its bell, cheering up every other creature (+1 mood)', discover: 'quest' },
      { id: 'henbell_smoke', label: 'Dislikes', value: 'Smoke. Coughs (−2 mood) when standing on or beside Chimnius', discover: 'quest' },
    ],
  },
  Sortoise: {
    name: 'Sortoise',
    emoji: '🐢',
    kind: 'shell-sage',
    food: 'river moss',
    blurb: 'An unhurried tortoise with tidy little labelled drawers in its shell. It insists on doing things in order.',
    traits: [
      { id: 'sortoise_eats', label: 'Eats', value: 'River moss', discover: 'feed' },
      { id: 'sortoise_dig', label: 'Night work', value: 'Digs up a shiny pebble each night', discover: 'quest' },
    ],
  },
  Chimnius: {
    name: 'Chimnius',
    emoji: '🏭',
    kind: 'hearth-walker',
    food: 'deadwood',
    blurb: 'A brick smokestack on two stubby legs. It hums. It is warm to the touch. Nobody knows why it came.',
    traits: [
      { id: 'chimnius_eats', label: 'Eats', value: 'Deadwood', discover: 'feed' },
      { id: 'chimnius_warm', label: 'Night work', value: 'Warms its own plot (+8) and the plots beside it (+5). Frost protection!', discover: 'quest' },
      { id: 'chimnius_smoke', label: 'Side effect', value: 'Its smoke makes creatures that dislike smoke cough', discover: 'quest' },
    ],
  },
  Puddlewump: {
    name: 'Puddlewump',
    emoji: '💧',
    kind: 'wander-puddle',
    food: 'rainwater',
    blurb: 'A knee-high puddle that walks. It leaves damp footprints that never quite dry, and it giggles when it rains.',
    traits: [
      { id: 'puddle_eats', label: 'Eats', value: 'Rainwater', discover: 'feed' },
      { id: 'puddle_water', label: 'Night work', value: 'Waters its own plot and the plots beside it (moisture back to 3)', discover: 'quest' },
      { id: 'puddle_rot', label: 'Side effect', value: 'Keeps its own plot so soggy that root crops (Snoutroot) rot instead of growing', discover: 'quest' },
    ],
  },
  Nullkin: {
    name: 'Nullkin',
    emoji: '👻',
    kind: 'label-eater',
    food: 'spilled ink',
    blurb: 'A shimmer in the corner of your eye. When you look straight at it, it is not there. Neither are some of your notes.',
    ethereal: true,
    traits: [
      { id: 'nullkin_eats', label: 'Eats', value: 'Spilled ink', discover: 'feed' },
      { id: 'nullkin_nibble', label: 'Night work', value: "Nibbles the Ledger: its own entries have no source, and it erases one other entry's amount each night, leaving NULL", discover: 'quest' },
      { id: 'nullkin_hunger', label: 'Hunger', value: 'Never gets hungry. Ghosts don’t, apparently.', discover: 'quest' },
    ],
  },
  Echolamb: {
    name: 'Echolamb',
    emoji: '🐑',
    kind: 'echo-sheep',
    food: 'clover',
    blurb: 'A fluffy sheep whose bleat comes back a second later. Then again. Then again.',
    traits: [
      { id: 'echolamb_eats', label: 'Eats', value: 'Clover', discover: 'feed' },
      { id: 'echolamb_wool', label: 'Night work', value: 'Grows a bundle of Echo wool', discover: 'quest' },
      { id: 'echolamb_echo', label: 'Side effect', value: "Repeats yesterday: copies the previous night's log entries, creating exact duplicates", discover: 'quest' },
    ],
  },
};

const BY_KIND = new Map(Object.values(SPECIES).map((s) => [s.kind, s]));

/**
 * The species of a creature row. Creatures are matched by `kind`, so a farm can have
 * several of one species (Henbell, Clang and Peal are all bell-fowl).
 */
export function speciesOf(c: { kind?: string | null; name?: string | null }): Species | undefined {
  return (c.kind ? BY_KIND.get(c.kind) : undefined) ?? (c.name ? SPECIES[c.name] : undefined);
}

/** Creatures planned for later chapters, shown as silhouettes in the Bestiary. */
export const COMING_SOON = ['Glimmerwick', 'Tumblecrag', 'Mossgrandle', 'Moolump', 'Twinnet'];

export const ALL_TRAIT_IDS = Object.values(SPECIES).flatMap((s) => s.traits.map((t) => t.id));
