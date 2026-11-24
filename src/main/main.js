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
//   --x-allclothes        衣柜里的衣服全部解锁（不用等信）

const { app, ipcMain, nativeImage, net, powerMonitor, safeStorage, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Store, LANGUAGES, isValidSetting, sanitizePet } = require('./store');
const { Overlay } = require('./overlay');
const { PetTray } = require('./tray');
const { Mail } = require('./mail');
const { Todos, TODO_ID } = require('./todos');
const { TodoNotes, registerApp } = require('./todo-notify');
const { PhonePush } = require('./phone');
const { Feeder, buildRules } = require('./feed');
const { logicalDay, festivalToday } = require('./letters');
const F = require('../shared/festivals/catalog');
const O = require('../shared/outfits/catalog');
const native = require('./native');
const { setupLog } = require('./log');
const { LedgeWatch } = require('./ledges');

// 程序在 Windows 里的 ID：开机启动项的名字、任务栏分组、通知都用它（和 electron-builder.yml 的 appId 一样）
const APP_ID = 'app.pawmail.desktop';

// 托盘菜单「帮助与反馈」里打开的网页。只是用浏览器打开，程序自己不联网（唯一会联网的是你自己打开的手机提醒，见 phone.js）
const LINKS = {
  releases: 'https://github.com/lisirith/pawmail/releases', // 检查新版本：看看有没有比菜单里写的版本号更新的
  issues: 'https://github.com/lisirith/pawmail/issues', // 反馈问题
};

const args = process.argv.slice(1);
const flag = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};
// 自检会清空信箱、改设置。所以在打包好的正式版里，只有同时指定了测试存档（--userdata）才允许跑，
// 这样它绝不会碰到你真正的存档；开发版里随时可以跑（npm run selftest 本来就带着 --userdata）
const SELFTEST_DIR = !app.isPackaged || flag('userdata') ? flag('selftest') : null;
const DEV = args.includes('--dev') || !!SELFTEST_DIR;
const TEST_PROFILE = !!flag('userdata'); // 用的是测试存档：不去动系统设置（比如开机启动项）
const ALL_CLOTHES = DEV && args.includes('--x-allclothes');

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
let todos = null; // 待办事项（见 todos.js）
let notes = null; // 待办的 Windows 通知（见 todo-notify.js）
let phone = null; // 待办的手机提醒（见 phone.js），默认关着
let trayIcon = null; // 托盘图标（宠物的头，画面画好传过来的 PNG）：{ dataUrl, image }，通知上也用它
let feeder = null; // 喂它吃文件（见 feed.js）
let logFiles = null; // 日志文件在哪儿（见 log.js）
let ledgeWatch = null; // 看着屏幕上的窗口：宠物可以站到窗口顶上（见 ledges.js）
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
  if (key === 'outfit') {
    value = O.sanitizeOutfit(value);
    if (!mail || !mail.ownsOutfit(value)) return false; // 还没收到的衣服不能穿
  }
  if (JSON.stringify(store.data.settings[key]) === JSON.stringify(value)) return true;
  store.data.settings[key] = value;
  store.saveSoon();
  if (key === 'displayMode') overlay.setDisplayMode(value);
  if (key === 'autoStart') applyAutoStart(value);
  if (key === 'hideOnFullscreen' && !value) showAfterFullscreen(); // 关掉"全屏时躲起来"：正躲着的话马上出来
  if ((key === 'windowPerch' || key === 'displayMode') && ledgeWatch) ledgeWatch.refresh(); // 能不能站到窗口上变了
  if (key === 'todoNotify' && !value && notes) notes.closeAll(); // 关掉待办通知：还挂着的也收起来
  if (key === 'language') registerNotifyApp(); // 通知左上角的程序名跟着语言走
  overlay.send('settings', effectiveSettings());
  if (tray) tray.refresh();
  if (mail && ['language', 'species', 'catCoat', 'petName', 'birthday', 'cultures', 'profileAsked', 'outfit', 'todoNotify'].includes(key)) mail.refresh();
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

