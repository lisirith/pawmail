// 画面这一侧的主程序：把宠物、大脑、鼠标、菜单、气泡串在一起，并驱动每一帧。

import { createBridge } from './bridge.js';
import { createI18n } from './i18n.js';
import { getSpecies } from './pet/species/index.js';
import { Pet } from './pet/pet.js';
import { Brain } from './pet/brain.js';
import { RIG, drawHeadOnly } from './pet/draw.js';
import { makePose, poseDistance, copyPose } from './pet/pose.js';
import { Bubble } from './ui/bubble.js';
import { PetMenu } from './ui/menu.js';
import { clamp, damp, rand, TAU } from './util/math.js';

const bridge = createBridge();

/** 把宠物的头画成一张小图，交给后台当托盘图标 */
function makeTrayIcon(species) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const k = size / (2 * (species.head.rx + 8));
  g.translate(size / 2, size / 2 + species.earReach * 0.35 * k);
  g.scale(k, k);
  drawHeadOnly(g, species, makePose({ blush: 0.5 }));
  return c.toDataURL('image/png');
}

async function main() {
  const init = await bridge.init();
  let settings = { ...init.settings };
  const i18n = createI18n(init.strings, settings.language);
  document.documentElement.lang = i18n.lang;
  document.body.classList.toggle('preview', !!init.preview);
  if (init.preview) {
    // 预览时可以加 ?box=640x480，把"假桌面"限制在左上角一块固定大小的区域里（方便截图检查）
    const box = (new URLSearchParams(location.search).get('box') || '').match(/^(\d+)x(\d+)$/);
    if (box) {
      document.body.style.width = `${box[1]}px`;
      document.body.style.height = `${box[2]}px`;
    }
  }

  // 开发用的开关（启动参数 --x-hud 显示状态面板，--x-fps=30 固定帧率），正常运行时是空的
  const xflags = init.flags || [];

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('pet');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const showHud = !!init.preview || xflags.includes('hud');

  // ------------------------------------------------------------ 环境

  const world = {
    width: stage.clientWidth,
    height: stage.clientHeight,
    groundY: stage.clientHeight - 3, // 地面 = 任务栏的上沿
    scale: settings.scale,
    time: 0,
    pointer: {
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      tracked: false,
      inside: false, // 鼠标在不在我们的窗口范围内
      down: false,
      vx: 0,
      vy: 0,
      ax: 0,
      speed: 0,
      lastMoveAt: -Infinity,
    },
    system: { idle: 0 }, // 后台告诉我们：你已经多少秒没碰电脑了
  };

  const pet = new Pet(getSpecies(settings.species), world);
  const bubble = new Bubble(document.getElementById('bubble'));
  const say = (key, seconds) => bubble.say(i18n.line(key, pet.sp.id), seconds);
  const brain = new Brain({ pet, world, say, saved: init.pet, stat: (kind) => bridge.stat(kind) });

  // 来信：后台告诉我们还有几封没拆。有没拆的信时，它会把信抱在手里。
  let mail = { unread: 0, total: 0, special: false, ...(init.mail || {}) };
  pet.carryGold = !!mail.special;
  bridge.on('mail', (next) => {
    const fresh = next.unread > mail.unread;
    mail = { ...mail, ...next };
    pet.carryGold = !!mail.special; // 有没拆的月报或年度回顾：拿金色信封
    brain.onMail(mail.unread, fresh);
    if (menu.isOpen) menu.render(buildMenu());
  });

  // ------------------------------------------------------------ 画布

  let dpr = 1;
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const S = world.scale;
    canvas.style.width = `${RIG.canvasW * S}px`;
    canvas.style.height = `${RIG.canvasH * S}px`;
    canvas.width = Math.round(RIG.canvasW * S * dpr);
    canvas.height = Math.round(RIG.canvasH * S * dpr);
  }
  resizeCanvas();

  // 省电的关键：只有"看得出变化"时才重画。
  // 实测在这台电脑上，窗口每更新一次画面，系统合成这一帧就要花约 3 毫秒的 CPU——
  // 和画得复杂不复杂、窗口大不大都没关系。所以宠物发呆时那些不到 1 个像素的细微变化
  // （呼吸、尾巴慢慢摆）先攒着，攒够大约 1 个像素再画。动作快的时候自然每帧都画，不受影响。
  const REDRAW_PX = 0.75; // 物理像素
  const drawn = { pose: makePose(), rot: 0, species: null, mode: '', k: 0, fx: 0, at: 0, transform: '', carry: false, carryLift: 0 };
  let redraws = 0;

  function render(nowMs) {
    const S = world.scale;
    const k = S * dpr; // 宠物坐标里的 1，等于多少物理像素
    const O = pet.out;
    const fxCount = pet.fx.items.length;
    const dirty =
      drawn.species !== pet.sp ||
      drawn.mode !== pet.mode ||
      drawn.k !== k ||
      drawn.fx !== fxCount ||
      drawn.carry !== pet.carry ||
      drawn.carryGold !== pet.carryGold ||
      Math.abs(pet.carryLift - drawn.carryLift) * 70 * k > REDRAW_PX ||
      poseDistance(O, drawn.pose) * k > REDRAW_PX ||
      Math.abs(pet.rot - drawn.rot) * 120 * k > REDRAW_PX ||
      // 飘着的特效：宠物安静时每秒画 12 次就够了，其余时候每秒 30 次
      (fxCount > 0 && nowMs - drawn.at > (pet.style.fps <= 20 ? 80 : 30)) ||
      (O.eyes === 'dizzy' && nowMs - drawn.at > 30); // 转圈的眼睛是随时间转的
    if (dirty) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      pet.draw(ctx);
      copyPose(O, drawn.pose);
      drawn.rot = pet.rot;
      drawn.species = pet.sp;
      drawn.mode = pet.mode;
      drawn.k = k;
      drawn.fx = fxCount;
      drawn.carry = pet.carry;
      drawn.carryGold = pet.carryGold;
      drawn.carryLift = pet.carryLift;
      drawn.at = nowMs;
      redraws += 1;
    }
    // 小画布跟着宠物移动（对齐到物理像素，静止时才不会发虚）
    const left = Math.round((pet.x - RIG.anchorX * S) * dpr) / dpr;
    const top = Math.round((pet.y - RIG.anchorY * S) * dpr) / dpr;
    const transform = `translate3d(${left}px, ${top}px, 0)`;
    if (transform !== drawn.transform) {
      drawn.transform = transform;
      canvas.style.transform = transform;
    }
    // 气泡在头顶上方；它把信举起来的时候，气泡再往上让一让，别挡住信
    bubble.update(pet.x, pet.y + (pet.headTop() - 6 - (pet.carry ? pet.carryLift * 32 : 0)) * S, world.width);
  }

  window.addEventListener('resize', () => {
    world.width = stage.clientWidth;
    world.height = stage.clientHeight;
    world.groundY = stage.clientHeight - 3;
    if (window.devicePixelRatio !== dpr) resizeCanvas();
  });

  // ------------------------------------------------------------ 鼠标

  const samples = []; // 最近的鼠标轨迹，用来算"松手时扔出去的速度"
  let press = null; // 鼠标左键按在宠物身上：{ x, y, t, dragging }
  let lastClickAt = -Infinity;

  function setPointer(x, y) {
    const p = world.pointer;
    if (x !== p.x || y !== p.y) p.lastMoveAt = world.time;
    p.x = x;
    p.y = y;
    p.inside = true;
    samples.push({ t: performance.now(), x, y });
    if (samples.length > 16) samples.shift();
  }

  function updatePointer(dt) {
    const p = world.pointer;
    if (!p.inside || !p.tracked) {
      p.tracked = p.inside;
      p.px = p.x;
      p.py = p.y;
      p.vx = damp(p.vx, 0, 0.05, dt);
      p.vy = damp(p.vy, 0, 0.05, dt);
      p.ax = damp(p.ax, 0, 0.05, dt);
    } else {
      const before = p.vx;
      p.vx = damp(p.vx, (p.x - p.px) / dt, 0.03, dt);
      p.vy = damp(p.vy, (p.y - p.py) / dt, 0.03, dt);
      p.ax = damp(p.ax, (p.vx - before) / dt, 0.04, dt);
      p.px = p.x;
      p.py = p.y;
    }
    p.speed = Math.hypot(p.vx, p.vy);
  }

  function releaseVelocity() {
    const now = performance.now();
    const recent = samples.filter((s) => now - s.t < 90);
    if (recent.length < 2) return { x: 0, y: 0 };
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.008) return { x: 0, y: 0 };
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }

  function startDrag() {
    if (!press || press.dragging) return;
    press.dragging = true;
    const local = pet.toLocal(press.x, press.y);
    pet.grab(local.x, local.y);
    brain.onGrab();
    bubble.hide();
    document.body.classList.add('dragging');
  }

  function endPress(cancelled) {
    if (!press) return;
    const wasDragging = press.dragging;
    press = null;
    world.pointer.down = false;
    document.body.classList.remove('dragging');
    if (wasDragging) {
      const v = cancelled ? { x: 0, y: 0 } : releaseVelocity();
      if (Math.hypot(v.x, v.y) > 700 * world.scale) bridge.stat('throw'); // 带着速度松手 = 把它扔出去了
      pet.release(v.x, v.y);
      brain.onRelease();
    } else if (!cancelled) {
      if (mail.unread > 0 && pet.mode === 'ground') {
        // 手里有信：点它 = 拆信
        bridge.openMail();
        brain.start('hop', { count: 1 });
        return;
      }
      const isDouble = world.time - lastClickAt < 0.38;
      lastClickAt = isDouble ? -Infinity : world.time;
      brain.onClick(isDouble);
    }
  }

  window.addEventListener('pointerdown', (e) => {
    setPointer(e.clientX, e.clientY);
    if (menu.isOpen) {
      if (!menu.contains(e.target)) menu.close(); // 点菜单外面 = 关闭菜单
      return;
    }
    if (e.button !== 0 || !pet.hit(e.clientX, e.clientY)) return;
    press = { x: e.clientX, y: e.clientY, t: world.time, dragging: false };
    world.pointer.down = true;
    try {
      stage.setPointerCapture(e.pointerId); // 拖出窗口也能继续收到鼠标事件
    } catch {
      /* 没关系 */
    }
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    setPointer(e.clientX, e.clientY);
    // 按住并移动超过几个像素才算"拖"，否则算"点一下"
    if (press && !press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) startDrag();
  });

  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) endPress(false);
  });
  window.addEventListener('pointercancel', () => endPress(true));

  document.documentElement.addEventListener('mouseleave', () => {
    if (!press) world.pointer.inside = false;
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (menu.isOpen) {
      menu.close();
      return;
    }
    if (pet.mode === 'ground' && pet.hit(e.clientX, e.clientY)) {
      menu.open(buildMenu(), e.clientX, e.clientY, world.width, world.height);
    }
  });

  // 鼠标不在宠物身上时，窗口是"穿透"的，收不到鼠标事件；这时由后台定时告诉我们鼠标在哪
  bridge.on('cursor', (c) => {
    world.system.idle = 0; // 鼠标动了 = 你回来了（不用等后台每 5 秒一次的通知）
    if (c.inside) setPointer(c.x, c.y);
    else if (!press) world.pointer.inside = false;
  });

  // 告诉后台：现在需不需要"接住"鼠标（在宠物身上、拖动中、菜单开着时需要，其余时候让鼠标穿过去）
  let captureWanted = false;
  let captureSentAt = 0;
  let wasOver = false;
  function updateCapture() {
    const p = world.pointer;
    const over = p.inside && !!pet.hit(p.x, p.y);
    if (over !== wasOver) {
      wasOver = over;
      document.body.classList.toggle('over-pet', over);
    }
    const want = !!press || menu.isOpen || over;
    const now = performance.now();
    // 需要接住鼠标时，每 0.2 秒重新确认一次；万一画面卡死，后台收不到确认就会自动恢复穿透
    if (want !== captureWanted || (want && now - captureSentAt > 200)) {
      captureWanted = want;
      captureSentAt = now;
      bridge.setCapture(want);
    }
  }

  // ------------------------------------------------------------ 菜单

  const menu = new PetMenu(document.getElementById('menu'), {
    onChoice: (key, value) => bridge.setSetting(key, value),
    onAction: (id) => {
      menu.close();
      if (id === 'toggleSleep') brain.command(brain.asleep ? 'wake' : 'sleep');
      else if (id === 'mail') bridge.openMail();
      else if (id === 'quit') {
        save();
        bridge.quit();
      }
    },
  });

  function buildMenu() {
    const t = i18n.t;
    const mailLabel = mail.unread > 0 ? t('menu.mailboxUnread').replace('{n}', mail.unread) : t('menu.mailbox');
    return [
      { type: 'action', id: 'mail', label: `📬 ${mailLabel}` },
      { type: 'separator' },
      {
        type: 'choice',
        key: 'species',
        label: t('menu.animal'),
        value: settings.species,
        options: [
          { value: 'cat', label: `🐱 ${t('menu.cat')}` },
          { value: 'panda', label: `🐼 ${t('menu.panda')}` },
        ],
      },
      {
        type: 'choice',
        key: 'displayMode',
        label: t('menu.display'),
        value: settings.displayMode,
        options: [
          { value: 'top', label: t('menu.top'), title: t('menu.topLong') },
          { value: 'desktop', label: t('menu.desktop'), title: t('menu.desktopLong') },
        ],
      },
      {
        type: 'choice',
        key: 'scale',
        label: t('menu.size'),
        value: settings.scale,
        options: [
          { value: 0.8, label: t('menu.small') },
          { value: 1, label: t('menu.medium') },
          { value: 1.3, label: t('menu.large') },
        ],
      },
      {
        type: 'choice',
        key: 'language',
        label: t('menu.language'),
        value: i18n.lang,
        options: [
          { value: 'zh', label: '中文' },
          { value: 'en', label: 'English' },
        ],
      },
      {
        type: 'choice',
        key: 'autoStart',
        label: t('menu.autoStart'),
        value: !!settings.autoStart,
        options: [
          { value: true, label: t('menu.on') },
          { value: false, label: t('menu.off') },
        ],
      },
      { type: 'separator' },
      { type: 'action', id: 'toggleSleep', label: brain.asleep ? `☀️ ${t('menu.wake')}` : `🌙 ${t('menu.sleep')}` },
      { type: 'action', id: 'quit', label: `👋 ${t('menu.quit')}`, danger: true },
    ];
  }

  // ------------------------------------------------------------ 设置、指令、系统消息

  function applySettings(next) {
    const prev = settings;
    settings = { ...next };
    if (settings.species !== prev.species) {
      pet.setSpecies(getSpecies(settings.species));
      pet.squashSpring.kick(3); // 换动物时"噗"地弹一下
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        pet.fx.spawn('spark', {
          x: Math.cos(a) * 34,
          y: -60 + Math.sin(a) * 44,
          vx: Math.cos(a) * 36,
          vy: Math.sin(a) * 36,
          life: 0.6,
          vrot: 3,
        });
      }
      bridge.setTrayIcon(makeTrayIcon(pet.sp));
    }
    if (settings.scale !== prev.scale) {
      world.scale = settings.scale;
      resizeCanvas();
    }
    if (settings.language !== prev.language) {
      i18n.setLanguage(settings.language);
      document.documentElement.lang = i18n.lang;
    }
    if (menu.isOpen) menu.render(buildMenu());
  }

  bridge.on('settings', applySettings);
  bridge.on('command', (c) => brain.command(c.type));
  bridge.on('system', (s) => {
    if (!xflags.includes('noaway')) Object.assign(world.system, s); // --x-noaway：测试时假装你一直在电脑前
  });

  // ------------------------------------------------------------ 存档

  function save() {
    bridge.savePet({ ...brain.snapshot(), xFrac: clamp(pet.x / Math.max(1, world.width), 0, 1) });
  }
  setInterval(save, 60000); // 每分钟存一次；退出时还会再存一次
  bridge.on('save-now', save);

  // ------------------------------------------------------------ 每一帧

  let lastFrameAt = performance.now();
  let fpsShown = 0;
  let hudAt = 0;
  let statAt = performance.now();
  let statFrames = 0;
  let menuIdle = 0;

  function step(dt) {
    world.time += dt;
    updatePointer(dt);
    if (press && !press.dragging && world.time - press.t > 0.28) startDrag(); // 按住不动一小会儿也算拎起来
    if (menu.isOpen) {
      // 菜单开着时，整个窗口都在接鼠标。如果你把鼠标移开不管它了，过几秒自动关掉，免得挡住你点别的东西。
      const p = world.pointer;
      if (p.inside && (wasOver || menu.containsPoint(p.x, p.y))) menuIdle = 0;
      else menuIdle += dt;
      if (menuIdle > (p.inside ? 6 : 1.5)) menu.close();
    } else {
      menuIdle = 0;
    }
    pet.begin(dt);
    brain.update(dt);
    pet.finish(dt);
    updateCapture();
    render(performance.now());
  }

  const forcedFps = Number((xflags.find((f) => f.startsWith('fps=')) || '').slice(4)) || 0;

  /**
   * 这一刻每秒要"想"多少次？有动作或你在和它互动时 60 次，发呆 30 次，睡觉 15 次。
   * （"想"很便宜；真正费电的"重画"由上面的 render 自己把关，没变化就不画。）
   */
  function wantedFps() {
    if (forcedFps) return forcedFps;
    if (press || menu.isOpen || wasOver || pet.busy) return 60;
    if (brain.userAway && brain.asleep) return 6; // 你不在、它也睡着了：没人看，几乎不占资源
    return Math.max(pet.style.fps, pet.fx.active ? 20 : 0);
  }

  const debug = { paused: false }; // 开发时可以暂停自动播放，改成手动一步步推进

  function frame(now) {
    const elapsed = (now - lastFrameAt) / 1000;
    lastFrameAt = now;
    if (!debug.paused) {
      if (elapsed > 1.5) brain.advance(elapsed - 0.25); // 被暂停过（锁屏、窗口被完全挡住）：把这段时间补上
      step(clamp(elapsed, 0.001, 0.25));
    }

    if (showHud && now - hudAt > 250) {
      hudAt = now;
      fpsShown = damp(fpsShown, 1 / Math.max(elapsed, 0.001), 0.3, 0.25);
      const n = brain.needs;
      hud.textContent =
        `${brain.name} ${brain.t.toFixed(1)}s  mode:${pet.mode}  ~${fpsShown.toFixed(0)}fps (want ${wantedFps()})\n` +
        `energy ${n.energy.toFixed(2)}  boredom ${n.boredom.toFixed(2)}  social ${n.social.toFixed(2)}  mood ${brain.mood.toFixed(2)}\n` +
        `curiosity ${brain.curiosity.toFixed(2)}  petting ${brain.petting}  away ${brain.userAway}  capture ${captureWanted}`;
    }
    if (init.dev) {
      // 每 10 秒在后台控制台报告一次：每秒"想"了几次、真正重画了几次。方便检查有没有白白耗电。
      statFrames += 1;
      if (now - statAt >= 10000) {
        const seconds = (now - statAt) / 1000;
        bridge.log(`stat think=${(statFrames / seconds).toFixed(1)}/s redraw=${(redraws / seconds).toFixed(1)}/s activity=${brain.name} mode=${pet.mode}`);
        statAt = now;
        statFrames = 0;
        redraws = 0;
      }
    }

    // 安排下一帧。需要流畅时每次屏幕刷新都画；否则先"睡"一会儿再申请下一帧，
    // 这样发呆、睡觉时每秒只被叫醒十几、二十几次，而不是 60 次。
    // （实测：画面空闲时，申请下一帧几乎会立刻执行，所以这里只留 4 毫秒余量）
    const fps = wantedFps();
    if (fps >= 50) requestAnimationFrame(frame);
    else setTimeout(() => requestAnimationFrame(frame), 1000 / fps - 4);
  }

  // ------------------------------------------------------------ 开场

  // 从离"上次待的地方"近的那一边跑进来，挥手打招呼
  const S = world.scale;
  const savedX = init.pet && Number.isFinite(init.pet.xFrac) ? init.pet.xFrac * world.width : rand(0.25, 0.75) * world.width;
  const from = savedX < world.width / 2 ? -1 : 1;
  const edge = from < 0 ? 0 : world.width;
  const maxRun = 460 * S;
  const tx = clamp(Math.abs(savedX - edge) <= maxRun ? savedX : edge - from * rand(220, 420) * S, 80 * S, Math.max(80 * S, world.width - 80 * S));
  brain.start('arrive', { from, tx });
  const firstRun = !settings.firstRunDone;
  brain.queue.push(['greet', { line: firstRun ? 'firstRun' : 'hello', sayFor: firstRun ? 7 : 2.4, dur: firstRun ? 2.6 : 1.9 }]);
  brain.onMail(mail.unread, false); // 启动时就有没拆的信：打完招呼后把信举给你看
  if (firstRun) bridge.setSetting('firstRunDone', true);

  bridge.setTrayIcon(makeTrayIcon(pet.sp));

  if (showHud) hud.hidden = false;
  if (init.dev && !init.preview) {
    // 开发模式下，把它每次换动作都报告给后台控制台（npm run dev 时能看到），方便分析"它为什么这么做"
    const start = brain.start.bind(brain);
    brain.start = (name, params) => {
      const n = brain.needs;
      bridge.log(
        `act: ${brain.name || '-'} -> ${name}  energy=${n.energy.toFixed(2)} boredom=${n.boredom.toFixed(2)} ` +
          `social=${n.social.toFixed(2)} away=${brain.userAway} idle=${Math.round(world.system.idle)}s`
      );
      start(name, params);
    };
  }
  if (init.dev) {
    // 方便在开发者工具里调试：__pawmail.brain.start('yawn')、__pawmail.pause()、__pawmail.run(0.5) ……
    window.__pawmail = {
      pet,
      brain,
      world,
      menu,
      bubble,
      bridge,
      settings: () => settings,
      setPointer,
      pause: () => (debug.paused = true),
      resume: () => (debug.paused = false),
      /** 手动把时间往前推 seconds 秒（配合 pause 使用，可以停在任意一瞬间检查画面） */
      run(seconds, fps = 60) {
        const n = Math.max(1, Math.round(seconds * fps));
        for (let i = 0; i < n; i++) step(1 / fps);
        drawn.species = null; // 最后强制重画一次，保证看到的就是此刻的样子
        render(performance.now());
      },
    };
  }

  requestAnimationFrame((now) => {
    lastFrameAt = now;
    requestAnimationFrame(frame);
  });
}

main().catch((err) => {
  console.error(err);
  try {
    bridge.log(`画面启动失败: ${err && err.stack ? err.stack : err}`);
  } catch {
    /* 忽略 */
  }
});

window.addEventListener('error', (e) => {
  try {
    bridge.log(`画面出错: ${e.message} @ ${e.filename}:${e.lineno}`);
  } catch {
    /* 忽略 */
  }
});
