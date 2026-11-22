// 所有动物的登记处。以后再加动物，在这里加一行；再到这些地方各加一处：
// src/main/store.js 的 SPECIES、托盘菜单（tray.js）、右键菜单（app.js，带小头像）、语言文件的 menu.<编号> 和 say.<编号>、
// 信里的零食（shared/letters/*.json 的 snack）、activities.js 的 HOP_REACH、开发工具（dev-server、sim-letters、check-art、
// gallery 的 REFERENCE）、自检里切换动物的那一项，以及 README 和 ASSETS-LICENSE.md。

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
