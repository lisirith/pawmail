'use strict';
// 存档：把设置、宠物的状态、收到的信和礼物保存成一个 JSON 文件。
// 文件位置：%APPDATA%\Pawmail\save.json（只在你自己的电脑上，不会上传到任何地方）。
//
// 读存档时，每一项都会检查一遍类型和范围（下面那些 sanitize 开头的函数）。
// 这样就算文件被手动改坏了、或者是旧版本留下的，程序也不会因此出错。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MAX_LETTERS } = require('./letters');
const F = require('../shared/festivals/catalog');
const O = require('../shared/outfits/catalog');
const { sanitizeTodos } = require('./todos');

const SCALES = [0.8, 1, 1.3];
const LANGUAGES = ['zh', 'en'];
const SPECIES = ['cat', 'panda', 'capybara', 'shiba', 'redpanda']; // 和画面那边 species/index.js 的 SPECIES 一致
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const YEAR = /^\d{4}$/;
const NAME_ID = /^[A-Za-z]{1,32}$/; // 地点、礼物的编号

const DEFAULT_SETTINGS = Object.freeze({
  species: 'cat',
  catCoat: 'tabby', // 猫的花色，切换动物时也保留选择。
  displayMode: 'top', // top 始终在最前面 | desktop 只待在桌面上
  scale: 1,
  language: null, // null = 跟随系统语言
  firstRunDone: false,
  petName: null, // 你给它起的名字（信的落款）
  autoStart: false, // 开机自动启动
  birthday: null, // 你的生日 'MM-DD'（不问年份）
  cultures: null, // 你过哪些节日组（见 shared/festivals/catalog.js 的 GROUPS）；null = 还没告诉它，先按语言猜
  profileAsked: false, // 有没有问过你生日和节日（问过一次就不再追问，之后可以在信纸窗口里改）
  area: null, // 活动范围 { x, y, w, h }，都是占整个窗口的比例（0~1）；null = 整个屏幕
  fedBefore: false, // 有没有喂它吃过文件（第一次吃的时候，它会解释"其实是放进了回收站"）
  outfit: O.EMPTY, // 现在穿着的衣服 { hat, glasses, top, bag, held }，每个部位是衣服编号或 null（见 shared/outfits/catalog.js）
  hideOnFullscreen: true, // 有全屏的程序在最前面（打游戏、全屏看视频）时，宠物先躲起来
  feedHints: 0, // 提醒过几次"不要的文件可以拖给我吃"（最多 3 次；喂过一次就不再提醒）
  windowPerch: true, // 可以站到别的窗口顶上（只在"始终在最前面"模式下有用）
});

/** 活动范围：四个 0~1 之间的数字，方框不能超出窗口，也不能小得离谱 */
function isValidArea(v) {
  if (v === null) return true;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== 4 || !['x', 'y', 'w', 'h'].every((k) => keys.includes(k) && Number.isFinite(v[k]))) return false;
  return v.x >= 0 && v.y >= 0 && v.w >= 0.03 && v.h >= 0.03 && v.x + v.w <= 1.0001 && v.y + v.h <= 1.0001;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isValidBirthday(v) {
  if (v === null) return true;
  const m = /^(\d{2})-(\d{2})$/.exec(typeof v === 'string' ? v : '');
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

// 每一项设置允许的取值。画面发来的任何修改都要先过这一关。
const VALID = {
  species: (v) => SPECIES.includes(v),
  catCoat: (v) => v === 'tabby' || v === 'lucky',
  displayMode: (v) => v === 'top' || v === 'desktop',
  scale: (v) => SCALES.includes(v),
  language: (v) => v === null || LANGUAGES.includes(v),
  firstRunDone: (v) => typeof v === 'boolean',
  petName: (v) => v === null || (typeof v === 'string' && v.trim().length >= 1 && v.length <= 16 && !/[\u0000-\u001f<>]/.test(v)),
  autoStart: (v) => typeof v === 'boolean',
  birthday: isValidBirthday,
  cultures: (v) => v === null || (Array.isArray(v) && v.length <= 20 && new Set(v).size === v.length && v.every((id) => F.GROUP_IDS.includes(id))),
  profileAsked: (v) => typeof v === 'boolean',
  area: isValidArea,
  fedBefore: (v) => typeof v === 'boolean',
  // 这里只查"样子对不对"（五个部位、每件衣服穿对了部位）；"你有没有这件衣服"由 main.js 再查一遍
  outfit: (v) => O.sanitizeOutfit(v) !== null,
  hideOnFullscreen: (v) => typeof v === 'boolean',
  feedHints: (v) => Number.isInteger(v) && v >= 0 && v <= 3,
  windowPerch: (v) => typeof v === 'boolean',
};

function isValidSetting(key, value) {
  return Object.prototype.hasOwnProperty.call(VALID, key) && VALID[key](value);
}

function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (isValidSetting(key, raw[key])) out[key] = raw[key];
    }
  }
  return out;
}

