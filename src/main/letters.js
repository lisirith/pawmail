'use strict';
// 写信。这个文件只做"纯计算"，不碰窗口、不碰硬盘，所以可以单独测试（npm run letters）。
//
// 一封信在存档里只记录"选了哪些句子"（地点、第几件小事、第几句感想……），不记录文字本身。
// 显示的时候再按当前语言把文字拼出来（renderLetter），所以切换中英文后，以前的信也会跟着变。
//
// 一封信的结构：
//   开头（去了哪儿） + 一件在那儿发生的小事 + 一句关于"你"的话（来自真实的使用情况） + （有时）一句收尾
//   + （有时）一件礼物 + 落款
//
// 除了每天的信，每月 1 号还有一封"月报"，1 月 1 日那封换成"年度回顾"（见下面的"月报和年度回顾"一节）。

const { PLACES, GIFTS } = require('../shared/letters/catalog');

const CONTENT = {
  zh: require('../shared/letters/zh.json'),
  en: require('../shared/letters/en.json'),
};
const BASE = CONTENT.zh; // "有几句可选"以中文为准（英文必须一样多，npm run letters 会检查）

const DAY_START_HOUR = 4; // 凌晨 4 点之前算作"前一天"：熬夜到 2 点，那还是今天的事
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100, 200, 365];
const MAX_LETTERS = 800; // 信箱最多留多少封，超过了就删最老的。一封信只占约 0.3 KB，800 封（两年多）约 270 KB
const MIN_MONTH_DAYS = 3; // 这个月一起不到 3 天，就不发月报（数据太少，写出来很空）
const MIN_YEAR_DAYS = 7; // 这一年一起不到 7 天，就不发年度回顾
const MONTHS_KEPT = 36; // "每月小结"留最近 36 个月（年度回顾要用）
/** 信的编号：每天的信用日期（2026-11-11），月报是 m-2026-11，年度回顾是 y-2026 */
const LETTER_ID = /^(\d{4}-\d{2}-\d{2}|m-\d{4}-\d{2}|y-\d{4})$/;

// ---------------------------------------------------------------- 日期

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (day) => day.slice(0, 7);

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

/** 这一"天"从什么时候开始（那天凌晨 4 点） */
function dayStartMs(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, DAY_START_HOUR).getTime();
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

// ---------------------------------------------------------------- 月报和年度回顾
//
// 每次跨进新的一个月，先把上个月"总结"成一份小结（只有数字和编号，很小），存在 mail.monthly 里。
// 月报直接用这份小结来写；年度回顾用这一年的 12 份小结来写。
// 小结是在月初那一刻算好存下来的，所以之后就算你删了旧信，月报和年度回顾的内容也不会变。

const RARITY_RANK = { legendary: 0, rare: 1, common: 2 };
const LATE_AFTER = (24 + 0.5 - DAY_START_HOUR) * 3600 * 1000; // 过了凌晨 0 点半还在用电脑，就算"熬夜"

/** 把某个月（格式 2026-11）总结成一份小结 */
function summarizeMonth(month, { letters = [], usage = {}, gifts = {} } = {}) {
  const inMonth = (day) => typeof day === 'string' && monthOf(day) === month;
  const start = `${month}-01`;
  const end = `${month}-31`; // 按字符串比较时，任何一个月的最后一天都 ≤ "xx-31"

  // 一起度过的日子：那天用过电脑，或者那天收到了信
  const daySet = new Set();
  let activeMin = 0;
  let pets = 0;
  let pokes = 0;
  let throws = 0;
  let latest = null;
  let lateness = null; // 最晚那次距离那天凌晨 4 点过了多久（毫秒），用来比较哪天睡得最晚
  for (const [day, rec] of Object.entries(usage)) {
    if (!inMonth(day) || !rec) continue;
    daySet.add(day);
    activeMin += rec.activeMin || 0;
    pets += rec.pets || 0;
    pokes += rec.pokes || 0;
    throws += rec.throws || 0;
    const late = rec.last - dayStartMs(day);
    if (rec.activeMin > 0 && (lateness === null || late > lateness)) {
      lateness = late;
      latest = rec.last;
    }
  }
  for (const l of letters) if (inMonth(l.day) && (l.kind === 'daily' || l.kind === 'welcome')) daySet.add(l.day);

  // 最长连续几天
  let streak = 0;
  let run = 0;
  let prev = null;
  for (const day of [...daySet].sort()) {
    run = prev && dayDiff(prev, day) === 1 ? run + 1 : 1;
    streak = Math.max(streak, run);
    prev = day;
  }

  // 去过的地方、带回的礼物
  const seenBefore = new Set(letters.filter((l) => l.kind === 'daily' && l.day < start).map((l) => l.place));
  const places = {};
  const newPlaces = [];
  const giftCount = { common: 0, rare: 0, legendary: 0 };
  const highlights = [];
  for (const l of letters) {
    if (l.kind !== 'daily' || !inMonth(l.day)) continue;
    places[l.place] = (places[l.place] || 0) + 1;
    if (!seenBefore.has(l.place) && !newPlaces.includes(l.place)) newPlaces.push(l.place);
    const g = l.gift && GIFTS[l.gift];
    if (g) {
      giftCount[g.rarity] += 1;
      if (g.rarity !== 'common' && !highlights.includes(l.gift)) highlights.push(l.gift);
    }
  }
  highlights.sort((a, b) => RARITY_RANK[GIFTS[a].rarity] - RARITY_RANK[GIFTS[b].rarity]);

  // 图鉴：这个月之前有几件、到月底有几件（按礼物第一次到手的那天算）
  let albumBefore = 0;
  let albumAfter = 0;
  for (const rec of Object.values(gifts)) {
    if (!rec || !rec.firstDay) continue;
    if (rec.firstDay < start) albumBefore += 1;
    if (rec.firstDay <= end) albumAfter += 1;
  }

  return {
    days: daySet.size,
    streak,
    places,
    newPlaces,
    gifts: giftCount,
    highlights,
    albumBefore,
    albumAfter,
    pets,
    pokes,
    throws,
    activeMin,
    latest,
    lateness,
    latestLate: lateness !== null && lateness >= LATE_AFTER,
  };
}

