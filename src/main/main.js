'use strict';
// 后台主程序（Electron 的"主进程"）。负责所有要和 Windows 打交道的事：
// 创建透明窗口、托盘图标、读写存档、知道你有没有在用电脑、收发每天的来信。
// 以后如果想把 Electron 换成别的技术，主要重写 src/main/ 这个文件夹；画面部分（src/renderer/）可以原样保留。
//
// 启动参数（开发用）：
//   --dev                 在控制台打印诊断信息（它在做什么、为什么）
//   --devtools            同时打开开发者工具
//   --userdata=<文件夹>   把存档放到别的文件夹（测试时不会弄乱你真正的存档）
//   --selftest=<文件夹>   自动检查一遍关键功能，把结果和截图写到这个文件夹，然后退出
//   --no-gpu              关闭显卡加速（排查画面问题时用）
//   --x-hud               在屏幕上显示状态面板
//   --x-newday            假装现在是"明天"（马上收到一封新的来信，测试用）
//   --x-feeddry           喂它吃文件时只演习：照常检查、照常演"吃"，但不真的放进回收站

const { app, ipcMain, powerMonitor, screen, shell } = require('electron');
const path = require('node:path');
const { Store, LANGUAGES, isValidSetting, sanitizePet } = require('./store');
const { Overlay } = require('./overlay');
const { PetTray } = require('./tray');
const { Mail } = require('./mail');
const { Feeder, buildRules } = require('./feed');
const { logicalDay, festivalToday } = require('./letters');
const F = require('../shared/festivals/catalog');
const native = require('./native');

const args = process.argv.slice(1);
const flag = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};
const SELFTEST_DIR = app.isPackaged ? null : flag('selftest');
const DEV = args.includes('--dev') || !!SELFTEST_DIR;
const TEST_PROFILE = !!flag('userdata'); // 用的是测试存档：不去动系统设置（比如开机启动项）

if (flag('userdata')) app.setPath('userData', path.resolve(flag('userdata')));
if (args.includes('--no-gpu')) app.disableHardwareAcceleration();

const STRINGS = {
  zh: require('../shared/locales/zh.json'),
  en: require('../shared/locales/en.json'),
};

let store = null;
let overlay = null;
let tray = null;
let mail = null;
let feeder = null; // 喂它吃文件（见 feed.js）
let quitting = false;

/**
 * 现在的时间。开发时可以"穿越"：
 *   --x-newday            快一天，马上看到"第二天的来信"
 *   --x-date=2026-10-31   跳到那一天（时刻不变），看看那天过节是什么样子
 * 都要配合 --userdata 用，免得把真正存档里的日期弄乱。
 */
const clockOffset = (() => {
  if (!DEV) return 0;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(flag('x-date') || '');
  if (date) {
    const now = new Date();
    const target = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), now.getHours(), now.getMinutes(), now.getSeconds());
    return target.getTime() - now.getTime();
  }
  return args.includes('--x-newday') ? 24 * 3600 * 1000 : 0;
})();
const nowMs = () => Date.now() + clockOffset;

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

function t(key, params) {
  const dig = (obj) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const text = dig(STRINGS[currentLanguage()]) ?? dig(STRINGS.en) ?? key;
  return params ? String(text).replace(/\{(\w+)\}/g, (whole, k) => (params[k] === undefined ? whole : params[k])) : text;
}

function applyAutoStart(enabled) {
  if (TEST_PROFILE) return;
  // 开发版是"用 electron.exe 打开这个文件夹"，所以要把文件夹路径作为参数一起登记。
  // 注意：路径不要自己加引号，Electron 会自动加（实测：自己再加一层，开机时就找不到文件夹了）。
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  });
}

