'use strict';
// 宠物住的那个窗口：一块盖住整个桌面工作区的"透明玻璃"。
//
// 关键点：
//   1. 窗口是透明、无边框、不抢焦点的（点宠物不会让你正在打字的窗口失去焦点）。
//   2. 平时鼠标会"穿过"这块玻璃，点到下面的窗口；只有鼠标移到宠物身上时才"接住"鼠标。
//      谁来判断鼠标在不在宠物身上？后台每秒看约 30 次鼠标位置，告诉画面；
//      画面知道宠物的精确轮廓，再回头告诉后台"现在要接住 / 现在放行"。
//   3. 没有使用"全局鼠标钩子"，所以不会拖慢整个系统的鼠标，也不会被游戏反作弊误伤。

const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const native = require('./native');

const CURSOR_POLL_MS = 33; // 鼠标在动时，每秒看约 30 次
const CURSOR_IDLE_POLL_MS = 120; // 鼠标静止 2 秒后放慢到每秒约 8 次（一动就立刻恢复）
// 接住鼠标期间，画面每 0.2 秒会确认一次。超过这个时间没确认（比如画面卡死了），就自动恢复穿透，
// 免得一块看不见的玻璃挡住你点东西。
const CAPTURE_TIMEOUT_MS = 700;

function workArea() {
  const display = screen.getPrimaryDisplay();
  const area = { ...display.workArea };
  // 任务栏设成自动隐藏时，工作区 = 整个屏幕。少 1 像素，免得被 Windows 当成"全屏程序"。
  if (area.height >= display.bounds.height) area.height -= 1;
  return area;
}

class Overlay {
  constructor({ dev = false } = {}) {
    this.dev = dev;
    this.win = null;
    this.ready = false;
    this.displayMode = 'top';
    this.capturing = false;
    this.captureAt = 0;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.cursor = { x: NaN, y: NaN, inside: null };
    this.pollTimer = null;
    this.polling = false;
    this.lastMoveAt = 0;
    this.pollEnabled = true; // 自检时会关掉，改用模拟的鼠标位置
    this.onReady = null;
    this.onGone = null;
    this.relayout = this.relayout.bind(this);
  }

  create(displayMode) {
    this.displayMode = displayMode === 'desktop' ? 'desktop' : 'top';
    const area = workArea();
    const win = new BrowserWindow({
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      focusable: false, // 点它不会抢走别的窗口的焦点
      alwaysOnTop: this.displayMode === 'top',
      // "工具窗口"：不出现在任务栏和 Alt+Tab 里。还有一个重要作用：Chrome、Edge、VS Code 这类程序
      // 会检查自己是不是被别的窗口完全盖住（盖住就停止刷新画面），而它们会忽略工具窗口，
      // 所以我们这块全屏的透明玻璃不会让它们误以为自己被挡住了。
      type: 'toolbar',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        devTools: this.dev,
      },
    });
    this.win = win;

    win.removeMenu();
    win.setIgnoreMouseEvents(true); // 默认：鼠标穿过去

    // 这个窗口只显示我们自己的页面，不允许跳转到别处，也不允许弹新窗口
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    win.once('ready-to-show', () => {
      this.ready = true;
      this.bounds = win.getContentBounds();
      win.showInactive();
      this.setDisplayMode(this.displayMode);
      this.startPolling();
      if (this.onReady) this.onReady();
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[overlay] 画面进程退出了：', details.reason);
      this.setCapture(false);
      if (this.onGone) this.onGone(details);
    });
    win.on('unresponsive', () => this.setCapture(false));
    win.on('closed', () => {
      this.stopPolling();
      this.win = null;
      this.ready = false;
    });

    screen.on('display-metrics-changed', this.relayout);
    screen.on('display-added', this.relayout);
    screen.on('display-removed', this.relayout);

    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    return win;
  }

  get alive() {
    return !!this.win && !this.win.isDestroyed();
  }

  /** 给画面发消息 */
  send(channel, data) {
    if (!this.alive || this.win.webContents.isDestroyed()) return;
    this.win.webContents.send(`pawmail:${channel}`, data);
  }

  /** true = 接住鼠标（可以点、拖宠物）；false = 鼠标穿过窗口 */
  setCapture(flag) {
    if (!this.alive) return;
    flag = !!flag;
    if (flag) this.captureAt = Date.now();
    if (flag === this.capturing) return;
    this.capturing = flag;
    this.win.setIgnoreMouseEvents(!flag);
  }

  setDisplayMode(mode) {
    this.displayMode = mode === 'desktop' ? 'desktop' : 'top';
    if (!this.alive) return;
    if (this.displayMode === 'desktop') {
      this.win.setAlwaysOnTop(false);
      native.sendToBottom(this.win); // 压到所有窗口下面，只有桌面露出来的地方才看得到它
    } else {
      this.win.setAlwaysOnTop(true, 'floating');
      this.win.moveTop();
    }
  }

  /** 分辨率、缩放、任务栏变了：重新铺满工作区 */
  relayout() {
    if (!this.alive) return;
    this.win.setBounds(workArea());
    this.bounds = this.win.getContentBounds();
    if (this.displayMode === 'desktop') native.sendToBottom(this.win);
  }

  startPolling() {
    this.stopPolling();
    this.polling = true;
    this.pollTimer = setTimeout(() => this.poll(), CURSOR_POLL_MS);
  }

  stopPolling() {
    this.polling = false;
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  poll() {
    if (!this.alive) return;
    const now = Date.now();
    if (this.pollEnabled) {
      const point = screen.getCursorScreenPoint();
      const b = this.bounds;
      const x = point.x - b.x;
      const y = point.y - b.y;
      const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
      const c = this.cursor;
      if (x !== c.x || y !== c.y || inside !== c.inside) {
        c.x = x;
        c.y = y;
        c.inside = inside;
        this.lastMoveAt = now;
        this.send('cursor', { x, y, inside });
      }
    }
    if (this.capturing && now - this.captureAt > CAPTURE_TIMEOUT_MS) this.setCapture(false);
    if (this.polling) {
      const busy = this.capturing || now - this.lastMoveAt < 2000;
      this.pollTimer = setTimeout(() => this.poll(), busy ? CURSOR_POLL_MS : CURSOR_IDLE_POLL_MS);
    }
  }

  /** 锁屏、睡眠时暂停 */
  pause() {
    this.stopPolling();
    this.setCapture(false);
  }

  resume() {
    if (this.ready) this.startPolling();
  }

  destroy() {
    screen.removeListener('display-metrics-changed', this.relayout);
    screen.removeListener('display-added', this.relayout);
    screen.removeListener('display-removed', this.relayout);
    this.stopPolling();
    if (this.alive) this.win.destroy();
    this.win = null;
    this.ready = false;
    this.capturing = false;
  }
}

module.exports = { Overlay };