const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const int = (v, fallback = 0) => (Number.isInteger(v) ? v : fallback);
const time = (v) => num(v, 0, Number.MAX_SAFE_INTEGER);

/** 宠物状态只保留认识的几个数字，别的一律丢掉 */
function sanitizePet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw.needs && typeof raw.needs === 'object' ? raw.needs : {};
  return {
    needs: { energy: num(n.energy, 0, 1), boredom: num(n.boredom, 0, 1), social: num(n.social, 0, 1) },
    mood: num(raw.mood, 0, 1),
    xFrac: num(raw.xFrac, 0, 1),
    savedAt: time(raw.savedAt),
  };
}

/** 每天的使用记录：几点来、几点走、用了多久，以及那天和宠物互动了几次、喂了它几样东西 */
function sanitizeUsage(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [day, rec] of Object.entries(raw)) {
    if (!DAY.test(day) || !rec || typeof rec !== 'object') continue;
    const first = time(rec.first);
    const last = time(rec.last);
    if (first === undefined || last === undefined) continue;
    out[day] = {
      first,
      last,
      activeMin: num(rec.activeMin, 0, 24 * 60) || 0,
      pets: num(rec.pets, 0, 99999) || 0,
      pokes: num(rec.pokes, 0, 99999) || 0,
      throws: num(rec.throws, 0, 99999) || 0,
      dizzies: num(rec.dizzies, 0, 99999) || 0,
      feeds: num(rec.feeds, 0, 99999) || 0, // 喂它吃了几样东西（只记个数）
      todosDone: num(rec.todosDone, 0, 99999) || 0, // 勾掉了几件待办（只记个数，不记是什么事）
    };
  }
  return out;
}

/** 月报、年度回顾用的"小结"：全是数字和编号 */
function sanitizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = (v) => Math.round(num(v, 0, 1e9) || 0);
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && NAME_ID.test(id)).slice(0, 60) : []);
  const places = {};
  if (raw.places && typeof raw.places === 'object') {
    for (const [id, count] of Object.entries(raw.places)) if (NAME_ID.test(id) && Number.isFinite(count)) places[id] = n(count);
  }
  const g = raw.gifts && typeof raw.gifts === 'object' ? raw.gifts : {};
  const latest = time(raw.latest);
  return {
    days: n(raw.days),
    streak: n(raw.streak),
    places,
    newPlaces: ids(raw.newPlaces),
    gifts: { common: n(g.common), rare: n(g.rare), legendary: n(g.legendary), festival: n(g.festival) },
    highlights: ids(raw.highlights),
    albumBefore: n(raw.albumBefore),
    albumAfter: n(raw.albumAfter),
    pets: n(raw.pets),
    pokes: n(raw.pokes),
    throws: n(raw.throws),
    activeMin: n(raw.activeMin),
    latest: latest === undefined ? null : latest,
    lateness: Number.isFinite(raw.lateness) ? raw.lateness : null,
    latestLate: !!raw.latestLate,
  };
}

function sanitizeLetter(raw) {
  if (!raw || typeof raw !== 'object' || !DAY.test(raw.day)) return null;
  const base = { id: raw.day, day: raw.day, at: time(raw.at) || 0, opened: !!raw.opened };
  if (raw.kind === 'monthly' || raw.kind === 'yearly') {
    const monthly = raw.kind === 'monthly';
    if (!(monthly ? MONTH : YEAR).test(raw.period)) return null;
    const summary = sanitizeSummary(raw.summary);
    if (!summary) return null;
    return { ...base, id: `${monthly ? 'm' : 'y'}-${raw.period}`, kind: raw.kind, period: raw.period, summary, ending: Math.max(0, int(raw.ending)) };
  }
  if (raw.kind === 'welcome') return { ...base, kind: 'welcome', gift: 'pawprint', days: 1 };
  if (raw.kind === 'ask') return { ...base, id: `q-${raw.day}`, kind: 'ask' };
  if (raw.kind === 'festival') {
    const info = F.FESTIVALS[raw.festival];
    if (!info) return null;
    return {
      ...base,
      kind: 'festival',
      festival: raw.festival,
      variant: Math.max(0, int(raw.variant)),
      look: typeof raw.look === 'string' && NAME_ID.test(raw.look) ? raw.look : null,
      years: Number.isInteger(raw.years) && raw.years > 0 ? raw.years : null,
      gift: info.gift,
      days: Math.max(1, int(raw.days, 1)),
    };
  }
  if (raw.kind !== 'daily' || typeof raw.place !== 'string') return null;
  let remark = null;
  if (raw.remark && typeof raw.remark === 'object' && typeof raw.remark.key === 'string') {
    const params = {};
    if (raw.remark.params && typeof raw.remark.params === 'object') {
      for (const [k, v] of Object.entries(raw.remark.params)) if (Number.isFinite(v)) params[k] = v;
    }
    remark = { key: raw.remark.key, variant: int(raw.remark.variant), params };
  }
  return {
    ...base,
    kind: 'daily',
    place: raw.place,
    event: int(raw.event),
    long: !!raw.long,
    opener: int(raw.opener),
    remark,
    closer: int(raw.closer, -1),
    gift: typeof raw.gift === 'string' ? raw.gift : null,
    noGift: int(raw.noGift, -1),
    outfit: typeof raw.outfit === 'string' && O.OUTFITS[raw.outfit] ? raw.outfit : null, // 随信捎来的衣服
    days: Math.max(1, int(raw.days, 1)),
  };
}