function setSetting(key, value) {
  if (key === 'petName' && typeof value === 'string') value = value.trim();
  if (!isValidSetting(key, value)) return false;
  if (JSON.stringify(store.data.settings[key]) === JSON.stringify(value)) return true;
  store.data.settings[key] = value;
  store.saveSoon();
  if (key === 'displayMode') overlay.setDisplayMode(value);
  if (key === 'autoStart') applyAutoStart(value);
  overlay.send('settings', effectiveSettings());
  if (tray) tray.refresh();
  if (mail && ['language', 'species', 'catCoat', 'petName', 'birthday', 'cultures', 'profileAsked'].includes(key)) mail.refresh();
  if (['language', 'birthday', 'cultures'].includes(key)) refreshFestival();
  return true;
}

// ---------------------------------------------------------------- 生日、节日

/** 你的生日、过哪些节日。还没告诉它的话，节日先按语言猜 */
function profile() {
  const s = store.data.settings;
  return { birthday: s.birthday, cultures: s.cultures || F.defaultCultures(currentLanguage()), asked: s.profileAsked };
}

/** 保存生日和节日。{ skip: true } = "以后再说"：不再追问，节日照旧按语言猜 */
function setProfile(next) {
  if (next.skip) return setSetting('profileAsked', true);
  if (!isValidSetting('birthday', next.birthday) || !isValidSetting('cultures', next.cultures)) return false;
  setSetting('birthday', next.birthday);
  setSetting('cultures', next.cultures);
  setSetting('profileAsked', true);
  return true;
}

let festivalSent = 'unset';
/** 今天过不过节？变了就告诉宠物（它会换装扮、打招呼） */
function refreshFestival() {
  if (!overlay || !mail) return;
  const today = festivalToday(logicalDay(nowMs()), mail.data, profile());
  const key = JSON.stringify(today);
  if (key === festivalSent) return;
  festivalSent = key;
  overlay.send('festival', today);
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

// ---------------------------------------------------------------- 你在不在用电脑、和它玩了几次

/** 今天的使用记录（没有就新建一条） */
function todayRecord(now) {
  const usage = store.data.usage;
  const day = logicalDay(now);
  if (!usage[day]) {
    usage[day] = { first: now, last: now, activeMin: 0, pets: 0, pokes: 0, throws: 0, dizzies: 0, feeds: 0 };
    const days = Object.keys(usage).sort();
    while (days.length > 60) delete usage[days.shift()]; // 只留最近 60 天
  }
  return usage[day];
}

let usageTickAt = 0;
/**
 * 每分钟记一笔：今天第一次用电脑是几点、最后一次是几点、一共用了多少分钟。
 * 第二天的来信会用到（比如"你昨天三点才睡哦"）。
 * 只记"有没有在用"，不记你做了什么、按了什么键；数据只存在本机。
 */
function trackUsage(idleSeconds) {
  const now = nowMs();
  if (now - usageTickAt < 60000) return;
  usageTickAt = now;
  if (idleSeconds >= 60) return; // 这一分钟你没碰电脑
  const record = todayRecord(now);
  record.last = now;
  record.activeMin += 1;
  store.saveSoon();
}

const STAT_FIELDS = { pet: 'pets', poke: 'pokes', throw: 'throws', dizzy: 'dizzies' };
/** 记一次互动：摸头、戳、扔、弄晕。信里会提到（"昨天你把我扔了 5 次"）。 */
function bumpStat(kind) {
  const field = STAT_FIELDS[kind];
  if (!field) return;
  const now = nowMs();
  const record = todayRecord(now);
  record[field] += 1;
  record.last = now;
  store.saveSoon();
}

function startSystemWatch() {
  setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime(); // 你已经多少秒没碰鼠标键盘了
    overlay.send('system', { idle });
    trackUsage(idle);
    mail.check(nowMs(), idle < 120); // 新的一天、而且你在电脑前：来信
    refreshFestival(); // 过了凌晨 4 点，节日可能开始或结束了
  }, 5000);
  powerMonitor.on('lock-screen', () => overlay.pause());
  powerMonitor.on('unlock-screen', () => overlay.resume());
  powerMonitor.on('suspend', () => {
    overlay.pause();
    store.saveNow();
  });
  powerMonitor.on('resume', () => overlay.resume());
}

