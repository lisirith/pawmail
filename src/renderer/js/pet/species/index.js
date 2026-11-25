// 所有动物的登记处。以后再加动物，在这里加一行；再到这些地方各加一处：
// src/main/store.js 的 SPECIES、托盘菜单（tray.js）、右键菜单（app.js，带小头像）、语言文件的 menu.<编号> 和 say.<编号>、
// 信里的零食（shared/letters/*.json 的 snack）、activities.js 的 HOP_REACH、开发工具（dev-server、sim-letters、check-art、
// gallery 的 REFERENCE）、自检里切换动物的那一项，以及 README 和 ASSETS-LICENSE.md。
// 动物文件里还要写 tricks（三个招牌动作，见 tricks.js）和 snack（抱着啃的零食，画法在 props.js，和信里写的零食一致）。

import { cat, luckyCat } from './cat.js';
import { panda } from './panda.js';
import { capybara } from './capybara.js';
import { shiba } from './shiba.js';
import { redpanda } from './redpanda.js';
import { bunny } from './bunny.js';
import { fox } from './fox.js';
import { penguin } from './penguin.js';
import { otter } from './otter.js';

// 顺序就是菜单里的顺序（2026-11-24 用户说"合理一点"）：家里养的猫和狗在前，然后是狗的亲戚狐狸、长得像狐狸的小熊猫、
// 名字里也有"熊猫"的熊猫、兔子，最后是爱泡水的卡皮巴拉、水獭和企鹅（从陆地一路走进水里）
export const SPECIES = Object.freeze({ cat, shiba, fox, redpanda, panda, bunny, capybara, otter, penguin });
export const SPECIES_IDS = Object.freeze(Object.keys(SPECIES));
export const DEFAULT_SPECIES = 'cat';

export function getSpecies(id, catCoat = 'tabby') {
  if (id === 'cat' && catCoat === 'lucky') return luckyCat;
  return SPECIES[id] || SPECIES[DEFAULT_SPECIES];
}
