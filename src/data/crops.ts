export interface Crop {
  id: string;
  label: string;
  emoji: string;
  seedPrice: number;
  sellPrice: number;
  /** Growth points gained per night (100 = ready to harvest). */
  rate: number;
  /** Items gained on harvest (+1 if the plot was tilled). */
  yield: number;
}

export const CROPS: Record<string, Crop> = {
  snoutroot: { id: 'snoutroot', label: 'Snoutroot', emoji: '🥕', seedPrice: 2, sellPrice: 6, rate: 34, yield: 2 },
  sunpuff: { id: 'sunpuff', label: 'Sunpuff', emoji: '🌼', seedPrice: 5, sellPrice: 14, rate: 25, yield: 2 },
  glassberry: { id: 'glassberry', label: 'Glassberry', emoji: '🫐', seedPrice: 10, sellPrice: 32, rate: 20, yield: 2 },
};

/** Non-crop things that can be sold at market. */
export const GOODS: Record<string, { label: string; emoji: string; sellPrice: number }> = {
  egg: { label: 'Egg', emoji: '🥚', sellPrice: 4 },
  shiny_pebble: { label: 'Shiny pebble', emoji: '🪨', sellPrice: 3 },
  echo_wool: { label: 'Echo wool', emoji: '🧶', sellPrice: 9 },
};

export function itemEmoji(item: string): string {
  if (item.endsWith('_seed')) return '🌱';
  return CROPS[item]?.emoji ?? GOODS[item]?.emoji ?? '📦';
}

export function itemLabel(item: string): string {
  if (item.endsWith('_seed')) {
    const crop = CROPS[item.replace(/_seed$/, '')];
    return crop ? `${crop.label} seed` : item;
  }
  return CROPS[item]?.label ?? GOODS[item]?.label ?? item;
}
