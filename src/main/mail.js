'use strict';
// "邮局"：决定什么时候来一封新信，保管所有的信和礼物，以及打开信纸窗口。
// 信的内容怎么写在 letters.js；这里只管"什么时候来、放在哪、怎么给你看"。

const { BrowserWindow, ipcMain, clipboard, nativeImage, shell, app, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const L = require('./letters');

const ID = L.LETTER_ID;
const PNG_PREFIX = 'data:image/png;base64,';
const isReport = (letter) => letter.kind === 'monthly' || letter.kind === 'yearly';
const WINDOW_SIZE = { width: 472, height: 700 };

class Mail {
  /**
   * @param store       存档
   * @param getContext  () => { lang, name, species, ui }  当前语言、宠物名字、动物、信纸窗口用的文字
   * @param onChange    信或礼物有变化时调用（主程序会存档，并通知宠物"有新信"）
   * @param setName     (name) => void  给宠物起名字
   * @param dev         开发模式
   */
  constructor({ store, getContext, onChange, setName, dev = false }) {
    this.store = store;
    this.getContext = getContext;
    this.onChange = onChange;
    this.setName = setName;
    this.dev = dev;
    this.win = null;
    this.target = null; // 窗口打开后要显示哪一页
    this.test = null; // 自检时：{ dir } 把明信片存到别处，并且不弹出文件夹
  }

  get data() {
    return this.store.data.mail;
  }

  /** 有几封没拆、一共几封、没拆的里面有没有月报或年度回顾（有的话宠物手里拿的是金色信封） */
  summary() {
    const letters = this.data.letters;
    const unread = letters.filter((l) => !l.opened);
    return { unread: unread.length, total: letters.length, special: unread.some(isReport) };
  }

  /**
   * 看看是不是该来信了。每隔几秒调用一次，很便宜。
   * 规则（具体见 letters.js 的 advanceDay）：第一次运行立刻有一封"见面信"；
   * 之后每到新的一天（凌晨 4 点为界），你回到电脑前时来一封；跨月时再多一封月报或年度回顾。
   * @returns 这次有没有来新信
   */
  check(now, present) {
    if (this.data.welcomed && !present) return false;
    const added = L.advanceDay(this.data, { day: L.logicalDay(now), now, usage: this.store.data.usage });
    if (!added.length) return false;
    this.onChange();
    this.refresh();
    return true;
  }

  /**
   * 拆开一封信：礼物这时才真正到手（进图鉴）。
   * quiet：不通知窗口和宠物（自检一口气模拟几百天时用）
   */
  markOpened(id, { quiet = false } = {}) {
    const letter = this.data.letters.find((l) => l.id === id);
    if (!letter || letter.opened) return;
    letter.opened = true;
    if (letter.gift && L.GIFTS[letter.gift]) {
      const have = this.data.gifts[letter.gift];
      this.data.gifts[letter.gift] = { count: (have ? have.count : 0) + 1, firstDay: have && have.firstDay ? have.firstDay : letter.day };
    }
    if (quiet) return;
    this.onChange();
    this.refresh(); // 图鉴变了，让窗口同步一下（正在看的信不会被打断）
  }

  /**
   * 删信（你在信箱里选的）。拿到的礼物不会因此从图鉴里消失。
   * @returns 删掉了几封
   */
  deleteLetters(ids) {
    const doomed = new Set(ids);
    const before = this.data.letters.length;
    this.data.letters = this.data.letters.filter((l) => !doomed.has(l.id));
    const removed = before - this.data.letters.length;
    if (removed) {
      this.onChange();
      this.refresh();
    }
    return removed;
  }

  /** 发给信纸窗口的全部内容（文字已经按当前语言拼好） */
  payload(nav) {
    const ctx = this.getContext();
    const owned = this.data.gifts;
    const letters = [...this.data.letters].reverse().map((letter) => {
      const rendered = L.renderLetter(letter, ctx.lang, ctx);
      rendered.month = letter.day.slice(0, 7); // 信箱按月分组用
      if (rendered.gift) rendered.gift.isNew = !letter.opened && !owned[rendered.gift.id]; // 第一次拿到这种礼物
      return rendered;
    });
    return {
      lang: ctx.lang,
      ui: ctx.ui,
      name: ctx.name,
      species: ctx.species,
      letters,
      album: L.album(owned, ctx.lang),
      nav: nav || null,
    };
  }

  /** 窗口开着的话，把最新内容推过去（不改变它正在看的那一页） */
  refresh(nav) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('pawmail-mail:update', this.payload(nav));
  }

  /**
   * 打开信纸窗口。
   * @param target { view: 'letter' | 'box' | 'album', id }；不传 = 有没拆的信就打开最新那封，否则打开信箱
   */
  open(target) {
    if (!target) {
      const unread = [...this.data.letters].reverse().find((l) => !l.opened);
      target = unread ? { view: 'letter', id: unread.id } : { view: 'box' };
    }
    this.target = target;
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.show();
      this.win.focus();
      this.refresh(target);
      return this.win;
    }

    const area = screen.getPrimaryDisplay().workArea;
    const win = new BrowserWindow({
      ...WINDOW_SIZE,
      x: Math.round(area.x + (area.width - WINDOW_SIZE.width) / 2),
      y: Math.round(area.y + Math.max(0, (area.height - WINDOW_SIZE.height) / 2)),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: this.getContext().ui.title,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'mail-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        devTools: this.dev,
      },
    });
    this.win = win;
    win.removeMenu();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'mail.html'));
    return win;
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close();
  }

  /** 登记信纸窗口发来的消息。只调用一次。 */
  register() {
    const mine = (event) => this.win && !this.win.isDestroyed() && event.sender === this.win.webContents;
    const validImage = (dataUrl) => typeof dataUrl === 'string' && dataUrl.startsWith(PNG_PREFIX) && dataUrl.length < 16 * 1024 * 1024;

    ipcMain.handle('pawmail-mail:init', (event) => {
      if (!mine(event)) return null;
      const data = this.payload(this.target);
      this.target = null;
      return data;
    });

    ipcMain.on('pawmail-mail:opened', (event, id) => {
      if (mine(event) && ID.test(id)) this.markOpened(id);
    });

    ipcMain.handle('pawmail-mail:delete', (event, ids) => {
      if (!mine(event) || !Array.isArray(ids) || !ids.length || ids.length > 1000) return { ok: false };
      if (!ids.every((id) => typeof id === 'string' && ID.test(id))) return { ok: false };
      return { ok: true, removed: this.deleteLetters(ids) };
    });

    ipcMain.on('pawmail-mail:set-name', (event, name) => {
      if (!mine(event) || typeof name !== 'string') return;
      this.setName(name.trim().slice(0, 16));
    });

    // 把明信片存成图片：放到"图片\Pawmail"文件夹里，然后在资源管理器里指给你看
    ipcMain.handle('pawmail-mail:save-postcard', async (event, dataUrl, id) => {
      if (!mine(event) || !validImage(dataUrl) || !ID.test(id)) return { ok: false };
      try {
        const dir = this.test ? this.test.dir : path.join(app.getPath('pictures'), 'Pawmail');
        await fs.promises.mkdir(dir, { recursive: true });
        const file = path.join(dir, `pawmail-${id}.png`);
        await fs.promises.writeFile(file, Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64'));
        if (!this.test) shell.showItemInFolder(file);
        return { ok: true, file };
      } catch (err) {
        console.error('[mail] 保存明信片失败：', err.message);
        return { ok: false };
      }
    });

    // 把明信片复制到剪贴板，可以直接粘贴到聊天软件里
    ipcMain.handle('pawmail-mail:copy-postcard', (event, dataUrl) => {
      if (!mine(event) || !validImage(dataUrl)) return { ok: false };
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) return { ok: false };
      if (!this.test) clipboard.writeImage(image);
      return { ok: true };
    });

    ipcMain.on('pawmail-mail:close', (event) => {
      if (mine(event)) this.close();
    });
  }
}

module.exports = { Mail };
