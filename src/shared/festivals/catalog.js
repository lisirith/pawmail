'use strict';
// 节日目录：有哪些"节日组"、每个节日哪天、那天它穿什么、送什么、照片拍在哪儿。
// 文字（节日名字、节日来信）在同一个文件夹的 zh.json / en.json 里。
//
// 想加一种文化（比如日本、韩国）：
//   1. 在 GROUPS 里加一组，列出它的节日
//   2. 在 FESTIVALS 里给每个节日写上日期规则、装扮、礼物
//   3. 在 zh.json / en.json 里写上组名、节日名、节日来信；礼物名字写在 ../letters/zh.json、en.json 的 giftNames
//   4. 运行 npm run letters 检查有没有缺漏

const DATES = require('./dates.json'); // 中国传统节日的官方日期（香港天文台），由 tools/build-festival-dates.js 生成

/** 节日组：用户可以多选。所有人都有的节日（元旦、生日、认识纪念日）不在这里 */
const GROUPS = [
  { id: 'chinese', emoji: '🏮', festivals: ['chuxi', 'springFestival', 'lantern', 'qingming', 'dragonBoat', 'qixi', 'midAutumn', 'winterSolstice'] },
  { id: 'cnPublic', emoji: '🎆', festivals: ['labourDay', 'nationalDay'] },
  { id: 'western', emoji: '🎄', festivals: ['valentine', 'easter', 'halloween', 'christmas'] },
  { id: 'us', emoji: '🦃', festivals: ['independence', 'thanksgiving'] },
];
const GROUP_IDS = GROUPS.map((g) => g.id);
const UNIVERSAL = ['newYear', 'birthday', 'anniversary'];

/**
 * 每个节日：
 *   date      日期规则：{ fixed: [月, 日] } | { lunar: 表里的名字 } | { easter: true } | { nthWeekday: [月, 星期几(0=周日), 第几个] }
 *             | 'birthday'（你的生日）| 'anniversary'（认识纪念日）
 *   priority  同一天碰上两个节日时，数字大的那个算数
 *   look      那天的装扮（见 renderer/js/pet/looks.js）；写成数组 = 每年随机挑一种，节日来信也跟着挑对应的那一封
 *   gift      节日限定礼物（只有那天的信里有）
 *   scene     信里照片的背景 [风景, 地点]
 *   greet     那天第一次见到你时的动作：bow 拜年 | cheer 欢呼 | gaze 抬头看天 | boo 吓你一下
 */
const FESTIVALS = {
  newYear: { date: { fixed: [1, 1] }, priority: 60, look: 'party', gift: 'partyPopper', scene: ['night', 'rooftop'], greet: 'cheer' },
  birthday: { date: 'birthday', priority: 100, look: 'birthday', gift: 'birthdayCake', scene: ['home', 'home'], greet: 'cheer' },
  anniversary: { date: 'anniversary', priority: 70, look: 'party', gift: 'memoryAlbum', scene: ['home', 'home'], greet: 'cheer' },

  chuxi: { date: { lunar: 'chuxi' }, priority: 85, look: 'springFestival', gift: 'firecracker', scene: ['night', 'nightMarket'], greet: 'bow' },
  springFestival: { date: { lunar: 'springFestival' }, priority: 90, look: 'springFestival', gift: 'redEnvelope', scene: ['night', 'nightMarket'], greet: 'bow' },
  lantern: { date: { lunar: 'lantern' }, priority: 80, look: 'lantern', gift: 'tangyuan', scene: ['night', 'nightMarket'], greet: 'cheer' },
  // 清明是怀念亲人的日子：插柳、踏青，安安静静的，不扮鬼
  qingming: { date: { lunar: 'qingming' }, priority: 75, look: 'willow', gift: 'willowSprig', scene: ['mountain', 'hill'], greet: 'gaze' },
  dragonBoat: { date: { lunar: 'dragonBoat' }, priority: 80, look: 'sachet', gift: 'zongzi', scene: ['mountain', 'riverside'], greet: 'cheer' },
  qixi: { date: { lunar: 'qixi' }, priority: 65, look: null, gift: 'magpieFeather', scene: ['night', 'observatory'], greet: 'gaze' },
  midAutumn: { date: { lunar: 'midAutumn' }, priority: 85, look: 'mooncake', gift: 'mooncake', scene: ['night', 'rooftop'], greet: 'gaze' },
  winterSolstice: { date: { lunar: 'winterSolstice' }, priority: 70, look: 'bowl', gift: 'dumplings', scene: ['snow', 'snowfield'], greet: 'cheer' },

  labourDay: { date: { fixed: [5, 1] }, priority: 55, look: null, gift: 'medal', scene: ['city', 'park'], greet: 'cheer' },
  nationalDay: { date: { fixed: [10, 1] }, priority: 55, look: null, gift: 'travelPhoto', scene: ['city', 'trainStation'], greet: 'cheer' },

  valentine: { date: { fixed: [2, 14] }, priority: 60, look: 'heart', gift: 'chocolate', scene: ['city', 'park'], greet: 'cheer' },
  easter: { date: { easter: true }, priority: 65, look: 'bunny', gift: 'easterEgg', scene: ['mountain', 'flowerField'], greet: 'cheer' },
  halloween: { date: { fixed: [10, 31] }, priority: 80, look: ['ghost', 'pumpkin'], gift: 'pumpkinCandy', scene: ['night', 'rooftop'], greet: 'boo' },
  christmas: { date: { fixed: [12, 25] }, priority: 90, look: 'santa', gift: 'presentBox', scene: ['snow', 'snowfield'], greet: 'cheer' },

  independence: { date: { fixed: [7, 4] }, priority: 60, look: 'sparkler', gift: 'sparkler', scene: ['night', 'rooftop'], greet: 'cheer' },
  thanksgiving: { date: { nthWeekday: [11, 4, 4] }, priority: 75, look: 'autumn', gift: 'pie', scene: ['forest', 'mapleValley'], greet: 'cheer' },
};

