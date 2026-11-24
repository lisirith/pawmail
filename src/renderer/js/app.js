// 画面这一侧的主程序：把宠物、大脑、鼠标、菜单、气泡串在一起，并驱动每一帧。

import { createBridge } from './bridge.js';
import { createI18n } from './i18n.js';
import { getSpecies } from './pet/species/index.js';
import { Pet } from './pet/pet.js';
import { Brain } from './pet/brain.js';
import { RIG, drawHeadOnly } from './pet/draw.js';
import { lookById } from './pet/looks.js';
import { drawFood, foodOfMime, foodOfName } from './pet/food.js';
import { makePose, poseDistance, copyPose } from './pet/pose.js';
import { Toy } from './pet/toy.js';
import { drawYarn, drawBall, drawBone } from './pet/props.js';
import { Bubble } from './ui/bubble.js';
import { PetMenu } from './ui/menu.js';
import { AreaEditor } from './ui/area.js';
import { clamp, damp, rand, TAU } from './util/math.js';

const bridge = createBridge();

/** 把宠物的头画成一张小图，交给后台当托盘图标。过节戴着帽子的话，托盘图标也戴着 */
/** 托盘图标：宠物的头。过节戴着节日帽子；平时戴着衣柜里的帽子、眼镜 */
function makeTrayIcon(species, look, outfit) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const hat = (look && look.head) || (outfit && outfit.hat);
  const k = size / (2 * (species.head.rx + 8)) * (hat ? 0.82 : 1); // 戴帽子时缩小一点，帽子才放得下
  g.translate(size / 2, size / 2 + (species.earReach * 0.35 + (hat ? 12 : 0)) * k);
  g.scale(k, k);
  drawHeadOnly(g, species, makePose({ blush: 0.5 }), look && look.head ? { head: look.head } : null, outfit);
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
    area: null, // 活动范围（像素）：{ left, top, right, bottom, custom }，由下面的 layoutArea 算出来
    clip: null, // 宠物画在哪个框里：框外面的部分看不见，也点不到
    groundY: stage.clientHeight - 3, // 地面 = 活动范围的底边（没设置时就是任务栏的上沿）
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
    // 别的窗口的顶边，宠物可以站上去：[{ id, x, y, right, bottom, segs: [[左, 右], ...], sideL, sideR }]
    // （只留活动范围里站得下的，见 layoutLedges；各项的意思见 setLedges）
    ledges: [],
    // 桌面上滚来滚去的玩具（猫的毛线球、柴犬的网球，见 pet/toy.js 和 pet/tricks.js）
    toy: new Toy(),
  };
  let rawLedges = []; // 后台发来的原样（整个屏幕的）；活动范围、宠物大小变了要重新筛

  // ------------------------------------------------------------ 活动范围
  //
  // 设置里存的是"占整个窗口的比例"（换了分辨率也大致在同一个位置），这里换算成像素。
  // 宠物只在这个方框里活动：方框的底边就是地面，左右两边是墙（可以爬），方框外面的部分看不见。

  const arena = document.getElementById('arena');
  let arenaX = 0; // 方框（裁剪框）左上角在窗口里的位置
  let arenaY = 0;
  // 裁剪框比活动范围往上多留一截：头顶冒出来的爱心、ZZZ、跳起来的耳朵不会被切掉一半
  const ARENA_SPILL = 90;
  /** 方框最小多大：再小它就转不开身了（宠物调大了，方框也跟着要大一点） */
  const minAreaSize = (S) => ({ w: 240 * S, h: 190 * S });

  function computeArea() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const f = settings.area;
    if (!f) return { left: 0, top: 0, right: W, bottom: H, custom: false };
    // 方框比最小尺寸还小（比如后来把宠物调大了）：底边不动，往上、往两边撑大
    const min = minAreaSize(world.scale);
    const w = Math.min(W, Math.max(f.w * W, min.w));
    const h = Math.min(H, Math.max(f.h * H, min.h));
    const left = clamp((f.x + f.w / 2) * W - w / 2, 0, W - w);
    const bottom = clamp((f.y + f.h) * H, h, H);
    return { left, top: bottom - h, right: left + w, bottom, custom: true };
  }

  function layoutArea() {
    world.width = stage.clientWidth;
    world.height = stage.clientHeight;
    const A = computeArea();
    world.area = A;
    world.groundY = A.bottom - 3;
    // 裁剪框对齐到物理像素，宠物才不会发虚
    const ratio = window.devicePixelRatio || 1;
    const snap = (v) => Math.round(v * ratio) / ratio;
    const top = A.custom ? Math.max(0, A.top - ARENA_SPILL * world.scale) : 0;
    const bottom = A.custom ? Math.min(world.height, A.bottom + 4 * world.scale) : world.height; // 底下留一点给影子
    arenaX = snap(A.left);
    arenaY = snap(top);
    const width = snap(A.right) - arenaX;
    const height = snap(bottom) - arenaY;
    arena.style.left = `${arenaX}px`;
    arena.style.top = `${arenaY}px`;
    arena.style.width = `${width}px`;
    arena.style.height = `${height}px`;
    world.clip = { left: arenaX, top: arenaY, right: arenaX + width, bottom: arenaY + height };
    layoutLedges();
  }

  /**
   * 从后台发来的窗口顶边里，挑出宠物站得上去的：在活动范围里、头顶有地方（不会顶出范围）、
   * 离地面不太近（那和站在地上差不多）、露出来的一段够它站。
   */
  function layoutLedges() {
    const A = world.area;
    const S = world.scale;
    const lo = A.left + 34 * S;
    const hi = A.right - 34 * S;
    const top = A.top + 130 * S;
    const bottom = world.groundY - 60 * S;
    world.ledges = rawLedges
      .filter((L) => L.y >= top && L.y <= bottom)
      .map((L) => ({ ...L, segs: L.segs.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b - a >= 70 * S) }))
      .filter((L) => L.segs.length);
  }

  /**
   * 后台发来的窗口顶边：先检查一下样子（画面不信任任何外来数据）。
   * right、bottom 是窗口的右边和底边，sideL / sideR 是左右两条竖边露在外面的几截（宠物顺着它爬上去，见 activities.js 的 climbUp）
   */
  function setLedges(list) {
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    const spans = (v) => (Array.isArray(v) ? v.filter((s) => Array.isArray(s) && num(s[0]) && num(s[1]) && s[1] > s[0]).slice(0, 20) : []);
    rawLedges = (Array.isArray(list) ? list : [])
      .slice(0, 200)
      .filter((L) => L && typeof L.id === 'string' && num(L.x) && num(L.y) && Array.isArray(L.segs))
      .map((L) => ({
        id: L.id,
        x: L.x,
        y: L.y,
        right: num(L.right) ? L.right : L.x,
        bottom: num(L.bottom) ? L.bottom : L.y,
        segs: spans(L.segs),
        sideL: spans(L.sideL),
        sideR: spans(L.sideR),
      }));
    layoutLedges();
  }
  layoutArea();

  const pet = new Pet(getSpecies(settings.species, settings.catCoat), world);
  pet.setOutfit(settings.outfit); // 穿着上次换好的衣服出场
  const bubble = new Bubble(document.getElementById('bubble'));
  // 说一句话：params 填进句子里的 {占位}（比如待办提醒里你写的那件事）
  const fill = (text, params) => (params ? String(text).replace(/\{(\w+)\}/g, (whole, key) => (params[key] === undefined ? whole : String(params[key]))) : text);
  const say = (key, seconds, params) => bubble.say(fill(i18n.line(key, pet.sp.id), params), seconds);
  const brain = new Brain({ pet, world, say, saved: init.pet, stat: (kind) => bridge.stat(kind), onAck: (id) => bridge.todoAck(id) });

  // 笔记本的电量（浏览器自带的电池接口，只在本机看，不联网，也不记录）：快没电时它也蔫了，插上电又精神了。
  // 台式机没有电池，接口会说"插着电、满格"，什么都不会发生
  if (navigator.getBattery) {
    navigator
      .getBattery()
      .then((battery) => {
        const report = () => brain.onBattery({ level: battery.level, charging: battery.charging });
        report();
        battery.addEventListener('levelchange', report);
        battery.addEventListener('chargingchange', report);
      })
      .catch(() => {});
  }

  // 待办（见 src/main/todos.js）：到点了（或者提前一会儿）它举牌子提醒你；你在通知上点了"知道了"，它把牌子放下；
  // 你勾掉一件，它替你高兴
  bridge.on('remind', (r) => brain.onRemind(r));
  bridge.on('remind-off', (r) => brain.reminderOff(r && r.ids));
  bridge.on('todo-done', (d) => brain.onTodoDone(d));

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

  // 节日：后台每 5 秒看一次今天过不过节，变了就告诉我们。换装扮、打节日招呼
  let festival = null;
  function applyFestival(next, { greet = true } = {}) {
    festival = next || null;
    pet.setLook(festival ? lookById(festival.look) : null);
    brain.setFestival(festival, { greet });
    bridge.setTrayIcon(makeTrayIcon(pet.sp, pet.look, pet.outfit));
  }
  bridge.on('festival', (next) => applyFestival(next));

  // 窗口顶边（宠物可以站上去）：后台看到窗口挪了、开了、关了，就发一份新的
  bridge.on('ledges', setLedges);
  let perchSent = null; // 上次告诉后台的"站在哪个窗口上"

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
  const drawn = { pose: makePose(), rot: 0, species: null, mode: '', k: 0, fx: 0, at: 0, transform: '', carry: false, carryLift: 0, look: null, outfit: null, sheetLift: 0, birdDir: 1 };
  let redraws = 0;

  function render(nowMs) {
    const S = world.scale;
    const k = S * dpr; // 宠物坐标里的 1，等于多少物理像素
    const O = pet.out;
    const fxCount = pet.fx.items.length;
    // 飘着的特效：宠物安静时每秒画 12 次就够了，其余时候每秒 30 次；
    // 只有节日的背景特效（雪花、彩带、火星）在飘时，每秒 10 次就够了，免得过节那天特别费电
    const lively = fxCount > 0 && pet.fx.items.some((item) => !item.ambient);
    const fxInterval = lively ? (pet.style.fps <= 20 ? 80 : 30) : 100;
    const dirty =
      drawn.species !== pet.sp ||
      drawn.mode !== pet.mode ||
      drawn.k !== k ||
      drawn.fx !== fxCount ||
      drawn.carry !== pet.carry ||
      drawn.carryGold !== pet.carryGold ||
      drawn.look !== pet.look ||
      drawn.outfit !== pet.outfit ||
      (drawn.birdDir !== pet.birdDir && O.bird > 0.02) ||
      (drawn.mouthToy !== pet.mouthToy && O.mouthBall > 0.02) ||
      Math.abs(pet.carryLift - drawn.carryLift) * 70 * k > REDRAW_PX ||
      Math.abs(pet.sheetLift - drawn.sheetLift) * 80 * k > REDRAW_PX ||
      poseDistance(O, drawn.pose) * k > REDRAW_PX ||
      Math.abs(pet.rot - drawn.rot) * 120 * k > REDRAW_PX ||
      (fxCount > 0 && nowMs - drawn.at > fxInterval) ||
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
      drawn.look = pet.look;
      drawn.outfit = pet.outfit;
      drawn.sheetLift = pet.sheetLift;
      drawn.birdDir = pet.birdDir;
      drawn.mouthToy = pet.mouthToy;
      drawn.at = nowMs;
      redraws += 1;
    }
    renderToy();
    // 小画布跟着宠物移动（对齐到物理像素，静止时才不会发虚）。画布放在活动范围的框里，所以要减去框的位置
    const left = Math.round((pet.x - RIG.anchorX * S - arenaX) * dpr) / dpr;
    const top = Math.round((pet.y - RIG.anchorY * S - arenaY) * dpr) / dpr;
    const transform = `translate3d(${left}px, ${top}px, 0)`;
    if (transform !== drawn.transform) {
      drawn.transform = transform;
      canvas.style.transform = transform;
    }
    // 气泡在头顶上方；它把信举起来的时候，气泡再往上让一让，别挡住信
    // （举着提醒的便签时也一样）
    const lifted = Math.max(pet.carry ? pet.carryLift * 32 : 0, pet.out.sign * 44);
    bubble.update(pet.x, pet.y + (pet.headTop() - 6 - lifted) * S, world.width);
  }

  // ------------------------------------------------------------ 桌面上的玩具（毛线球、网球）
  //
  // 玩具会滚得很远（滚出宠物那块小画布），所以单独用一块小画布：样子只在换玩具、换大小时画一次，
  // 平时只是挪位置、转一转（CSS transform）。和宠物一样：位置没变就不去碰页面（省电）
  const toyCanvas = document.getElementById('toy');
  const toyCtx = toyCanvas.getContext('2d');
  const toyDrawn = { kind: null, k: 0, transform: '', opacity: '', shown: false };
  const TOY_BOX = 44; // 小画布的边长（按宠物原始大小算）：毛线球拖着的线头也装得下
  function renderToy() {
    const toy = world.toy;
    const shown = toy.active && !toy.held && toy.alpha > 0.01;
    if (shown !== toyDrawn.shown) {
      toyDrawn.shown = shown;
      toyCanvas.hidden = !shown;
    }
    if (!shown) return;
    const S = world.scale;
    const k = S * dpr;
    if (toyDrawn.kind !== toy.kind || toyDrawn.k !== k) {
      toyDrawn.kind = toy.kind;
      toyDrawn.k = k;
      const px = Math.round(TOY_BOX * k);
      toyCanvas.width = px;
      toyCanvas.height = px;
      toyCanvas.style.width = `${TOY_BOX * S}px`;
      toyCanvas.style.height = `${TOY_BOX * S}px`;
      toyCtx.setTransform(k, 0, 0, k, 0, 0);
      toyCtx.clearRect(0, 0, TOY_BOX, TOY_BOX);
      toyCtx.translate(TOY_BOX / 2, TOY_BOX / 2);
      if (toy.kind === 'yarn') drawYarn(toyCtx, toy.r);
      else if (toy.kind === 'bone') drawBone(toyCtx, 30);
      else drawBall(toyCtx, toy.r);
      toyDrawn.transform = '';
    }
    const half = (TOY_BOX * S) / 2;
    const left = Math.round((toy.x - half - arenaX) * dpr) / dpr;
    const top = Math.round((toy.y - toy.r * S - half - arenaY) * dpr) / dpr;
    const transform = `translate3d(${left}px, ${top}px, 0) rotate(${toy.rot.toFixed(2)}rad)`;
    if (transform !== toyDrawn.transform) {
      toyDrawn.transform = transform;
      toyCanvas.style.transform = transform;
    }
    const opacity = toy.alpha >= 0.99 ? '' : toy.alpha.toFixed(2);
    if (opacity !== toyDrawn.opacity) {
      toyDrawn.opacity = opacity;
      toyCanvas.style.opacity = opacity;
    }
  }

  window.addEventListener('resize', () => {
    applyArea(); // 分辨率、任务栏变了：活动范围按比例跟着变
    if (window.devicePixelRatio !== dpr) resizeCanvas();
  });

  /** 一闪一闪地"噗"一下（换动物、被挪到新的活动范围时） */
  function poof() {
    pet.squashSpring.kick(3);
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
  }

  /**
   * 活动范围变了（你画了新方框、换了分辨率、把宠物调大了）：重新算范围，再把宠物放进去。
   * announce：是你刚画的新方框，宠物会说句话
   */
  function applyArea({ announce = false } = {}) {
    const before = world.area;
    layoutArea();
    const A = world.area;
    const same = before && before.left === A.left && before.top === A.top && before.right === A.right && before.bottom === A.bottom;
    if (same || pet.unbounded || pet.mode === 'held') return; // 正在进场、正被你拎着：之后物理会自己把它放进范围里
    const S = world.scale;
    if (pet.mode === 'wall') brain.start('falling'); // 正扒在墙上：先松手（爬墙动作一结束就会让它掉下来）
    // 站在窗口上：不用管。那个窗口不在新的范围里的话，layoutLedges 已经把它筛掉了，宠物下一帧自己会掉下去
    const lo = A.left + 40 * S;
    const hi = Math.max(lo, A.right - 40 * S);
    const insideX = pet.x >= lo && pet.x <= hi;
    const insideY = pet.y >= pet.ceilingY() - 1 && pet.y <= world.groundY + 1;
    if (!insideX || !insideY) {
      // 跑到范围外面了："噗"地一下出现在范围里离原来最近的地方
      pet.x = clamp(pet.x, A.left + 70 * S, Math.max(A.left + 70 * S, A.right - 70 * S));
      pet.y = world.groundY;
      pet.mode = 'ground';
      pet.perch = null;
      pet.vx = pet.vy = pet.rot = pet.vrot = 0;
      pet.leapt = pet.bounced = false;
      poof();
    } else if (pet.mode === 'ground' && !pet.perch && pet.y < world.groundY - 2) {
      // 还在范围里，但新的地面更低：从原来的高度轻轻跳下去
      pet.mode = 'air';
      pet.vx = pet.vy = 0;
      pet.leapt = true;
      brain.start('falling');
    }
    brain.onAreaChange();
    if (announce) say('area', 2.6);
  }

  // ------------------------------------------------------------ 鼠标

  const samples = []; // 最近的鼠标轨迹，用来算"松手时扔出去的速度"
  let press = null; // 鼠标左键按在宠物身上：{ x, y, t, dragging }
  let toyPress = null; // 鼠标左键按在柴犬放下的球（骨头）上：{ x, y, t, dragging }
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

  // 柴犬叼来的球（骨头）：按住拖着走，松手带着鼠标的速度扔出去；只点一下的话，它替你扔（见 pet/tricks.js 的 fetch）
  function startToyDrag() {
    if (!toyPress || toyPress.dragging) return;
    toyPress.dragging = true;
    world.toy.grab();
    world.toy.dragTo(world.pointer.x, world.pointer.y, world);
    document.body.classList.add('dragging');
  }

  function endToyPress(cancelled) {
    if (!toyPress) return;
    const wasDragging = toyPress.dragging;
    toyPress = null;
    world.pointer.down = false;
    document.body.classList.remove('dragging');
    if (!world.toy.active) return; // 拖着的时候它已经被收走了
    if (wasDragging) {
      const v = cancelled ? { x: 0, y: 0 } : releaseVelocity();
      world.toy.release(v.x, v.y, world.scale);
    } else if (!cancelled) {
      world.toy.clicked = true;
    }
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
      if (brain.ackReminder()) return; // 正在提醒待办：点一下 = 知道了
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
    if (areaEditor.isOpen) return; // 正在画活动范围：鼠标归画框用
    if (menu.isOpen) {
      if (!menu.contains(e.target)) menu.close(); // 点菜单外面 = 关闭菜单
      return;
    }
    if (e.button === 0 && world.toy.hit(e.clientX, e.clientY, world.scale)) {
      // 按在柴犬放下的球（骨头）上：拖着扔出去，或者点一下让它替你扔
      toyPress = { x: e.clientX, y: e.clientY, t: world.time, dragging: false };
      world.pointer.down = true;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* 没关系 */
      }
      e.preventDefault();
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
    if (toyPress) {
      if (!toyPress.dragging && Math.hypot(e.clientX - toyPress.x, e.clientY - toyPress.y) > 5) startToyDrag();
      if (toyPress && toyPress.dragging) world.toy.dragTo(e.clientX, e.clientY, world);
      return;
    }
    // 按住并移动超过几个像素才算"拖"，否则算"点一下"
    if (press && !press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) startDrag();
  });

  window.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    endToyPress(false);
    endPress(false);
  });
  window.addEventListener('pointercancel', () => {
    endToyPress(true);
    endPress(true);
  });

  document.documentElement.addEventListener('mouseleave', () => {
    if (!press && !toyPress) world.pointer.inside = false;
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (areaEditor.isOpen) {
      areaEditor.cancel(); // 画框时点右键 = 取消
      return;
    }
    if (menu.isOpen) {
      menu.close();
      return;
    }
    if ((pet.mode === 'ground' || pet.mode === 'wall') && pet.hit(e.clientX, e.clientY)) {
      menu.open(buildMenu(), e.clientX, e.clientY, world.width, world.height);
    }
  });

  // ------------------------------------------------------------ 喂它吃文件
  //
  // 拖着文件经过它时，和平时鼠标移到它身上一样，窗口会"接住"鼠标，拖放就落到我们的窗口里了。
  // 这边只负责演：张嘴、吃、嚼；真正"吃"（放进回收站）是后台做的，见 src/main/feed.js。

  const isFileDrag = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  // 正在被拎着、在空中、爬墙、正在吃、正在进场、正在画活动范围：这些时候不吃
  const canEat = () => pet.mode === 'ground' && brain.name !== 'eat' && brain.name !== 'arrive' && !areaEditor.isOpen && !press;
  let foodOver = false; // 文件正停在它身上
  let foodSeenAt = -Infinity;
  let dragImageAskedAt = -Infinity;

  // 跟在鼠标旁边的小纸团。Windows 自己那个半透明的大文件图标会盖住它的脸，所以文件停在它身上时，
  // 我们请后台把那个大图标藏起来，换成这个小纸团（拖走以后，Windows 的图标会自己回来）
  const foodCursor = document.getElementById('food-cursor');
  const foodCursorCtx = foodCursor.getContext('2d');
  const FOOD_BOX = 76; // 小纸团画布的大小（CSS 像素）
  const FOOD_OFFSET = { x: 5, y: 7 }; // 纸团中心在鼠标尖的右下方一点：像是被鼠标捏着
  const held = { food: null, count: 0, k: 0, transform: '' };

  function showHeldFood(food, count, x, y) {
    const k = world.scale * 1.15;
    if (food !== held.food || count !== held.count || k !== held.k || foodCursor.width !== Math.round(FOOD_BOX * dpr)) {
      held.food = food;
      held.count = count;
      held.k = k;
      foodCursor.width = Math.round(FOOD_BOX * dpr);
      foodCursor.height = Math.round(FOOD_BOX * dpr);
      foodCursor.style.width = `${FOOD_BOX}px`;
      foodCursor.style.height = `${FOOD_BOX}px`;
      foodCursorCtx.setTransform(dpr * k, 0, 0, dpr * k, (FOOD_BOX / 2) * dpr, (FOOD_BOX / 2) * dpr);
      foodCursorCtx.clearRect(-FOOD_BOX, -FOOD_BOX, FOOD_BOX * 2, FOOD_BOX * 2);
      drawFood(foodCursorCtx, food, { count });
    }
    const transform = `translate3d(${Math.round(x + FOOD_OFFSET.x - FOOD_BOX / 2)}px, ${Math.round(y + FOOD_OFFSET.y - FOOD_BOX / 2)}px, 0)`;
    if (transform !== held.transform) {
      held.transform = transform; // 位置没变就不去碰页面（省电）
      foodCursor.style.transform = transform;
    }
    if (foodCursor.hidden) foodCursor.hidden = false;
  }

  function hideHeldFood() {
    if (!foodCursor.hidden) foodCursor.hidden = true;
    held.transform = '';
  }

  /** how：文件被拿走了（'leave'）还是放下了（'drop'） */
  function setFood(on, how = 'leave') {
    if (on === foodOver) return;
    foodOver = on;
    if (on) {
      bridge.log('[喂食] 有文件拖到了宠物身上');
    } else {
      hideHeldFood();
      bridge.dragImage(how);
      dragImageAskedAt = -Infinity;
    }
    brain.onFood(on, how);
  }

  window.addEventListener('dragenter', (e) => {
    if (isFileDrag(e)) e.preventDefault();
  });

  window.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setPointer(e.clientX, e.clientY);
    const over = canEat() && !!pet.hit(e.clientX, e.clientY);
    // "复制"：文件管理器那边不会动这个文件；吃不吃、怎么放进回收站，由我们这边决定
    e.dataTransfer.dropEffect = over ? 'copy' : 'none';
    foodSeenAt = performance.now();
    setFood(over);
    if (!over) return;
    // 还没松手时，只知道文件的类型（不知道文件名），先按类型挑个纸团；松手以后再按文件名挑准
    const files = Array.from(e.dataTransfer.items || []).filter((item) => item.kind === 'file');
    showHeldFood(foodOfMime(files[0] && files[0].type), files.length, e.clientX, e.clientY);
    if (foodSeenAt - dragImageAskedAt > 100) {
      dragImageAskedAt = foodSeenAt;
      bridge.dragImage('hide');
    }
  });

  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) setFood(false); // 离开了窗口（在窗口里面换元素时也会触发，那种不算）
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault(); // 不让浏览器自己去"打开"这个文件
    const over = isFileDrag(e) && canEat() && !!pet.hit(e.clientX, e.clientY);
    setFood(false, 'drop');
    if (!over) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    // 每样东西揉成什么纸团：文件夹、文档、图片……（只是为了画对；真正的检查在后台）
    const items = Array.from(e.dataTransfer.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        const file = item.getAsFile();
        return { food: foodOfName(file && file.name, !!(entry && entry.isDirectory)) };
      });
    const from = pet.toLocal(e.clientX + FOOD_OFFSET.x, e.clientY + FOOD_OFFSET.y); // 从小纸团所在的地方飞进嘴里
    const eat = brain.onFeed(items.length ? items : files.map((f) => ({ food: foodOfName(f.name) })), from);
    bridge.feed(files).then(
      (result) => eat.resolve(result),
      (err) => {
        bridge.log(`喂食出错: ${err && err.message}`);
        eat.resolve(null);
      }
    );
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
    // 在宠物身上，或者在等你点的球上（柴犬叼球）：都要接住鼠标
    const over = p.inside && (!!pet.hit(p.x, p.y) || world.toy.hit(p.x, p.y, world.scale));
    if (over !== wasOver) {
      wasOver = over;
      document.body.classList.toggle('over-pet', over);
    }
    const want = !!press || !!toyPress || menu.isOpen || areaEditor.isOpen || over;
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
      if (id === 'trick') brain.performTrick();
      else if (id === 'todos') bridge.openMail('todos');
      else if (id === 'fetch') brain.playFetch();
      else if (id === 'toggleSleep') brain.command(brain.asleep ? 'wake' : 'sleep');
      else if (id === 'mail') bridge.openMail();
      else if (id === 'wardrobe') bridge.openMail('wardrobe');
      else if (id === 'area') openAreaEditor();
      else if (id === 'quit') {
        save();
        bridge.quit();
      }
    },
  });

  // 画活动范围（右键菜单、托盘菜单都能打开）
  const areaEditor = new AreaEditor(document.getElementById('area-editor'), {
    t: (key) => i18n.t(key),
    onDone: (result) => {
      bridge.setEditing(false);
      if (result !== undefined) bridge.setSetting('area', result); // undefined = 取消，什么都不改
    },
  });

  function openAreaEditor() {
    if (areaEditor.isOpen) return;
    menu.close();
    bubble.hide();
    const A = world.area;
    const min = minAreaSize(world.scale);
    const rect = A.custom ? { x: A.left, y: A.top, w: A.right - A.left, h: A.bottom - A.top } : null;
    bridge.setEditing(true); // "只在桌面"模式下也先把窗口提到最前面，不然画框界面会被别的窗口挡住
    areaEditor.open(rect, stage.clientWidth, stage.clientHeight, min.w, min.h);
  }

  // 菜单里每种动物前面的小头像：用代码画的（和托盘图标同一套画法），比 emoji 统一，卡皮巴拉也没有现成的 emoji。
  // 每种只画一次就记住，菜单开开关关不用重画
  const headIcons = new Map();
  function headIcon(id, coat = 'tabby') {
    const key = `${id}|${coat}`;
    if (!headIcons.has(key)) {
      const c = document.createElement('canvas');
      c.width = 40;
      c.height = 40;
      const ctx = c.getContext('2d');
      const sp = getSpecies(id, coat);
      const tall = sp.earReach > 20; // 兔子的长耳朵：头画小一点、往下挪一点，耳尖才不会出格
      ctx.translate(20, tall ? 25 : 22);
      ctx.scale(tall ? 0.32 : 0.36, tall ? 0.32 : 0.36);
      drawHeadOnly(ctx, sp, makePose());
      headIcons.set(key, c.toDataURL());
    }
    return headIcons.get(key);
  }

  function buildMenu() {
    const t = i18n.t;
    const mailLabel = mail.unread > 0 ? t('menu.mailboxUnread').replace('{n}', mail.unread) : t('menu.mailbox');
    return [
      { type: 'action', id: 'mail', label: `📬 ${mailLabel}` },
      { type: 'action', id: 'wardrobe', label: `👕 ${t('menu.wardrobe')}` },
      { type: 'action', id: 'trick', label: `✨ ${t('menu.trick')}` },
      // 柴犬：随时陪它玩球（叼来一个球或者骨头，你扔，它追）
      ...(settings.species === 'shiba' ? [{ type: 'action', id: 'fetch', label: `🎾 ${t('menu.fetch')}` }] : []),
      { type: 'action', id: 'todos', label: `📝 ${t('menu.todos')}` },
      { type: 'separator' },
      {
        type: 'choice',
        key: 'species',
        label: t('menu.animal'),
        value: settings.species,
        compact: true, // 没选中的动物只显示小头像，名字在鼠标停上去时显示
        options: [
          { value: 'cat', label: t('menu.cat'), icon: headIcon('cat', settings.catCoat || 'tabby') },
          { value: 'panda', label: t('menu.panda'), icon: headIcon('panda') },
          { value: 'capybara', label: t('menu.capybara'), icon: headIcon('capybara') },
          { value: 'shiba', label: t('menu.shiba'), icon: headIcon('shiba') },
          { value: 'redpanda', label: t('menu.redpanda'), icon: headIcon('redpanda') },
          { value: 'bunny', label: t('menu.bunny'), icon: headIcon('bunny') },
        ],
      },
      ...(settings.species === 'cat' ? [{
        type: 'choice', key: 'catCoat', label: t('menu.catCoat'), value: settings.catCoat || 'tabby',
        options: [
          { value: 'tabby', label: t('menu.tabby') },
          { value: 'lucky', label: t('menu.luckyCat') },
        ],
      }] : []),
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
      {
        type: 'choice',
        key: 'windowPerch',
        label: t('menu.windowPerch'),
        value: settings.windowPerch !== false,
        options: [
          { value: true, label: t('menu.on'), title: t('menu.windowPerchLong') },
          { value: false, label: t('menu.off') },
        ],
      },
      { type: 'separator' },
      { type: 'action', id: 'area', label: `🔲 ${t('menu.areaEdit')}` },
      { type: 'action', id: 'toggleSleep', label: brain.asleep ? `☀️ ${t('menu.wake')}` : `🌙 ${t('menu.sleep')}` },
      { type: 'action', id: 'quit', label: `👋 ${t('menu.quit')}`, danger: true },
    ];
  }

  // ------------------------------------------------------------ 设置、指令、系统消息

  function applySettings(next) {
    const prev = settings;
    settings = { ...next };
    if (settings.species !== prev.species || settings.catCoat !== prev.catCoat) {
      pet.setSpecies(getSpecies(settings.species, settings.catCoat));
      poof(); // 换动物时"噗"地弹一下
      bridge.setTrayIcon(makeTrayIcon(pet.sp, pet.look, pet.outfit));
    }
    if (settings.scale !== prev.scale) {
      world.scale = settings.scale;
      resizeCanvas();
      applyArea(); // 宠物变大了，方框可能要跟着撑大一点
    }
    if (JSON.stringify(settings.area) !== JSON.stringify(prev.area)) applyArea({ announce: true });
    // 在衣柜里换了衣服：穿上，然后低头看看、转一圈、问"好看吗？"
    if (pet.setOutfit(settings.outfit)) {
      brain.onOutfit({ off: !pet.outfit });
      bridge.setTrayIcon(makeTrayIcon(pet.sp, pet.look, pet.outfit));
    }
    if (settings.language !== prev.language) {
      i18n.setLanguage(settings.language);
      document.documentElement.lang = i18n.lang;
    }
    if (menu.isOpen) menu.render(buildMenu());
  }

  bridge.on('settings', applySettings);
  bridge.on('command', (c) => {
    if (c.type === 'editArea') openAreaEditor(); // 托盘菜单里的"画一个活动范围…"
    else brain.command(c.type);
  });
  bridge.on('system', (s) => {
    if (!xflags.includes('noaway')) Object.assign(world.system, s); // --x-noaway：测试时假装你一直在电脑前
  });

  // ------------------------------------------------------------ 存档

  function save() {
    bridge.savePet({ ...brain.snapshot(), xFrac: clamp(pet.x / Math.max(1, world.width), 0, 1) });
  }
  setInterval(save, 60000); // 每分钟存一次；退出时还会再存一次
  bridge.on('save-now', save);

  // ------------------------------------------------------------ 小提示

  // 喂文件是藏得最深的功能：没有按钮，也没人会想到"把文件拖到宠物身上"。
  // 所以从没喂过它的人，它会偶尔挥挥手提醒一句。提醒得很克制：
  //   - 每次开机最多一次，而且要开了十分钟以后、你在电脑前、它正闲着、手里没有等你拆的信
  //   - 总共最多 3 次（存档里的 feedHints）；喂过一次（fedBefore）就再也不说
  let hintedThisRun = false;
  function maybeHintFeed(force = false) {
    if (hintedThisRun || settings.fedBefore || (settings.feedHints || 0) >= 3) return false;
    if (!force && world.time < 600) return false;
    if (mail.unread > 0 || brain.userAway || pet.mode !== 'ground' || bubble.visible) return false;
    if (!['idle', 'sit', 'lookAround'].includes(brain.name) || brain.queue.length) return false;
    hintedThisRun = true;
    brain.queue.push(['greet', { line: 'hintFeed', sayFor: 6, dur: 2.2 }]);
    bridge.setSetting('feedHints', (settings.feedHints || 0) + 1);
    return true;
  }
  setInterval(maybeHintFeed, 20000);

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
    if (toyPress && !toyPress.dragging && world.time - toyPress.t > 0.28) startToyDrag();
    if (menu.isOpen) {
      // 菜单开着时，整个窗口都在接鼠标。如果你把鼠标移开不管它了，过几秒自动关掉，免得挡住你点别的东西。
      const p = world.pointer;
      if (p.inside && (wasOver || menu.containsPoint(p.x, p.y))) menuIdle = 0;
      else menuIdle += dt;
      if (menuIdle > (p.inside ? 6 : 1.5)) menu.close();
    } else {
      menuIdle = 0;
    }
    // 拖着文件停在它身上时，浏览器会一直发 dragover；超过 1.2 秒没收到，说明拖走了（保险）
    if (foodOver && performance.now() - foodSeenAt > 1200) setFood(false, 'leave');
    pet.begin(dt);
    brain.update(dt);
    pet.finish(dt);
    world.toy.step(dt, world);
    // 站上 / 离开了某个窗口：告诉后台（站在窗口上时，后台会更勤快地盯着那个窗口，你拖窗口时它才跟得上）
    const perchId = pet.perch ? pet.perch.id : null;
    if (perchId !== perchSent) {
      perchSent = perchId;
      bridge.perch(perchId);
    }
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
    const toyMoving = world.toy.active && (!world.toy.resting || world.toy.fading > 0); // 球还在滚、还在淡出
    if (press || toyPress || menu.isOpen || areaEditor.isOpen || wasOver || pet.busy || toyMoving) return 60;
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

  // 从活动范围里离"上次待的地方"近的那一边跑进来，挥手打招呼
  const S = world.scale;
  const A0 = world.area;
  const savedX = init.pet && Number.isFinite(init.pet.xFrac) ? init.pet.xFrac * world.width : A0.left + rand(0.25, 0.75) * (A0.right - A0.left);
  const from = savedX < (A0.left + A0.right) / 2 ? -1 : 1;
  const edge = from < 0 ? A0.left : A0.right;
  const maxRun = 460 * S;
  const lo = A0.left + 80 * S;
  const hi = Math.max(lo, A0.right - 80 * S);
  const tx = clamp(Math.abs(savedX - edge) <= maxRun ? savedX : edge - from * rand(220, 420) * S, lo, hi);
  brain.start('arrive', { from, tx });
  const firstRun = !settings.firstRunDone;
  applyFestival(init.festival, { greet: false }); // 过节的话，跑进来时就已经穿好装扮了
  if (firstRun || !festival) {
    brain.queue.push(['greet', { line: firstRun ? 'firstRun' : 'hello', sayFor: firstRun ? 7 : 2.4, dur: firstRun ? 2.6 : 1.9 }]);
  }
  if (festival) brain.queue.push(['festiveGreet', {}]); // 过节：用节日招呼代替平常的"嗨"
  brain.onMail(mail.unread, false); // 启动时就有没拆的信：打完招呼后把信举给你看
  if (firstRun) bridge.setSetting('firstRunDone', true);

  bridge.setTrayIcon(makeTrayIcon(pet.sp, pet.look, pet.outfit));

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
      areaEditor,
      openAreaEditor,
      settings: () => settings,
      /** 测试用：假装后台发来了一份窗口顶边（[{ id, x, y, segs: [[左, 右]] }]，画面坐标） */
      setLedges,
      /** 测试用：马上试着提醒一次"文件可以拖给我吃"（跳过"开了十分钟"这一条，别的条件照旧） */
      hintFeed: () => maybeHintFeed(true),
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
