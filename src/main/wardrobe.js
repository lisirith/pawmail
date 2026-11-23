'use strict';
// 衣柜的"纯计算"部分：信里捎来哪件衣服、衣服叫什么、衣柜里显示什么。
// 和 letters.js 一样不碰窗口、不碰硬盘，所以来信模拟器（npm run letters）和预览服务器也能直接用。
//
// 衣服怎么到手：
//   - 一开始送三件（目录里标了 starter 的）
//   - 其余的随每日来信捎来：第一封日常来信一定有一件，之后每封一半的机会（不会连着两封都有，所以大约每三封有一件），
//     同一件不会寄两次
//   - 和礼物一样，拆开信才算收到（存档里的 mail.outfits）

const O = require('../shared/outfits/catalog');

const TEXT = {
  zh: require('../shared/outfits/zh.json'),
  en: require('../shared/outfits/en.json'),
};

const CHANCE = 0.5; // 还有没收到的衣服时，一封日常来信捎来衣服的机会（衣服有 50 件了，40% 太慢）
const MIN_GAP = 2; // 两件衣服之间至少隔几封日常来信（不会连着两天都有）

const textOf = (lang) => TEXT[lang] || TEXT.en;
const fill = (text, params) => String(text).replace(/\{(\w+)\}/g, (whole, key) => (params[key] === undefined ? whole : params[key]));

/** 已经有了、或者已经在路上（寄来了还没拆）的衣服：这些不会再寄 */
function claimed(history, received) {
  const set = O.ownedSet(received);
  for (const letter of history) if (letter.outfit && O.OUTFITS[letter.outfit]) set.add(letter.outfit);
  return set;
}

/**
 * 这封日常来信捎不捎衣服、捎哪件。
 * @param rng       信自己的随机数（同一天同一台电脑结果固定）
 * @param place     这封信去的地点（地点对了更容易捡到对应的衣服，比如港口的水手服）
 * @param history   以前所有的信（从旧到新）
 * @param received  已经收到的衣服 mail.outfits
 * @returns 衣服编号，或者 null
 */
function chooseOutfit(rng, place, { history = [], received = {} } = {}) {
  // 先把要用的两个随机数都取出来：不管走哪条路，用掉的随机数一样多，别的选择就不会跟着变
  const roll = rng();
  const pickRoll = rng();
  const taken = claimed(history, received);
  const pool = O.IDS.filter((id) => !taken.has(id));
  if (!pool.length) return null; // 全都收齐了

  const daily = history.filter((l) => l.kind === 'daily');
  let lastAt = -1;
  daily.forEach((l, i) => {
    if (l.outfit) lastAt = i;
  });
  const anyBefore = lastAt >= 0 || Object.keys(received || {}).some((id) => O.OUTFITS[id] && !O.OUTFITS[id].starter);
  let chance = CHANCE;
  if (!anyBefore) chance = 1; // 还从来没寄过：这封就寄，让你早点发现衣柜
  else if (lastAt >= 0 && daily.length - lastAt < MIN_GAP) chance = 0;
  if (roll >= chance) return null;

  const weights = pool.map((id) => {
    const info = O.OUTFITS[id];
    if (info.places && info.places.includes(place.id)) return 5;
    if (info.scenes && info.scenes.includes(place.scene)) return 3;
    return 1;
  });
  let r = pickRoll * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * 一件衣服的文字。
 * place / variant：写进信里时用（"我在海边捡到了一顶渔夫帽……"）
 */
function describeOutfit(id, lang, { place = '', variant = 0 } = {}) {
  const info = O.OUTFITS[id];
  if (!info) return null;
  const T = textOf(lang);
  const item = T.items[id] || { name: id, a: id };
  const lines = T.lines[info.slot] || [''];
  const line = fill(lines[((variant % lines.length) + lines.length) % lines.length], { item: item.a, place });
  return { id, slot: info.slot, name: item.name, line, wear: T.wear[info.slot], wearing: T.wearing[info.slot] };
}

/**
 * 衣柜里显示的全部内容。没收到的衣服不透露名字（和礼物图鉴一样）。
 * @param received  mail.outfits
 * @param worn      现在穿着的 { hat, glasses, top, bag, held }
 * @param all       开发时全部解锁
 */
function wardrobeView(received, worn, lang, { all = false } = {}) {
  const T = textOf(lang);
  const owned = O.ownedSet(received, { all });
  const items = O.IDS.map((id) => {
    const info = O.OUTFITS[id];
    const have = owned.has(id);
    const rec = received && received[id];
    return {
      id,
      slot: info.slot,
      owned: have,
      name: have ? (T.items[id] || { name: id }).name : null,
      // 收到了、还一次都没穿过：衣柜里标个"新！"
      isNew: have && !info.starter && !!rec && !rec.tried,
    };
  });
  return {
    slots: O.SLOTS.map((slot) => ({ id: slot, name: T.slots[slot] })),
    items,
    worn: O.keepOwned(worn, owned),
    have: items.filter((i) => i.owned).length,
    total: items.length,
  };
}

/** 检查衣服的目录和中英文文字是否对得上。返回问题列表（空 = 没问题） */
function validateWardrobe(artIds = null) {
  const problems = [];
  for (const [lang, T] of Object.entries(TEXT)) {
    for (const slot of O.SLOTS) {
      if (!T.slots[slot] || !T.wear[slot] || !T.wearing[slot]) problems.push(`${lang}: 衣柜部位 ${slot} 缺少文字`);
      if (!Array.isArray(T.lines[slot]) || !T.lines[slot].length) problems.push(`${lang}: 部位 ${slot} 没有信里的句子`);
      else if (T.lines[slot].length !== TEXT.zh.lines[slot].length) problems.push(`${lang}: 部位 ${slot} 的句子数量和中文不一样`);
      for (const line of T.lines[slot] || []) if (!line.includes('{item}') || !line.includes('{place}')) problems.push(`${lang}: "${line}" 里缺少 {item} 或 {place}`);
    }
    for (const id of O.IDS) {
      const item = T.items[id];
      if (!item || !item.name || !item.a) problems.push(`${lang}: 衣服 ${id} 缺少名字`);
    }
    for (const id of Object.keys(T.items)) if (!O.OUTFITS[id]) problems.push(`${lang}: 文字里有目录里没有的衣服 ${id}`);
  }
  for (const slot of O.SLOTS) if (!O.IDS.some((id) => O.OUTFITS[id].slot === slot)) problems.push(`部位 ${slot} 一件衣服都没有`);
  if (artIds) {
    // 画面那边（renderer/js/pet/outfits.js）画了哪些、各是哪个部位
    for (const [id, slot] of Object.entries(artIds)) {
      if (!O.OUTFITS[id]) problems.push(`画了衣服 ${id}，但目录里没有`);
      else if (O.OUTFITS[id].slot !== slot) problems.push(`衣服 ${id}：画的是 ${slot}，目录里写的是 ${O.OUTFITS[id].slot}`);
    }
    for (const id of O.IDS) if (!artIds[id]) problems.push(`目录里有衣服 ${id}，但还没画`);
  }
  return problems;
}

module.exports = { chooseOutfit, describeOutfit, wardrobeView, validateWardrobe, TEXT, CHANCE };
