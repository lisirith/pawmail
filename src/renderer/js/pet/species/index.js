// 所有动物的登记处。以后再加动物，在这里加一行；
// 再到 src/main/store.js 的 SPECIES、托盘菜单、右键菜单、语言文件里各加一处（见 CLAUDE.md "加一种新动物"）。

import { cat, luckyCat } from './cat.js';
import { panda } from './panda.js';
import { capybara } from './capybara.js';
import { shiba } from './shiba.js';
import { redpanda } from './redpanda.js';

export const SPECIES = Object.freeze({ cat, panda, capybara, shiba, redpanda });
export const SPECIES_IDS = Object.freeze(Object.keys(SPECIES));
export const DEFAULT_SPECIES = 'cat';

export function getSpecies(id, catCoat = 'tabby') {
  if (id === 'cat' && catCoat === 'lucky') return luckyCat;
  return SPECIES[id] || SPECIES[DEFAULT_SPECIES];
}
