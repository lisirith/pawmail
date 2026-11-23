'use strict';
// 待办事项：你在信纸窗口的「待办」页里写下要做的事，可以设一个提醒时间。
// 到点了（你在电脑前、宠物露着的时候），宠物会跑到你鼠标旁边，举着小牌子提醒你；点它一下就算知道了。
// 没理它的话过 10 分钟再提醒，一件事最多提醒 3 次。做完了在待办里勾掉，它会替你高兴一下。
// 全部只存在本机的存档里（save.json 的 todos），不联网。
// 这个文件是纯数据（不碰窗口）：什么时候提醒、提醒谁，由 main.js 每 5 秒来问一次 check。

const MAX_TODOS = 200;
const MAX_TEXT = 80;
const ID = /^t[0-9a-z]{4,24}$/;
const REMIND_AGAIN = 10 * 60 * 1000; // 提醒了没理：过多久再提醒一次
const MAX_REMINDS = 3;
const KEEP_DONE = 30 * 24 * 3600 * 1000; // 做完的事留 30 天，之后自动清掉
const MAX_TIME = 8640000000000000; // JavaScript 能表示的最大时间

const isTime = (v) => Number.isFinite(v) && v >= 0 && v <= MAX_TIME;

/** 一件事的文字：去掉首尾空白和看不见的控制字符，最长 80 个字 */
function cleanText(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
  return text.length ? text : null;
}

/** 存档里的一件事：每一项都检查类型和范围，不认识的一律丢掉 */
function sanitizeTodo(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
  const text = cleanText(raw.text);
  if (!text || !isTime(raw.createdAt)) return null;
  return {
    id: raw.id,
    text,
    createdAt: raw.createdAt,
    due: isTime(raw.due) ? raw.due : null, // 提醒时间（null = 不提醒）
    done: raw.done === true,
    doneAt: raw.done === true && isTime(raw.doneAt) ? raw.doneAt : null,
    reminded: Number.isInteger(raw.reminded) && raw.reminded >= 0 && raw.reminded <= MAX_REMINDS ? raw.reminded : 0,
    remindedAt: isTime(raw.remindedAt) ? raw.remindedAt : null,
  };
}

/** 读存档时用（store.js）：最多 200 件，做完超过 30 天的不要了 */
function sanitizeTodos(raw, now = Date.now()) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const todo = sanitizeTodo(item);
    if (!todo || seen.has(todo.id)) continue;
    if (todo.done && todo.doneAt && now - todo.doneAt > KEEP_DONE) continue;
    seen.add(todo.id);
    out.push(todo);
    if (out.length >= MAX_TODOS) break;
  }
  return out;
}

class Todos {
  /**
   * @param store    存档（store.data.todos 是一个数组）
   * @param now      () => 现在的时间戳
   * @param onChange 有变化时调用（存档、让信纸窗口同步）
   * @param onRemind (todo) => void  该提醒了（告诉宠物）
   * @param onDone   (todo) => void  刚勾掉一件（宠物高兴一下，今天的记录 +1）
   */
  constructor({ store, now = Date.now, onChange = () => {}, onRemind = () => {}, onDone = () => {} }) {
    this.store = store;
    this.now = now;
    this.onChange = onChange;
    this.onRemind = onRemind;
    this.onDone = onDone;
    this.seq = 0;
  }

  get list() {
    if (!Array.isArray(this.store.data.todos)) this.store.data.todos = [];
    return this.store.data.todos;
  }

  find(id) {
    return typeof id === 'string' ? this.list.find((t) => t.id === id) || null : null;
  }

  /** 新的编号：t + 时间 + 序号（都是小写字母和数字） */
  newId() {
    this.seq = (this.seq + 1) % 1296;
    return `t${this.now().toString(36)}${this.seq.toString(36).padStart(2, '0')}`;
  }

  /** 加一件事。due：提醒时间（时间戳）或 null。返回这件事，不行（字是空的、太多了）返回 null */
  add({ text, due = null } = {}) {
    const clean = cleanText(text);
    if (!clean || this.list.length >= MAX_TODOS) return null;
    const now = this.now();
    const todo = { id: this.newId(), text: clean, createdAt: now, due: isTime(due) ? due : null, done: false, doneAt: null, reminded: 0, remindedAt: null };
    this.list.push(todo);
    this.onChange();
    return todo;
  }

  /** 改文字或提醒时间（改了提醒时间就重新开始算提醒次数） */
  update(id, { text, due } = {}) {
    const todo = this.find(id);
    if (!todo) return false;
    if (text !== undefined) {
      const clean = cleanText(text);
      if (!clean) return false;
      todo.text = clean;
    }
    if (due !== undefined) {
      todo.due = isTime(due) ? due : null;
      todo.reminded = 0;
      todo.remindedAt = null;
    }
    this.onChange();
    return true;
  }

  /** 勾上 / 取消勾 */
  setDone(id, done) {
    const todo = this.find(id);
    if (!todo || todo.done === !!done) return false;
    todo.done = !!done;
    todo.doneAt = todo.done ? this.now() : null;
    this.onChange();
    if (todo.done) this.onDone(todo);
    return true;
  }

  remove(id) {
    const before = this.list.length;
    this.store.data.todos = this.list.filter((t) => t.id !== id);
    if (this.list.length === before) return false;
    this.onChange();
    return true;
  }

  /** 清掉所有做完的 */
  clearDone() {
    const before = this.list.length;
    this.store.data.todos = this.list.filter((t) => !t.done);
    const removed = before - this.list.length;
    if (removed) this.onChange();
    return removed;
  }

  /** 宠物提醒了，你点了它一下：知道了，这件事不再提醒 */
  ack(id) {
    const todo = this.find(id);
    if (!todo || todo.reminded >= MAX_REMINDS) return false;
    todo.reminded = MAX_REMINDS;
    this.onChange();
    return true;
  }

  /**
   * 每隔几秒来问一次：有没有到点要提醒的？canRemind：你在电脑前、宠物露着（全屏打游戏时它躲着，等你出来再说）。
   * 一次只提醒一件（最早到点的那件）。返回提醒了哪件，没有就是 null
   */
  check(canRemind) {
    if (!canRemind) return null;
    const now = this.now();
    let best = null;
    for (const todo of this.list) {
      if (todo.done || todo.due === null || todo.due > now || todo.reminded >= MAX_REMINDS) continue;
      if (todo.remindedAt !== null && now - todo.remindedAt < REMIND_AGAIN) continue;
      if (!best || todo.due < best.due) best = todo;
    }
    if (!best) return null;
    best.reminded += 1;
    best.remindedAt = now;
    this.onChange();
    this.onRemind(best);
    return best;
  }

  /** 给信纸窗口看的：没做完的在前（有提醒时间的按时间、没有的按添加顺序），做完的在后（最近做完的在前） */
  view() {
    const now = this.now();
    const open = this.list.filter((t) => !t.done).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.createdAt - b.createdAt);
    const done = this.list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return [...open, ...done].map((t) => ({ id: t.id, text: t.text, due: t.due, done: t.done, overdue: !t.done && t.due !== null && t.due <= now }));
  }
}

module.exports = { Todos, sanitizeTodos, cleanText, TODO_ID: ID, MAX_TODOS, MAX_TEXT };
