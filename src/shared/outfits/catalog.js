'use strict';
// 衣柜的"目录"：有哪些衣服、各穿在哪个部位、哪几件一开始就送、别的会在哪儿捡到。
// 衣服的样子（怎么画）在 src/renderer/js/pet/outfits.js；名字和信里的句子在同一个文件夹的 zh.json / en.json。
// 三边的编号必须一模一样，npm run letters 会检查。
//
// 想加一件新衣服：
//   1. 在 src/renderer/js/pet/outfits.js 里把它画出来
//   2. 在下面的 OUTFITS 里加一行（编号和画的那件一样）
//   3. 在 zh.json 和 en.json 的 "items" 里各加名字
//   4. 运行 npm run letters 检查，再打开 gallery.html?outfits=1 看看样子

/** 部位，也是衣柜里标签的顺序 */
const SLOTS = ['hat', 'glasses', 'top', 'bag', 'held'];

/**
 * slot     穿在哪个部位
 * starter  一开始就送（不用等信）
 * places   在这些地点更容易捡到（地点编号见 shared/letters/catalog.js）
 * scenes   在这些风景的地方更容易捡到：sea 海 | mountain 山 | forest 森林 | city 城市 | snow 雪地 | night 夜晚
 * 不写 places / scenes 的话，在哪儿都一样容易捡到。
 */
const OUTFITS = {
  capRed: { slot: 'hat', starter: true },
  bucketHat: { slot: 'hat', scenes: ['sea', 'mountain'] },
  knitBeanie: { slot: 'hat', scenes: ['snow', 'city'] },
  wizardHat: { slot: 'hat', scenes: ['night'], places: ['observatory'] },
  roundGlasses: { slot: 'glasses', starter: true },
  pixelShades: { slot: 'glasses', scenes: ['sea', 'city'] },
  starGlasses: { slot: 'glasses', scenes: ['night'] },
  sailorTop: { slot: 'top', scenes: ['sea'], places: ['harbor', 'lighthouse'] },
  hoodie: { slot: 'top', scenes: ['city', 'mountain'] },
  knitSweater: { slot: 'top', starter: true },
  tangJacket: { slot: 'top', places: ['teaField', 'nightMarket', 'bambooGrove', 'hotSpring'] },
  backpack: { slot: 'bag', scenes: ['mountain', 'forest'] },
  catBag: { slot: 'bag', scenes: ['city'] },
  bobaTea: { slot: 'held', places: ['nightMarket', 'convenience', 'trainStation'] },
  blueFish: { slot: 'held', places: ['harbor', 'seaside', 'frozenLake'] },
  bamboo: { slot: 'held', places: ['bambooGrove', 'teaField'] },
};

const IDS = Object.keys(OUTFITS);
const STARTERS = IDS.filter((id) => OUTFITS[id].starter);

/** 什么都不穿 */
const EMPTY = Object.freeze({ hat: null, glasses: null, top: null, bag: null, held: null });

/**
 * 检查"穿着什么"：必须正好是五个部位，每个部位是 null 或者这个部位的一件衣服。
 * 合格就返回整理好的新对象，不合格返回 null。
 */
function sanitizeOutfit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== SLOTS.length || !SLOTS.every((slot) => keys.includes(slot))) return null;
  const out = {};
  for (const slot of SLOTS) {
    const id = value[slot];
    if (id === null) out[slot] = null;
    else if (typeof id === 'string' && OUTFITS[id] && OUTFITS[id].slot === slot) out[slot] = id;
    else return null;
  }
  return out;
}

/**
 * 你有哪些衣服：一开始送的 + 信里收到过的（拆开信才算收到）。
 * received：存档里的 mail.outfits { 编号: { firstDay } }；all = true：开发时全部解锁
 */
function ownedSet(received, { all = false } = {}) {
  if (all) return new Set(IDS);
  const set = new Set(STARTERS);
  if (received && typeof received === 'object') for (const id of Object.keys(received)) if (OUTFITS[id]) set.add(id);
  return set;
}

/** 把没有的衣服脱掉（比如存档里穿着一件开发时解锁的衣服） */
function keepOwned(outfit, owned) {
  const out = { ...EMPTY };
  for (const slot of SLOTS) if (outfit && outfit[slot] && owned.has(outfit[slot])) out[slot] = outfit[slot];
  return out;
}

module.exports = { SLOTS, OUTFITS, IDS, STARTERS, EMPTY, sanitizeOutfit, ownedSet, keepOwned };
