// 所有动物的登记处。以后加卡皮巴拉、小狗、小熊猫，只要在这里加一行。

import { cat } from './cat.js';
import { panda } from './panda.js';

export const SPECIES = Object.freeze({ cat, panda });
export const SPECIES_IDS = Object.freeze(Object.keys(SPECIES));
export const DEFAULT_SPECIES = 'cat';

export function getSpecies(id) {
  return SPECIES[id] || SPECIES[DEFAULT_SPECIES];
}
