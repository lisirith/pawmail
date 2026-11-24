'use strict';
// 待办的 Windows 通知：到点、提前提醒的那一刻，在屏幕右下角弹一条（带 Windows 的提示音），没看到的会留在通知中心。
// 你不在电脑前、宠物因为全屏的程序躲起来了，也照样弹（宠物的提醒要等你回来）。什么时候弹由 todos.js 决定。
//
//   - 提前的那条（"还有 15 分钟"）：普通通知，几秒后自己收进通知中心。点它 = 打开待办页。
//   - 到点的那条：一直留在屏幕上，直到你理它（全屏的程序在最前面时除外，那时用普通通知，免得挡着游戏）。
//     Windows 会自己加一个"关闭"按钮，关掉就算"知道了"（宠物不再来提醒）；我们再加一个"做完了"，点了就勾掉。
//     点通知本身 = 知道了 + 打开待办页。好几件同时到点就合成一条，只有"关闭"。
//
// Windows 只显示"认识的程序"发的通知：安装版的开始菜单快捷方式里写着我们的程序 ID（app.pawmail.desktop）；
// 免安装版和开发版没有快捷方式，要把名字和图标写进注册表 HKCU\Software\Classes\AppUserModelId\app.pawmail.desktop
// （register）。实测（2026-11-23，开发版）：不登记的话通知"发出去了"，屏幕上却什么都没有；登记以后就有了，
// 左上角是名字和小图标。卸载时由 build/installer.nsh 删掉这一项。
//
// 通知对象要一直留着引用（this.live），否则被回收以后点它就没反应了。

const { Notification } = require('electron');
const { execFile } = require('node:child_process');

const MAX_LIVE = 40; // 最多同时记着几条（再多就把最早的收起来）

class TodoNotes {
  /**
   * @param texts    (kind, todos) => { title, body, done }  通知上的字（main.js 按现在的语言拼好）
   * @param icon     () => NativeImage | null  通知左边的大图：宠物的头（和托盘图标是同一张）
   * @param persist  () => boolean  到点的那条要不要一直留在屏幕上
   * @param onOpen   () => void       点了通知：打开待办页
   * @param onAck    (ids) => void    到点的那条被关掉 / 被点了：算"知道了"
   * @param onDone   (id) => void     点了"做完了"
   * @param log      (message) => void
   * @param Note     通知的"模子"：平时是 Electron 的 Notification；自检时换成假的（不在屏幕上真的弹出来）
   */
  constructor({ texts, icon, persist, onOpen, onAck, onDone, log = () => {}, Note = Notification }) {
    this.texts = texts;
    this.icon = icon;
    this.persist = persist;
    this.onOpen = onOpen;
    this.onAck = onAck;
    this.onDone = onDone;
    this.log = log;
    this.Note = Note;
    this.live = new Map(); // 通知 → { kind, ids }
  }

  /** 弹一条。kind：'soon' 提前 | 'due' 到点；todos：这一条说的是哪几件 */
  show(kind, todos) {
    if (!todos.length || !this.Note.isSupported()) return null;
    if (kind === 'due') this.#closeWhere((entry) => entry.kind === 'soon' && todos.some((t) => entry.ids.has(t.id))); // 到点了，"还有 15 分钟"那条用不着了
    const { title, body, done } = this.texts(kind, todos);
    const single = todos.length === 1;
    const icon = this.icon();
    const note = new this.Note({
      title,
      body,
      icon: icon || undefined,
      timeoutType: kind === 'due' && this.persist() ? 'never' : 'default',
      actions: kind === 'due' && single ? [{ type: 'button', text: done }] : [],
    });
    const entry = { kind, ids: new Set(todos.map((t) => t.id)) };
    this.live.set(note, entry);
    note.on('click', () => {
      if (!this.#forget(note)) return;
      if (kind === 'due') this.onAck([...entry.ids]);
      this.onOpen();
    });
    note.on('action', (details, index) => {
      const at = details && Number.isInteger(details.actionIndex) ? details.actionIndex : index;
      if (at !== 0 || !single || !this.#forget(note)) return;
      this.onDone(todos[0].id);
    });
    note.on('close', (details) => {
      const reason = details && details.reason;
      if (reason === 'timedOut') return; // 自己收进了通知中心：还留着，在那里点它照样有用
      if (!this.#forget(note)) return; // 是我们自己收起来的
      if (reason === 'userCanceled' && kind === 'due') this.onAck([...entry.ids]); // 你关掉了到点的那条：知道了
    });
    note.on('failed', (event, error) => {
      this.#forget(note);
      this.log(`[待办] 通知没弹出来：${String(error).slice(0, 200)}`);
    });
    note.show();
    while (this.live.size > MAX_LIVE) this.#close(this.live.keys().next().value);
    return note;
  }

  /** 这几件不用再提醒了（点了宠物、勾掉了、删掉了、改了时间）：只说这几件的通知收起来 */
  settle(ids) {
    const gone = new Set(ids);
    this.#closeWhere((entry) => {
      for (const id of gone) entry.ids.delete(id);
      return entry.ids.size === 0;
    });
  }

  /** 关掉通知开关、退出程序时：全部收起来（程序退出后，留在通知中心里的点了也没反应） */
  closeAll() {
    this.#closeWhere(() => true);
  }

  #closeWhere(test) {
    for (const [note, entry] of [...this.live]) if (test(entry)) this.#close(note);
  }

  #close(note) {
    this.live.delete(note);
    try {
      note.close();
    } catch {
      // 已经没了
    }
  }

  /** 不再管这条了。返回 true = 之前还在管（第一次处理它） */
  #forget(note) {
    return this.live.delete(note);
  }
}

/**
 * 把程序的名字和图标登记给 Windows（见文件开头）。name：现在的语言里的名字；iconFile：一张 PNG 图片的完整路径。
 * 用 Windows 自带的 reg 命令写注册表（只写我们自己这一项），写不进去也不影响别的功能
 */
function registerApp({ appId, name, iconFile, log = () => {} }) {
  if (process.platform !== 'win32') return;
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${appId}`;
  const write = (value, data) =>
    execFile('reg', ['add', key, '/v', value, '/t', 'REG_SZ', '/d', data, '/f'], { windowsHide: true }, (err) => {
      if (err) log(`[待办] 登记通知用的程序名失败：${String(err.message).slice(0, 200)}`);
    });
  write('DisplayName', name);
  if (iconFile) write('IconUri', iconFile);
}

module.exports = { TodoNotes, registerApp };
