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
};

/** Creatures planned for later chapters, shown as silhouettes in the Bestiary. */
export const COMING_SOON = ['Puddlewump', 'Glimmerwick', 'Tumblecrag', 'Mossgrandle', 'Moolump', 'Nullkin', 'Echolamb', 'Twinnet'];

export const ALL_TRAIT_IDS = Object.values(SPECIES).flatMap((s) => s.traits.map((t) => t.id));