// ---------------------------------------------------------------- 日期

/** 复活节（西方教会）：每年春分后第一个满月之后的星期日。用的是通行的"匿名格里高利算法" */
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** 某年某月的第 n 个星期几（比如感恩节：11 月的第 4 个星期四） */
function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month - 1, 1).getDay();
  return [month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7];
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** 2 月 29 日出生的人，平年在 2 月 28 日过 */
const fixFeb29 = (year, m, d) => (m === 2 && d === 29 && !isLeap(year) ? [2, 28] : [m, d]);

/**
 * 某个节日在某一年是几月几号。返回 [月, 日]；这一年没有（比如超出了农历表的范围、还没填生日）就返回 null。
 * profile：{ birthday: 'MM-DD' | null, metDay: 'YYYY-MM-DD' | null }
 */
function dateOf(id, year, profile = {}) {
  const rule = FESTIVALS[id] && FESTIVALS[id].date;
  if (!rule) return null;
  if (rule === 'birthday') {
    if (!/^\d{2}-\d{2}$/.test(profile.birthday || '')) return null;
    const [m, d] = profile.birthday.split('-').map(Number);
    return fixFeb29(year, m, d);
  }
  if (rule === 'anniversary') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.metDay || '')) return null;
    const [y, m, d] = profile.metDay.split('-').map(Number);
    return year > y ? fixFeb29(year, m, d) : null; // 认识满一年才算
  }
  if (rule.fixed) return rule.fixed;
  if (rule.easter) return easterDate(year);
  if (rule.nthWeekday) return nthWeekday(year, ...rule.nthWeekday);
  if (rule.lunar) {
    const table = DATES.years[year];
    return table && table[rule.lunar] ? table[rule.lunar].split('-').map(Number) : null;
  }
  return null;
}

// ---------------------------------------------------------------- 你过哪些节日

/** 还没问过你的时候，先按语言猜一个：中文 → 中华传统节日，英文 → 西方节日 */
function defaultCultures(lang) {
  return lang === 'zh' ? ['chinese'] : ['western'];
}

function sanitizeCultures(list) {
  if (!Array.isArray(list)) return null;
  return GROUP_IDS.filter((id) => list.includes(id));
}

/** 这个人会过的所有节日（所有人都有的那几个 + 选中的组） */
function activeFestivals(cultures) {
  const ids = [...UNIVERSAL];
  for (const group of GROUPS) if (cultures.includes(group.id)) ids.push(...group.festivals);
  return ids;
}

/**
 * 这一天（格式 2026-10-31）是什么节日？返回节日的 id，不是节日就返回 null。同一天有好几个节日时，取最重要的那个。
 * profile：{ birthday, metDay, cultures }
 */
function festivalOn(day, profile = {}) {
  const [y, m, d] = day.split('-').map(Number);
  let best = null;
  for (const id of activeFestivals(profile.cultures || [])) {
    const date = dateOf(id, y, profile);
    if (date && date[0] === m && date[1] === d && (!best || FESTIVALS[id].priority > FESTIVALS[best].priority)) best = id;
  }
  return best;
}

/** 从这天往后（含这天）最近的一个节日：{ id, day } */
function nextFestival(day, profile = {}) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d, 12);
  for (let i = 0; i < 400; i++) {
    const current = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const id = festivalOn(current, profile);
    if (id) return { id, day: current };
    t.setDate(t.getDate() + 1);
  }
  return null;
}

/** 有几种装扮可选的节日（万圣节），按年份和这台电脑挑一种；返回 { look, variant }。variant 用来挑对应的那封节日信 */
function lookFor(id, year, seed = 0) {
  const look = FESTIVALS[id] && FESTIVALS[id].look;
  if (!Array.isArray(look)) return { look: look || null, variant: null };
  const index = Math.abs((year * 31 + seed) % look.length);
  return { look: look[index], variant: index };
}

module.exports = {
  GROUPS,
  GROUP_IDS,
  UNIVERSAL,
  FESTIVALS,
  DATE_RANGE: DATES.range,
  dateOf,
  easterDate,
  defaultCultures,
  sanitizeCultures,
  activeFestivals,
  festivalOn,
  nextFestival,
  lookFor,
};