function sanitizeMail(raw) {
  const mail = {
    installId: crypto.randomBytes(8).toString('hex'),
    letters: [],
    gifts: {},
    outfits: {}, // 信里收到的衣服 { 编号: { firstDay 哪天收到, tried 穿过没有 } }；一开始送的三件不记在这里
    lastDay: null,
    streak: 0,
    bestStreak: 0,
    welcomed: false, // 见面信寄过没有（就算之后删了，也不会再寄）
    metDay: null, // 认识的那天（每年这天是认识纪念日）
    askSent: false, // "一个小问题"那封信寄过没有
    monthly: {}, // 每个月的小结，年度回顾要用
  };
  if (!raw || typeof raw !== 'object') return mail;
  if (typeof raw.installId === 'string' && /^[0-9a-f]{8,32}$/.test(raw.installId)) mail.installId = raw.installId;
  if (Array.isArray(raw.letters)) {
    const seen = new Set();
    for (const item of raw.letters.slice(-MAX_LETTERS)) {
      const letter = sanitizeLetter(item);
      if (letter && !seen.has(letter.id)) {
        seen.add(letter.id);
        mail.letters.push(letter);
      }
    }
  }
  if (raw.gifts && typeof raw.gifts === 'object') {
    for (const [id, rec] of Object.entries(raw.gifts)) {
      if (!/^[A-Za-z]{1,32}$/.test(id) || !rec || typeof rec !== 'object') continue;
      mail.gifts[id] = { count: Math.max(1, int(rec.count, 1)), firstDay: DAY.test(rec.firstDay) ? rec.firstDay : null };
    }
  }
  if (raw.outfits && typeof raw.outfits === 'object') {
    for (const [id, rec] of Object.entries(raw.outfits)) {
      if (!O.OUTFITS[id] || !rec || typeof rec !== 'object') continue;
      mail.outfits[id] = { firstDay: DAY.test(rec.firstDay) ? rec.firstDay : null, tried: rec.tried === true };
    }
  }
  if (DAY.test(raw.lastDay)) mail.lastDay = raw.lastDay;
  mail.streak = Math.max(0, int(raw.streak));
  mail.bestStreak = Math.max(mail.streak, int(raw.bestStreak));
  // 旧版本的存档没有 welcomed：只要收到过信，就算见过面了
  mail.welcomed = raw.welcomed === true || mail.letters.length > 0 || !!mail.lastDay;
  // 旧版本的存档没有 metDay：用见面信的日期，没有见面信就用最早那封信的日期
  if (DAY.test(raw.metDay)) mail.metDay = raw.metDay;
  else if (mail.letters.length) {
    const welcome = mail.letters.find((l) => l.kind === 'welcome');
    mail.metDay = welcome ? welcome.day : mail.letters.map((l) => l.day).sort()[0];
  }
  mail.askSent = raw.askSent === true || mail.letters.some((l) => l.kind === 'ask');
  if (raw.monthly && typeof raw.monthly === 'object') {
    for (const [month, summary] of Object.entries(raw.monthly)) {
      const clean = MONTH.test(month) && sanitizeSummary(summary);
      if (clean) mail.monthly[month] = clean;
    }
  }
  return mail;
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 2, settings: { ...DEFAULT_SETTINGS }, pet: null, usage: {}, mail: sanitizeMail(null), todos: [] };
    this.timer = null;
  }

  load() {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // 存档文件坏了：留一份备份，然后从头开始
        try {
          fs.copyFileSync(this.file, `${this.file}.broken`);
        } catch {
          /* 备份失败也不影响启动 */
        }
      }
    }
    if (raw && typeof raw === 'object') {
      this.data = {
        version: 2,
        settings: sanitizeSettings(raw.settings),
        pet: sanitizePet(raw.pet),
        usage: sanitizeUsage(raw.usage),
        mail: sanitizeMail(raw.mail),
        todos: sanitizeTodos(raw.todos), // 待办事项（见 todos.js）
      };
    }
    return this.data;
  }

  /** 稍后保存（短时间内多次修改只写一次硬盘） */
  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 800);
  }

  saveNow() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // 先写到临时文件再改名：就算写到一半断电，原来的存档也不会坏
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] 保存失败：', err.message);
    }
  }
}

module.exports = { Store, DEFAULT_SETTINGS, LANGUAGES, MAX_LETTERS, isValidSetting, sanitizePet };
