'use strict';
// 存档：把设置和宠物的状态保存成一个 JSON 文件。
// 文件位置：%APPDATA%\Pawmail\save.json（只在你自己的电脑上，不会上传到任何地方）。

const fs = require('node:fs');
const path = require('node:path');

const SCALES = [0.8, 1, 1.3];
const LANGUAGES = ['zh', 'en'];
const SPECIES = ['cat', 'panda'];

const DEFAULT_SETTINGS = Object.freeze({
  species: 'cat',
  displayMode: 'top', // top 始终在最前面 | desktop 只待在桌面上
  scale: 1,
  language: null, // null = 跟随系统语言
  firstRunDone: false,
});

// 每一项设置允许的取值。画面发来的任何修改都要先过这一关。
const VALID = {
  species: (v) => SPECIES.includes(v),
  displayMode: (v) => v === 'top' || v === 'desktop',
  scale: (v) => SCALES.includes(v),
  language: (v) => v === null || LANGUAGES.includes(v),
  firstRunDone: (v) => typeof v === 'boolean',
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

/** 宠物状态只保留认识的几个数字，别的一律丢掉 */
function sanitizePet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw.needs && typeof raw.needs === 'object' ? raw.needs : {};
  return {
    needs: { energy: num(n.energy, 0, 1), boredom: num(n.boredom, 0, 1), social: num(n.social, 0, 1) },
    mood: num(raw.mood, 0, 1),
    xFrac: num(raw.xFrac, 0, 1),
    savedAt: num(raw.savedAt, 0, Number.MAX_SAFE_INTEGER),
  };
}

function sanitizeUsage(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [day, rec] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !rec || typeof rec !== 'object') continue;
    const first = num(rec.first, 0, Number.MAX_SAFE_INTEGER);
    const last = num(rec.last, 0, Number.MAX_SAFE_INTEGER);
    if (first === undefined || last === undefined) continue;
    out[day] = { first, last, activeMin: num(rec.activeMin, 0, 24 * 60) || 0 };
  }
  return out;
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 1, settings: { ...DEFAULT_SETTINGS }, pet: null, usage: {} };
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
        version: 1,
        settings: sanitizeSettings(raw.settings),
        pet: sanitizePet(raw.pet),
        usage: sanitizeUsage(raw.usage),
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

module.exports = { Store, DEFAULT_SETTINGS, LANGUAGES, isValidSetting, sanitizePet };
