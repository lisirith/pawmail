'use strict';
// 自检：自动把最关键的几件事检查一遍，不需要人动鼠标。
// 运行方式见 package.json 里的 "selftest"。结果写到 <输出文件夹>/result.json，截图写到 shot.png。
//
// 检查的内容：
//   画面有没有正常启动、有没有铺满窗口
//   鼠标不在宠物身上时，点击是不是真的"穿过"了我们的窗口（直接问 Windows：这个点最上面是谁的窗口）
//   鼠标移到宠物身上时，是不是"接住"了
//   鼠标离开后，是不是又放行了
//   画面如果卡死，后台会不会自动恢复穿透（否则会有一块看不见的玻璃挡住屏幕）
//   两种显示模式能不能切换
//   窗口背景是不是真的透明

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { screen } = require('electron');
const native = require('./native');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 自检用的假通知（代替 Electron 的 Notification，见 todo-notify.js）：不在屏幕上真的弹出来，只记下弹了什么。
 * 自检可以假装你点了它（emit('click')）、点了按钮（emit('action', { actionIndex })）、关掉了它（emit('close', { reason: 'userCanceled' })）
 */
class FakeNote extends EventEmitter {
  static shown = [];
  static isSupported() {
    return true;
  }
  constructor(options) {
    super();
    this.options = options;
    this.closed = false;
  }
  show() {
    FakeNote.shown.push(this);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', { reason: 'applicationHidden' });
  }
}

/**
 * 自检用的假"发请求"（代替 Electron 的 net.fetch，见 phone.js）：不真的联网，只记下发了什么，假装对方说"收到了"
 */
async function fakeFetch(url, options) {
  fakeFetch.requests.push({ url, body: JSON.parse(options.body) });
  return { ok: true, status: 200, json: async () => ({ code: 0, message: '' }) };
}
fakeFetch.requests = [];

