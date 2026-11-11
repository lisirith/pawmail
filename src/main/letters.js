'use strict';
// 写信。这个文件只做"纯计算"，不碰窗口、不碰硬盘，所以可以单独测试（npm run letters）。
//
// 一封信在存档里只记录"选了哪些句子"（地点、第几件小事、第几句感想……），不记录文字本身。
// 显示的时候再按当前语言把文字拼出来（renderLetter），所以切换中英文后，以前的信也会跟着变。
//
// 一封信的结构：
//   开头（去了哪儿） + 一件在那儿发生的小事 + 一句关于"你"的话（来自真实的使用情况） + （有时）一句收尾
//   + （有时）一件礼物 + 落款

const { PLACES, GIFTS } = require('../shared/letters/catalog');

const CONTENT = {
  zh: require('../shared/letters/zh.json'),
  en: require('../shared/letters/en.json'),
};
const BASE = CONTENT.zh; // "有几句可选"以中文为准（英文必须一样多，npm run letters 会检查）

const DAY_START_HOUR = 4; // 凌晨 4 点之前算作"前一天"：熬夜到 2 点，那还是今天的事
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100, 200, 365];

// ---------------------------------------------------------------- 日期

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 这个时刻属于哪一"天"（格式 2026-11-11） */
function logicalDay(now) {
  return dayOf(new Date(now - DAY_START_HOUR * 3600 * 1000));
}

function dayToDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** 从 from 到 to 隔了几天 */
function dayDiff(from, to) {
  return Math.round((dayToDate(to) - dayToDate(from)) / 86400000);
}

