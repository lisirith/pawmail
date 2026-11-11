'use strict';
// 后台主程序（Electron 的"主进程"）。负责所有要和 Windows 打交道的事：
// 创建透明窗口、托盘图标、读写存档、知道你有没有在用电脑。
// 以后如果想把 Electron 换成别的技术，主要重写 src/main/ 这个文件夹；画面部分（src/renderer/）可以原样保留。
//
// 启动参数（开发用）：
//   --dev                 显示调试面板，并在控制台打印诊断信息
//   --devtools            同时打开开发者工具
//   --userdata=<文件夹>   把存档放到别的文件夹（测试时不会弄乱你真正的存档）
//   --selftest=<文件夹>   自动检查一遍关键功能，把结果和截图写到这个文件夹，然后退出
//   --no-gpu              关闭显卡加速（排查画面问题时用）

const { app, ipcMain, powerMonitor, screen } = require('electron');
const path = require('node:path');
const { Store, LANGUAGES, isValidSetting, sanitizePet } = require('./store');
const { Overlay } = require('./overlay');
const { PetTray } = require('./tray');
const native = require('./native');

const args = process.argv.slice(1);
const flag = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};
const SELFTEST_DIR = app.isPackaged ? null : flag('selftest');
const DEV = args.includes('--dev') || !!SELFTEST_DIR;

if (flag('userdata')) app.setPath('userData', path.resolve(flag('userdata')));
if (args.includes('--no-gpu')) app.disableHardwareAcceleration();

const STRINGS = {
  zh: require('../shared/locales/zh.json'),
  en: require('../shared/locales/en.json'),
};

let store = null;
let overlay = null;
let tray = null;
let quitting = false;

// ---------------------------------------------------------------- 设置和文字

/** 实际使用的语言：用户选过就用选的，否则跟随系统 */
function currentLanguage() {
  const chosen = store.data.settings.language;
  if (LANGUAGES.includes(chosen)) return chosen;
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function effectiveSettings() {
  return { ...store.data.settings, language: currentLanguage() };
}

function t(key) {
  const dig = (obj) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  return dig(STRINGS[currentLanguage()]) ?? dig(STRINGS.en) ?? key;
}

function setSetting(key, value) {
  if (!isValidSetting(key, value)) return;
  if (store.data.settings[key] === value) return;
  store.data.settings[key] = value;
  store.saveSoon();
  if (key === 'displayMode') overlay.setDisplayMode(value);
  overlay.send('settings', effectiveSettings());
  if (tray) tray.refresh();
}

// ---------------------------------------------------------------- 退出

function quit() {
  if (quitting) return;
  quitting = true;
  overlay.send('save-now'); // 让画面把宠物最后的状态交上来
  setTimeout(() => {
    store.saveNow();
    app.quit();
  }, 250);
}

// ---------------------------------------------------------------- 画面发来的消息

function registerIpc() {
  // 只接受我们自己那个窗口发来的消息
  const fromOverlay = (event) => overlay && overlay.alive && event.sender === overlay.win.webContents;

  ipcMain.handle('pawmail:init', (event) => {
    if (!fromOverlay(event)) return null;
    return {
      settings: effectiveSettings(),
      pet: store.data.pet,
      strings: STRINGS,
      dev: DEV,
      flags: DEV ? args.filter((a) => a.startsWith('--x-')).map((a) => a.slice(4)) : [], // 开发实验用的开关
      preview: false,
      version: app.getVersion(),
    };
  });

  ipcMain.on('pawmail:set-capture', (event, wanted) => {
    if (fromOverlay(event)) overlay.setCapture(!!wanted);
  });

  ipcMain.on('pawmail:save-pet', (event, state) => {
    if (!fromOverlay(event)) return;
    const pet = sanitizePet(state);
    if (pet) {
      store.data.pet = pet;
      store.saveSoon();
    }
  });

  ipcMain.on('pawmail:set-setting', (event, key, value) => {
    if (fromOverlay(event)) setSetting(key, value);
  });

  ipcMain.on('pawmail:tray-icon', (event, dataUrl) => {
    if (!fromOverlay(event) || !tray) return;
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length < 300000) {
      tray.setIcon(dataUrl);
    }
  });

  ipcMain.on('pawmail:quit', (event) => {
    if (fromOverlay(event)) quit();
  });

  ipcMain.on('pawmail:log', (event, message) => {
    if (fromOverlay(event)) console.log('[画面]', String(message).slice(0, 2000));
  });
}

