'use strict';
// 待办事项：你在信纸窗口的「待办」页里写下要做的事，可以设一个提醒时间，还可以选"提前几分钟先说一声"。
// 提醒分两种：
//   - 通知（Windows 右下角弹出来的那种，见 todo-notify.js）：不管你在不在电脑前，到了那一刻就发，每次只发一回。
//     提前提醒的那一刻发一条"还有 15 分钟"，到点再发一条"到点啦"。
//   - 宠物：你在电脑前、宠物露着的时候，它跑到你鼠标旁边举着小牌子提醒你；点它一下就算知道了。
//     到点后没理它的话过 10 分钟再提醒，一件事最多提醒 3 次。提前的那次只说一回（还没到点才说）。
// 做完了在待办里勾掉，它会替你高兴一下。
// 全部只存在本机的存档里（save.json 的 todos）。只有你打开了手机提醒（默认关着，见 phone.js），
// 提醒的那一刻才会把这一条发给你选的推送服务。
// 这个文件是纯数据（不碰窗口）：什么时候提醒、提醒谁，由 main.js 每 5 秒来问一次 check。

const MAX_TODOS = 200;
const MAX_TEXT = 80;
const ID = /^t[0-9a-z]{4,24}$/;
const REMIND_AGAIN = 10 * 60 * 1000; // 提醒了没理：过多久再提醒一次
const MAX_REMINDS = 3;
const MAX_LEAD = 24 * 60; // 最多提前一天（单位：分钟）
const KEEP_DONE = 30 * 24 * 3600 * 1000; // 做完的事留 30 天，之后自动清掉
const MAX_TIME = 8640000000000000; // JavaScript 能表示的最大时间

const isTime = (v) => Number.isFinite(v) && v >= 0 && v <= MAX_TIME;
const isLead = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_LEAD;

/** 提前提醒的那一刻（没设提前提醒、没设提醒时间就是 null） */
function soonAt(todo) {
  return todo.lead > 0 && todo.due !== null ? todo.due - todo.lead * 60000 : null;
}

/**
 * 提醒时间或者提前多久变了：提醒从头算。
 * 提前提醒的那一刻已经过了（比如 10 分钟后的事选了"提前 15 分钟"），就不再提前说，到点照常提醒
 */