function addDays(day, n) {
  const d = dayToDate(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
}

// ---------------------------------------------------------------- 随机

/** 把一段文字变成一个数字，用来当随机数的种子：同一天、同一台电脑，生成的信永远一样 */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function pickWeighted(rng, entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

/** 从 0…count-1 里挑一个，尽量别挑 avoid */
function pickIndex(rng, count, avoid) {
  const options = [];
  for (let i = 0; i < count; i++) if (i !== avoid || count === 1) options.push(i);
  return pick(rng, options);
}

// ---------------------------------------------------------------- 关于"你"的那句话

/**
 * 根据昨天的真实情况，列出"可以说的话"以及各自的分量（分量越大越容易被选中）。
 * facts.y 是昨天的使用记录：{ first, last, activeMin, pets, pokes, throws, dizzies }
 */
function remarkCandidates(facts) {
  const list = [];
  const add = (key, weight, params = {}) => list.push({ key, weight, params });

  if (facts.gapDays >= 3) add('gap', 8, { days: facts.gapDays });
  if (STREAK_MILESTONES.includes(facts.streak)) add('streak', 8, { days: facts.streak });

  const y = facts.y;
  if (y) {
    const last = new Date(y.last);
    const first = new Date(y.first);
    const lastMin = last.getHours() * 60 + last.getMinutes();
    const firstMin = first.getHours() * 60 + first.getMinutes();
    if (lastMin >= 30 && lastMin < DAY_START_HOUR * 60) add('lateNight', 6, { time: y.last }); // 过了 0 点半还在
    if (firstMin >= DAY_START_HOUR * 60 && firstMin < 7 * 60) add('earlyBird', 3, { time: y.first }); // 7 点前就来了
    if (y.activeMin >= 480) add('longDay', 3, { hours: Math.round(y.activeMin / 60) });
    else if (y.activeMin > 0 && y.activeMin < 20) add('shortDay', 1.5);
    if (y.throws >= 3) add('thrown', 3.5, { count: y.throws });
    if (y.dizzies >= 1) add('dizzy', 2);
    if (y.pets >= 5) add('petted', 3, { count: y.pets });
    if (y.pokes >= 8) add('poked', 2, { count: y.pokes });
    if (!y.pets && !y.pokes && !y.throws && y.activeMin >= 90) add('ignored', 2);
  }

  if (facts.weekday === 1) add('monday', 1.5);
  else if (facts.weekday === 5) add('friday', 1.5);
  else if (facts.weekday === 0 || facts.weekday === 6) add('weekend', 1.2);

  add('generic', 1.2); // 没什么特别的可说时，就说句普通的
  return list;
}

// ---------------------------------------------------------------- 礼物

function chooseGift(rng, place, owned, { gapDays, guaranteed }) {
  // 不是每天都有礼物；离开得越久，它走得越远，带回东西的机会越大
  const chance = guaranteed ? 1 : Math.min(0.95, 0.62 + (gapDays - 1) * 0.1);
  if (rng() > chance) return null;

  const boost = Math.min(0.1, (gapDays - 1) * 0.03);
  const roll = rng();
  const rarity = roll < 0.06 + boost ? 'legendary' : roll < 0.28 + boost * 2 ? 'rare' : 'common';
  let pool = place.gifts.filter((id) => GIFTS[id] && GIFTS[id].rarity === rarity);
  if (!pool.length) pool = place.gifts.filter((id) => GIFTS[id] && GIFTS[id].rarity === 'common');
  if (!pool.length) pool = place.gifts.filter((id) => GIFTS[id]);
  if (!pool.length) return null;
  // 还没拿到过的礼物，被选中的机会是 3 倍——图鉴才会慢慢填满
  return pickWeighted(
    rng,
    pool.map((id) => ({ item: id, weight: owned && owned[id] ? 1 : 3 }))
  );
}

// ---------------------------------------------------------------- 生成

/** 第一封"见面信" */
function welcomeLetter({ day, now }) {
  return { id: day, day, at: now, kind: 'welcome', gift: 'pawprint', days: 1, opened: false };
}

/**
 * 生成某一天的来信。
 * @param day        今天（logicalDay 的格式）
 * @param now        现在的时间戳
 * @param installId  这台电脑上的随机编号（让每个人收到的信都不一样）
 * @param history    以前所有的信（从旧到新）
 * @param owned      已经拥有的礼物 { 礼物id: { count } }
 * @param usage      使用记录 { 日期: { first, last, activeMin, pets, pokes, throws, dizzies } }
 * @param lastDay    上一次见面是哪天
 * @param streak     到今天为止连续见面了多少天
 */
function generateLetter({ day, now, installId, history = [], owned = {}, usage = {}, lastDay = null, streak = 1 }) {
  const rng = makeRng(hash(`${installId}|${day}`));
  const date = dayToDate(day);
  const month = date.getMonth() + 1;
  const gapDays = lastDay ? Math.max(1, dayDiff(lastDay, day)) : 1;
  const facts = {
    gapDays,
    streak,
    weekday: date.getDay(),
    y: gapDays === 1 ? usage[addDays(day, -1)] || null : null, // 昨天确实见过面，才谈"你昨天……"
  };
  const daily = history.filter((l) => l.kind === 'daily');
  const previous = daily[daily.length - 1] || null;

  // 去哪儿：先按季节筛，再避开最近去过的 8 个地方，没去过的地方更容易被选中
  let options = PLACES.filter((p) => !p.months || p.months.includes(month));
  const recent = daily.slice(-8).map((l) => l.place);
  const fresh = options.filter((p) => !recent.includes(p.id));
  if (fresh.length) options = fresh;
  const visited = new Set(daily.map((l) => l.place));
  const place = pickWeighted(
    rng,
    options.map((p) => ({ item: p, weight: visited.has(p.id) ? 1 : 2.5 }))
  );

  // 在那儿发生的小事：没讲过的优先；都讲过了就挑最久没讲的
  const count = BASE.places[place.id].events.length;
  const told = daily.filter((l) => l.place === place.id).map((l) => l.event);
  let untold = [];
  for (let i = 0; i < count; i++) if (!told.includes(i)) untold.push(i);
  if (!untold.length) {
    let oldest = 0;
    for (let i = 1; i < count; i++) if (told.lastIndexOf(i) < told.lastIndexOf(oldest)) oldest = i;
    untold = [oldest];
  }
  const event = pick(rng, untold);

  // 开头
  const long = gapDays >= 2;
  const openers = long ? BASE.longOpeners : BASE.openers;
  const opener = pickIndex(rng, openers.length, previous && previous.long === long ? previous.opener : -1);

  // 关于"你"的那句话：尽量不和上一封说同一类
  const chosen = pickWeighted(
    rng,
    remarkCandidates(facts).map((c) => ({
      item: c,
      weight: previous && previous.remark && previous.remark.key === c.key ? c.weight * 0.2 : c.weight,
    }))
  );
  const lastSame = [...daily].reverse().find((l) => l.remark && l.remark.key === chosen.key);
  const remark = {
    key: chosen.key,
    variant: pickIndex(rng, BASE.remarks[chosen.key].length, lastSame ? lastSame.remark.variant : -1),
    params: chosen.params,
  };

  // 收尾：大约一半的信有
  const closer = rng() < 0.55 ? pickIndex(rng, BASE.closers.length, previous ? previous.closer : -1) : -1;

  // 礼物：收到的第一封日常来信一定有（第一印象）
  const gift = chooseGift(rng, place, owned, { gapDays, guaranteed: daily.length === 0 });
  const noGift = !gift && rng() < 0.45 ? Math.floor(rng() * BASE.noGift.length) : -1;

  return {
    id: day,
    day,
    at: now,
    kind: 'daily',
    place: place.id,
    event,
    long,
    opener,
    remark,
    closer,
    gift: gift || null,
    noGift,
    days: gapDays,
    opened: false,
  };
}

// ---------------------------------------------------------------- 把信变成文字

const at = (list, i) => (list && list.length ? list[((i % list.length) + list.length) % list.length] : '');
const fill = (text, params) => String(text).replace(/\{(\w+)\}/g, (whole, key) => (params[key] === undefined ? whole : params[key]));

function formatTime(lang, ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  if (lang === 'zh') {
    const period = h < 5 ? '凌晨' : h < 9 ? '早上' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上';
    return `${period} ${h > 12 ? h - 12 : h} 点${m ? ` ${m} 分` : ''}`;
  }
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(lang, day) {
  const C = CONTENT[lang] || CONTENT.en;
  const d = dayToDate(day);
  const weekday = C.weekdays[d.getDay()];
  if (lang === 'zh') return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekday}`;
  return `${weekday}, ${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
}

function describeGift(id, lang) {
  const C = CONTENT[lang] || CONTENT.en;
  const g = GIFTS[id];
  if (!g) return null;
  const name = C.giftNames[id] || id;
  return { id, emoji: g.emoji, rarity: g.rarity, rarityLabel: C.rarity[g.rarity], name, line: fill(C.giftLine, { gift: name }) };
}

/**
 * 把一封信变成可以直接显示的文字。
 * @returns { id, day, kind, opened, scene, title, dateText, lines, gift, sign }
 */
function renderLetter(letter, lang, { name, species } = {}) {
  const C = CONTENT[lang] || CONTENT.en;
  const snack = C.snack[species] || C.snack.cat;
  const lines = [];
  let title;
  let scene;

  if (letter.kind === 'welcome') {
    title = C.welcome.place;
    scene = 'home';
    lines.push(...C.welcome.lines);
  } else {
    const placeInfo = PLACES.find((p) => p.id === letter.place) || PLACES[0];
    const P = C.places[placeInfo.id];
    title = P.name;
    scene = placeInfo.scene;
    lines.push(fill(at(letter.long ? C.longOpeners : C.openers, letter.opener), { place: P.name, days: letter.days }));
    lines.push(at(P.events, letter.event));
    if (letter.remark && C.remarks[letter.remark.key]) {
      const params = { ...letter.remark.params };
      if (params.time !== undefined) params.time = formatTime(lang, params.time);
      lines.push(fill(at(C.remarks[letter.remark.key], letter.remark.variant), params));
    }
    if (letter.noGift >= 0) lines.push(at(C.noGift, letter.noGift));
    if (letter.closer >= 0) lines.push(fill(at(C.closers, letter.closer), { snack }));
  }

  return {
    id: letter.id,
    day: letter.day,
    kind: letter.kind,
    opened: !!letter.opened,
    scene,
    place: letter.kind === 'welcome' ? 'home' : letter.place,
    title,
    dateText: formatDate(lang, letter.day),
    lines,
    gift: letter.gift ? describeGift(letter.gift, lang) : null,
    sign: fill(C.sign, { name: name || C.defaultName }),
  };
}

/** 礼物图鉴：按目录顺序列出所有礼物；没拿到的不透露名字 */
function album(owned, lang) {
  return Object.keys(GIFTS).map((id) => {
    const info = describeGift(id, lang);
    const have = owned && owned[id] ? owned[id].count || 1 : 0;
    return { id, emoji: have ? info.emoji : null, rarity: info.rarity, rarityLabel: info.rarityLabel, name: have ? info.name : null, count: have };
  });
}

/** 检查中英文内容有没有缺漏、数量对不对得上。返回问题列表（空 = 没问题）。 */
function validateContent() {
  const problems = [];
  const zh = CONTENT.zh;
  const en = CONTENT.en;
  const same = (label, a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) problems.push(`${label}: 中英文的句子数量不一样`);
  };
  same('openers', zh.openers, en.openers);
  same('longOpeners', zh.longOpeners, en.longOpeners);
  same('closers', zh.closers, en.closers);
  same('noGift', zh.noGift, en.noGift);
  for (const key of Object.keys(zh.remarks)) same(`remarks.${key}`, zh.remarks[key], (en.remarks || {})[key]);
  for (const place of PLACES) {
    for (const [lang, C] of Object.entries(CONTENT)) {
      if (!C.places[place.id]) problems.push(`${lang}: 缺少地点 ${place.id} 的文字`);
    }
    if (zh.places[place.id] && en.places[place.id]) same(`places.${place.id}.events`, zh.places[place.id].events, en.places[place.id].events);
    for (const gift of place.gifts) if (!GIFTS[gift]) problems.push(`地点 ${place.id} 里有不存在的礼物 ${gift}`);
  }
  for (const id of Object.keys(GIFTS)) {
    for (const [lang, C] of Object.entries(CONTENT)) if (!C.giftNames[id]) problems.push(`${lang}: 礼物 ${id} 没有名字`);
    if (!GIFTS[id].special && !PLACES.some((p) => p.gifts.includes(id))) problems.push(`礼物 ${id} 在任何地点都捡不到`);
  }
  return problems;
}

module.exports = {
  logicalDay,
  dayDiff,
  addDays,
  generateLetter,
  welcomeLetter,
  renderLetter,
  album,
  validateContent,
  PLACES,
  GIFTS,
};