async function run({ overlay, mail, store, outDir, setSetting, ledgeWatch, phone }) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = overlay.win.webContents;
  const js = (code) => wc.executeJavaScript(`(() => { ${code} })()`, true);
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail });
    console.log(`[selftest] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + JSON.stringify(detail) : ''}`);
  };

  overlay.pollEnabled = false; // 不用真实鼠标，改用下面模拟的位置
  // 先不让它站到窗口上：别的检查会打开信纸窗口、让宠物往下掉，不能让它落到信纸窗口顶上。testLedges 里再打开
  setSetting('windowPerch', false);
  await wait(1500);

  // 1. 画面启动了吗？把时间快进到宠物跑进屏幕站好。
  const info = await js(`
    const P = window.__pawmail;
    if (!P) return null;
    P.pause();
    let n = 0;
    while (P.brain.name === 'arrive' && n++ < 1200) P.run(1 / 60);
    P.brain.queue.length = 0;
    P.brain.start('idle');
    P.setPointer(5, 5);
    P.run(0.5);
    return {
      w: P.world.width, h: P.world.height, x: P.pet.x, y: P.pet.y, scale: P.world.scale,
      dpr: window.devicePixelRatio, species: P.pet.sp.id, activity: P.brain.name, arriveFrames: n,
      hasBridge: typeof window.pawmail === 'object',
    };
  `);
  check('画面正常启动', !!info && info.hasBridge, info);
  if (!info) return finish();

  const bounds = overlay.win.getContentBounds();
  check('画面铺满整个窗口', Math.abs(info.w - bounds.width) <= 1 && Math.abs(info.h - bounds.height) <= 1, { bounds });
  check('宠物站在窗口底边（任务栏上沿）', Math.abs(info.y - (info.h - 3)) < 1 && info.x > 0 && info.x < info.w, { x: info.x, y: info.y });

  // 宠物身上的一个点（胸口），换算成屏幕物理像素
  const chest = { x: info.x, y: info.y - 50 * info.scale };
  const chestOnScreen = screen.dipToScreenPoint({ x: Math.round(bounds.x + chest.x), y: Math.round(bounds.y + chest.y) });
  const mine = native.handleOf(overlay.win);
  const topWindowAtPet = () => native.rootWindowAt(chestOnScreen.x, chestOnScreen.y);
  const canProbe = topWindowAtPet() !== null;

  // 2. 鼠标不在宠物身上：应该穿透
  await wait(200);
  check('鼠标不在宠物身上时，点击会穿过窗口', !overlay.capturing && (!canProbe || topWindowAtPet() !== mine), {
    capturing: overlay.capturing,
    probed: canProbe,
  });

  // 3. 鼠标移到宠物身上：应该接住
  await js(`const P = window.__pawmail; P.setPointer(${chest.x}, ${chest.y}); P.run(0.1); return true;`);
  await wait(200);
  check('鼠标在宠物身上时，窗口会接住点击', overlay.capturing && (!canProbe || topWindowAtPet() === mine), {
    capturing: overlay.capturing,
    probed: canProbe,
  });

  // 4. 鼠标离开：应该恢复穿透
  await js(`const P = window.__pawmail; P.setPointer(5, 5); P.run(0.1); return true;`);
  await wait(200);
  check('鼠标离开宠物后，恢复穿透', !overlay.capturing && (!canProbe || topWindowAtPet() !== mine), {
    capturing: overlay.capturing,
  });

  // 5. 画面"卡死"（这里是暂停状态，不会再发确认）：后台应该在 1 秒内自动恢复穿透
  await js(`const P = window.__pawmail; P.setPointer(${chest.x}, ${chest.y}); P.run(0.1); return true;`);
  await wait(100);
  const grabbed = overlay.capturing;
  await wait(1100);
  check('画面不再确认时，后台自动恢复穿透（保险）', grabbed && !overlay.capturing, { grabbed, after: overlay.capturing });
  await js(`const P = window.__pawmail; P.setPointer(5, 5); P.run(0.1); return true;`);

  // 6. 显示模式
  setSetting('displayMode', 'desktop');
  await wait(250);
  const desktopOk = !overlay.win.isAlwaysOnTop();
  setSetting('displayMode', 'top');
  await wait(250);
  check('可以在"最前面"和"只在桌面"之间切换', desktopOk && overlay.win.isAlwaysOnTop(), { nativeHelpers: native.available });

  // 7. 设置能传到画面
  setSetting('species', info.species === 'cat' ? 'panda' : 'cat');
  await wait(250);
  const swapped = await js(`return window.__pawmail.pet.sp.id;`);
  // 后来加的动物也挨个切过去：画面换成了它，存档里也记住了
  const later = {};
  for (const id of ['capybara', 'shiba', 'redpanda', 'bunny', 'fox', 'penguin', 'otter']) {
    setSetting('species', id);
    await wait(250);
    const shown = await js(`const P = window.__pawmail; P.run(0.2); return P.pet.sp.id;`);
    later[id] = { shown, saved: store.data.settings.species };
  }
  setSetting('species', info.species);
  await wait(250);
  const laterOk = Object.entries(later).every(([id, r]) => r.shown === id && r.saved === id);
  check('从后台切换动物，画面会跟着变（猫、熊猫、卡皮巴拉、柴犬、小熊猫、兔子、狐狸、企鹅、水獭）', swapped !== info.species && laterOk, { swapped, ...later });

  // 陪它玩（右键「陪它玩…」，见 pet/play.js）：每种动物的小游戏都能开始，再点一次"不玩了"能收工，桌面上的道具也收起来。
  // 柴犬的叼球要鼠标在屏幕上才玩得起来（自检时鼠标在哪说不准），这里不测
  const plays = {};
  for (const id of ['cat', 'fox', 'redpanda', 'panda', 'bunny', 'capybara', 'otter', 'penguin']) {
    setSetting('species', id);
    await wait(250);
    plays[id] = await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.2);
      const ok = P.brain.play(); P.run(1.5); const name = P.brain.name; const playing = P.brain.playing;
      P.brain.play(); P.run(4);
      const st = P.world.play;
      return { ok, name, playing, after: P.brain.name, stillPlaying: P.brain.playing, leftovers: !!(st.cursor || st.ground.length || st.handler || P.pet.playProp) };`);
  }
  setSetting('species', info.species);
  await wait(250);
  const playOk = Object.values(plays).every((r) => r && r.ok && r.playing && !r.stillPlaying && !r.leftovers);
  check('右键「陪它玩…」：八种动物的小游戏都能开始，点"不玩了"能收工（桌面上的道具也收起来）', playOk, plays);

  const previousCoat = store.data.settings.catCoat;
  setSetting('species', 'cat'); setSetting('catCoat', 'lucky');
  await wait(250);
  const coat = await js(`return [window.__pawmail.pet.sp.id, window.__pawmail.pet.sp.coatId];`);
  check('选择招财猫只换花色，桌宠与信箱共用同一设置', coat[0] === 'cat' && coat[1] === 'lucky' && mail.payload().catCoat === 'lucky', { coat });
  setSetting('catCoat', previousCoat); setSetting('species', info.species);
  await wait(150);

  // 8. 截一张图，并检查背景是不是真的透明
  await js(`const P = window.__pawmail; P.brain.start('greet', { line: 'hello' }); P.run(0.9); return true;`);
  await wait(600);
  const rect = {
    x: Math.max(0, Math.round(info.x - 220)),
    y: Math.max(0, Math.round(info.y - 330)),
    width: 440,
    height: 334,
  };
  const image = await wc.capturePage(rect);
  fs.writeFileSync(path.join(outDir, 'shot.png'), image.toPNG());
  const bitmap = image.toBitmap();
  const size = image.getSize();
  const cornerAlpha = bitmap[3]; // 左上角第一个像素的透明度
  let opaque = 0;
  for (let i = 3; i < bitmap.length; i += 4) if (bitmap[i] > 200) opaque += 1;
  check('窗口背景是透明的，而且画出了宠物', cornerAlpha === 0 && opaque > 2000, { cornerAlpha, opaquePixels: opaque, size });

  await testArea();
  await testFeed();
  await testMail();
  await testWardrobe();
  await testTodos();
  await testPhone();
  await testReports();
  await testFestivals();
  await testFullscreen();
  await testHints();
  await testLedges();
  await testLog();
  return finish();

  // ---------------------------------------------------------------- 站到窗口顶上

  async function testLedges() {
    const { BrowserWindow } = require('electron');
    const b = overlay.bounds;
    // 开一个普通的窗口（不抢焦点），看画面认不认得出它的顶边。
    // 设成"总在最前面"：跑自检时你可能开着一个最大化的窗口，普通窗口会被它整个挡住（那样本来就不该站上去）
    const box = { x: b.x + Math.round(b.width * 0.25), y: b.y + Math.round(b.height * 0.45), width: 560, height: 260 };
    const win = new BrowserWindow({ ...box, show: false, title: 'Pawmail selftest', skipTaskbar: true, alwaysOnTop: true });
    win.loadURL('data:text/html,<body style="background:%23dfe7f1"></body>');
    win.showInactive();
    win.moveTop();
    const id = String(native.handleOf(win));
    // 只认自检自己开的窗口：你桌面上开着的普通窗口如果正好在附近，宠物会落到它上面（那是对的），检查就乱了
    ledgeWatch.only = new Set([id]);
    setSetting('windowPerch', true);
    await wait(900);
    const ledgeOf = async () => js(`return window.__pawmail.world.ledges.find((L) => L.id === ${JSON.stringify(id)}) || null;`);
    const L = await ledgeOf();
    check('认出了普通窗口的顶边（位置对得上）', !!L && Math.abs(L.y - (box.y - b.y)) <= 3 && L.segs.length >= 1, { ledge: L, expectTop: box.y - b.y });

    // 把它放到窗口顶上：松手后掉下去，落在顶边上
    const dropOn = (x) => js(`
      const P = window.__pawmail;
      const L = P.world.ledges.find((l) => l.id === ${JSON.stringify(id)});
      if (!L) return null;
      P.brain.queue.length = 0;
      P.brain.start('idle');
      P.pet.grab(0, -60);
      P.brain.onGrab();
      P.pet.x = ${x === undefined ? '(L.segs[0][0] + L.segs[0][1]) / 2' : x};
      P.pet.y = L.y - 90;
      P.pet.release(0, 0);
      P.brain.onRelease();
      P.run(1.6);
      return { perch: P.pet.perch && P.pet.perch.id, mode: P.pet.mode, x: P.pet.x, y: P.pet.y, ledgeY: L.y, activity: P.brain.name };
    `);
    const on = await dropOn();
    await wait(200);
    check('放到窗口顶上，它就站在顶边上；后台知道它站在哪个窗口上', !!on && on.perch === id && on.mode === 'ground' && Math.abs(on.y - on.ledgeY) < 0.6 && ledgeWatch.perchId === id, {
      ...on,
      watching: ledgeWatch.perchId,
    });

    // 拖动窗口：它跟着走（先让它坐好，免得它自己正好在窗口上走几步，量出来的距离就不准了）
    const seated = await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('sit'); P.run(0.05); return { x: P.pet.x, y: P.pet.y };`);
    if (on) Object.assign(on, seated);
    win.setPosition(box.x + 120, box.y - 60);
    await wait(500);
    const moved = await js(`
      const P = window.__pawmail;
      P.run(0.3);
      const L = P.world.ledges.find((l) => l.id === ${JSON.stringify(id)});
      return { perch: P.pet.perch && P.pet.perch.id, x: P.pet.x, y: P.pet.y, ledgeY: L && L.y };
    `);
    check('窗口被拖走，它跟着一起走', !!on && moved.perch === id && Math.abs(moved.x - on.x - 120) < 3 && Math.abs(moved.y - moved.ledgeY) < 0.6 && Math.abs(moved.ledgeY - (on.ledgeY - 60)) <= 3, {
      before: on && { x: on.x, y: on.y },
      after: moved,
    });

    // 另一个窗口盖住了它脚下那一段：掉下去（落到地上）
    const P0 = await js(`const P = window.__pawmail; return { x: P.pet.x, y: P.pet.y };`);
    const cover = new BrowserWindow({ x: b.x + Math.round(P0.x) - 120, y: b.y + Math.round(P0.y) - 80, width: 240, height: 200, show: false, skipTaskbar: true, alwaysOnTop: true });
    cover.loadURL('data:text/html,<body style="background:%23f1dfe0"></body>');
    cover.showInactive();
    cover.moveTop();
    await wait(900);
    const covered = await js(`
      const P = window.__pawmail;
      P.run(2.5);
      return { perch: P.pet.perch && P.pet.perch.id, mode: P.pet.mode, y: P.pet.y, ground: P.world.groundY, activity: P.brain.name };
    `);
    check('脚下那一段被别的窗口挡住：它掉下去，落到地上', moved.perch === id && covered.perch !== id && covered.mode === 'ground' && Math.abs(covered.y - covered.ground) < 0.6, covered);
    cover.destroy();

    // 再放上去，然后把窗口关掉：掉下去
    await wait(800);
    const again = await dropOn();
    win.destroy();
    await wait(900);
    const closed = await js(`
      const P = window.__pawmail;
      P.run(2.5);
      return { perch: P.pet.perch && P.pet.perch.id, mode: P.pet.mode, y: P.pet.y, ground: P.world.groundY, ledges: P.world.ledges.length };
    `);
    check('站着的窗口被关掉：它掉下去，落到地上', !!again && again.perch === id && !closed.perch && closed.mode === 'ground' && Math.abs(closed.y - closed.ground) < 0.6, { again, closed });

    // 自己上去：开一个窗口，让它做 hopUp / climbUp（only = 只认这个窗口），一直推进到它站在这个窗口顶上
    const openWin = (box, color) => {
      const w = new BrowserWindow({ ...box, show: false, skipTaskbar: true, alwaysOnTop: true });
      w.loadURL(`data:text/html,<body style="background:%23${color}"></body>`);
      w.showInactive();
      w.moveTop();
      return w;
    };
    const getUp = (winId, activity, startX) => js(`
      const P = window.__pawmail;
      const id = ${JSON.stringify(winId)};
      const L = P.world.ledges.find((l) => l.id === id);
      if (!L) return { found: false, ledges: P.world.ledges.map((l) => l.id) };
      P.brain.queue.length = 0;
      P.brain.start('idle');
      P.pet.x = ${startX};
      P.run(0.3);
      P.brain.start(${JSON.stringify(activity)}, { only: id });
      const planned = !!P.brain.current.plan;
      const seen = [];
      let n = 0;
      while (!(P.pet.perch && P.pet.perch.id === id && P.pet.mode === 'ground') && n++ < 200) {
        P.run(0.25);
        const tag = P.brain.name + '/' + (P.brain.current.phase || '');
        if (seen[seen.length - 1] !== tag) seen.push(tag);
      }
      return { found: true, planned, perch: P.pet.perch && P.pet.perch.id, mode: P.pet.mode, y: P.pet.y, ledgeY: L.y,
        bottom: L.bottom, sideL: L.sideL, ground: P.world.groundY, seconds: n / 4, seen: seen.slice(0, 12) };
    `);
    const geo = await js(`const P = window.__pawmail; return { S: P.world.scale, g: P.world.groundY, w: P.world.width };`);
    // 矮窗口：顶边比地面高 95（按宠物大小算），宠物在它左边，跳上去
    await wait(800);
    const lowBox = { x: b.x + Math.round(geo.w * 0.55), y: b.y + Math.round(geo.g - 95 * geo.S), width: 380, height: 200 };
    const low = openWin(lowBox, 'e3efe0');
    const lowId = String(native.handleOf(low));
    ledgeWatch.only.add(lowId);
    await wait(900);
    const hop = await getUp(lowId, 'hopUp', `L.x - 150 * P.world.scale`);
    check('自己跳上一个矮窗口', hop.found && hop.planned && hop.perch === lowId && Math.abs(hop.y - hop.ledgeY) < 0.6, hop);
    low.destroy();
    // 伸到地面的高窗口：顶边比地面高 300，宠物在它左边，顺着窗口的左边爬上去
    await wait(800);
    await js(`window.__pawmail.run(3); return true;`); // 脚下的窗口关掉了：先落回地面
    const tallTop = Math.round(geo.g - 300 * geo.S);
    const tallBox = { x: b.x + Math.round(geo.w * 0.4), y: b.y + tallTop, width: 420, height: Math.round(b.height - tallTop + 60) };
    const tall = openWin(tallBox, 'e0e6f1');
    const tallId = String(native.handleOf(tall));
    ledgeWatch.only.add(tallId);
    await wait(900);
    const climbed = await getUp(tallId, 'climbUp', `L.x - 200 * P.world.scale`);
    check('自己顺着伸到地面的窗口侧边爬上去', climbed.found && climbed.planned && climbed.perch === tallId && Math.abs(climbed.y - climbed.ledgeY) < 0.6, climbed);
    tall.destroy();
    await wait(800);
    await js(`window.__pawmail.run(3); return true;`);

    // 关掉"站到窗口上"：后台不再发窗口顶边
    setSetting('windowPerch', false);
    await wait(700);
    const off = await js(`return window.__pawmail.world.ledges.length;`);
    check('关掉"站到窗口上"以后，没有可以站的窗口了', off === 0, { ledges: off });
    ledgeWatch.only = null;
    await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.3); return true;`);
  }

  // ---------------------------------------------------------------- 日志文件

  async function testLog() {
    const { app } = require('electron');
    const os = require('node:os');
    const file = path.join(app.getPath('userData'), 'logs', 'pawmail.log');
    console.log('[selftest] 写一行带用户文件夹的日志：', path.join(os.homedir(), 'pawmail-selftest.txt'));
    await wait(500); // 日志是排队写的，等它落到硬盘上
    let text = '';
    try {
      // 测试存档的日志会一直累加，正好在这次自检里超过 512 KB 的话，前半截被改名成 pawmail.old.log：两份接起来看
      const old = path.join(path.dirname(file), 'pawmail.old.log');
      if (fs.existsSync(old) && fs.statSync(old).mtimeMs > Date.now() - 10 * 60000) text = fs.readFileSync(old, 'utf8');
      text += fs.readFileSync(file, 'utf8');
    } catch {
      // 没有文件：下面的检查会失败
    }
    const home = os.homedir().toLowerCase();
    // 测试存档反复用，日志里还有以前几次的；只看这一次写的（从最后一行诊断信息开始，它是这次启动时写的）
    const lower = text.slice(Math.max(0, text.lastIndexOf('[diag]'))).toLowerCase();
    // 普通写法、JSON 里的写法（诊断信息那一行）、正斜杠写法，哪种都不能留下
    const leaks = [home, home.replace(/\\/g, '\\\\'), home.replace(/\\/g, '/')].filter((form) => lower.includes(form));
    check('日志写进了存档文件夹里的 logs\\pawmail.log（有版本号等诊断信息）', /\[diag\].*"version"/.test(text), { file, bytes: text.length });
    check('日志里的用户文件夹换成了 ~（不会露出 Windows 用户名）', text.includes('~\\pawmail-selftest.txt') && leaks.length === 0, {
      scrubbed: text.includes('~\\pawmail-selftest.txt'),
      leaks: leaks.length,
    });
  }

  // ---------------------------------------------------------------- 全屏时躲起来

  async function testFullscreen() {
    const { BrowserWindow } = require('electron');
    // 自己开一个真正全屏的窗口，问 native.js：它算不算"铺满了整个主屏幕"。
    // 窗口是完全透明、鼠标能穿过去的：判断只看窗口的大小，所以不需要真的挡住屏幕——
    // 跑自检的时候你可能正在用电脑，不能让一块黑屏闪到你眼前
    const full = new BrowserWindow({ fullscreen: true, frame: false, show: false, skipTaskbar: true, focusable: false, opacity: 0 });
    full.setIgnoreMouseEvents(true);
    full.showInactive();
    await wait(700);
    const fullCovers = native.coversPrimaryScreen(native.handleOf(full));
    full.destroy();
    // 最大化的普通窗口不算全屏（它不盖住任务栏）；我们自己的透明窗口也不算
    const max = new BrowserWindow({ width: 500, height: 300, show: false, skipTaskbar: true, focusable: false, opacity: 0 });
    max.setIgnoreMouseEvents(true);
    max.maximize();
    max.showInactive();
    await wait(500);
    const maxCovers = native.coversPrimaryScreen(native.handleOf(max));
    max.destroy();
    const ownCovers = native.coversPrimaryScreen(native.handleOf(overlay.win));
    check('能认出全屏的窗口；最大化的窗口和我们自己的透明窗口不算全屏', !native.available || (fullCovers === true && maxCovers === false && ownCovers === false), {
      fullCovers,
      maxCovers,
      ownCovers,
      foregroundNow: native.foregroundFullscreen(),
    });

    // 藏起来、再回来：回来以后还是不抢焦点、鼠标照样穿过去、层次和原来一样
    const onTopBefore = overlay.win.isAlwaysOnTop();
    overlay.setHidden(true);
    await wait(250);
    const hidden = !overlay.win.isVisible() && !overlay.polling;
    overlay.setHidden(false);
    await wait(350);
    const back = overlay.win.isVisible() && overlay.polling && !overlay.capturing && overlay.win.isAlwaysOnTop() === onTopBefore && !overlay.win.isFocused();
    check('有全屏程序时整块窗口藏起来，退出后回来（不抢焦点、鼠标照样穿透）', hidden && back, { hidden, back });
    const alive = await js(`const P = window.__pawmail; P.run(0.2); return { x: P.pet.x > 0, mode: P.pet.mode };`);
    check('藏起来再回来以后，画面照常运行', !!alive && alive.x === true, alive);
  }

  // ---------------------------------------------------------------- 小提示

  async function testHints() {
    // 先把信都拆掉（手里有信时不提醒），并且假装你在电脑前
    for (const l of store.data.mail.letters) if (!l.opened) mail.markOpened(l.id, { quiet: true });
    mail.onChange();
    setSetting('feedHints', 0);
    setSetting('fedBefore', true);
    await wait(300);
    const prepare = `
      const P = window.__pawmail;
      P.world.system.idle = 0;
      P.run(0.3);
      P.brain.queue.length = 0;
      P.brain.start('idle');
      P.bubble.hide();
      P.run(0.1);`;
    const fed = await js(`${prepare} return P.hintFeed();`);
    setSetting('fedBefore', false);
    await wait(300);
    const hint = await js(`${prepare}
      const first = P.hintFeed();
      const queued = P.brain.queue.map((q) => [q[0], q[1] && q[1].line]);
      const second = P.hintFeed();
      P.run(1.4);
      return { first, second, queued, said: document.querySelector('#bubble .bubble-text').textContent, activity: P.brain.name };`);
    await wait(300);
    check(
      '从没喂过它：它会挥手提醒一次"不要的文件可以拖给我吃"；同一次开机不说第二遍；喂过的人不提醒',
      fed === false && hint.first === true && hint.second === false && hint.queued.some(([name, line]) => name === 'greet' && line === 'hintFeed') && store.data.settings.feedHints === 1 && hint.said.length > 4,
      { fed, ...hint, feedHints: store.data.settings.feedHints }
    );
    await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.bubble.hide(); P.run(0.2); return true;`);
  }

  // ---------------------------------------------------------------- 活动范围、爬墙

  async function testArea() {
    const bad = setSetting('area', { x: 0.6, y: 0, w: 0.6, h: 0.5 }); // 超出窗口右边
    const odd = setSetting('area', { x: 0.1, y: 0.1, w: 0.5, h: 0.5, extra: 1 }); // 多了不认识的东西
    check('不合法的活动范围会被拒绝', bad === false && odd === false && store.data.settings.area === null, { bad, odd });

    setSetting('area', { x: 0.25, y: 0.2, w: 0.5, h: 0.75 });
    await wait(300);
    const inside = await js(`
      const P = window.__pawmail;
      P.brain.start('idle');
      P.run(2);
      const A = P.world.area, c = P.world.clip, box = document.getElementById('arena').getBoundingClientRect();
      const result = {
        A, clip: c, x: P.pet.x, y: P.pet.y, ground: P.world.groundY,
        boxOk: Math.abs(box.left - c.left) < 1 && Math.abs(box.top - c.top) < 1 && Math.abs(box.right - c.right) < 1,
      };
      // 让它贴着左边站：脑袋有一小截伸到方框外面（看不见），那一截不该"点得到"，方框里面的部分照样点得到
      const S = P.world.scale;
      P.pet.x = A.left + 34 * S;
      P.run(0.05);
      result.hitOutside = !!P.pet.hit(c.left - 2, P.pet.y - 76 * S);
      result.hitInside = !!P.pet.hit(c.left + 8, P.pet.y - 76 * S);
      return result;
    `);
    const W = info.w;
    const H = info.h;
    check(
      '设置活动范围后，宠物待在方框里，方框底边就是地面',
      Math.abs(inside.A.left - 0.25 * W) < 1 && Math.abs(inside.A.bottom - 0.95 * H) < 1 && inside.x > inside.A.left && inside.x < inside.A.right && Math.abs(inside.y - inside.ground) < 0.5 && inside.boxOk && !inside.hitOutside && inside.hitInside,
      inside
    );

    setSetting('displayMode', 'desktop'); // "只在桌面"模式：画框时也要先提到最前面，不然会被别的窗口挡住
    await wait(250);
    const editing = await js(`const P = window.__pawmail; P.openAreaEditor(); P.run(0.1); return P.areaEditor.isOpen;`);
    await wait(200);
    const capturedWhileEditing = overlay.capturing;
    const onTopWhileEditing = overlay.win.isAlwaysOnTop();
    await js(`const P = window.__pawmail; P.areaEditor.cancel(); P.setPointer(5, 5); P.run(0.1); return true;`);
    await wait(200);
    const backToDesktop = !overlay.win.isAlwaysOnTop();
    setSetting('displayMode', 'top');
    await wait(250);
    check('画活动范围时窗口提到最前面并接住鼠标，取消后恢复原样', editing && capturedWhileEditing && onTopWhileEditing && backToDesktop && !overlay.capturing && !overlay.editing, {
      editing,
      capturedWhileEditing,
      onTopWhileEditing,
      backToDesktop,
      after: overlay.capturing,
    });

    const climb = await js(`
      const P = window.__pawmail;
      const S = P.world.scale;
      P.brain.start('climb', { side: 1, goal: 120 * S });
      const cur = P.brain.current;
      let i = 0;
      while (!(cur.phase === 'cling' && cur.pt > 0.5) && i++ < 2400) P.run(1 / 60);
      const onWall = { mode: P.pet.mode, gap: P.world.area.right - P.pet.x, height: P.world.groundY - P.pet.y };
      cur.letGo(P.brain);
      i = 0;
      while (P.pet.mode !== 'ground' && i++ < 600) P.run(1 / 60);
      P.run(1);
      return { onWall, landed: P.pet.mode, act: P.brain.name, inside: P.pet.x > P.world.area.left && P.pet.x < P.world.area.right };
    `);
    check(
      '爬墙：爬到活动范围右边的墙上挂着，点一下跳回地面，不会摔晕',
      climb.onWall.mode === 'wall' && climb.onWall.gap < 80 * info.scale && climb.onWall.height > 100 * info.scale && climb.landed === 'ground' && climb.act !== 'dizzy' && climb.inside,
      climb
    );

    setSetting('area', null);
    await wait(300);
    const back = await js(`const P = window.__pawmail; P.run(1); return { right: P.world.area.right, ground: P.world.groundY, y: P.pet.y };`);
    check('改回"整个屏幕"', Math.abs(back.right - W) < 1 && Math.abs(back.ground - (H - 3)) < 1 && Math.abs(back.y - back.ground) < 0.5, back);
  }

  // ---------------------------------------------------------------- 生日、节日、装扮

  async function testFestivals() {
    const L = require('./letters');
    const F = require('../shared/festivals/catalog');

    check('农历节日用官方表：2027 年春节是 2 月 6 日（电脑自带的农历会算成 7 日）', F.festivalOn('2027-02-06', { cultures: ['chinese'] }) === 'springFestival' && F.festivalOn('2027-02-07', { cultures: ['chinese'] }) === null);
    check('没选的节日组不过：只选了中华传统节日，万圣节不算', F.festivalOn('2026-10-31', { cultures: ['chinese'] }) === null && F.festivalOn('2026-10-31', { cultures: ['western'] }) === 'halloween');

    // 在信纸窗口里填表（和你在"一个小问题"那封信里点"就这样"是同一条路）
    const win = mail.open({ view: 'box' });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(800);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const bad = await mjs(`return await window.pawmailMail.setProfile({ birthday: '13-40', cultures: ['chinese'] });`);
    check('不合法的生日会被拒绝', bad && bad.ok === false && store.data.settings.birthday === null, bad);
    const good = await mjs(`return await window.pawmailMail.setProfile({ birthday: '12-03', cultures: ['chinese', 'western', 'nonsense'] });`);
    const s = store.data.settings;
    check('保存生日和节日（不认识的节日组会被去掉）', good.ok && s.birthday === '12-03' && JSON.stringify(s.cultures) === '["chinese","western"]' && s.profileAsked === true, {
      birthday: s.birthday,
      cultures: s.cultures,
    });
    const profile = { birthday: s.birthday, cultures: s.cultures, asked: s.profileAsked };
    const birthday = L.festivalToday('2026-12-03', mail.data, profile);
    const halloween = L.festivalToday('2026-10-31', mail.data, profile);
    check('12 月 3 日是你的生日，10 月 31 日是万圣节', birthday && birthday.id === 'birthday' && birthday.look === 'birthday' && halloween && halloween.id === 'halloween', {
      birthday,
      halloween,
    });

    // 图鉴里出现"节日限定"一栏
    await mjs(`__mail.go('album'); return true;`);
    await wait(300);
    const albumHeads = await mjs(`return document.querySelectorAll('.album-head').length;`);
    check('图鉴分成普通礼物和节日限定两栏', albumHeads === 2, { albumHeads });
    mail.close();
    await wait(200);

    // 让宠物过一次万圣节：换上白布，打招呼时把白布撩起来、喊 Boo
    overlay.send('festival', { id: 'halloween', day: 'selftest', look: 'ghost', greet: 'boo' });
    await wait(300);
    const ghost = await js(`
      const P = window.__pawmail;
      const dressed = !!(P.pet.look && P.pet.look.cover === 'sheet');
      const queued = P.brain.queue.some((q) => q[0] === 'festiveGreet');
      P.brain.queue.length = 0;
      P.brain.start('festiveGreet');
      P.run(1.0);
      return { dressed, queued, lift: +P.pet.sheetLift.toFixed(2), boo: P.pet.fx.items.some((i) => i.type === 'boo') };
    `);
    check('万圣节：宠物披上白布，打招呼时撩起白布喊 Boo', ghost.dressed && ghost.queued && ghost.lift > 0.8 && ghost.boo, ghost);
    // 白布放下来再截图（等一会儿，让窗口把新的一帧画出来）
    await js(`const P = window.__pawmail; P.brain.start('idle'); P.run(1.2); return true;`);
    await wait(500);
    const image = await overlay.win.webContents.capturePage({ x: Math.max(0, Math.round(info.x - 220)), y: Math.max(0, Math.round(info.y - 330)), width: 440, height: 334 });
    fs.writeFileSync(path.join(outDir, 'halloween.png'), image.toPNG());

    overlay.send('festival', null);
    await wait(300);
    const plain = await js(`const P = window.__pawmail; P.run(0.5); return { look: P.pet.look, lift: +P.pet.sheetLift.toFixed(2) };`);
    check('节日结束，脱下装扮', plain.look === null && plain.lift < 0.1, plain);
  }

  // ---------------------------------------------------------------- 月报、年度回顾、删信

  async function testReports() {
    const L = require('./letters');
    const DAY_MS = 86400000;
    const mailData = store.data.mail;
    const usage = store.data.usage;

    // 从上次见面的第二天开始，一天天往后模拟，直到跨过下一个元旦再多 3 天（中间一定会跨好几个月）
    let t = new Date(`${mailData.lastDay}T10:00:00`).getTime() + DAY_MS;
    const year = Number(L.logicalDay(t).slice(0, 4));
    const stop = new Date(`${year + 1}-01-04T10:00:00`).getTime();
    let simulated = 0;
    while (t <= stop) {
      const day = L.logicalDay(t);
      usage[day] = { first: t - 3600000, last: t + 12 * 3600000, activeMin: 240, pets: 3, pokes: 1, throws: simulated % 5 === 0 ? 1 : 0, dizzies: 0 };
      mail.check(t, true);
      for (const l of mailData.letters) if (!l.opened) mail.markOpened(l.id, { quiet: true }); // 假装每封都拆了
      t += DAY_MS;
      simulated += 1;
    }

    const monthly = mailData.letters.filter((l) => l.kind === 'monthly');
    const review = mailData.letters.find((l) => l.id === `y-${year}`);
    check('跨月时收到月报（这个月一起不少于 3 天）', monthly.length >= 1 && monthly.every((l) => /^m-\d{4}-\d{2}$/.test(l.id) && l.summary.days >= 3), {
      simulatedDays: simulated,
      reports: monthly.map((l) => l.id),
    });
    check('元旦收到年度回顾，代替 12 月的月报', !!review && review.summary.days >= 7 && !mailData.letters.some((l) => l.id === `m-${year}-12`), {
      review: review && { days: review.summary.days, places: Object.keys(review.summary.places).length },
    });
    check('每个月都存了一份小结（年度回顾要用）', Object.keys(mailData.monthly).filter((k) => k.startsWith(`${year}-`)).length >= 1, {
      months: Object.keys(mailData.monthly),
    });

    // 节日：还没告诉它过哪些节日，所以按语言猜；元旦是所有人都过的
    const festivalLetters = mailData.letters.filter((l) => l.kind === 'festival');
    const newYear = festivalLetters.find((l) => l.festival === 'newYear' && l.day === `${year + 1}-01-01`);
    check('元旦那天的信是节日信，附节日限定礼物', !!newYear && L.GIFTS[newYear.gift].rarity === 'festival' && !!mailData.gifts[newYear.gift], {
      festivals: festivalLetters.map((l) => `${l.festival}@${l.day}`),
    });
    check('拆完见面信后，收到"一个小问题"', mailData.letters.some((l) => l.kind === 'ask'));

    // 在信纸窗口里打开年度回顾：应该有数据格子；明信片是 1080×1920 的长图
    const win = mail.open({ view: 'letter', id: review.id });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(900);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const page = await mjs(
      `return { stats: document.querySelectorAll('.stats .stat').length, title: (document.querySelector('.letter-title') || {}).textContent, lines: document.querySelectorAll('.letter-body p').length };`
    );
    check('年度回顾页面有数据格子和正文', page.stats >= 4 && page.lines >= 5 && /\d{4}/.test(page.title || ''), page);
    fs.writeFileSync(path.join(outDir, 'report.png'), (await win.webContents.capturePage()).toPNG());
    const card = await mjs(`const url = __mail.postcard(); const img = new Image(); img.src = url; await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight };`);
    check('年度回顾能存成 1080×1920 的长图', card.w === 1080 && card.h === 1920, card);

    // 删一封：用窗口里的"删除"走一遍（和你点垃圾桶是同一条路）
    const giftsBefore = Object.keys(mailData.gifts).length;
    const victim = mailData.letters.find((l) => l.kind === 'daily');
    const one = await mjs(`return await window.pawmailMail.deleteLetters(['${victim.id}']);`);
    check('删一封信', one.ok && one.removed === 1 && !mailData.letters.some((l) => l.id === victim.id), one);

    // 删一个月：删掉最早那个月的全部信（见面信也在里面）
    const firstMonth = mailData.letters[0].day.slice(0, 7);
    const ids = mailData.letters.filter((l) => l.day.startsWith(firstMonth)).map((l) => l.id);
    const many = await mjs(`return await window.pawmailMail.deleteLetters(${JSON.stringify(ids)});`);
    check('删整个月的信', many.ok && many.removed === ids.length && !mailData.letters.some((l) => l.day.startsWith(firstMonth)), {
      month: firstMonth,
      removed: many.removed,
    });
    check('删信不会把礼物从图鉴里拿走', Object.keys(mailData.gifts).length === giftsBefore, { gifts: giftsBefore });

    const countBefore = mailData.letters.length;
    mail.check(t - DAY_MS + 60000, true);
    check('见面信删了以后，不会再寄一封', mailData.letters.length === countBefore && !mailData.letters.some((l) => l.kind === 'welcome'));

    const bad = await mjs(`return await window.pawmailMail.deleteLetters(['../../save.json']);`);
    check('删信时不认识的编号会被拒绝', bad && bad.ok === false, bad);

    await mjs(`__mail.go('box'); return true;`);
    await wait(400);
    const box = await mjs(`return { months: document.querySelectorAll('.box-month').length, rows: document.querySelectorAll('.box-row').length };`);
    check('信箱按月分组显示', box.months >= 2 && box.rows === mailData.letters.length, box);
    fs.writeFileSync(path.join(outDir, 'mailbox.png'), (await win.webContents.capturePage()).toPNG());

    store.saveNow();
    const reread = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    check('月报、年度回顾和小结都写进了存档', reread.mail.letters.some((l) => l.kind === 'yearly') && reread.mail.welcomed === true && Object.keys(reread.mail.monthly).length >= 1, {
      letters: reread.mail.letters.length,
      sizeKB: Math.round(fs.statSync(store.file).size / 1024),
    });

    mail.close();
    await wait(200);
  }

  // ---------------------------------------------------------------- 每日来信

  async function testMail() {
    const DAY_MS = 86400000;
    const now = Date.now();
    // 从一份干净的"邮局"开始，这样每次自检的结果都一样
    Object.assign(store.data.mail, { letters: [], gifts: {}, outfits: {}, lastDay: null, streak: 0, bestStreak: 0, welcomed: false, metDay: null, askSent: false, monthly: {} });
    Object.assign(store.data.settings, { petName: null, birthday: null, cultures: null, profileAsked: false });
    setSetting('outfit', { hat: null, glasses: null, top: null, bag: null, held: null });
    mail.test = { dir: outDir }; // 明信片存到自检的输出文件夹，不弹资源管理器、不动剪贴板

    mail.check(now, true);
    const first = store.data.mail.letters[0];
    check('第一次运行，马上收到一封见面信', mail.summary().unread === 1 && first && first.kind === 'welcome');
    mail.check(now + 60000, true);
    check('同一天不会来第二封', mail.summary().total === 1);
    mail.check(now + DAY_MS, false);
    check('新的一天，但你不在电脑前：先不来信', mail.summary().total === 1);
    mail.check(now + DAY_MS, true);
    const daily = store.data.mail.letters[1];
    check('新的一天，你回到电脑前：来一封新信', mail.summary().total === 2 && daily && daily.kind === 'daily' && !!daily.gift, {
      place: daily && daily.place,
      gift: daily && daily.gift,
    });

    await wait(300);
    const carrying = await js(`const P = window.__pawmail; P.run(0.3); return { carry: P.pet.carry, hasMail: P.brain.hasMail };`);
    check('有没拆的信时，宠物把信拿在手里', carrying.carry && carrying.hasMail, carrying);

    // 打开信纸窗口，像你一样：点信封 → 起名字 → 看信
    const win = mail.open();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(900);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const before = await mjs(
      `return { ready: !!window.__mail, sealed: !!document.querySelector('.sealed-envelope'), letters: window.__mail ? __mail.state.data.letters.length : 0 };`
    );
    check('信纸窗口能打开，先看到一封没拆的信', before.ready && before.sealed && before.letters === 2, before);

    await mjs(`document.querySelector('.sealed-envelope').click(); return true;`);
    await wait(300);
    const askedName = await mjs(`return !document.getElementById('naming').hidden;`);
    await mjs(`document.querySelector('.naming-input').value = '年糕'; document.querySelector('.naming-card .btn').click(); return true;`);
    await wait(1300);
    const after = await mjs(
      `const l = __mail.state.data.letters[0]; return { id: l.id, opened: l.opened, name: __mail.state.data.name, sign: l.sign, paper: !!document.querySelector('.paper'), lines: l.lines.length };`
    );
    check('第一次拆信前先起名字，然后信被拆开、落款是这个名字', askedName && after.opened && after.paper && after.name === '年糕' && after.sign.includes('年糕'), after);
    check('后台记下了：名字、这封信已拆、礼物进了图鉴', store.data.settings.petName === '年糕' && mail.summary().unread === 1 && !!store.data.mail.gifts[daily.gift], {
      unread: mail.summary().unread,
      gifts: Object.keys(store.data.mail.gifts),
    });

    await wait(400);
    fs.writeFileSync(path.join(outDir, 'mail.png'), (await win.webContents.capturePage()).toPNG());

    const saved = await mjs(
      `const url = __mail.postcard(); const r = await window.pawmailMail.savePostcard(url, __mail.state.id); return { ok: !!(r && r.ok), kb: Math.round(url.length * 0.75 / 1024) };`
    );
    const postcard = path.join(outDir, `pawmail-${after.id}.png`);
    check('能把信存成明信片图片', saved.ok && fs.existsSync(postcard) && fs.statSync(postcard).size > 50000, saved);

    // 把剩下那封也拆掉：宠物手里就没有信了
    mail.markOpened(first.id);
    await wait(300);
    const empty = await js(`const P = window.__pawmail; P.run(0.3); return { carry: P.pet.carry, hasMail: P.brain.hasMail };`);
    check('信都拆完后，宠物手里不再拿着信', mail.summary().unread === 0 && !empty.carry && !empty.hasMail, empty);

    // 重启后还在吗？把存档写出去再读回来
    store.saveNow();
    const reread = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    check('信和礼物都写进了存档', reread.mail.letters.length === 2 && reread.mail.letters.every((l) => l.opened) && !!reread.mail.gifts.pawprint, {
      letters: reread.mail.letters.length,
    });

    mail.close();
    await wait(200);
  }

  // ---------------------------------------------------------------- 衣柜（接着 testMail：那时已经拆了第一封日常来信）

  async function testWardrobe() {
    const O = require('../shared/outfits/catalog');
    const mailData = store.data.mail;
    const daily = mailData.letters.find((l) => l.kind === 'daily');
    const gotten = daily && daily.outfit;
    check('第一封日常来信捎来一件衣服，拆开后进了衣柜', !!gotten && !O.OUTFITS[gotten].starter && !!mailData.outfits[gotten] && mail.ownedOutfits().has(gotten), {
      outfit: gotten,
      received: Object.keys(mailData.outfits),
    });
    const locked = O.IDS.find((id) => !mail.ownedOutfits().has(id));
    const before = JSON.stringify(store.data.settings.outfit);
    const notMine = setSetting('outfit', { ...O.EMPTY, [O.OUTFITS[locked].slot]: locked });
    const wrongSlot = setSetting('outfit', { ...O.EMPTY, hat: 'hoodie' });
    check('还没收到的衣服、穿错部位的衣服都穿不上', notMine === false && wrongSlot === false && JSON.stringify(store.data.settings.outfit) === before, { locked });

    // 在信纸窗口的衣柜里点那件刚收到的衣服
    await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.2); return true;`);
    const win = mail.open({ view: 'wardrobe' });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(900);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const page = await mjs(`return {
      view: __mail.state.view,
      items: document.querySelectorAll('.wardrobe-item').length,
      locked: document.querySelectorAll('.wardrobe-item.locked').length,
      fresh: document.querySelectorAll('.wardrobe-badge.new').length,
    };`);
    const ownedCount = mail.ownedOutfits().size;
    check('衣柜里列出全部衣服，没收到的是灰色剪影', page.view === 'wardrobe' && page.items === O.IDS.length && page.locked === O.IDS.length - ownedCount && page.fresh === 1, page);
    await mjs(`[...document.querySelectorAll('button.wardrobe-item')].find((b) => b.title && __mail.state.data.wardrobe.items.find((i) => i.id === ${JSON.stringify(gotten)}).name === b.title).click(); return true;`);
    await wait(500);
    const pet = await js(`const P = window.__pawmail; return { outfit: P.pet.outfit, queued: P.brain.queue.map((q) => q[0]), name: P.brain.name };`);
    const slot = gotten && O.OUTFITS[gotten].slot;
    check('在衣柜里点一下就穿上：存进设置、桌面上的它也穿上了', store.data.settings.outfit[slot] === gotten && pet.outfit && pet.outfit[slot] === gotten, { setting: store.data.settings.outfit, pet: pet.outfit });
    check('换了衣服，它会转一圈问"好看吗？"；穿过之后不再标"新！"', (pet.queued.includes('showOff') || pet.name === 'showOff') && mailData.outfits[gotten].tried === true, pet);
    const sneaky = await mjs(`return window.pawmailMail.setOutfit({ hat: null, glasses: null, top: null, bag: null, held: null, ${JSON.stringify(O.OUTFITS[locked].slot)}: ${JSON.stringify(locked)} });`);
    check('信纸窗口要穿没收到的衣服：后台拒绝', sneaky && sneaky.ok === false && store.data.settings.outfit[O.OUTFITS[locked].slot] !== locked, sneaky);

    // 再穿一件一开始送的（帽子），拍张照片。
    // 信里捎来的那件本身就是帽子的话（哪天会捎来什么是按日期定的），就戴着它拍，不换
    const hat = slot === 'hat' ? gotten : 'capRed';
    if (slot !== 'hat') await mjs(`[...document.querySelectorAll('button.wardrobe-item')].find((b) => b.title === __mail.state.data.wardrobe.items.find((i) => i.id === 'capRed').name).click(); return true;`);
    await wait(500);
    fs.writeFileSync(path.join(outDir, 'wardrobe.png'), (await win.webContents.capturePage()).toPNG());
    const tray = await js(`const P = window.__pawmail; P.run(0.1); return !!P.pet.outfit && P.pet.outfit.hat;`);
    check('戴上帽子', store.data.settings.outfit.hat === hat && tray === hat, { hat: store.data.settings.outfit.hat, expected: hat });

    store.saveNow();
    const reread = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    check('穿的衣服和收到的衣服都写进了存档', reread.settings.outfit[slot] === gotten && reread.mail.outfits[gotten] && reread.mail.outfits[gotten].tried === true, {
      outfit: reread.settings.outfit,
    });

    // 全部脱下
    await mjs(`[...document.querySelectorAll('.wardrobe-side .btn')].pop().click(); return true;`);
    await wait(500);
    const bare = await js(`const P = window.__pawmail; return P.pet.outfit;`);
    check('"全部脱下"', Object.values(store.data.settings.outfit).every((v) => v === null) && bare === null, { setting: store.data.settings.outfit });

    mail.close();
    await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.2); return true;`);
    await wait(200);
  }

  // ---------------------------------------------------------------- 待办（见 todos.js）

  async function testTodos() {
    const L = require('./letters');
    const { FakeNote: Note } = module.exports;
    const todos = mail.todos;
    store.data.todos = [];
    setSetting('todoNotify', true);
    Note.shown.length = 0;
    const lastNote = () => Note.shown[Note.shown.length - 1] || null;
    // sayText：等它把这句话说出来再看（它要先跑到你的鼠标旁边才开口：鼠标离得远的话要跑几秒，最多等 8 秒）
    const petState = (sayText = null) =>
      js(`const P = window.__pawmail; const want = ${JSON.stringify(sayText)};
        P.run(0.5);
        for (let i = 0; want && i < 15 && !P.bubble.textEl.textContent.includes(want); i++) P.run(0.5);
        return { name: P.brain.name, queued: P.brain.queue.map((q) => q[0]), reminder: P.brain.reminder && { text: P.brain.reminder.text, kind: P.brain.reminder.kind }, said: P.bubble.textEl.textContent };`);
    await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.2); return true;`);
    // 在信纸窗口的「待办」页里写一件事，选"30 分钟后"、提前 15 分钟，点"加上"
    const win = mail.open({ view: 'todos' });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(800);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    await mjs(`
      const input = document.querySelector('.todo-input');
      input.value = '自检的待办';
      input.dispatchEvent(new Event('input'));
      [...document.querySelectorAll('.todo-when button')][1].click();
      await new Promise((r) => setTimeout(r, 50));
      const lead = document.querySelector('.todo-lead-select');
      lead.value = '15';
      lead.dispatchEvent(new Event('change'));
      document.querySelector('.todo-add').click();
      return true;`);
    await wait(500);
    const added = store.data.todos[0];
    const soon = Date.now() + 30 * 60000;
    check(
      '在信纸窗口的「待办」页写下一件事、选"30 分钟后"提醒、提前 15 分钟：存进存档',
      !!added && added.text === '自检的待办' && Math.abs(added.due - soon) < 120000 && added.lead === 15 && !added.soonNote,
      added
    );
    const rows = await mjs(`return document.querySelectorAll('.todo-row').length;`);
    const bad = await mjs(`return [
      await window.pawmailMail.todo({ type: 'add', text: '   ' }),
      await window.pawmailMail.todo({ type: 'explode' }),
      await window.pawmailMail.todo({ type: 'done', id: '../../x', done: true }),
      await window.pawmailMail.todo({ type: 'add', text: '提前太久', due: Date.now() + 60000, lead: 99999 }),
    ];`);
    check('空的待办、不认识的操作、不存在的编号、提前太久都会被拒绝；清单上只有那一件', rows === 1 && bad.every((r) => r && r.ok === false) && store.data.todos.length === 1, { rows, bad });

    // 提前提醒（把提醒时间改到 10 分钟后：提前 15 分钟的那一刻刚过）：弹一条普通的通知，宠物也先说一声
    added.due = Date.now() + 10 * 60000;
    const early = todos.check(true);
    await wait(300);
    const soonNote = lastNote();
    const petSoon = await petState('自检的待办');
    await js(`const P = window.__pawmail; P.brain.ackReminder(); P.run(0.2); return true;`); // 提前的那次点它：只是它自己应一声
    await wait(300);
    check(
      '提前提醒：弹一条"还有…"的通知，宠物也先说一声；这时点宠物不算"知道了"，到点还会提醒',
      early === added && Note.shown.length === 1 && soonNote.options.title === '自检的待办' && soonNote.options.timeoutType === 'default' && /10 (分钟|min)/.test(soonNote.options.body) &&
        petSoon.name === 'remind' && petSoon.reminder.kind === 'soon' && petSoon.said.includes('自检的待办') && /10 (分钟|min)/.test(petSoon.said) && added.reminded === 0,
      { notes: Note.shown.map((n) => n.options.body), petSoon, reminded: added.reminded }
    );

    // 到点了（把提醒时间改到刚刚过去）：宠物举着牌子提醒你，到点的通知一直留着、带"做完了"按钮
    added.due = Date.now() - 1000;
    const reminded = todos.check(true);
    await wait(300);
    const pet = await petState();
    const dueNote = lastNote();
    check('待办到点了：宠物跑过来举着牌子提醒你', !!reminded && pet.name === 'remind' && pet.reminder.text === '自检的待办' && pet.reminder.kind === 'due', pet);
    const doneLabels = ['zh', 'en'].map((lang) => require(`../shared/locales/${lang}.json`).notify.done);
    check(
      '到点的通知一直留在屏幕上、带"做完了"按钮；"还有…"那条收起来了',
      Note.shown.length === 2 && dueNote.options.timeoutType === 'never' && dueNote.options.actions.length === 1 && doneLabels.includes(dueNote.options.actions[0].text) && soonNote.closed,
      { options: dueNote.options && { ...dueNote.options, icon: !!dueNote.options.icon }, soonClosed: soonNote.closed }
    );
    check('刚提醒过的那件，10 分钟之内不会再提醒、不会再弹通知；你不在电脑前时宠物不提醒', todos.check(true) === null && todos.check(false) === null && Note.shown.length === 2);
    await js(`const P = window.__pawmail; P.brain.ackReminder(); P.run(0.2); return true;`);
    await wait(300);
    check('点它一下就算"知道了"：这件不再提醒，到点的通知也收起来', added.reminded >= 3 && dueNote.closed, { reminded: added.reminded, noteClosed: dueNote.closed });

    // 在信纸窗口里勾掉：存档里标成做完，今天的记录 +1（第二天的信里会提），宠物替你高兴
    const day = L.logicalDay(Date.now());
    const before = (store.data.usage[day] && store.data.usage[day].todosDone) || 0;
    await mjs(`document.querySelector('.todo-row .todo-check').click(); return true;`);
    await wait(500);
    const cheer = await js(`const P = window.__pawmail; return { name: P.brain.name, queued: P.brain.queue.map((q) => q[0]) };`);
    const after = (store.data.usage[day] && store.data.usage[day].todosDone) || 0;
    check('勾掉一件：标成做完、今天的记录 +1、宠物替你高兴', added.done === true && after === before + 1 && (cheer.name === 'cheer' || cheer.queued.includes('cheer')), { ...cheer, before, after });
    await mjs(`document.querySelector('.todo-row .todo-delete').click(); return true;`);
    await wait(400);
    check('删掉一件', store.data.todos.length === 0);

    // 在到点的通知上点"做完了"：勾掉，宠物替你高兴（它正举着这件的牌子的话，直接放下来欢呼）
    const second = todos.add({ text: '自检的第二件', due: Date.now() - 1000 });
    todos.check(true);
    await wait(300);
    lastNote().emit('action', { actionIndex: 0 }, 0);
    await wait(300);
    const afterDone = await petState();
    check('在通知上点"做完了"：这件勾掉了，宠物替你高兴', second.done === true && (afterDone.name === 'cheer' || afterDone.queued.includes('cheer')) && !afterDone.reminder, afterDone);

    // 关掉到点的通知（Windows 的"关闭"、右上角的叉）= 知道了：不再提醒，宠物把牌子放下
    const third = todos.add({ text: '自检的第三件', due: Date.now() - 1000 });
    todos.check(true);
    await wait(300);
    const holding = await petState();
    lastNote().emit('close', { reason: 'userCanceled' });
    await wait(300);
    const afterClose = await petState();
    check('关掉到点的通知就算"知道了"：不再提醒，宠物把牌子放下', holding.name === 'remind' && third.reminded >= 3 && !afterClose.reminder && afterClose.name !== 'remind', { holding: holding.name, after: afterClose, reminded: third.reminded });
    todos.remove(third.id);
    todos.remove(second.id);

    // 待办页最下面的勾：关掉以后，到点只有宠物提醒，不弹通知
    await mjs(`document.querySelector('.todo-notify input').click(); return true;`);
    await wait(400);
    const off = store.data.settings.todoNotify;
    const shownBefore = Note.shown.length;
    const fourth = todos.add({ text: '自检的第四件', due: Date.now() - 1000 });
    todos.check(true);
    await wait(200);
    check('待办页最下面的勾能关掉通知：关掉以后到点不弹通知，宠物照样提醒', off === false && Note.shown.length === shownBefore && fourth.reminded === 1, { off, shown: Note.shown.length - shownBefore });
    todos.remove(fourth.id);
    setSetting('todoNotify', true);
    await js(`const P = window.__pawmail; P.brain.reminder = null; return true;`);

    mail.close();
    await js(`const P = window.__pawmail; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.2); return true;`);
    await wait(200);
  }

  // ---------------------------------------------------------------- 手机提醒（见 phone.js；用假的"发请求"，不真的联网）

  async function testPhone() {
    const { app } = require('electron');
    const F = module.exports.fakeFetch;
    const todos = mail.todos;
    const win = mail.open({ view: 'todos' });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(800);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const choose = (service) => mjs(`const s = document.querySelector('.phone-service'); s.value = '${service}'; s.dispatchEvent(new Event('change')); return true;`);

    // 选 ntfy：生成一个随机频道名，存档里是加密过的；页面上有二维码和频道名
    await choose('ntfy');
    await wait(500);
    const topic = phone.topic();
    const saved = JSON.stringify(store.data.phone);
    const page = await mjs(`return { qr: !!document.querySelector('.phone-qr'), topic: (document.querySelector('.phone-topic-name') || {}).textContent };`);
    check(
      '手机提醒选 ntfy：生成一个随机频道名，存档里存的是加密过的；页面上有二维码和频道名',
      store.data.phone.service === 'ntfy' && /^pawmail-[a-z0-9]{16}$/.test(topic || '') && !saved.includes(topic) && page.qr && page.topic === topic,
      { service: store.data.phone.service, page: { qr: page.qr, sameTopic: page.topic === topic }, encrypted: !saved.includes(topic) }
    );

    // 「发一条试试」
    F.requests.length = 0;
    await mjs(`document.querySelector('.phone-test').click(); return true;`);
    await wait(500);
    const tried = F.requests[0];
    check(
      '「发一条试试」：往 ntfy.sh 发了一条（频道名对、普通优先级）',
      F.requests.length === 1 && tried.url === 'https://ntfy.sh/' && tried.body.topic === topic && tried.body.priority === 3 && !!tried.body.title,
      { count: F.requests.length, url: tried && tried.url, priority: tried && tried.body.priority }
    );

    // 待办到点（你不在电脑前：宠物不出来，手机照发）：优先级 4；勾了"不发具体内容"就不带待办写的字
    F.requests.length = 0;
    const a = todos.add({ text: '自检的手机提醒', due: Date.now() - 1000 });
    todos.check(false);
    await wait(300);
    phone.setOptions({ hideText: true });
    const b = todos.add({ text: '自检的秘密待办', due: Date.now() - 1000 });
    todos.check(false);
    await wait(300);
    phone.setOptions({ hideText: false });
    const [shown, hidden] = F.requests;
    check(
      '待办到点：手机上也发一条（优先级 4、写着那件事）；勾了"不发具体内容"就只说"有一件待办到点了"',
      F.requests.length === 2 && shown.body.priority === 4 && shown.body.title === '自检的手机提醒' && !JSON.stringify(hidden.body).includes('自检的秘密待办'),
      { count: F.requests.length, shown: shown && shown.body.title, hidden: hidden && [hidden.body.title, hidden.body.message] }
    );
    phone.setOptions({ skipPresent: true });
    const skipped = await phone.send('due', [a], { present: true });
    const sent = await phone.send('due', [a], { present: false });
    phone.setOptions({ skipPresent: false });
    check('勾了"我在电脑前时不发到手机"：你在就不发，不在照发', skipped.skipped === true && sent.ok === true, { skipped, sent });

    // Server酱：不像 SendKey 的不收；像的加密存起来；试发是发到 Server酱 的地址
    await choose('serverchan');
    await wait(400);
    const bad = await mjs(`return await window.pawmailMail.phone({ type: 'sctKey', key: 'hello' });`);
    const good = await mjs(`return await window.pawmailMail.phone({ type: 'sctKey', key: 'SCT000000TselftestKey123' });`);
    F.requests.length = 0;
    const sct = await mjs(`return await window.pawmailMail.phone({ type: 'test' });`);
    check(
      'Server酱：不像 SendKey 的不收，像的加密存起来；试发是发到 Server酱 的地址',
      bad.ok === false && good.ok === true && !JSON.stringify(store.data.phone).includes('SCT000000') && F.requests.length === 1 &&
        F.requests[0].url === 'https://sctapi.ftqq.com/SCT000000TselftestKey123.send' && sct.ok === true,
      { bad, good, url: F.requests[0] && F.requests[0].url.replace(/SCT\w+/, 'SCT…') }
    );

    // 关掉：到点不发；日志里不写频道名、key、待办的字
    await choose('off');
    await wait(400);
    F.requests.length = 0;
    const c = todos.add({ text: '自检的第三件', due: Date.now() - 1000 });
    todos.check(false);
    await wait(700);
    let log = '';
    try {
      const file = path.join(app.getPath('userData'), 'logs', 'pawmail.log');
      log = fs.readFileSync(file, 'utf8');
      log = log.slice(log.lastIndexOf('[diag]'));
    } catch {
      // 读不到就算了，下面会失败
    }
    check(
      '关掉手机提醒以后到点不发；日志里不写频道名、SendKey 和待办的字',
      store.data.phone.service === 'off' && F.requests.length === 0 && log.includes('[手机提醒]') && !log.includes(topic) && !log.includes('SCT000000') && !log.includes('自检的秘密待办'),
      { requests: F.requests.length, logged: log.includes('[手机提醒]') }
    );
    for (const t of [a, b, c]) todos.remove(t.id);
    mail.close();
    await js(`const P = window.__pawmail; P.brain.reminder = null; P.brain.queue.length = 0; P.brain.start('idle'); P.run(0.2); return true;`);
    await wait(200);
  }

  // ---------------------------------------------------------------- 喂它吃文件

  async function testFeed() {
    const os = require('node:os');
    const { app } = require('electron');
    const { Feeder, buildRules } = require('./feed');
    const realRules = buildRules({
      getPath: (name) => app.getPath(name),
      appPath: app.getAppPath(),
      userData: app.getPath('userData'),
      exeDir: path.dirname(process.execPath),
    });

    // 1. 不该吃的东西：用一个"假的回收站"来测（只记下被要求扔什么，什么都不删），
    //    这样就算规则写错了，也不会真的把这些重要的文件夹扔掉
    const asked = [];
    const fakeTrash = async (p) => {
      asked.push(p);
    };
    const guarded = new Feeder({ trash: fakeTrash, native, rules: realRules });
    const home = os.homedir();
    const BS = '\\';
    const refuse = {
      disk: 'C:' + BS,
      windows: process.env.SystemRoot,
      home,
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      appData: app.getPath('appData'),
      self: app.getAppPath(),
      network: BS + BS + 'localhost' + BS + 'c$' + BS + 'Windows' + BS + 'win.ini',
      missing: path.join(home, 'pawmail-no-such-file-' + Date.now() + '.txt'),
    };
    const refusal = {};
    for (const [name, p] of Object.entries(refuse)) {
      const res = await guarded.feed([p]);
      refusal[name] = res.reason;
    }
    const expected = { disk: 'protected', windows: 'protected', home: 'protected', desktop: 'protected', documents: 'protected', appData: 'protected', self: 'home', network: 'notLocal', missing: 'missing' };
    check(
      '重要的地方不吃：整个磁盘、Windows、用户文件夹、桌面和文档文件夹本身、AppData、它自己的家、网络上的、不存在的',
      asked.length === 0 && Object.entries(expected).every(([k, v]) => refusal[k] === v),
      { refusal, trashCalls: asked.length }
    );

    // 2. 一次太多、太大：也不吃（同样用假的回收站）
    const base = path.join(app.getPath('userData'), `feed-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(base, { recursive: true });
    const testRules = buildRules({ getPath: (name) => app.getPath(name), userData: path.join(base, 'not-here') }); // 测试文件放在程序文件夹里，这里不把程序文件夹算作"家"
    const many = [];
    for (let i = 0; i < 21; i++) {
      const f = path.join(base, `crumb-${i}.txt`);
      fs.writeFileSync(f, 'pawmail selftest crumb');
      many.push(f);
    }
    const tooMany = await new Feeder({ trash: fakeTrash, native, rules: testRules }).feed(many);
    const tooBig = await new Feeder({ trash: fakeTrash, native, rules: testRules, limits: { maxItems: 20, maxBytes: 8, maxEntries: 5000 } }).feed([many[0]]);
    check('一次超过 20 样、或者太大：不吃', tooMany.reason === 'tooMany' && tooBig.reason === 'tooBig' && asked.length === 0, {
      tooMany: tooMany.reason,
      tooBig: tooBig.reason,
      trashCalls: asked.length,
    });

    // 3. 真的吃：自检自己造的两个测试文件和一个测试文件夹，真的放进回收站，确认回收站里找得到，再从回收站里清掉
    const token = `${process.pid}-${Date.now()}`;
    const snackFile = path.join(base, `pawmail-selftest-cookie-${token}.txt`);
    const snackDir = path.join(base, `pawmail-selftest-box-${token}`);
    fs.writeFileSync(snackFile, 'pawmail selftest: this file is safe to delete');
    fs.mkdirSync(snackDir);
    fs.writeFileSync(path.join(snackDir, 'candy.txt'), 'pawmail selftest: this file is safe to delete');
    const real = new Feeder({ trash: (p) => require('electron').shell.trashItem(p), native, rules: testRules });
    const eaten = await real.feed([snackFile, snackDir]);
    const gone = !fs.existsSync(snackFile) && !fs.existsSync(snackDir);
    const purged = purgeFromRecycleBin([snackFile, snackDir]);
    check('能吃的测试文件和文件夹真的进了回收站（之后已从回收站清掉）', eaten.eaten === 2 && gone && purged === 2, {
      result: eaten.items,
      gone,
      foundInRecycleBin: purged,
    });
    fs.rmSync(base, { recursive: true, force: true });

    // 4. 画面那边：张嘴等着、吃下去、吐出来
    const show = await js(`
      const P = window.__pawmail;
      const bubble = () => document.querySelector('.bubble-text').textContent;
      P.brain.start('idle');
      P.run(0.3);
      const out = {};
      P.brain.onFood(true); P.run(0.4);
      out.hungry = P.brain.name;
      P.brain.onFood(false); P.run(0.3);
      out.after = P.brain.name;
      let eat = P.brain.onFeed([{ kind: 'file' }, { kind: 'folder' }], { x: 0, y: -50 });
      P.run(0.6);
      out.chewing = eat.phase;
      eat.resolve({ items: [{ kind: 'file', ok: true }, { kind: 'folder', ok: true }], eaten: 2, reason: null, first: true });
      P.run(1.2);
      out.swallow = eat.phase;
      out.firstLine = bubble();
      P.run(3);
      out.done = P.brain.name;
      eat = P.brain.onFeed([{ kind: 'file' }], { x: 0, y: -50 });
      P.run(0.6);
      eat.resolve({ items: [{ kind: 'file', ok: false, reason: 'protected' }], eaten: 0, reason: 'protected' });
      P.run(1);
      out.spit = eat.phase;
      out.refuseLine = bubble();
      P.run(3);
      out.done2 = P.brain.name;
      return out;
    `);
    check(
      '画面：文件拖到身上时张嘴等着，吃下去会说"放进回收站了"，吃不下会吐出来说原因',
      show.hungry === 'hungry' && show.after !== 'hungry' && show.chewing === 'chew' && show.swallow === 'yum' && /回收站|Recycle/.test(show.firstLine) && show.spit === 'spit' && show.refuseLine.length > 0 && show.done !== 'eat' && show.done2 !== 'eat',
      show
    );

    // 5. 拖着文件停在它身上：鼠标旁边换成小纸团（代替 Windows 那个挡脸的大图标），它张大嘴等着；拖走后纸团消失
    const hover = await js(`
      const P = window.__pawmail;
      P.brain.start('idle');
      P.run(0.3);
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
      const x = P.pet.x;
      const y = P.pet.y - 60 * P.world.scale;
      for (const type of ['dragenter', 'dragover']) {
        window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      }
      P.run(0.3);
      const ball = document.getElementById('food-cursor');
      const during = { activity: P.brain.name, ball: !ball.hidden };
      window.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, clientX: -5, clientY: -5, bubbles: true }));
      P.run(0.3);
      return { during, after: { activity: P.brain.name, ball: !ball.hidden } };
    `);
    check(
      '文件停在它身上时：鼠标旁边换成小纸团、它张嘴等着；拖走后纸团消失',
      hover.during.activity === 'hungry' && hover.during.ball && !hover.after.ball && hover.after.activity !== 'hungry',
      hover
    );

    // 6. 画面拿到的只是"假文件"（没有真实路径）时：后台什么都不吃
    const empty = await js(`return window.pawmail.feed([new File(['x'], 'a.txt')]).then((r) => r);`);
    check('不是从电脑上拖来的文件：后台不吃', empty && empty.eaten === 0 && empty.items.length === 0, empty);
  }

  /**
   * 自检扔进回收站的测试文件：在回收站里找到它们，彻底删掉，免得弄脏你的回收站。
   * 回收站里每样东西有两个文件：$I 开头的记着原来的位置，$R 开头的是东西本身。只删原来位置完全对得上的。
   */
  function purgeFromRecycleBin(originals) {
    const wanted = new Set(originals.map((p) => path.resolve(p).toLowerCase()));
    const binRoot = path.join(path.parse(path.resolve(originals[0])).root, '$Recycle.Bin');
    let removed = 0;
    let folders = [];
    try {
      folders = fs.readdirSync(binRoot);
    } catch {
      return 0;
    }
    for (const sid of folders) {
      const dir = path.join(binRoot, sid);
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue; // 别的用户的回收站：打不开，也不该碰
      }
      for (const name of names) {
        if (!name.startsWith('$I')) continue;
        let buf;
        try {
          buf = fs.readFileSync(path.join(dir, name));
        } catch {
          continue;
        }
        // Windows 10 以后的格式：8 字节版本号(2)、8 字节大小、8 字节删除时间、4 字节路径长度，后面是 UTF-16 的原路径
        if (buf.length < 30 || buf.readUInt32LE(0) !== 2) continue;
        const chars = buf.readUInt32LE(24);
        const original = buf.toString('utf16le', 28, 28 + Math.max(0, chars - 1) * 2).toLowerCase();
        if (!wanted.has(original)) continue;
        fs.rmSync(path.join(dir, '$R' + name.slice(2)), { recursive: true, force: true });
        fs.rmSync(path.join(dir, name), { force: true });
        removed += 1;
      }
    }
    return removed;
  }

  function finish() {
    const passed = results.filter((r) => r.ok).length;
    console.log(`[selftest] ${passed}/${results.length} 项通过`);
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ passed, total: results.length, results }, null, 2));
  }
}

module.exports = { run, FakeNote, fakeFetch };