// ---------------------------------------------------------------- 拖文件时的大图标

// 每次文件拖到宠物身上，按这个顺序试（见 native.js 的说明）：
//   1. 告诉 Windows 的拖动图标管家"已经离开了"，它就不在我们的窗口上画了
//   2. 过一小会儿看看那个图标窗口还看不看得见；又冒出来了就再说一次（最多两次）
//   3. 还是不行：直接把那个图标窗口藏起来，文件拖走时再放出来
const DRAG_IMAGE_IDLE = { phase: 'idle', at: 0, reshown: 0, hwnd: null };
let dragImage = { ...DRAG_IMAGE_IDLE };

function hideDragImage() {
  const now = Date.now();
  if (dragImage.phase === 'idle') {
    const hr = native.dragImageLeave();
    dragImage = { ...DRAG_IMAGE_IDLE, phase: 'left', at: now };
    console.log(`[拖动图标] 请 Windows 别在宠物身上画大图标（结果码 ${hr === null ? '无' : hr.toString(16)}）`);
    return;
  }
  if (now - dragImage.at < 120) return; // 给 Windows 一点时间
  const win = native.dragImageWindow();
  if (!win || !win.visible) {
    if (dragImage.phase === 'left') {
      dragImage.phase = 'ok';
      // 找不到那个窗口也算成功：用户的 Windows 11 上就是这样（实测大图标确实不见了），后备的办法用不上
      console.log(`[拖动图标] 好了（${win ? '图标窗口已经看不见了' : '找不到 SysDragImage 窗口，后备办法用不上，但大图标已经不画了'}）`);
    }
    return;
  }
  if (dragImage.phase === 'hidden') {
    native.setDragImageWindowVisible(win.hwnd, false); // 我们藏过，它又冒出来了：再藏一次
    return;
  }
  if (dragImage.reshown < 2) {
    dragImage.reshown += 1;
    dragImage.at = now;
    native.dragImageLeave();
    console.log(`[拖动图标] 大图标还看得见，再请一次（第 ${dragImage.reshown} 次）`);
    return;
  }
  native.setDragImageWindowVisible(win.hwnd, false);
  dragImage = { ...dragImage, phase: 'hidden', hwnd: win.hwnd, at: now };
  console.log('[拖动图标] 请了也没用，直接把图标窗口藏起来了');
}

/** 文件拖走了（restore = true）或者松手了：收尾 */
function endDragImage(restore) {
  if (dragImage.phase === 'idle') return;
  if (restore && dragImage.phase === 'hidden') native.setDragImageWindowVisible(dragImage.hwnd, true);
  console.log(`[拖动图标] 结束（${restore ? '拖走了' : '松手了'}）：${dragImage.phase}`);
  dragImage = { ...DRAG_IMAGE_IDLE };
}

// ---------------------------------------------------------------- 宠物窗口发来的消息