// ---------------------------------------------------------------- 你在不在用电脑

/** 凌晨 4 点之前算作"前一天"：熬夜到 2 点，那还是今天的事 */
function logicalDay(now) {
  const d = new Date(now - 4 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let usageTickAt = 0;
/**
 * 每分钟记一笔：今天第一次用电脑是几点、最后一次是几点、一共用了多少分钟。
 * 以后的"每日来信"会用到（比如"你昨天三点才睡哦"）。
 * 只记"有没有在用"，不记你做了什么、按了什么键；数据只存在本机。
 */
function trackUsage(idleSeconds) {
  const now = Date.now();
  if (now - usageTickAt < 60000) return;
  usageTickAt = now;
  if (idleSeconds >= 60) return; // 这一分钟你没碰电脑
  const usage = store.data.usage;
  const day = logicalDay(now);
  const record = usage[day] || (usage[day] = { first: now, last: now, activeMin: 0 });
  record.last = now;
  record.activeMin += 1;
  const days = Object.keys(usage).sort();
  while (days.length > 60) delete usage[days.shift()]; // 只留最近 60 天
  store.saveSoon();
}

function startSystemWatch() {
  setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime(); // 你已经多少秒没碰鼠标键盘了
    overlay.send('system', { idle });
    trackUsage(idle);
  }, 5000);
  powerMonitor.on('lock-screen', () => overlay.pause());
  powerMonitor.on('unlock-screen', () => overlay.resume());
  powerMonitor.on('suspend', () => {
    overlay.pause();
    store.saveNow();
  });
  powerMonitor.on('resume', () => overlay.resume());
}

// ---------------------------------------------------------------- 启动

function start() {
  app.setAppUserModelId('app.pawmail.desktop');

  store = new Store(path.join(app.getPath('userData'), 'save.json'));
  store.load();

  registerIpc();

  overlay = new Overlay({ dev: DEV });
  let restarts = 0;
  overlay.onGone = () => {
    // 画面崩溃了：自动重开，最多 3 次
    if (quitting || restarts >= 3) return;
    restarts += 1;
    setTimeout(() => {
      overlay.destroy();
      overlay.create(store.data.settings.displayMode);
    }, 1000);
  };
  overlay.onReady = () => {
    if (DEV) logDiagnostics();
    if (args.includes('--devtools')) overlay.win.webContents.openDevTools({ mode: 'detach', activate: false });
    if (SELFTEST_DIR) {
      require('./selftest')
        .run({ overlay, outDir: path.resolve(SELFTEST_DIR), setSetting })
        .catch((err) => console.error('[selftest] 出错：', err))
        .finally(quit);
    }
  };
  overlay.create(store.data.settings.displayMode);

  tray = new PetTray({
    getModel: () => ({ t, settings: effectiveSettings() }),
    onSet: setSetting,
    onCommand: (type) => overlay.send('command', { type }),
    onQuit: quit,
  });
  tray.create();

  startSystemWatch();
}

function logDiagnostics() {
  const display = screen.getPrimaryDisplay();
  console.log(
    '[diag]',
    JSON.stringify({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      display: { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor },
      window: overlay.win.getBounds(),
      displayMode: overlay.displayMode,
      nativeHelpers: native.available,
      userData: app.getPath('userData'),
      language: currentLanguage(),
    })
  );
}

if (!app.requestSingleInstanceLock()) {
  // 已经有一只在运行了，不再开第二只
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlay) overlay.send('command', { type: 'comeBack' }); // 再次双击启动：把宠物叫回屏幕中间
  });
  app.on('before-quit', () => {
    quitting = true;
    if (store) store.saveNow();
  });
  app.on('window-all-closed', () => {
    if (!quitting) return; // 画面崩溃重开的间隙，不要退出整个程序
    app.quit();
  });
  app.whenReady().then(start);
}
