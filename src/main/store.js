'use strict';
// 存档：把设置、宠物的状态、收到的信和礼物保存成一个 JSON 文件。
// 文件位置：%APPDATA%\Pawmail\save.json（只在你自己的电脑上，不会上传到任何地方）。
//
// 读存档时，每一项都会检查一遍类型和范围（下面那些 sanitize 开头的函数）。
// 这样就算文件被手动改坏了、或者是旧版本留下的，程序也不会因此出错。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCALES = [0.8, 1, 1.3];
const LANGUAGES = ['zh', 'en'];
const SPECIES = ['cat', 'panda'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LETTERS = 800;

const DEFAULT_SETTINGS = Object.freeze({
  species: 'cat',
  displayMode: 'top', // top 始终在最前面 | desktop 只待在桌面上
  scale: 1,
  language: null, // null = 跟随系统语言
  firstRunDone: false,
  petName: null, // 你给它起的名字（信的落款）
  autoStart: false, // 开机自动启动
});

// 每一项设置允许的取值。画面发来的任何修改都要先过这一关。
const VALID = {
  species: (v) => SPECIES.includes(v),
  displayMode: (v) => v === 'top' || v === 'desktop',
  scale: (v) => SCALES.includes(v),
  language: (v) => v === null || LANGUAGES.includes(v),
  firstRunDone: (v) => typeof v === 'boolean',
  petName: (v) => v === null || (typeof v === 'string' && v.trim().length >= 1 && v.length <= 16 && !/[\u0000-\u001f<>]/.test(v)),
  autoStart: (v) => typeof v === 'boolean',
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

/** 每天的使用记录：几点来、几点走、用了多久，以及那天和宠物互动了几次 */
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
    };
  }
  return out;
}

function sanitizeLetter(raw) {
  if (!raw || typeof raw !== 'object' || !DAY.test(raw.day)) return null;
  const base = { id: raw.day, day: raw.day, at: time(raw.at) || 0, opened: !!raw.opened };
  if (raw.kind === 'welcome') return { ...base, kind: 'welcome', gift: 'pawprint', days: 1 };
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
    days: Math.max(1, int(raw.days, 1)),
  };
}

function sanitizeMail(raw) {
  const mail = { installId: crypto.randomBytes(8).toString('hex'), letters: [], gifts: {}, lastDay: null, streak: 0 };
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
  if (DAY.test(raw.lastDay)) mail.lastDay = raw.lastDay;
  mail.streak = Math.max(0, int(raw.streak));
  return mail;
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 2, settings: { ...DEFAULT_SETTINGS }, pet: null, usage: {}, mail: sanitizeMail(null) };
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