function registerIpc() {
  // 只接受我们自己那个窗口发来的消息
  const fromOverlay = (event) => overlay && overlay.alive && event.sender === overlay.win.webContents;

  ipcMain.handle('pawmail:init', (event) => {
    if (!fromOverlay(event)) return null;
    const festival = festivalToday(logicalDay(nowMs()), mail.data, profile());
    festivalSent = JSON.stringify(festival); // 画面一启动就知道了，不用再单独发一次
    return {
      settings: effectiveSettings(),
      pet: store.data.pet,
      mail: mail.summary(),
      festival,
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

  ipcMain.on('pawmail:editing', (event, flag) => {
    if (fromOverlay(event)) overlay.setEditing(!!flag);
  });

  // 拖着文件停在宠物身上时，不让 Windows 画那个挡住它脸的大文件图标（画面那边会换成一个小纸团）。
  //   'hide'  文件正停在它身上（画面每 0.1 秒左右说一次）
  //   'leave' 文件拖走了：如果我们直接藏过 Windows 的图标窗口，把它放出来
  //   'drop'  松手了：拖放结束，Windows 自己会收拾那个图标
  ipcMain.on('pawmail:drag-image', (event, mode) => {
    if (!fromOverlay(event)) return;
    if (mode === 'hide') hideDragImage();
    else if (mode === 'leave' || mode === 'drop') endDragImage(mode === 'leave');
  });

  // 把文件拖给它吃（放进回收站）。路径由 preload 直接交给我们，画面本身拿不到完整路径。
  ipcMain.handle('pawmail:feed', async (event, paths) => {
    if (!fromOverlay(event) || !feeder) return null;
    const result = await feeder.feed(paths);
    console.log(`[feed] 拖进来 ${result.items.length} 样，吃下 ${result.eaten} 样${result.reason ? `，没吃的原因：${result.reason}` : ''}`);
    if (result.eaten > 0) {
      // 只记吃了几样，不记是什么（第二天的信里会提到："昨天你喂了我 3 个文件"）
      const now = nowMs();
      const record = todayRecord(now);
      record.feeds = (record.feeds || 0) + result.eaten;
      record.last = now;
      store.saveSoon();
      result.first = !store.data.settings.fedBefore; // 第一次喂：它会解释一下"其实是放进了回收站"
      if (result.first) setSetting('fedBefore', true);
    }
    return result;
  });

  ipcMain.on('pawmail:open-mail', (event) => {
    if (fromOverlay(event)) mail.open();
  });

  ipcMain.on('pawmail:stat', (event, kind) => {
    if (fromOverlay(event)) bumpStat(kind);
  });

  ipcMain.on('pawmail:quit', (event) => {
    if (fromOverlay(event)) quit();
  });

  ipcMain.on('pawmail:log', (event, message) => {
    if (fromOverlay(event)) console.log('[画面]', String(message).slice(0, 2000));
  });
}

// ---------------------------------------------------------------- 启动

function start() {
  app.setAppUserModelId('app.pawmail.desktop');

  store = new Store(path.join(app.getPath('userData'), 'save.json'));
  store.load();

  mail = new Mail({
    store,
    dev: DEV,
    getContext: () => {
      const lang = currentLanguage();
      return { lang, name: store.data.settings.petName, species: store.data.settings.species, catCoat: store.data.settings.catCoat, ui: STRINGS[lang].mail };
    },
    setName: (name) => setSetting('petName', name),
    getProfile: profile,
    setProfile,
    now: nowMs,
    onChange: () => {
      store.saveSoon();
      if (overlay) overlay.send('mail', mail.summary()); // 告诉宠物：有（或没有）没拆的信
      if (tray) tray.refresh();
    },
  });
  mail.register();
  mail.check(nowMs(), true); // 刚启动 = 你在电脑前。第一次运行会马上有一封"见面信"

  feeder = new Feeder({
    trash: (p) => shell.trashItem(p),
    native,
    rules: buildRules({
      getPath: (name) => app.getPath(name),
      appPath: app.getAppPath(),
      userData: app.getPath('userData'),
      exeDir: path.dirname(process.execPath),
    }),
    dryRun: DEV && args.includes('--x-feeddry'),
    log: (message) => console.log(message),
  });

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
        .run({ overlay, mail, store, feeder, outDir: path.resolve(SELFTEST_DIR), setSetting })
        .catch((err) => console.error('[selftest] 出错：', err))
        .finally(quit);
    }
  };
  overlay.create(store.data.settings.displayMode);

  tray = new PetTray({
    getModel: () => ({ t, settings: effectiveSettings(), mail: mail.summary() }),
    onSet: setSetting,
    onCommand: (type) => overlay.send('command', { type }),
    onOpenMail: () => mail.open(),
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
      mail: mail.summary(),
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
    if (!quitting) return; // 画面崩溃重开的间隙、或者只是关了信纸窗口：不要退出整个程序
    app.quit();
  });
  app.whenReady().then(start);
}