// ---------------------------------------------------------------- 待办的提醒（见 todos.js、todo-notify.js）

/** 还有多久，写成人话：15 分钟 / 1 小时 / 1 小时 30 分钟 / 1 天 */
function leftText(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return t('notify.min', { n: min });
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? t('notify.hourMin', { h, m }) : t('notify.hour', { n: h });
  }
  return t('notify.day', { n: Math.round(min / (24 * 60)) });
}

/** 通知上的字：一件事的话，标题就是那件事；几件同时到点，标题写"3 件待办到点了"、下面列出来 */
function noteTexts(kind, list) {
  const name = store.data.settings.petName;
  const done = t('notify.done');
  if (list.length > 1) {
    const all = list.map((todo) => todo.text).join(t('notify.join'));
    return { title: t(kind === 'due' ? 'notify.many' : 'notify.manySoon', { n: list.length }), body: all.length > 120 ? `${all.slice(0, 119)}…` : all, done };
  }
  const todo = list[0];
  const key = kind === 'due' ? 'notify.due' : 'notify.soon';
  return { title: todo.text, body: t(name ? `${key}From` : key, { name, left: leftText(todo.due - nowMs()) }), done };
}

/**
 * 发到手机上的字：和 Windows 通知一样。勾了"不发具体内容"的话，只说"有一件待办到点了"，不写是什么事。
 * kind = 'test'：「发一条试试」那一条
 */
function phoneTexts(kind, list, hide) {
  if (kind === 'test') return { title: t('appName'), body: t('phone.test') };
  if (hide) {
    const many = list.length > 1;
    const key = kind === 'due' ? (many ? 'phone.hiddenDueMany' : 'phone.hiddenDue') : many ? 'phone.hiddenSoonMany' : 'phone.hiddenSoon';
    return { title: t('appName'), body: t(key, { n: list.length, left: leftText(list[0].due - nowMs()) }) };
  }
  const { title, body } = noteTexts(kind, list);
  return { title, body };
}

/** 你在电脑前、而且没在全屏打游戏（"我在电脑前时不发到手机"用） */
function userPresent() {
  return powerMonitor.getSystemIdleTime() < 120 && !(overlay && overlay.hidden);
}

/** 通知的左上角写着程序名、带个小图标：告诉 Windows 我们叫什么（见 todo-notify.js 开头）。测试存档不碰注册表 */
function registerNotifyApp() {
  if (TEST_PROFILE) return;
  registerApp({ appId: APP_ID, name: t('appName'), iconFile: path.join(app.getPath('userData'), 'notify-icon.png'), log: (m) => console.log(m) });
}

/** 画面画好了新的托盘图标（宠物的头）：通知上也用它；存一份 PNG 给 Windows 当通知左上角的小图标 */
function setTrayIcon(dataUrl) {
  if (trayIcon && trayIcon.dataUrl === dataUrl) return;
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) return;
  trayIcon = { dataUrl, image };
  if (tray) tray.setIcon(image);
  if (TEST_PROFILE) return;
  fs.promises.writeFile(path.join(app.getPath('userData'), 'notify-icon.png'), image.toPNG()).catch((err) => console.log(`[待办] 存通知图标失败：${err.message}`));
}

// ---------------------------------------------------------------- 退出

function quit() {
  if (quitting) return;
  quitting = true;
  if (notes) notes.closeAll(); // 程序退出以后，留在通知中心里的待办通知点了也没反应，先收起来
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
    usage[day] = { first: now, last: now, activeMin: 0, pets: 0, pokes: 0, throws: 0, dizzies: 0, feeds: 0, todosDone: 0 };
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
    // 待办到点了：你在电脑前、宠物露着才提醒（全屏打游戏时它躲着，等你出来再说）
    todos.check(idle < 120 && overlay.alive && overlay.ready && !overlay.hidden);
    refreshFestival(); // 过了凌晨 4 点，节日可能开始或结束了
  }, 5000);
  // 全屏时躲起来（自检时不看：自检要截图，不能因为你正好开着全屏的程序就失败）
  if (!SELFTEST_DIR) setInterval(watchFullscreen, 500);
  powerMonitor.on('lock-screen', () => overlay.pause());
  powerMonitor.on('unlock-screen', () => overlay.resume());
  powerMonitor.on('suspend', () => {
    overlay.pause();
    store.saveNow();
  });
  powerMonitor.on('resume', () => overlay.resume());
}