/** 把一年的几份月小结合成一份 */
function combineSummaries(summaries) {
  const out = {
    days: 0,
    streak: 0,
    places: {},
    newPlaces: [],
    gifts: { common: 0, rare: 0, legendary: 0 },
    highlights: [],
    albumBefore: 0,
    albumAfter: 0,
    pets: 0,
    pokes: 0,
    throws: 0,
    activeMin: 0,
    latest: null,
    lateness: null,
    latestLate: false,
  };
  for (const s of summaries) {
    out.days += s.days;
    out.streak = Math.max(out.streak, s.streak);
    for (const [id, n] of Object.entries(s.places)) out.places[id] = (out.places[id] || 0) + n;
    for (const r of Object.keys(out.gifts)) out.gifts[r] += s.gifts[r] || 0;
    for (const id of s.highlights) if (!out.highlights.includes(id)) out.highlights.push(id);
    out.albumAfter = Math.max(out.albumAfter, s.albumAfter);
    out.pets += s.pets;
    out.pokes += s.pokes;
    out.throws += s.throws;
    out.activeMin += s.activeMin;
    if (s.lateness !== null && (out.lateness === null || s.lateness > out.lateness)) {
      out.lateness = s.lateness;
      out.latest = s.latest;
      out.latestLate = s.latestLate;
    }
  }
  out.highlights = out.highlights.filter((id) => GIFTS[id]).sort((a, b) => RARITY_RANK[GIFTS[a].rarity] - RARITY_RANK[GIFTS[b].rarity]);
  return out;
}

function monthlyReport(month, summary, { day, now, installId }) {
  const rng = makeRng(hash(`${installId}|report|${month}`));
  return {
    id: `m-${month}`,
    day,
    at: now,
    kind: 'monthly',
    period: month,
    summary,
    ending: Math.floor(rng() * BASE.report.monthEndings.length),
    opened: false,
  };
}

function yearlyReview(year, summaries, { day, now, installId }) {
  const summary = combineSummaries(summaries);
  if (summary.days < MIN_YEAR_DAYS) return null;
  const rng = makeRng(hash(`${installId}|review|${year}`));
  return {
    id: `y-${year}`,
    day,
    at: now,
    kind: 'yearly',
    period: year,
    summary,
    ending: Math.floor(rng() * BASE.report.yearEndings.length),
    opened: false,
  };
}

/**
 * 新的一天到了（或者第一次运行）：决定要来哪些信，放进信箱。
 * 会直接修改 mail（存档里的"邮局"部分）。返回这次新来的信（可能是 0、1 或 2 封）。
 *
 * mail 的样子：{ installId, letters, gifts, lastDay, streak, bestStreak, welcomed, monthly }
 */