function resetReminders(todo, now) {
  todo.reminded = 0;
  todo.remindedAt = null;
  todo.dueNote = false;
  const at = soonAt(todo);
  const skip = at === null || at <= now;
  todo.soonPet = skip;
  todo.soonNote = skip;
}

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
  const due = isTime(raw.due) ? raw.due : null;
  const lead = due !== null && isLead(raw.lead) ? raw.lead : 0;
  const reminded = Number.isInteger(raw.reminded) && raw.reminded >= 0 && raw.reminded <= MAX_REMINDS ? raw.reminded : 0;
  return {
    id: raw.id,
    text,
    createdAt: raw.createdAt,
    due, // 提醒时间（null = 不提醒）
    lead, // 提前几分钟先提醒一次（0 = 不提前）
    done: raw.done === true,
    doneAt: raw.done === true && isTime(raw.doneAt) ? raw.doneAt : null,
    reminded, // 到点后宠物提醒过几次
    remindedAt: isTime(raw.remindedAt) ? raw.remindedAt : null,
    soonPet: lead ? raw.soonPet === true : true, // 提前的那次：宠物说过了（或者用不着了）
    soonNote: lead ? raw.soonNote === true : true, // 提前的那次：通知发过了（或者用不着了）
    // 到点的通知发过了。旧存档里没有这一项：宠物已经提醒过的，就当通知也发过了（免得一更新就弹一堆旧事）
    dueNote: typeof raw.dueNote === 'boolean' ? raw.dueNote : reminded > 0,
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
   * @param store     存档（store.data.todos 是一个数组）
   * @param now       () => 现在的时间戳
   * @param onChange  有变化时调用（存档、让信纸窗口同步）
   * @param onRemind  (todo, kind) => void   宠物该提醒了。kind：'soon' 提前说一声 | 'due' 到点了
   * @param onNotify  (kind, todos) => void  该发通知了（几件同时到点就一起发）
   * @param onSettled (ids) => void          这几件不用再提醒了（知道了、做完了、删掉了、改了时间）：还挂着的通知可以收起来
   * @param onDone    (todo) => void         刚勾掉一件（宠物高兴一下，今天的记录 +1）
   */
  constructor({ store, now = Date.now, onChange = () => {}, onRemind = () => {}, onNotify = () => {}, onSettled = () => {}, onDone = () => {} }) {
    this.store = store;
    this.now = now;
    this.onChange = onChange;
    this.onRemind = onRemind;
    this.onNotify = onNotify;
    this.onSettled = onSettled;
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

  /**
   * 加一件事。due：提醒时间（时间戳）或 null；lead：提前几分钟先提醒一次（0 = 不提前）。
   * 返回这件事，不行（字是空的、太多了、提前的分钟数不对）返回 null
   */
  add({ text, due = null, lead = 0 } = {}) {
    const clean = cleanText(text);
    if (!clean || this.list.length >= MAX_TODOS || !isLead(lead)) return null;
    const now = this.now();
    const when = isTime(due) ? due : null;
    const todo = { id: this.newId(), text: clean, createdAt: now, due: when, lead: when === null ? 0 : lead, done: false, doneAt: null };
    resetReminders(todo, now);
    this.list.push(todo);
    this.onChange();
    return todo;
  }

  /** 改文字、提醒时间或者提前多久（改了时间就重新开始算提醒） */
  update(id, { text, due, lead } = {}) {
    const todo = this.find(id);
    if (!todo) return false;
    const clean = text === undefined ? null : cleanText(text);
    if ((text !== undefined && !clean) || (lead !== undefined && !isLead(lead))) return false;
    if (clean) todo.text = clean;
    if (due !== undefined || lead !== undefined) {
      if (due !== undefined) todo.due = isTime(due) ? due : null;
      if (lead !== undefined) todo.lead = lead;
      if (todo.due === null) todo.lead = 0;
      resetReminders(todo, this.now());
      this.onSettled([todo.id]); // 按旧时间发的通知不算数了
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
    if (todo.done) {
      this.onSettled([todo.id]);
      this.onDone(todo);
    }
    return true;
  }

  remove(id) {
    const before = this.list.length;
    this.store.data.todos = this.list.filter((t) => t.id !== id);
    if (this.list.length === before) return false;
    this.onSettled([id]);
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

  /**
   * 到点以后你说了"知道了"（点了宠物，或者关掉了、点了到点的那条通知）：这件事不再提醒。
   * 提前的那次点宠物不算（宠物那边不会发过来），到点还是照常提醒
   */
  ack(id) {
    const todo = this.find(id);
    if (!todo || todo.reminded >= MAX_REMINDS) return false;
    todo.reminded = MAX_REMINDS;
    this.onSettled([todo.id]);
    this.onChange();
    return true;
  }

  /**
   * 每隔几秒来问一次：有没有该提醒的？canRemind：宠物能不能出来提醒（你在电脑前、它露着；全屏打游戏时它躲着，等你出来再说）。
   *   1. 通知：不管你在不在，到了那一刻就发，每件事提前、到点各一回。几件同时到点就合成一条（onNotify）。
   *   2. 宠物：一次只提醒一件。先看到点的（最早到点的那件），没有的话再看有没有要提前说一声的（onRemind）。
   * 返回宠物提醒了哪件，没有就是 null
   */
  check(canRemind) {
    const now = this.now();
    const dueNow = [];
    const soonNow = [];
    for (const todo of this.list) {
      if (todo.done || todo.due === null) continue;
      if (todo.due <= now) {
        if (!todo.dueNote) {
          todo.dueNote = true;
          todo.soonNote = true; // 提前的那条还没来得及发就到点了（比如电脑刚开机）：不用再发
          dueNow.push(todo);
        }
      } else if (!todo.soonNote && soonAt(todo) !== null && soonAt(todo) <= now) {
        todo.soonNote = true;
        soonNow.push(todo);
      }
    }

    let best = null;
    let kind = 'due';
    if (canRemind) {
      for (const todo of this.list) {
        if (todo.done || todo.due === null || todo.due > now || todo.reminded >= MAX_REMINDS) continue;
        if (todo.remindedAt !== null && now - todo.remindedAt < REMIND_AGAIN) continue;
        if (!best || todo.due < best.due) best = todo;
      }
      if (!best) {
        kind = 'soon';
        for (const todo of this.list) {
          if (todo.done || todo.due === null || todo.due <= now || todo.soonPet) continue;
          const at = soonAt(todo);
          if (at === null || at > now) continue;
          if (!best || todo.due < best.due) best = todo;
        }
      }
    }
    if (best) {
      best.soonPet = true;
      if (kind === 'due') {
        best.reminded += 1;
        best.remindedAt = now;
      }
    }
    if (dueNow.length || soonNow.length || best) this.onChange();
    if (dueNow.length) this.onNotify('due', dueNow);
    if (soonNow.length) this.onNotify('soon', soonNow);
    if (best) this.onRemind(best, kind);
    return best;
  }

  /**
   * 给信纸窗口看的：没做完的在前（有提醒时间的按时间、没有的按添加顺序），做完的在后（最近做完的在前）。
   * soon：还会提前提醒（提前的那一刻还没到）
   */
  view() {
    const now = this.now();
    const open = this.list.filter((t) => !t.done).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.createdAt - b.createdAt);
    const done = this.list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return [...open, ...done].map((t) => ({
      id: t.id,
      text: t.text,
      due: t.due,
      lead: t.lead,
      soon: !t.done && soonAt(t) !== null && soonAt(t) > now,
      done: t.done,
      overdue: !t.done && t.due !== null && t.due <= now,
    }));
  }
}

module.exports = { Todos, sanitizeTodos, cleanText, TODO_ID: ID, MAX_TODOS, MAX_TEXT, MAX_LEAD };