// ---------------------------------------------------------------- 全屏时躲起来

// 有人在全屏打游戏、全屏看视频时，宠物在画面上走来走去会很烦。所以每半秒看一次
// "最前面的窗口是不是铺满了整个主屏幕"（native.js，只看窗口大小，不看是什么程序）：
//   - 连着两次都是全屏（不到 1 秒）→ 整块窗口藏起来
//   - 退出全屏后连着四次都不是（约 2 秒）→ 回来
// 要连着几次才算，是为了切换窗口时一闪而过的全屏画面不会让它忽隐忽现。
let fullscreenStreak = 0; // 正数 = 连着几次是全屏；负数 = 连着几次不是

function showAfterFullscreen() {
  fullscreenStreak = 0;
  if (overlay && overlay.hidden) {
    overlay.setHidden(false);
    console.log('[全屏] 回来了'); // 写进日志：有人说"宠物不见了"时，看日志就知道是不是躲起来了
  }
}

function watchFullscreen() {
  if (!overlay || quitting) return;
  // 没开这个功能、或者你正在画活动范围（那时我们的窗口要在最前面）：不躲
  if (!store.data.settings.hideOnFullscreen || overlay.editing) {
    showAfterFullscreen();
    return;
  }
  const full = native.foregroundFullscreen();
  if (full === null) return; // Windows 的截图遮罩之类盖在最前面：保持原样，不躲也不出来（见 native.js 的 OVERLAY_CLASSES）
  fullscreenStreak = full ? Math.max(1, fullscreenStreak + 1) : Math.min(-1, fullscreenStreak - 1);
  if (fullscreenStreak >= 2 && !overlay.hidden) {
    overlay.setHidden(true);
    console.log('[全屏] 最前面是全屏的程序，先躲起来');
  } else if (fullscreenStreak <= -4) {
    showAfterFullscreen();
  }
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
    if (!fromOverlay(event)) return;
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length < 300000) {
      setTrayIcon(dataUrl);
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

  ipcMain.on('pawmail:open-mail', (event, view) => {
    if (fromOverlay(event)) mail.open(view === 'wardrobe' || view === 'todos' ? { view } : undefined);
  });

  // 宠物提醒你一件待办，你点了它一下：知道了，这件不再提醒
  ipcMain.on('pawmail:todo-ack', (event, id) => {
    if (fromOverlay(event) && typeof id === 'string' && TODO_ID.test(id)) todos.ack(id);
  });

  ipcMain.on('pawmail:stat', (event, kind) => {
    if (fromOverlay(event)) bumpStat(kind);
  });

  ipcMain.on('pawmail:quit', (event) => {
    if (fromOverlay(event)) quit();
  });

  ipcMain.on('pawmail:perch', (event, id) => {
    if (!fromOverlay(event) || !ledgeWatch) return;
    ledgeWatch.setPerch(typeof id === 'string' && /^\d{1,20}$/.test(id) ? id : null);
  });

  ipcMain.on('pawmail:log', (event, message) => {
    if (fromOverlay(event)) console.log('[画面]', String(message).slice(0, 2000));
  });
}

// ---------------------------------------------------------------- 启动