function advanceDay(mail, { day, now, usage = {} }) {
  const added = [];
  const push = (letter) => {
    mail.letters.push(letter);
    added.push(letter);
  };

  // 第一次运行：见面信。用 welcomed 记住"已经见过面了"，这样就算你把见面信删了，它也不会再寄一次
  if (!mail.welcomed) {
    push(welcomeLetter({ day, now }));
    mail.welcomed = true;
    mail.lastDay = day;
    mail.streak = 1;
    mail.bestStreak = Math.max(mail.bestStreak || 0, 1);
    return added;
  }
  if (mail.lastDay === day) return added;
  const lastDay = mail.lastDay;
  const gap = lastDay ? dayDiff(lastDay, day) : 1;
  if (gap <= 0) return added; // 电脑的日期被往回调了：等日子追上来再说

  mail.streak = gap === 1 ? (mail.streak || 0) + 1 : 1;
  mail.bestStreak = Math.max(mail.bestStreak || 0, mail.streak);
  push(generateLetter({ day, now, installId: mail.installId, history: mail.letters, owned: mail.gifts, usage, lastDay, streak: mail.streak }));

  // 跨进了新的一个月：给上个月写一份小结；够条件的话再寄一封月报（跨年的话换成年度回顾）。
  // 报告放在当天的信后面，所以拆信时会先看到它
  if (lastDay && monthOf(lastDay) !== monthOf(day)) {
    const month = monthOf(lastDay);
    const summary = summarizeMonth(month, { letters: mail.letters, usage, gifts: mail.gifts });
    mail.monthly[month] = summary;
    const kept = Object.keys(mail.monthly).sort();
    while (kept.length > MONTHS_KEPT) delete mail.monthly[kept.shift()];

    const existing = new Set(mail.letters.map((l) => l.id));
    const context = { day, now, installId: mail.installId };
    const year = month.slice(0, 4);
    if (year !== day.slice(0, 4)) {
      const months = Object.keys(mail.monthly)
        .filter((key) => key.startsWith(`${year}-`))
        .sort()
        .map((key) => mail.monthly[key]);
      const review = yearlyReview(year, months, context);
      if (review && !existing.has(review.id)) push(review);
    } else if (summary.days >= MIN_MONTH_DAYS && !existing.has(`m-${month}`)) {
      push(monthlyReport(month, summary, context));
    }
  }

  mail.lastDay = day;
  if (mail.letters.length > MAX_LETTERS) mail.letters.splice(0, mail.letters.length - MAX_LETTERS);
  return added;
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

const MONTHS_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (lang, m) => (lang === 'zh' ? `${m} 月` : MONTHS_EN_LONG[m - 1]);

/** 某个时刻是几月几号（按日历，不按"凌晨 4 点为界"）：11 月 18 日 / Nov 18 */
function formatShortDate(lang, ms) {
  const d = new Date(ms);
  return lang === 'zh' ? `${d.getMonth() + 1} 月 ${d.getDate()} 日` : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
}

/**
 * 把月报 / 年度回顾写成文字，外加几个"数据格子"（stats）。
 * 每一句都按数据挑合适的说法：比如一次都没熬夜就夸你，熬夜了就提醒你。
 */
function renderReport(letter, lang, C) {
  const R = C.report;
  const S = letter.summary;
  const yearly = letter.kind === 'yearly';
  const lines = [];
  const stats = [];
  const stat = (key, n, emoji) => stats.push({ key, emoji, value: fill(R.units[key], { n }), label: R.stats[key] });
  const month = yearly ? 0 : Number(letter.period.slice(5, 7));

  const title = yearly ? fill(R.yearTitle, { year: letter.period }) : fill(R.monthTitle, { month: lang === 'zh' ? month : MONTHS_EN_LONG[month - 1], year: letter.period.slice(0, 4) });

  // 一起过了几天
  if (yearly) lines.push(fill(R.yearDays, { days: S.days, streak: S.streak }));
  else lines.push(fill(S.streak >= 3 ? R.monthDaysStreak : R.monthDays, { days: S.days, streak: S.streak }));
  stat('days', S.days, '📅');
  if (S.streak >= 2) stat('streak', S.streak, '🔥');

  // 去了哪些地方
  const visited = Object.entries(S.places)
    .filter(([id]) => C.places[id])
    .sort((a, b) => b[1] - a[1]);
  if (visited.length === 1) {
    lines.push(fill(R.placesFew, { places: C.places[visited[0][0]].name }));
  } else if (visited.length > 1) {
    if (visited[0][1] === 1) lines.push(fill(R.placesAllOnce, { count: visited.length }));
    else lines.push(fill(R.places, { count: visited.length, place: C.places[visited[0][0]].name, times: visited[0][1] }));
    const fresh = S.newPlaces.filter((id) => C.places[id]);
    if (!yearly && fresh.length >= 1 && fresh.length <= 3 && fresh.length < visited.length) {
      lines.push(fill(R.newPlaces, { places: fresh.map((id) => C.places[id].name).join(R.joiner) }));
    }
  }
  if (visited.length) stat('places', visited.length, '🗺️');

  // 带回的礼物
  const giftTotal = S.gifts.common + S.gifts.rare + S.gifts.legendary;
  const best = S.highlights.find((id) => GIFTS[id] && C.giftNames[id]);
  if (giftTotal && best) lines.push(fill(R.giftsHighlight, { count: giftTotal, gift: C.giftNames[best], emoji: GIFTS[best].emoji }));
  else if (giftTotal) lines.push(fill(R.gifts, { count: giftTotal }));
  else if (!yearly) lines.push(R.noGifts);
  if (giftTotal) stat('gifts', giftTotal, '🎁');
  if (yearly && S.albumAfter) lines.push(fill(R.albumYear, { after: S.albumAfter, total: Object.keys(GIFTS).length }));
  else if (!yearly && S.albumAfter > S.albumBefore) lines.push(fill(S.albumBefore ? R.album : R.albumFirst, { before: S.albumBefore, after: S.albumAfter }));

  // 你对它做了什么
  if (S.pets > 0) lines.push(fill(S.throws >= 3 ? R.petsThrows : R.pets, { pets: S.pets, throws: S.throws }));
  else if (!yearly) lines.push(R.noPets);
  if (S.pets > 0) stat('pets', S.pets, '✋');

  // 一起在电脑前待了多久
  const hours = Math.round(S.activeMin / 60);
  if (hours >= 1) {
    lines.push(fill(R.hours, { hours }));
    stat('hours', hours, '⏰');
  }

  // 最晚的一次
  if (S.latest) {
    const time = formatTime(lang, S.latest);
    const date = formatShortDate(lang, S.latest);
    if (yearly) lines.push(fill(R.lateYear, { date, time }));
    else if (S.latestLate) lines.push(fill(R.lateBad, { date, time, next: monthName(lang, (month % 12) + 1) }));
    else lines.push(fill(R.lateGood, { time }));
  }

  lines.push(at(yearly ? R.yearEndings : R.monthEndings, letter.ending));

  // 照片：月报用这个月最常去的地方；年度回顾用挂着灯笼的夜市，热闹一点
  let scene = 'home';
  let place = 'home';
  if (yearly) {
    scene = 'night';
    place = 'nightMarket';
  } else if (visited.length) {
    const info = PLACES.find((p) => p.id === visited[0][0]);
    scene = info.scene;
    place = info.id;
  }
  return { title, scene, place, lines, stats };
}

/**
 * 把一封信变成可以直接显示的文字。
 * @returns { id, day, kind, opened, scene, place, title, dateText, lines, gift, stats, sign }
 */
function renderLetter(letter, lang, { name, species } = {}) {
  const C = CONTENT[lang] || CONTENT.en;
  const snack = C.snack[species] || C.snack.cat;
  const lines = [];
  let title;
  let scene;
  let place = letter.kind === 'welcome' ? 'home' : letter.place;
  let stats = null;

  if (letter.kind === 'monthly' || letter.kind === 'yearly') {
    const report = renderReport(letter, lang, C);
    title = report.title;
    scene = report.scene;
    place = report.place;
    stats = report.stats;
    lines.push(...report.lines);
  } else if (letter.kind === 'welcome') {
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
    place,
    title,
    dateText: formatDate(lang, letter.day),
    lines,
    stats,
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
  // 月报和年度回顾的句子
  const REPORT_TEXT = ['monthTitle', 'yearTitle', 'monthDays', 'monthDaysStreak', 'yearDays', 'places', 'placesFew', 'placesAllOnce', 'newPlaces', 'joiner', 'gifts', 'giftsHighlight', 'noGifts', 'album', 'albumFirst', 'albumYear', 'pets', 'petsThrows', 'noPets', 'hours', 'lateBad', 'lateGood', 'lateYear'];
  const STAT_KEYS = ['days', 'streak', 'places', 'gifts', 'pets', 'hours'];
  for (const [lang, C] of Object.entries(CONTENT)) {
    const R = C.report || {};
    for (const key of REPORT_TEXT) if (typeof R[key] !== 'string') problems.push(`${lang}: 缺少 report.${key}`);
    for (const key of STAT_KEYS) {
      if (!R.stats || typeof R.stats[key] !== 'string') problems.push(`${lang}: 缺少 report.stats.${key}`);
      if (!R.units || typeof R.units[key] !== 'string') problems.push(`${lang}: 缺少 report.units.${key}`);
    }
  }
  same('report.monthEndings', (zh.report || {}).monthEndings, (en.report || {}).monthEndings);
  same('report.yearEndings', (zh.report || {}).yearEndings, (en.report || {}).yearEndings);
  return problems;
}

module.exports = {
  logicalDay,
  dayDiff,
  addDays,
  generateLetter,
  welcomeLetter,
  advanceDay,
  summarizeMonth,
  renderLetter,
  album,
  validateContent,
  PLACES,
  GIFTS,
  MAX_LETTERS,
  LETTER_ID,
};