function start() {
  app.setAppUserModelId(APP_ID);

  store = new Store(path.join(app.getPath('userData'), 'save.json'));
  store.load();
  registerNotifyApp();

  // 待办的手机提醒（默认关着；自检时换成假的"发请求"，不真的联网，见 selftest.js 的 fakeFetch）
  phone = new PhonePush({
    store,
    fetch: SELFTEST_DIR ? require('./selftest').fakeFetch : (url, options) => net.fetch(url, options),
    safeStorage,
    texts: phoneTexts,
    onChange: () => {
      store.saveSoon();
      if (mail) mail.refresh();
    },
    log: (message) => console.log(message),
  });

  // 待办的 Windows 通知（自检时换成假的，不在你的屏幕上真的弹出来，见 selftest.js 的 FakeNote）
  notes = new TodoNotes({
    texts: noteTexts,
    icon: () => (trayIcon ? trayIcon.image : null),
    persist: () => !(overlay && overlay.hidden), // 全屏的程序在最前面（打游戏）时，到点的那条也不一直挡在屏幕上
    onOpen: () => mail.open({ view: 'todos' }),
    onAck: (ids) => {
      for (const id of ids) todos.ack(id);
      overlay.send('remind-off', { ids }); // 宠物要是正举着牌子，就放下
    },
    onDone: (id) => todos.setDone(id, true),
    log: (message) => console.log(message),
    Note: SELFTEST_DIR ? require('./selftest').FakeNote : undefined,
  });

  // 待办事项：到点了发通知、让宠物提醒你；勾掉一件，宠物替你高兴，今天的记录 +1（第二天的信里会提）
  todos = new Todos({
    store,
    now: nowMs,
    onChange: () => {
      store.saveSoon();
      if (mail) mail.refresh();
    },
    onRemind: (todo, kind) => {
      console.log(kind === 'soon' ? '[待办] 提前提醒一件' : '[待办] 提醒一件'); // 日志里不写是什么事
      overlay.send('remind', { id: todo.id, text: todo.text, kind, left: kind === 'soon' ? leftText(todo.due - nowMs()) : null });
    },
    onNotify: (kind, list) => {
      if (store.data.settings.todoNotify) notes.show(kind, list);
      phone.send(kind, list, { present: userPresent() }); // 没开手机提醒的话什么都不做
    },
    onSettled: (ids) => notes.settle(ids),
    onDone: (todo) => {
      todayRecord(nowMs()).todosDone += 1;
      overlay.send('todo-done', { id: todo.id, text: todo.text });
    },
  });

  mail = new Mail({
    store,
    todos,
    phone,
    dev: DEV,
    getContext: () => {
      const lang = currentLanguage();
      const s = store.data.settings;
      const today = festivalToday(logicalDay(nowMs()), store.data.mail, profile()); // 过节的话，衣柜里要说一声"今天帽子先用节日的"
      return { lang, name: s.petName, species: s.species, catCoat: s.catCoat, outfit: s.outfit, festivalLook: today ? today.look : null, todoNotify: s.todoNotify, ui: STRINGS[lang].mail };
    },
    setName: (name) => setSetting('petName', name),
    getProfile: profile,
    setProfile,
    setOutfit: (outfit) => setSetting('outfit', outfit),
    setTodoNotify: (on) => setSetting('todoNotify', on),
    allClothes: ALL_CLOTHES,
    now: nowMs,
    onChange: () => {
      store.saveSoon();
      if (overlay) overlay.send('mail', mail.summary()); // 告诉宠物：有（或没有）没拆的信
      if (tray) tray.refresh();
    },
  });
  mail.register();
  // 存档里穿着一件你其实没有的衣服（比如开发时用 --x-allclothes 解锁过）：先脱掉
  store.data.settings.outfit = O.keepOwned(store.data.settings.outfit, mail.ownedOutfits());
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

  // 开了"开机启动"的话，每次启动都把启动项重新登记一遍，指到程序现在所在的位置：
  // 免安装版解压后挪过文件夹、或者升级后位置变了，开机启动也不会失效
  if (store.data.settings.autoStart) applyAutoStart(true);

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
    logDiagnostics(); // 每次画面准备好都记一笔：版本、屏幕大小、缩放……排查问题时最先要看的
    if (ledgeWatch) ledgeWatch.refresh(); // 画面（重新）启动了：把窗口顶边再告诉它一遍
    if (args.includes('--devtools')) overlay.win.webContents.openDevTools({ mode: 'detach', activate: false });
    if (SELFTEST_DIR) {
      require('./selftest')
        .run({ overlay, mail, store, feeder, outDir: path.resolve(SELFTEST_DIR), setSetting, ledgeWatch, phone })
        .catch((err) => console.error('[selftest] 出错：', err))
        .finally(quit);
    }
  };
  overlay.create(store.data.settings.displayMode);
  // 启动的时候正好有全屏的程序在最前面（比如开机后马上开了游戏）：一开始就不露面，等退出全屏再出来。
  // 不然它会先在人家的画面上闪一下，过一秒才躲起来
  if (!SELFTEST_DIR && store.data.settings.hideOnFullscreen && native.foregroundFullscreen()) {
    fullscreenStreak = 2;
    overlay.setHidden(true);
    console.log('[全屏] 启动时最前面就是全屏的程序，先不露面');
  }

  tray = new PetTray({
    getModel: () => ({ t, settings: effectiveSettings(), mail: mail.summary(), version: app.getVersion() }),
    onSet: setSetting,
    onCommand: (type) => overlay.send('command', { type }),
    onOpenMail: (view) => mail.open(view ? { view } : undefined),
    onHelp: (what) => {
      if (what === 'releases' || what === 'issues') shell.openExternal(LINKS[what]);
      else if (what === 'logs' && logFiles) shell.openPath(logFiles.dir);
    },
    onQuit: quit,
  });
  tray.create();
  if (trayIcon) tray.setIcon(trayIcon.image); // 画面比托盘先画好了宠物的头

  // 窗口顶边：宠物可以站上去（见 ledges.js）。只在"始终在最前面"模式、宠物露着的时候看
  ledgeWatch = new LedgeWatch({
    native,
    toLocal: (r) => {
      // Windows 给的是物理像素；画面用的是缩放后的坐标（125% 缩放时 1.25 个物理像素 = 1），而且从工作区的左上角算起
      const d = screen.screenToDipRect(null, { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
      const b = overlay.bounds;
      return { left: d.x - b.x, top: d.y - b.y, right: d.x + d.width - b.x, bottom: d.y + d.height - b.y };
    },
    view: () => ({ width: overlay.bounds.width, height: overlay.bounds.height }),
    send: (ledges) => overlay.send('ledges', ledges),
    allowed: () => overlay.displayMode === 'top' && store.data.settings.windowPerch !== false,
    active: () => overlay.alive && overlay.ready && overlay.polling && !overlay.hidden,
    skip: () => new Set(overlay.alive ? [String(native.handleOf(overlay.win))] : []),
    log: (message) => console.log(message),
  });
  ledgeWatch.start();

  startSystemWatch();
}

function logDiagnostics() {
  const display = screen.getPrimaryDisplay();
  console.log(
    '[diag]',
    JSON.stringify({
      version: app.getVersion(),
      windows: process.getSystemVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      display: { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor },
      window: overlay.win.getBounds(),
      displayMode: overlay.displayMode,
      nativeHelpers: native.available,
      packaged: app.isPackaged, // 是不是打包好的正式版（不是的话就是开发版）
      exe: process.execPath,
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
  // 拿到了"只许开一只"的锁才开始写日志（被挡回去的第二只什么都不用记）
  logFiles = setupLog(path.join(app.getPath('userData'), 'logs'));
  // 后台出了没人接住的错：记进日志，宠物照常运行（不弹出吓人的报错框）
  process.on('uncaughtException', (err) => console.error('[出错]', err && err.stack ? err.stack : err));
  process.on('unhandledRejection', (err) => console.error('[出错]', err && err.stack ? err.stack : err));
  app.on('child-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') console.error('[子进程] 退出了：', details.type, details.reason);
  });
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
