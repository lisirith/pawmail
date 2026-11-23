// 宠物会做的所有动作。
//
// 每个动作是一个"工厂函数"：ACTIVITIES.xxx(b, 参数) 返回一个对象，里面有
//   update(b, dt, t)  每一帧调用。b 是大脑（b.pet 是宠物，b.world 是环境），
//                     dt 是这一帧经过的秒数，t 是这个动作已经做了多少秒。
//                     返回 true 表示"做完了"，大脑就会挑下一个动作。
//   exit(b)           （可选）动作被打断或结束时调用。
//
// 动作只需要把"想摆成的姿势"写进 pet.target，平滑过渡由 pet.js 负责。
// 想加新动作：在这里加一个函数，再到 brain.js 里给它一个出现的权重就行。

import { clamp, rand, chance, sign, wobble, bell, easeInOut, TAU } from '../util/math.js';
import { getGeometry } from './draw.js';
import { GRAVITY } from './pet.js';

/** 嘴在哪里（宠物坐标）：喂给它的文件飞到这里就算进了嘴 */
export function mouthPoint(pet) {
  const g = getGeometry(pet.sp, pet.pose);
  const face = pet.sp.face || {};
  return { x: g.headCx + pet.pose.lookX * 6, y: g.headCy + (face.noseY ?? 12) + 5 - pet.pose.lift };
}

/** 从嘴里吐出来几个纸团（吃不下的东西原样吐还给你）。foods：纸团的种类，见 food.js */
function spitOut(pet, foods) {
  const m = mouthPoint(pet);
  foods.slice(0, 6).forEach((food, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    pet.fx.spawn('food', {
      food,
      x: m.x,
      y: m.y,
      vx: dir * rand(45, 85),
      vy: -rand(120, 170),
      ay: 520,
      life: 1.1,
      delay: i * 0.08,
      rot: rand(-0.4, 0.4),
      vrot: dir * rand(3, 6),
    });
  });
}

/** 嚼东西掉下来的渣 */
function crumbs(pet, n = 4) {
  const m = mouthPoint(pet);
  for (let i = 0; i < n; i++) {
    pet.fx.spawn('crumb', { x: m.x + rand(-7, 7), y: m.y + rand(-2, 3), vx: rand(-25, 25), vy: -rand(10, 40), ay: 260, life: 0.7, size: rand(0.7, 1.2) });
  }
}

// 扒在墙上时，脚离墙（活动范围的边）多远。这个距离让脑袋的侧面刚好贴着墙
const WALL_GAP = 56;

// 爬墙时两只爪子的角度：在 CLIMB_MID ± CLIMB_AMP 之间一上一下（约 1.85 和 0.95）。
// 高的那只在下巴旁边、低的那只在腰旁边，两只都在大脑袋和身子外面，看得见；
// 再高的话爪子会藏到头后面，再低就够不着墙了（见 draw.js 的 wallArm）
const CLIMB_MID = 1.4;
const CLIMB_AMP = 0.45;

// 走路的几种步态。speed 是每秒走多少像素，stride 是一步的长度（脚才不会打滑）
// hop：一蹦一蹦走的动物（兔子，动物文件里 gait: 'hop'）每一跳有多高
export const GAITS = {
  walk: { speed: 46, stride: 15, lift: 4.5, bob: 1.8, lean: 0.03, sway: 0.03, arm: 0.3, hop: 6.5 },
  trot: { speed: 95, stride: 20, lift: 6, bob: 3.4, lean: 0.08, sway: 0.05, arm: 0.45, hop: 9 },
  run: { speed: 150, stride: 24, lift: 8, bob: 4.5, lean: 0.13, sway: 0.04, arm: 0.6, hop: 12 },
};
const HOP_STRIDE = 1.8; // 蹦着走时一跳的距离是一步的几倍（兔子一跳比别的动物迈一步远）

/** 朝 tx 走一步，并摆出走路的姿势。走到了返回 true。 */
export function locomote(b, st, dt, tx, gait, speedMul = 1) {
  const pet = b.pet;
  const T = pet.target;
  const S = b.world.scale;
  // 目的地在活动范围外面（比如你刚把范围改小了）、或者超出了脚下窗口顶边的那一段：走到边上就算到了，免得一直顶着边走
  if (!pet.unbounded) {
    const [lo, hi] = pet.spanX(34, 14);
    tx = clamp(tx, lo, hi);
  }
  const dx = tx - pet.x;
  const dir = dx >= 0 ? 1 : -1;
  T.facing = dir;
  pet.style.gaze = 'forward';
  pet.style.fps = 60;
  const hop = pet.sp.gait === 'hop';
  // 先转过身，再迈步
  if (pet.pose.facing * dir > 0.35) {
    // sp.pace：这种动物走得快慢（卡皮巴拉慢悠悠的，见 species/）
    const moved = Math.min(Math.abs(dx), gait.speed * speedMul * (pet.sp.pace || 1) * S * dt);
    pet.x += dir * moved;
    // 走了多远，腿就摆了多少（记在 walkPhase 里；别和动作自己的 phase 混在一起）
    st.walkPhase = (st.walkPhase || 0) + (moved / (gait.stride * (hop ? HOP_STRIDE : 1) * S)) * Math.PI;
  }
  const s = Math.sin(st.walkPhase || 0);
  const c = Math.cos(st.walkPhase || 0);
  if (hop) {
    // 兔子：两只脚并在一起，一蹦一蹦地往前跳（walkPhase 每走过 π 跳一下）。
    // 在空中时脚收在身子后面、两只前爪往前伸一点、耳朵往后甩一点；落地那一下身子压扁一点
    const h = Math.abs(s); // 0 踩在地上 … 1 跳到最高
    T.lift += h * gait.hop;
    T.footLY = h * 2.5;
    T.footRY = h * 2.5;
    T.footLX = -dir * 3 * h;
    T.footRX = -dir * 3 * h;
    T.lean += dir * (gait.lean + 0.05 * h);
    T.squash += Math.pow(1 - h, 8) * 0.09;
    T.earDroop += 0.14 * h;
    if (!pet.holding) {
      T.armL += 0.3 * h;
      T.armR += 0.3 * h;
    }
    return Math.abs(tx - pet.x) < 0.75;
  }
  T.footLY = Math.max(0, s) * gait.lift;
  T.footRY = Math.max(0, -s) * gait.lift;
  T.footLX = -c * 4 * dir; // 抬起的脚从后往前迈，踩着的脚相对身体往后
  T.footRX = c * 4 * dir;
  T.lift += Math.abs(s) * gait.bob;
  T.lean += dir * gait.lean + s * gait.sway;
  if (!pet.holding) {
    // 手里拿着东西（信、灯笼、奶茶……）时不甩手：两只手抱着它走（见 pet.js 的 #micro）
    T.armL += -s * gait.arm;
    T.armR += s * gait.arm;
  }
  T.headTilt += -s * 0.025;
  return Math.abs(tx - pet.x) < 0.75;
}

/** 挑一个要走去的地方：离现在 minDist ~ maxDist，且不出活动范围（站在窗口上时，不出脚下那一段顶边） */
export function pickWalkTarget(b, minDist, maxDist) {
  const pet = b.pet;
  const S = b.world.scale;
  const [lo, hi] = pet.spanX(56, 24);
  const mid = (lo + hi) / 2;
  if (hi <= lo) return mid;
  // 活动范围很窄的话，"走远一点"也走不了那么远
  const span = hi - lo;
  minDist = Math.min(minDist * S, span * 0.3);
  maxDist = Math.min(maxDist * S, span);
  for (let i = 0; i < 6; i++) {
    const tx = pet.x + rand(minDist, maxDist) * (chance(0.5) ? 1 : -1);
    if (tx >= lo && tx <= hi) return tx;
  }
  return clamp(pet.x + (pet.x > mid ? -1 : 1) * rand(minDist, maxDist), lo, hi);
}

/** 离左边、右边的"墙"（活动范围的边）各有多远 */
export function wallDistances(b) {
  const A = b.world.area;
  return { left: b.pet.x - A.left, right: A.right - b.pet.x };
}

/** 记住动作开始时是站着还是坐着，这样"被摸""打哈欠"之类的动作不会让它突然站起来 */
const postureOf = (b) => (b.pet.pose.crouch > 0.5 ? 1 : 0);

export const hearts = (pet, n = 1) => {
  for (let i = 0; i < n; i++) {
    pet.fx.spawn('heart', {
      x: rand(-24, 24),
      y: pet.headTop() + rand(-4, 10),
      vx: rand(-7, 7),
      vy: -rand(22, 32),
      life: rand(1.1, 1.5),
      size: rand(0.8, 1.15),
      phase: rand(0, 6),
      rot: rand(-0.25, 0.25),
    });
  }
};

export const sparks = (pet, n = 4) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    pet.fx.spawn('spark', {
      x: Math.cos(a) * rand(30, 46),
      y: -60 + Math.sin(a) * rand(30, 50),
      vx: Math.cos(a) * 20,
      vy: Math.sin(a) * 20,
      life: rand(0.5, 0.8),
      size: rand(0.7, 1.1),
      vrot: rand(-3, 3),
    });
  }
};

// ------------------------------------------------------------ 扒在墙上（爬屏幕边的 climb、爬窗口侧边的 climbUp 共用）
// side：墙在宠物的哪一边（-1 左 / 1 右）

/** 两只爪子在墙上：靠墙那只和另一只一上一下，正好相反。lift = 1 时靠墙那只在最上面 */
function wallPaws(T, side, lift) {
  const near = CLIMB_MID + CLIMB_AMP * lift;
  const far = CLIMB_MID - CLIMB_AMP * lift;
  T.armL = side < 0 ? near : far;
  T.armR = side > 0 ? near : far;
}

/**
 * 扒上墙：转身面向墙，抬头看看上面，蹲一下，两只爪子扒上墙：靠墙那只在上、另一只在下。pt：做了多久。返回 true = 扒好了。
 * 离墙远的那只手要换到墙这边来画（从身子后面伸过来，见 draw.js 的 wallArm）。
 * 趁它还垂着、藏在身子旁边的时候先换过去，换好了再抬起来——
 * 要是边抬边换，换的那一下会看到一只半透明的手悬在半空（用户反馈过）
 */
function reachWall(pet, side, pt) {
  const T = pet.target;
  const s = pet.style;
  const u = clamp(pt / 0.6, 0, 1);
  s.fps = 60;
  s.gaze = 'none';
  T.facing = side * 0.85;
  T.lookX = side * 0.3;
  T.lookY = -0.85;
  T.wallArm = side * clamp(pt / 0.1, 0, 1);
  const kNear = easeInOut(clamp(pt / 0.55, 0, 1));
  const kFar = easeInOut(clamp((pt - 0.2) / 0.4, 0, 1));
  T.armL = side < 0 ? (CLIMB_MID + CLIMB_AMP) * kNear : (CLIMB_MID - CLIMB_AMP) * kFar;
  T.armR = side > 0 ? (CLIMB_MID + CLIMB_AMP) * kNear : (CLIMB_MID - CLIMB_AMP) * kFar;
  T.crouch = 0.3 * bell(u);
  T.earDroop = -0.15;
  return u >= 1;
}

/** 扒在墙上的样子（爬着、挂着都一样）。climbed：离地多高（像素） */
function onWall(pet, side, climbed, S) {
  const T = pet.target;
  const s = pet.style;
  T.footLX = T.footRX = side * 9; // 脚蹬着墙
  T.lean = side * 0.03;
  T.wallArm = side; // 两只手都扒在墙上（离墙远的那只从身子后面伸过来）
  // 尾巴：爬高了就整条垂下来（圆滚滚的，不压扁）；刚离地时还翘着，免得垂到地板下面去
  T.tailCurl = 1;
  T.tailHang = clamp(climbed / (50 * S), 0, 1);
  s.tilt = side * 0.08; // 整个身子往墙那边靠一点
  s.tailSide = -side; // 尾巴一直在屋子这边：回头看屋里时也不换边（换边那一下尾巴会变成一根细棍，而且会伸进墙里）
}

/**
 * 往上（up = true）或往下爬一小段。st 里要有 cyc（手脚交替的节奏）、rate（换手多快）、pullReach（每换一次手拉多高）。
 * 返回这一帧爬了多高（像素，往下是负数）。
 * 两只爪子轮流换手：一只扒住墙往下拉，另一只松开往上够（往下爬时反过来）。
 * 扒住的那只爪子要"钉"在墙上不打滑，所以身子移动的速度 = 这只爪子相对身子移动的速度：
 * 手臂转得最快的时候身子走得最快；换手的那一瞬间（一只在最上、一只在最下）身子停一停
 */
function climbStroke(st, pet, dt, side, up, S) {
  const T = pet.target;
  const s = pet.style;
  s.fps = 60;
  s.gaze = 'none';
  s.tailAmp = 0.2;
  const rate = st.rate * (up ? 1 : 1.25);
  st.cyc += dt * rate;
  const sn = Math.sin(st.cyc);
  const pull = Math.abs(Math.cos(st.cyc));
  wallPaws(T, side, sn);
  // 脚也轮流往上蹬：靠墙那只手在上时，另一边的脚抬起来（一左一右交叉着动，像真的在爬）
  const farFoot = Math.max(0, sn) * 6;
  const nearFoot = Math.max(0, -sn) * 6;
  T.footLY = side > 0 ? farFoot : nearFoot;
  T.footRY = side > 0 ? nearFoot : farFoot;
  T.lift += pull * 1.2; // 拉的时候使一下劲
  T.facing = side * 0.85;
  T.lookX = side * 0.2;
  T.lookY = up ? -0.7 : 0.75; // 往上爬看上面，往下爬看脚下
  T.earDroop = -0.1;
  T.blush = 0.55;
  if (pet.sp.id !== 'cat' && up) T.mouth = 'wavy'; // 熊猫爬得很吃力
  return (up ? 1 : -1) * st.pullReach * rate * pull * S * dt;
}

/** 蹬一下墙，往墙的反方向跳：第一次调用时起跳（st.jumped 记着），之后每帧摆在空中的姿势 */
function wallLeap(st, pet, side, S) {
  const T = pet.target;
  const s = pet.style;
  if (!st.jumped) {
    st.jumped = true;
    pet.mode = 'air';
    pet.airT = 1;
    pet.leapt = true;
    pet.bounced = false;
    pet.vx = -side * rand(160, 230) * S;
    pet.vy = -rand(150, 260) * S;
    pet.vrot = -side * 1.2;
  }
  s.fps = 60;
  s.gaze = 'none';
  s.tailSide = -side; // 尾巴别在半空中换边：换边那一下尾巴是侧着的，看起来像一根细棍
  T.facing = -side * 0.5;
  // 离墙远的那只手：先放下来（在身子后面），再换回自己那边，然后才和另一只一起举起来（同样是为了不露出半透明的手）
  T.wallArm = st.pt < 0.2 ? side : 0;
  const farUp = st.pt < 0.32 ? 0 : 1.5;
  T.armL = side < 0 ? 1.5 : farUp;
  T.armR = side > 0 ? 1.5 : farUp;
  T.eyes = 'happy';
  T.mouth = 'smile';
  T.mouthOpen = 0.6;
  T.tailCurl = 1;
  T.footLY = T.footRY = 3;
}

// ------------------------------------------------------------ 自己上窗口（brain.js 的 hopUp / climbUp）

// 一跳最高能跳多高（按宠物原始大小算的像素）：猫轻巧，熊猫沉，卡皮巴拉懒得使劲
const HOP_REACH = { cat: 190, panda: 120, capybara: 110, shiba: 170, redpanda: 180, bunny: 205 }; // 兔子最能跳
const hopReach = (sp) => HOP_REACH[sp.id] ?? 150;
// 顺着窗口侧边爬到顶时：爪子扒住了顶边，脚还在顶边下面这么多，然后一翻身上去
const HANG = 72;

const ledgeById = (w, id) => (w.ledges || []).find((L) => L.id === id) || null;

/** 窗口侧边那面"墙"：宠物扒着它时脚站在哪（离边 WALL_GAP，脑袋的侧面刚好贴着边） */
function wallFoot(w, L, side) {
  return (side > 0 ? L.x : L.right) - side * WALL_GAP * w.scale;
}

/** 顶边挨着这个角的那一段（翻上去就落在这一段上）；没有（这个角被挡住了）返回 undefined */
function cornerSeg(w, L, side) {
  const S = w.scale;
  const edge = side > 0 ? L.x : L.right;
  return L.segs.find(([a, c]) => (side > 0 ? a <= edge + 30 * S : c >= edge - 30 * S) && c - a >= 70 * S);
}

/**
 * 窗口的这条侧边能不能扒着爬。side 和爬墙一样是"墙在宠物的哪一边"：
 * 1 = 窗口的左边（宠物在窗口左外面，墙在它右手边），-1 = 窗口的右边。要求：
 *   - 这条边从顶一直到 lowY 都露在外面（没被前面的窗口挡住）。lowY：从地面开始爬就是地面，已经爬到一半就是脚的高度
 *   - 从地面开始爬的话，窗口要一直伸到地面（悬在半空的窗口，下面够不着）
 *   - 边外面站得下（不出活动范围）
 *   - 顶边挨着这个角的那一段露在外面（爬到顶才翻得上去）
 */
function wallClimbable(w, L, side, lowY) {
  const S = w.scale;
  const A = w.area;
  const edge = side > 0 ? L.x : L.right;
  if (edge <= A.left || edge >= A.right) return false;
  const foot = wallFoot(w, L, side);
  if (foot < A.left + 34 * S || foot > A.right - 34 * S) return false;
  if (lowY >= w.groundY - 1 && !(L.bottom >= w.groundY - 2 * S)) return false;
  const spans = (side > 0 ? L.sideL : L.sideR) || [];
  if (!spans.some(([a, c]) => a <= L.y + 6 * S && c >= lowY - 4 * S)) return false;
  return !!cornerSeg(w, L, side);
}

/**
 * 想跳上哪个窗口：从现在站的地方（地面，或者一个窗口顶上）跳得上去、走过去最近的那个。
 * 从顶边那一段的一头跳上去：起跳点在这一头外面一点，落脚点在里面一点。
 * only：只看这一个窗口（自检用）。返回 { id, x, from, to, cost } 或 null（x 是这时窗口的左边，窗口被拖动了用来跟着改）
 */
export function planHop(b, only) {
  const pet = b.pet;
  const w = b.world;
  const S = w.scale;
  if (pet.mode !== 'ground') return null;
  const reach = hopReach(pet.sp) * S;
  const [lo, hi] = pet.spanX(34, 14); // 起跳点得在现在能走到的地方
  let best = null;
  for (const L of w.ledges || []) {
    if ((only && L.id !== only) || (pet.perch && L.id === pet.perch.id)) continue;
    const h = pet.y - L.y; // 比脚下高多少
    if (h < 30 * S || h > reach) continue;
    for (const [a, c] of L.segs) {
      for (const end of [-1, 1]) {
        const edge = end < 0 ? a : c;
        const to = edge - end * 45 * S;
        if (to < a + 30 * S || to > c - 30 * S) continue; // 这一段太短
        const from = clamp(edge + end * 70 * S, lo, hi);
        if (Math.abs(to - from) > 160 * S) continue; // 离得太远，跳不过去
        const cost = Math.abs(pet.x - from); // 要先走多远
        if (cost > 650 * S) continue;
        if (!best || cost < best.cost) best = { id: L.id, x: L.x, from, to, cost };
      }
    }
  }
  return best;
}

/**
 * 想顺着哪个窗口的侧边爬上去（只从地面爬；太矮的窗口跳上去就行）。
 * only：只看这一个窗口（自检用）。返回 { id, side, cost } 或 null
 */
export function planClimb(b, only) {
  const pet = b.pet;
  const w = b.world;
  const S = w.scale;
  if (pet.mode !== 'ground' || pet.perch) return null;
  let best = null;
  for (const L of w.ledges || []) {
    if (only && L.id !== only) continue;
    if (w.groundY - L.y < 110 * S) continue;
    for (const side of [1, -1]) {
      if (!wallClimbable(w, L, side, w.groundY)) continue;
      const cost = Math.abs(pet.x - wallFoot(w, L, side));
      if (cost > 700 * S) continue;
      if (!best || cost < best.cost) best = { id: L.id, side, cost };
    }
  }
  return best;
}

/**
 * 起跳，落到窗口顶边上的 (tx, ty)：算好往上、往前要多快，剩下的交给 pet.js 的物理——
 * 往下落的时候穿过这条顶边，就站上去了（和你把它放上去一样）。over：最高点比顶边高多少
 */
function leapTo(pet, w, tx, ty, over) {
  const S = w.scale;
  const g = GRAVITY * S;
  const rise = Math.max(8 * S, pet.y - (ty - over)); // 要往上跳多高
  const time = Math.sqrt((2 * rise) / g) + Math.sqrt((2 * Math.max(1, over)) / g); // 跳到最高点、再落回顶边，一共多久
  // 空中有一点阻力（pet.js 里横着的速度每秒只剩 60%），所以出发时要快一点，才能正好落到 tx
  const drag = Math.log(1 / 0.6);
  pet.vx = ((tx - pet.x) * drag) / (1 - Math.pow(0.6, time));
  pet.vy = -Math.sqrt(2 * g * rise);
  pet.vrot = 0;
  pet.perch = null;
  pet.skipPerch = null; // 没跳上去的话，落回原来的窗口上也行
  pet.mode = 'air';
  pet.airT = 1; // 不是刚松手：路过别的顶边时不放宽
  pet.leapt = true; // 自己跳的：稳稳落地，不晕
  pet.bounced = false;
}

/** 往窗口顶上跳、在半空中：两只手往上伸，看着要落的地方。face：往哪边跳 */
function upLeapPose(pet, face) {
  const T = pet.target;
  const s = pet.style;
  s.fps = 60;
  s.gaze = 'none';
  s.tailSide = -face; // 尾巴别在半空中换边（换边那一下是侧着的，像一根细棍）
  T.facing = face * 0.6;
  T.armL = T.armR = 1.6;
  T.lookX = face * 0.3;
  T.lookY = 0.3;
  T.eyes = 'wide';
  T.mouth = 'smile';
  T.mouthOpen = 0.5;
  T.tailCurl = 1;
  T.earDroop = -0.2;
  T.footLY = T.footRY = 3;
}

export const ACTIVITIES = {
  // ------------------------------------------------------------ 日常

  /** 站着发呆。呼吸、眨眼、东张西望都由 pet.js 的小动作负责 */
  idle: () => ({
    dur: rand(3, 9),
    update(b, dt, t) {
      return t >= this.dur;
    },
  }),

  /** 认真地左看看、右看看 */
  lookAround: (b) => ({
    dir: chance(0.5) ? 1 : -1,
    crouch: postureOf(b),
    update(b, dt, t) {
      const T = b.pet.target;
      b.pet.style.gaze = 'none';
      const side = t < 0.9 ? this.dir : t < 1.9 ? -this.dir : 0;
      T.crouch = this.crouch;
      T.lookX = side * 0.95;
      T.lookY = -0.15;
      T.headTilt += side * 0.04;
      T.facing = side * 0.35;
      return t >= 2.4;
    },
  }),

  /** 散步 */
  walk: (b, p) => ({
    tx: p.tx ?? pickWalkTarget(b, 70, 380),
    gait: GAITS[p.gait] || GAITS.walk,
    speedMul: rand(0.85, 1.15),
    update(b, dt, t) {
      const pet = b.pet;
      const arrived = locomote(b, this, dt, this.tx, this.gait, this.speedMul);
      if (this.gait === GAITS.run) {
        const T = pet.target;
        T.mouth = 'smile';
        T.mouthOpen = 0.4;
        T.earDroop = 0.25;
        T.tailCurl = 0.75;
      }
      return arrived || t > 40;
    },
  }),

  /** 撒欢跑 */
  run: (b) => ACTIVITIES.walk(b, { gait: 'run', tx: pickWalkTarget(b, 220, 760) }),

  /** 坐着 */
  sit: () => ({
    dur: rand(15, 50),
    update(b, dt, t) {
      const pet = b.pet;
      pet.target.crouch = 1;
      pet.target.tailCurl = 0.4;
      pet.style.tailAmp = 0.7;
      pet.style.tailSpeed = 0.8;
      return t >= this.dur;
    },
  }),

  /** 坐着清理自己：猫舔爪子蹭脸，熊猫挠肚皮 */
  groom: () => ({
    dur: rand(3.2, 5.5),
    side: chance(0.5) ? 1 : -1,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const k = clamp(t / 0.35, 0, 1) * clamp((this.dur - t) / 0.35, 0, 1); // 开头结尾渐入渐出
      T.crouch = 1;
      T.tailCurl = 0.35;
      pet.style.gaze = 'none';
      pet.style.fps = 60;
      if (pet.sp.id === 'cat') {
        const lick = Math.sin(t * 9);
        const arm = -(2.5 + lick * 0.16) * k; // 负数 = 手往身体内侧抬，一直抬到嘴边
        if (this.side > 0) T.armR = arm;
        else T.armL = arm;
        T.headTilt += this.side * 0.16 * k;
        T.headY += (2 + lick * 1.2) * k;
        T.lookX = this.side * 0.35 * k;
        T.lookY = 0.5 * k;
        T.blush = 0.6;
        if (k > 0.5) T.eyes = 'sleep';
      } else {
        const scratch = Math.sin(t * 13);
        const arm = (0.75 + scratch * 0.2) * k;
        if (this.side > 0) T.armR = arm;
        else T.armL = arm;
        T.headTilt += -this.side * 0.1 * k;
        T.lean += scratch * 0.012 * k;
        if (k > 0.5) T.eyes = 'happy';
      }
      return t >= this.dur;
    },
  }),

  /** 打哈欠 + 伸懒腰 */
  yawn: (b) => ({
    crouch: postureOf(b),
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const open = t < 0.5 ? easeInOut(t / 0.5) : t < 1.5 ? 1 : clamp(1 - (t - 1.5) / 0.45, 0, 1);
      pet.style.gaze = 'none';
      pet.style.fps = 60;
      T.crouch = this.crouch;
      T.mouth = open > 0.05 ? 'yawn' : 'cat';
      T.mouthOpen = open;
      if (open > 0.3) T.eyes = 'sleep';
      T.lookY = -0.45 * open;
      T.headTilt += -0.07 * open;
      T.headY += -1.5 * open;
      T.armL = 1.7 * open;
      T.armR = 1.7 * open;
      T.squash = -0.04 * open;
      T.earDroop = 0.35 * open;
      return t >= 2.1;
    },
  }),

  /** 坐着打瞌睡：头一点一点往下掉，又猛地抬起来 */
  nap: () => ({
    dur: rand(10, 24),
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      T.crouch = 1;
      T.tailCurl = 0.3;
      T.eyes = 'sleep';
      T.earDroop = 0.3;
      s.gaze = 'none';
      s.blink = false;
      s.breathPeriod = 4.4;
      s.breathDepth = 1.8;
      s.tailAmp = 0.1;
      s.fps = 20;
      const u = (t % 4.2) / 4.2;
      const droop = u < 0.85 ? easeInOut(u / 0.85) : 1 - (u - 0.85) / 0.15;
      T.headY += droop * 5;
      T.headTilt += droop * 0.12;
      return t >= this.dur;
    },
  }),

  /**
   * 卡皮巴拉的招牌小动作（动物文件里 headProp = 'orange' 才有）：坐下眯着眼发呆，
   * 一个橘子从天上掉下来，正好落在头顶上——它一点都不在意，接着发呆。
   * 过一会儿歪一下头，橘子骨碌碌从头顶滚下去。中途被戳、被拎起来，橘子就掉下去（见 exit）
   */
  orangeNap: () => ({
    dur: rand(14, 26), // 顶着橘子发呆多久
    side: chance(0.5) ? 1 : -1, // 最后往哪边歪头、橘子往哪边滚
    landed: false,
    done: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const DROP = 1.2; // 坐好以后过多久橘子掉下来
      const FALL = 0.45; // 掉下来要多久
      s.gaze = 'none';
      s.breathPeriod = 4.6;
      s.breathDepth = 1.4;
      s.tailAmp = 0.1;
      T.crouch = 1;
      T.eyeL = T.eyeR = 0.45; // 眯眯眼：一脸淡定
      T.blush = 0.6;
      T.earDroop = 0.15;
      if (t < DROP) {
        s.fps = 20;
        return false;
      }
      const u = t - DROP;
      s.fps = 60;
      T.prop = 1;
      if (u < FALL) {
        // 从头顶上方 90 像素掉下来，越掉越快
        const k = u / FALL;
        T.propY = 90 * (1 - k * k);
        return false;
      }
      if (!this.landed) {
        this.landed = true;
        pet.squashSpring.kick(1.2); // 咚：身子轻轻一压，脸上没有任何表情
      }
      const rest = u - FALL;
      if (rest < this.dur) {
        T.propY = rest < 0.35 ? Math.sin((rest / 0.35) * Math.PI) * 6 : 0; // 落下来弹一下
        if (rest > 0.4) s.fps = 20; // 之后就是静静地发呆，不用那么勤快地画
        return false;
      }
      // 歪一下头，橘子从这一边滚下去，越滚越快，掉出头顶以后就看不见了
      const v = clamp((rest - this.dur) / 1.1, 0, 1);
      T.headTilt += this.side * 0.2 * Math.min(1, v * 4);
      const roll = Math.max(0, v - 0.15) / 0.85;
      T.propX = this.side * 62 * roll * roll;
      T.propY = -18 * roll ** 4 - (roll > 0.6 ? 140 * (roll - 0.6) ** 2 : 0);
      T.prop = clamp((1 - roll) / 0.25, 0, 1);
      if (v >= 1) this.done = true;
      return v >= 1;
    },
    exit(b) {
      // 橘子还顶在头上就被打断了（你戳它、拎起它、它要去打招呼……）：橘子掉下去
      const pet = b.pet;
      if (this.done || pet.pose.prop < 0.3) {
        // 已经滚下去了（或者还没掉下来）：直接拿掉。不然下一个动作把位置拉回头顶正中时，
        // 还没完全淡掉的橘子会在头顶闪一下
        pet.pose.prop = 0;
        return;
      }
      const g = getGeometry(pet.sp, pet.pose);
      pet.fx.spawn('orange', {
        x: g.headCx - 3 + pet.pose.propX,
        y: g.headCy - pet.sp.head.ry - 8.5 - pet.pose.propY - pet.pose.lift,
        vx: rand(-45, 45),
        vy: -rand(70, 110),
        ay: 560,
        vrot: rand(-6, 6),
        life: 1.1,
      });
      pet.pose.prop = 0; // 头上那个马上拿掉，免得同时看到两个橘子
    },
  }),

  /**
   * 柴犬的招牌小动作（动物文件里 quirk = 'stubborn' 才有）：赖着不走。
   * 正走着路，突然往地上一趴、下巴贴地、扭过头不看你（"不走！"），赖几秒，再自己爬起来接着走。
   * 你点"叫它回来"时，它也可能先原地赖一下再跑回来（short，见 brain.js 的 command）。
   * 不放进 INTERRUPTIBLE：不然排着队的"跑回来"零点几秒就把它叫起来了，赖不住
   */
  stubborn: (b, p) => {
    const walking = !p.short; // 大脑自己挑的：先走几步再赖；叫它回来时：原地就赖
    return {
      tx: walking ? pickWalkTarget(b, 160, 420) : null,
      walkFor: walking ? rand(0.8, 1.8) : 0, // 先走多久
      dur: p.short ? rand(1.6, 2.6) : rand(3, 6), // 赖多久
      side: chance(0.5) ? 1 : -1, // 扭头往哪边（就是不看你）
      gait: GAITS.walk,
      speedMul: 1,
      flopped: false,
      update(b, dt, t) {
        const pet = b.pet;
        const T = pet.target;
        if (t < this.walkFor) {
          if (!locomote(b, this, dt, this.tx, this.gait, this.speedMul)) return false;
          this.walkFor = t; // 已经走到了：就地开始赖
        }
        const u = t - this.walkFor;
        if (!this.flopped) {
          this.flopped = true;
          pet.squashSpring.kick(1.6); // 啪叽一下趴平
          if (p.short || chance(0.7)) b.say('stubborn', 2.2);
        }
        const s = pet.style;
        s.gaze = 'none';
        s.tailAmp = 0.15;
        s.fps = u < 0.6 ? 60 : 20;
        T.loaf = 1;
        T.headY += 4; // 下巴贴着地
        T.lookX = this.side * 0.75;
        T.lookY = 0.2;
        T.headTilt += this.side * 0.08;
        T.earDroop = 0.55; // 耳朵往后贴：不高兴
        T.eyes = 'annoyed';
        T.mouth = 'pout';
        T.tailCurl = 0.3;
        if (u < this.dur) return false;
        if (this.tx !== null) b.queue.unshift(['walk', { tx: this.tx }]); // 赖够了，自己爬起来接着走
        return true;
      },
    };
  },

  /**
   * 小熊猫的招牌小动作（动物文件里 quirk = 'bluff' 才有）：受惊了就"嗖"地站直、把两只前爪高高举起，
   * 踮着脚晃来晃去"吓唬"你（真的小熊猫就是这样让自己看起来大一点）。举一会儿放下，有点不好意思。
   * 被戳的时候有时会这样（brain.onClick），鼠标猛地冲到它跟前时也会（brain 的 #watchRush）。
   * 两只手都举起来，手里的信、奶茶会先收起来（见 draw.js 的 holdAmount）
   */
  bluff: () => ({
    hold: rand(1.3, 1.9), // 举着手吓唬多久
    side: chance(0.5) ? 1 : -1,
    said: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      s.fps = 60;
      const UP = 0.16; // 举手只要零点一几秒：吓一跳是很快的
      const DOWN = 0.5;
      const rise = clamp(t / UP, 0, 1);
      const fall = clamp((t - UP - this.hold) / DOWN, 0, 1);
      const k = easeInOut(rise) * (1 - easeInOut(fall)); // 0 平常 … 1 手举到最高
      const shake = Math.sin(t * 28) * 0.04 * (1 - fall); // 爪子微微发抖
      T.crouch = 0;
      // 举到 2.0：再高（超过 2.1）爪子就藏到大脑袋后面，看不见了
      T.armL = (2.0 + shake) * k;
      T.armR = (2.0 - shake) * k;
      T.squash = -0.07 * k; // 站得直直的、伸长一点
      T.lift += 3 * k; // 踮着脚
      T.lean += Math.sin(t * 5.5) * 0.04 * k; // 左右晃
      T.earDroop = -0.3 * k; // 耳朵竖起来
      T.tailCurl = 1;
      if (fall < 0.4) {
        T.eyes = 'wide';
        T.mouth = 'o';
      } else {
        // 放下手：有点不好意思，脸红，眼睛眯起来
        T.eyes = 'happy';
        T.blush = 1;
      }
      if (!this.said && t > 0.15) {
        this.said = true;
        if (chance(0.8)) b.say('bluff', 1.8);
      }
      return fall >= 1 && t > UP + this.hold + DOWN + 0.25;
    },
  }),

  /** 趴成一团睡觉 */
  sleep: (b, p) => ({
    minDur: p.minDur ?? rand(45, 90),
    forced: !!p.forced,
    side: chance(0.5) ? 1 : -1,
    zz: 0.8,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const settled = t > 0.7;
      T.loaf = 1;
      if (pet.sp.tailWrap) T.tailWrap = 1; // 小熊猫睡觉时都抱着自己的大尾巴
      T.eyes = settled ? 'sleep' : 'open';
      if (!settled) T.eyeL = T.eyeR = 0.45;
      T.headTilt += this.side * 0.13;
      T.headY += 3;
      T.earDroop = 0.35;
      T.tailCurl = 0.15;
      T.blush = b.petting ? 1 : 0.55; // 睡着时被摸：做了个好梦，脸更红
      s.gaze = 'none';
      s.blink = false;
      s.breathPeriod = 5;
      s.breathDepth = 2.6;
      s.tailAmp = 0.06;
      s.fps = b.petting ? 30 : 15;
      this.zz -= dt;
      if (t > 1.4 && this.zz <= 0) {
        this.zz = rand(1.7, 2.5);
        pet.fx.spawn('zzz', {
          x: this.side * 20 + rand(-3, 3),
          y: pet.headTop() + 6,
          vx: this.side * rand(5, 9),
          vy: -rand(13, 18),
          life: 2.3,
          phase: rand(0, 6),
        });
        if (b.petting) hearts(pet);
      }
      return b.shouldWake(t, this);
    },
  }),

  /** 醒来：先睁开一条缝，再坐起来（接下来大脑会安排打哈欠） */
  wake: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.gaze = 'none';
      pet.style.blink = false;
      if (t < 0.9) {
        const u = t / 0.9;
        T.loaf = 1;
        if (pet.sp.tailWrap) T.tailWrap = 1 - u; // 醒来时慢慢松开抱着的尾巴
        T.headY += 3 * (1 - u);
        T.eyeL = T.eyeR = 0.25 + 0.4 * u;
        T.earDroop = 0.3;
        return false;
      }
      if (t < 1.5) {
        T.crouch = 1;
        T.eyeL = T.eyeR = 0.7;
        return false;
      }
      return true;
    },
  }),

  // ------------------------------------------------------------ 和你有关

  /** 挥手打招呼 */
  greet: (b, p) => ({
    dur: p.dur ?? 1.9,
    said: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      if (!this.said && t > 0.15) {
        this.said = true;
        if (p.line) b.say(p.line, p.sayFor);
      }
      const k = clamp(t / 0.25, 0, 1) * clamp((this.dur - t) / 0.25, 0, 1);
      pet.style.gaze = 'none';
      pet.style.fps = 60;
      pet.style.tailAmp = 0.9;
      pet.style.tailSpeed = 3;
      T.facing = 0;
      T.armR = (1.6 + Math.sin(t * 15) * 0.3) * k; // 举到脸颊旁边挥（再高的话爪子就藏到头后面看不见了）
      T.mouth = 'smile';
      T.mouthOpen = 0.45 * k;
      T.headTilt += 0.07 * k;
      if (t > 0.5 && t < 1.3) T.eyes = 'happy';
      return t >= this.dur;
    },
  }),

  /**
   * 换了新衣服（衣柜里点的）：低头看看自己，原地转一圈，再摆个姿势问"好看吗？"。
   * off = 全都脱掉了：转完圈说"凉快多了～"
   */
  showOff: (b, p) => ({
    said: false,
    dir: chance(0.5) ? 1 : -1, // 往哪边转
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const dur = 3.6;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.tailSpeed = 2.6;
      pet.style.tailAmp = 0.8;
      if (t < 1.1) {
        // 低头看看身上的新衣服，左右瞧一瞧
        const k = clamp(t / 0.25, 0, 1) * clamp((1.1 - t) / 0.2, 0, 1);
        T.facing = 0;
        T.lookY = 0.95 * k;
        T.lookX = Math.sin(t * 5) * 0.35 * k;
        T.headY += 2.5 * k;
        T.headTilt += Math.sin(t * 5) * 0.08 * k;
        T.armL = -0.3 * k;
        T.armR = -0.3 * k;
        T.mouth = 'o';
      } else if (t < 2.1) {
        // 原地转一圈：先转向一边，再转向另一边，最后转回正面；转的时候轻轻蹦一下
        const u = (t - 1.1) / 1.0;
        T.facing = Math.sin(u * TAU) * this.dir;
        T.lift += Math.sin(u * Math.PI) * 5;
        T.armL = T.armR = 0.35 * Math.sin(u * Math.PI);
        T.mouth = 'smile';
        T.mouthOpen = 0.3;
      } else {
        // 摆个姿势：一只手举到脸边，歪头笑
        if (!this.said) {
          this.said = true;
          b.say(p.off ? 'outfitOff' : 'outfit', 3.2);
        }
        const k = clamp((t - 2.1) / 0.25, 0, 1) * clamp((dur - t) / 0.3, 0, 1);
        T.facing = 0;
        T.armR = 1.45 * k;
        T.headTilt += 0.12 * k;
        T.mouth = 'smile';
        T.mouthOpen = 0.45 * k;
        T.blush = 0.9;
        if (t > 2.3 && t < 3.0) T.eyes = 'happy';
      }
      return t >= dur;
    },
  }),

  /** 把信举过头顶，踮着脚蹦：有你的信！ */
  showMail: (b, p) => ({
    said: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const dur = 2.4;
      if (!this.said) {
        this.said = true;
        if (p.say) b.say('mail', 3.4);
      }
      const k = clamp(t / 0.3, 0, 1) * clamp((dur - t) / 0.3, 0, 1); // 渐入渐出
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.carryLift = k;
      pet.style.tailSpeed = 3;
      pet.style.tailAmp = 0.9;
      T.facing = 0;
      T.armL = T.armR = 2.15 * k;
      T.lift = Math.abs(Math.sin(t * 7)) * 5 * k;
      T.mouth = 'smile';
      T.mouthOpen = 0.5 * k;
      T.blush = 0.8;
      if (k > 0.6) T.eyes = 'happy';
      return t >= dur;
    },
  }),

  /**
   * 待办到点了（见 src/main/todos.js）：跑到你鼠标旁边，把画着小闹钟的便签举过头顶，一蹦一蹦地晃，
   * 气泡里写着你要做的事（p.text，你自己写的）。点它一下 = 知道了（见 brain.ackReminder）。
   * 站在窗口上、鼠标不在屏幕上时，就在原地举
   */
  remind: (b, p) => ({
    phase: 'go',
    pt: 0,
    said: false,
    tx: undefined,
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const w = b.world;
      const S = w.scale;
      const P = w.pointer;
      this.pt += dt;
      if (this.phase === 'go') {
        if (pet.perch || !P.inside) {
          this.phase = 'show';
          this.pt = 0;
          return false;
        }
        if (this.tx === undefined) {
          const side = pet.x < P.x ? -1 : 1;
          const [lo, hi] = pet.spanX(56, 24);
          this.tx = clamp(P.x + side * 90 * S, lo, hi);
        }
        if (locomote(b, this, dt, this.tx, GAITS.trot, 1.1) || this.pt > 6) {
          this.phase = 'show';
          this.pt = 0;
        }
        return false;
      }
      const SHOW = 7;
      const k = clamp(this.pt / 0.3, 0, 1) * clamp((SHOW - this.pt) / 0.4, 0, 1);
      pet.style.fps = 60;
      pet.style.gaze = 'cursor';
      pet.style.tailSpeed = 3;
      pet.style.tailAmp = 0.9;
      T.facing = 0;
      T.sign = k;
      T.armL = T.armR = 2.15 * k;
      T.mouth = 'o';
      T.mouthOpen = 0.4;
      T.eyes = 'wide';
      T.earDroop = -0.2;
      const hop = this.pt % 1.4;
      if (hop < 0.3) T.lift += bell(hop / 0.3) * 7 * k;
      if (!this.said && this.pt > 0.2) {
        this.said = true;
        b.say('remind', SHOW, { text: p.text || '' });
      }
      return this.pt >= SHOW;
    },
  }),

  /** 你勾掉了一件待办：替你高兴，蹦两下、冒爱心 */
  cheer: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.tailSpeed = 3;
      pet.style.tailAmp = 0.9;
      if (!this.started) {
        this.started = true;
        hearts(pet, 2);
        b.say('todoDone', 2.6);
      }
      const i = Math.floor(t / 0.42);
      const u = (t % 0.42) / 0.42;
      if (i < 2) {
        T.lift = bell(u) * 22;
        T.armL = T.armR = 0.4 + bell(u) * 1.3;
      }
      T.eyes = 'happy';
      T.mouth = 'smile';
      T.mouthOpen = 0.7;
      T.blush = 1;
      return t >= 1.3;
    },
  }),

  /**
   * 深夜催你睡觉（见 brain.js 的 #bedtime）：跑到你鼠标旁边，抱着小枕头打个大哈欠，
   * 气泡里说"1:23 了……该睡觉啦～"（p.time），抱着枕头打一会儿瞌睡。
   * p.last：今晚最后一次劝你了——劝完它自己先去睡
   */
  bedtime: (b, p) => ({
    phase: 'go',
    pt: 0,
    said: false,
    tx: undefined,
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const w = b.world;
      const S = w.scale;
      const P = w.pointer;
      this.pt += dt;
      if (this.phase === 'go') {
        // 离你远的话先走过来（慢悠悠的，困了嘛）；站在窗口上、鼠标不在屏幕上时就在原地
        if (this.tx === undefined) {
          const far = P.inside && !pet.perch && Math.abs(P.x - pet.x) > 220 * S;
          const side = pet.x < P.x ? -1 : 1;
          const [lo, hi] = pet.spanX(56, 24);
          this.tx = far ? clamp(P.x + side * 110 * S, lo, hi) : null;
        }
        if (this.tx === null || locomote(b, this, dt, this.tx, GAITS.walk, 0.9) || this.pt > 8) {
          this.phase = 'show';
          this.pt = 0;
        }
        return false;
      }
      const DUR = 7;
      const s = pet.style;
      const k = clamp(this.pt / 0.4, 0, 1) * clamp((DUR - this.pt) / 0.5, 0, 1);
      s.fps = this.pt < 3 ? 60 : 30;
      s.gaze = this.pt < 3 ? 'cursor' : 'none';
      s.breathPeriod = 4.4;
      T.crouch = 1;
      T.pillow = k;
      T.armL = T.armR = -0.75 * k;
      T.blush = 0.7;
      T.earDroop = 0.35;
      // 先打个大哈欠，再抱着枕头一点一点地打瞌睡
      if (this.pt > 0.4 && this.pt < 2.2) {
        const y = clamp((this.pt - 0.4) / 0.4, 0, 1) * clamp((2.2 - this.pt) / 0.4, 0, 1);
        T.mouth = 'yawn';
        T.mouthOpen = y;
        if (y > 0.3) T.eyes = 'sleep';
      } else {
        T.eyeL = T.eyeR = 0.35;
      }
      if (this.pt > 3) {
        const u = ((this.pt - 3) % 2.2) / 2.2;
        T.headY += (u < 0.8 ? easeInOut(u / 0.8) : 1 - (u - 0.8) / 0.2) * 4;
        T.eyes = 'sleep';
      }
      if (!this.said && this.pt > 0.6) {
        this.said = true;
        b.say(p.last ? 'bedtimeLast' : 'bedtime', 4.5, { time: p.time || '' });
      }
      if (this.pt < DUR) return false;
      if (p.last) b.queue.unshift(['sleep', { forced: true, minDur: 300 }]); // 那我先睡啦
      return true;
    },
  }),

  /**
   * 笔记本快没电了（见 brain.js 的 onBattery）：头顶冒出一个红红的电池，坐下来、耳朵耷拉着，
   * 说一句"电量不多了，插上电源吧"。p.critical：电量 10% 以下，急一点
   */
  lowBattery: (b, p) => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      if (!this.started) {
        this.started = true;
        // 电池冒在耳朵旁边（正上方是说话的气泡，会挡住它）
        pet.fx.spawn('battery', { x: 44, y: pet.headTop() + 14, vy: -3, life: 3.4, level: p.level ?? 0.15 });
        if (p.critical) pet.fx.spawn('bang', { x: -34, y: pet.headTop() + 6, life: 0.8 });
        b.say(p.critical ? 'batteryCritical' : 'batteryLow', 3.4);
      }
      s.fps = 30;
      s.gaze = 'cursor';
      s.tailAmp = 0.1;
      T.crouch = 1;
      T.earDroop = 0.6;
      T.eyeL = T.eyeR = 0.45;
      T.mouth = 'wavy';
      T.headY += 2;
      T.lean += Math.sin(t * 2) * 0.01;
      return t >= 3.6;
    },
  }),

  /** 插上电源了（之前抱怨过没电）：一下子精神了，蹦一下 */
  charged: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      if (!this.started) {
        this.started = true;
        sparks(pet, 5);
        b.say('charged', 2.4);
      }
      const u = clamp(t / 0.45, 0, 1);
      T.lift = bell(u) * 20;
      T.armL = T.armR = 0.4 + bell(u) * 1.3;
      T.eyes = 'happy';
      T.mouth = 'smile';
      T.mouthOpen = 0.6;
      T.earDroop = -0.2;
      return t >= 1.1;
    },
  }),

  /**
   * 过节那天第一次见到你：打个节日招呼。
   * style：bow 作揖拜年 | cheer 欢呼蹦跳 | gaze 坐下抬头看月亮（星星） | boo 吓你一下（万圣节）
   */
  festiveGreet: (b, p) => {
    const festival = b.festival;
    const style = p.style || (festival && festival.greet) || 'cheer';
    return {
      style,
      dur: style === 'gaze' ? 4.5 : 2.6,
      said: false,
      booed: false,
      update(b, dt, t) {
        const pet = b.pet;
        const T = pet.target;
        if (!this.said && t > 0.2) {
          this.said = true;
          const key = p.line || (festival && `festivals.${festival.id}`);
          if (key) b.say(key, 3.4);
        }
        const k = clamp(t / 0.3, 0, 1) * clamp((this.dur - t) / 0.3, 0, 1);
        pet.style.fps = 60;
        pet.style.gaze = 'none';

        if (this.style === 'bow') {
          // 两只手在胸前合起来，上下拜两拜
          const bob = t > 0.3 && t < 2.1 ? Math.max(0, Math.sin((t - 0.3) * 7)) : 0;
          T.armL = T.armR = -1.15 * k;
          T.headY += 5 * bob;
          T.lookY = 0.25 + 0.45 * bob;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.35 * k;
          T.blush = 0.9;
        } else if (this.style === 'gaze') {
          // 坐下，抬头看天上的月亮
          pet.style.fps = 30;
          T.crouch = 1;
          T.lookY = -0.95 * k;
          T.lookX = 0.25 * k;
          T.headY -= 2 * k;
          T.blush = 0.75;
          if (t > 1.8) T.mouth = 'o';
        } else if (this.style === 'boo') {
          if (pet.look && pet.look.cover) {
            // 披着白布：先把白布撩起来，再"Boo!"一下
            pet.style.sheetLift = t < 1.7 ? 1 : 0;
            if (t > 0.7 && t < 1.6) {
              T.armL = T.armR = 1.75;
              T.eyes = 'wide';
              T.mouth = 'o';
              T.mouthOpen = 1;
              T.lift = bell((t - 0.7) / 0.9) * 14;
            }
          } else {
            T.lift = t > 0.6 && t < 1.2 ? bell((t - 0.6) / 0.6) * 18 : 0;
            if (t > 0.6) {
              T.armL = T.armR = 1.75 * k;
              T.eyes = 'wide';
              T.mouth = 'o';
            }
          }
          if (t > 0.75 && !this.booed) {
            this.booed = true;
            pet.fx.spawn('boo', { x: 36, y: pet.headTop() + 4, life: 1.3, size: 1.1 });
            pet.squashSpring.kick(2.5);
          }
        } else {
          // 欢呼：蹦两下
          const hopping = t < 0.9;
          const u = (t % 0.45) / 0.45;
          T.lift = hopping ? bell(u) * 18 * k : 0;
          T.armL = T.armR = (0.5 + (hopping ? bell(u) : 0.6) * 1.3) * k;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.7 * k;
          T.blush = 0.9;
        }
        return t >= this.dur;
      },
    };
  },

  /** 万圣节披着白布：时不时把白布撩起来，偷偷看你一眼 */
  peekSheet: () => ({
    dur: rand(2.4, 3.6),
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const up = t > 0.15 && t < this.dur - 0.6;
      pet.style.sheetLift = up ? 1 : 0;
      pet.style.fps = 60;
      pet.style.gaze = up ? 'cursor' : 'auto';
      if (up && t > 0.6) {
        T.mouth = 'smile';
        T.mouthOpen = 0.35;
        T.blush = 0.85;
      }
      return t >= this.dur;
    },
  }),

  /** 开心地蹦两下 */
  hop: (b, p) => ({
    count: p.count ?? 2,
    each: 0.42,
    landed: 0,
    crouchless: true,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      const i = Math.floor(t / this.each);
      if (i >= this.count) return true;
      const u = (t - i * this.each) / this.each;
      const up = bell(u);
      T.lift = up * 24;
      T.armL = T.armR = 0.4 + up * 1.2;
      T.eyes = 'happy';
      T.mouth = 'smile';
      T.mouthOpen = 0.7;
      T.blush = 0.85;
      T.squash = u < 0.12 || u > 0.9 ? 0.1 : -0.06;
      if (i > this.landed) {
        this.landed = i;
        pet.squashSpring.kick(2.2);
      }
      return false;
    },
  }),

  /** 走到鼠标旁边坐下，眼巴巴地看着：想让你陪它 */
  seekUser: () => ({
    phase: 0,
    wait: 0,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const w = b.world;
      const p = w.pointer;
      const S = w.scale;
      if (!p.inside) return true;
      if (this.phase === 0) {
        if (this.tx === undefined) {
          const side = pet.x < p.x ? -1 : 1;
          this.tx = clamp(p.x + side * 80 * S, w.area.left + 56 * S, Math.max(w.area.left + 56 * S, w.area.right - 56 * S));
        }
        if (locomote(b, this, dt, this.tx, GAITS.walk, 1.2) || t > 9) {
          this.phase = 1;
          if (chance(0.6)) b.say('lonely');
        }
        return false;
      }
      this.wait += dt;
      T.crouch = 1;
      T.headTilt += 0.1;
      pet.style.gaze = 'cursor';
      pet.style.tailAmp = 0.8;
      pet.style.tailSpeed = 2;
      return this.wait > 6;
    },
  }),

  /** 盯上鼠标 → 压低身体扭屁股 → 冲过去 → 扑！ */
  chase: () => ({
    phase: 'notice',
    pt: 0,
    jump: null,
    next(phase) {
      this.phase = phase;
      this.pt = 0;
    },
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const w = b.world;
      const p = w.pointer;
      const S = w.scale;
      const cat = pet.sp.id === 'cat';
      pet.style.fps = 60;
      this.pt += dt;
      if (!p.inside && this.phase !== 'jump' && this.phase !== 'after') return true; // 鼠标跑出屏幕了，算了
      const dir = p.x - pet.x >= 0 ? 1 : -1;

      if (this.phase === 'notice') {
        pet.style.gaze = 'cursor';
        T.facing = dir * 0.6;
        T.earDroop = -0.25;
        T.eyes = 'wide';
        if (this.pt > 0.45) this.next(Math.abs(p.x - pet.x) > 70 * S ? 'wiggle' : 'jump');
        return false;
      }

      if (this.phase === 'wiggle') {
        pet.style.gaze = 'cursor';
        pet.style.tailSpeed = 7;
        pet.style.tailAmp = 0.8;
        T.facing = dir;
        T.crouch = 0.55;
        T.lean += Math.sin(this.pt * 22) * 0.035;
        T.eyes = 'wide';
        T.tailCurl = 0.7;
        if (this.pt > (cat ? 0.75 : 0.4)) this.next('run');
        return false;
      }

      if (this.phase === 'run') {
        const tx = clamp(p.x, w.area.left + 50 * S, Math.max(w.area.left + 50 * S, w.area.right - 50 * S));
        const arrived = locomote(b, this, dt, tx, cat ? GAITS.run : GAITS.trot, 1.15);
        pet.style.gaze = 'cursor';
        T.eyes = 'wide';
        if (arrived || Math.abs(p.x - pet.x) < 26 * S) this.next('jump');
        else if (this.pt > 3.2) return true; // 追不上，放弃
        return false;
      }

      if (this.phase === 'jump') {
        if (!this.jump) {
          const height = (w.groundY - p.y) / S; // 鼠标离地多高
          this.jump = {
            h: clamp(height - 96, 14, cat ? 150 : 55),
            dur: cat ? 0.62 : 0.5,
            dir,
            checked: false,
            caught: false,
          };
        }
        const j = this.jump;
        const u = this.pt / j.dur;
        pet.style.gaze = 'cursor';
        T.facing = j.dir * 0.5;
        if (u < 1) {
          T.lift = bell(u) * j.h;
          T.armL = T.armR = 1.95;
          T.eyes = 'wide';
          T.mouth = 'smile';
          T.mouthOpen = 0.6;
          T.squash = u < 0.12 ? 0.12 : -0.07;
          T.tailCurl = 1;
          T.earDroop = -0.2;
          if (!j.checked && u >= 0.5) {
            // 跳到最高点：爪子够得着鼠标吗？
            j.checked = true;
            const reachTop = pet.y - (j.h + 140) * S;
            j.caught = p.inside && Math.abs(p.x - pet.x) < 46 * S && p.y > reachTop && p.y < pet.y;
          }
          return false;
        }
        pet.squashSpring.kick(2.6);
        if (j.caught) {
          sparks(pet, 5);
          if (chance(0.5)) b.say('caught');
          b.reward({ mood: 0.08, boredom: -0.5 });
        } else {
          pet.fx.spawn('question', { x: 30, y: pet.headTop() - 2, life: 1 });
          b.reward({ boredom: -0.3 });
        }
        this.next('after');
        return false;
      }

      // after：扑完之后的反应
      if (this.jump && this.jump.caught) {
        T.eyes = 'happy';
        T.mouth = 'smile';
        T.mouthOpen = 0.6;
        T.armL = T.armR = 0.7;
        T.blush = 0.9;
        pet.style.gaze = 'none';
      } else {
        T.headTilt += 0.16;
        T.mouth = 'o';
        pet.style.gaze = 'cursor';
      }
      return this.pt > 1.1;
    },
  }),

  /** 被摸头：眯起眼睛，往手上蹭，冒爱心 */
  petted: (b) => ({
    crouch: postureOf(b),
    heart: 0.25,
    quiet: 0,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const side = sign(b.world.pointer.x - pet.x) || 1;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.tailSpeed = 2.2;
      pet.style.tailAmp = 0.9;
      T.crouch = this.crouch;
      T.eyes = 'happy';
      T.blush = 1;
      T.mouth = t > 1.2 ? 'smile' : 'cat';
      T.mouthOpen = 0.25;
      T.headTilt += side * 0.1 + Math.sin(t * 5) * 0.03;
      T.headY += 1.5;
      T.earDroop = 0.3;
      T.lift += Math.sin(t * 40) * 0.25; // 呼噜呼噜的小震动
      this.heart -= dt;
      if (this.heart <= 0) {
        this.heart = rand(0.45, 0.8);
        hearts(pet);
      }
      this.quiet = b.petting ? 0 : this.quiet + dt;
      return this.quiet > 0.9;
    },
  }),

  /** 被戳了一下 */
  poked: (b) => ({
    crouch: postureOf(b),
    tilt: chance(0.5) ? 1 : -1,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      T.crouch = this.crouch;
      if (t < 0.16) {
        T.eyes = 'squeeze';
        T.mouth = 'o';
        pet.style.gaze = 'none';
      } else {
        T.eyes = 'wide';
        T.headTilt += 0.12 * this.tilt;
        if (t < 0.5) T.mouth = 'o';
        pet.style.gaze = 'cursor';
      }
      return t >= 0.9;
    },
  }),

  /** 戳太多次：生气了，转过身不理你 */
  annoyed: (b) => ({
    dur: rand(4, 6),
    dir: b.world.pointer.x > b.pet.x ? -1 : 1,
    started: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      if (!this.started) {
        this.started = true;
        pet.fx.spawn('anger', { x: 30, y: pet.headTop() + 12, life: 1.6, size: 1.1 });
        b.say('annoyed');
      }
      pet.style.gaze = 'none';
      pet.style.tailSpeed = 6;
      pet.style.tailAmp = 0.9;
      pet.style.fps = 60;
      T.facing = this.dir;
      T.lookX = this.dir * 0.4;
      T.eyes = 'annoyed';
      T.mouth = 'pout';
      T.earDroop = 0.6;
      T.blush = 0.15;
      T.headTilt += -this.dir * 0.05;
      return t >= this.dur;
    },
  }),

  // ------------------------------------------------------------ 吃文件

  /**
   * 有人拖着文件到了它身上：张大嘴、伸出手，等着你喂（文件就是"吃的"）。
   * 文件被拿走时（b.foodNear 变成 false），这个动作就结束了。
   */
  hungry: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const p = b.world.pointer;
      const side = p.x >= pet.x ? 1 : -1;
      const k = clamp(t / 0.25, 0, 1);
      pet.style.fps = 60;
      pet.style.gaze = 'cursor';
      pet.style.tailSpeed = 6;
      pet.style.tailAmp = 0.9;
      T.facing = side * 0.3 * k;
      T.mouth = 'yawn';
      T.mouthOpen = (0.85 + Math.sin(t * 8) * 0.12) * k; // 嘴张得大大的，一张一合："啊——"
      T.eyes = 'wide';
      T.blush = 0.9;
      T.earDroop = -0.2;
      T.armL = T.armR = 0.85 * k; // 两只手伸出来要
      T.lean += side * 0.05 * k;
      T.lift += Math.abs(Math.sin(t * 9)) * 2.5 * k; // 激动得踮脚
      if (!b.foodNear) return t > 0.15;
      return t > 30; // 拖着一直不松手：半分钟后算了
    },
  }),

  /**
   * 吃！p.items：拖进来的东西 [{ food }]（food 是纸团的种类，见 food.js）；p.from：从哪里飞过来（宠物坐标）。
   * 揉成纸团的文件先飞进嘴里，然后一直嚼着，等后台真的把东西放进回收站、告诉我们结果（resolve）以后：
   *   都吃下了 → 咽下去、拍拍肚子、冒爱心
   *   有吃不下的 → 吃不下的纸团原样吐出来，说说为什么
   * 只有后台说"吃下了"，它才会咽下去：画面上演的和真实发生的一致。
   */
  eat: (b, p) => {
    const pet = b.pet;
    const foods = (p.items || []).map((it) => (it && it.food) || (it && it.kind === 'folder' ? 'folder' : 'unknown'));
    const shown = foods.slice(0, 6);
    const from = p.from || { x: 0, y: -60 };
    const mouth = mouthPoint(pet);
    shown.forEach((food, i) => {
      pet.fx.spawn('food', {
        food,
        from: { x: from.x + (i - (shown.length - 1) / 2) * 7, y: from.y - 4 },
        to: mouth,
        arc: 16,
        life: 0.34,
        delay: i * 0.07,
        shrink: 0.65,
        size: 1.15,
        rot: rand(-0.3, 0.3),
        vrot: rand(-4, 4),
      });
    });
    const flyTime = 0.34 + 0.07 * (shown.length - 1);
    return {
      phase: 'in',
      pt: 0,
      result: undefined,
      after: null, // 吐完以后还要不要"咽下去"（有一部分吃下了）
      resolve(result) {
        if (this.result === undefined) this.result = result || null;
      },
      next(phase) {
        this.phase = phase;
        this.pt = 0;
      },
      /** 嚼完了：按后台的结果决定是咽下去还是吐出来 */
      finish(b) {
        const res = this.result;
        const items = res && Array.isArray(res.items) ? res.items : [];
        const eaten = res ? items.filter((it) => it.ok).length : 0;
        // 吐出来的纸团和飞进去的是同一种（后台的结果和拖进来的东西是一一对应的；对不上时按文件/文件夹猜）
        const sameOrder = items.length === foods.length;
        const refused = res
          ? items.map((it, i) => (it.ok ? null : sameOrder ? foods[i] : it.kind === 'folder' ? 'folder' : 'unknown')).filter(Boolean)
          : foods;
        const reason = (res && res.reason) || 'failed';
        if (eaten > 0) b.reward({ mood: Math.min(0.12, 0.04 * eaten), boredom: -0.3, social: -0.1 });
        if (refused.length > 0) {
          // 先把吃不下的吐出来，说说为什么；吃下了一部分的话，吐完再咽
          spitOut(b.pet, refused);
          b.say(`feed.reasons.${reason}`, 4.2);
          this.after = eaten > 0 ? 'yum' : null;
          this.next('spit');
        } else {
          b.say(res && res.first ? 'feed.first' : 'feed.yum', res && res.first ? 6.5 : 2.6);
          this.next('yum');
        }
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        s.tailSpeed = 3;
        s.tailAmp = 0.8;

        if (this.phase === 'in') {
          // 张大嘴接住飞过来的文件
          T.mouth = 'yawn';
          T.mouthOpen = 1;
          T.eyes = 'wide';
          T.lookY = -0.2;
          if (this.pt >= flyTime) {
            pet.squashSpring.kick(2.4); // 嗷呜！
            crumbs(pet);
            this.next('chew');
          }
          return false;
        }

        if (this.phase === 'chew') {
          // 吧唧吧唧……一直嚼到后台告诉我们吃没吃成（最少嚼 1 秒）
          const c = Math.sin(this.pt * 14);
          T.mouth = c > 0.2 ? 'wavy' : 'cat';
          T.eyes = 'happy';
          T.blush = 1;
          T.headY += Math.abs(c) * 1.4;
          T.squash += c * 0.025;
          T.armL = T.armR = -0.55;
          if (this.pt > 0.5 && chance(dt * 3)) crumbs(pet, 1);
          if (this.pt > 10 && this.result === undefined) this.result = null; // 后台一直没回话：当作没吃成
          if (this.pt >= 1 && this.result !== undefined) this.finish(b);
          return false;
        }

        if (this.phase === 'spit') {
          // 呸：张嘴把吃不下的吐出来，摇摇头
          T.mouth = this.pt < 0.35 ? 'o' : 'pout';
          T.mouthOpen = 1;
          T.eyes = this.pt < 0.25 ? 'squeeze' : 'open';
          T.lookX = this.pt < 0.8 ? Math.sin(this.pt * 18) * 0.8 : 0;
          T.earDroop = 0.3;
          if (this.pt < 1.2) return false;
          if (this.after === 'yum') {
            this.after = null;
            this.next('yum');
            return false;
          }
          return true;
        }

        // yum：咽下去，拍拍肚子
        const gulp = this.pt < 0.2;
        if (gulp && this.pt <= dt) pet.squashSpring.kick(1.6);
        T.eyes = gulp ? 'squeeze' : 'happy';
        T.mouth = gulp ? 'cat' : 'smile';
        T.mouthOpen = 0.45;
        T.blush = 1;
        T.armL = T.armR = -0.85 + Math.sin(this.pt * 9) * 0.14; // 两只手在肚子上揉一揉
        if (this.pt > 0.3 && !this.loved) {
          this.loved = true;
          hearts(pet, 2);
        }
        return this.pt >= 1.7;
      },
    };
  },

  // ------------------------------------------------------------ 爬墙

  /**
   * 爬墙：走到活动范围的左边或右边，扒着边往上爬，爬到一定高度后挂在那里东张西望，
   * 然后慢慢爬下来，或者蹬一下墙跳下来。爬的时候点它一下，它也会跳下来。
   * p.side：-1 左边的墙，1 右边的墙（不填就去近的那边）
   */
  climb: (b, p) => {
    const pet = b.pet;
    const w = b.world;
    const S = w.scale;
    const d = wallDistances(b);
    const side = p.side ?? (d.left <= d.right ? -1 : 1);
    const cat = pet.sp.id === 'cat';
    const room = Math.max(0, w.groundY - pet.ceilingY()); // 最多能爬多高
    // 往下拉的那只爪子每"换一次手"能把身子拉高多少：手臂越长拉得越多（见 climbStroke 里的说明）
    const armLen = 20 * ((pet.sp.build && pet.sp.build.armLen) || 1);
    return {
      side,
      phase: 'walk',
      pt: 0,
      cyc: Math.PI / 2, // 手脚交替的节奏（从"靠墙那只手在上、另一只在下"开始）
      climbed: 0, // 已经离地多高（像素）
      goal: p.goal ?? Math.min(room, Math.max(90 * S, rand(0.35, 1) * Math.min(room, 560 * S))),
      rate: cat ? 7 : 5.5, // 换手有多快（熊猫爬得慢吞吞）
      pullReach: armLen * 0.95 * CLIMB_AMP,
      clingFor: rand(2.6, 5),
      decided: false,
      jumped: false,
      next(phase) {
        this.phase = phase;
        this.pt = 0;
      },
      /** 扒在墙上时脚的位置：离墙这么远，脑袋刚好贴着墙 */
      wallX(w) {
        return side < 0 ? w.area.left + WALL_GAP * w.scale : w.area.right - WALL_GAP * w.scale;
      },
      /** 爬的时候被点了一下：蹬墙跳下来 */
      letGo(b) {
        if (b.pet.mode === 'wall') this.next('leap');
      },
      update(b, dt, t) {
        const pet = b.pet;
        const T = pet.target;
        const w = b.world;
        const s = pet.style;
        this.pt += dt;

        if (this.phase === 'walk') {
          if (locomote(b, this, dt, this.wallX(w), GAITS.walk, 1.15)) this.next('reach');
          return t > 20; // 怎么也走不到（不该发生）：算了
        }

        if (this.phase === 'reach') {
          // 转身面向墙，两只爪子扒上墙（见 reachWall）
          if (reachWall(pet, side, this.pt)) {
            pet.mode = 'wall';
            this.cyc = Math.PI / 2; // 接着 reach 的姿势：靠墙那只在上
            this.next('up');
          }
          return false;
        }

        if (this.phase === 'leap') {
          // 蹬一下墙，往屋里跳
          wallLeap(this, pet, side, w.scale);
          return this.pt > 6; // 落地时大脑会换成"落地"动作；万一 6 秒还没落地，就不管了
        }

        if (this.phase === 'done') {
          // 爬回地面：手放下来（离墙远的那只垂着的时候换回自己那边，看不出来）；尾巴还在屋子这边
          pet.style.tailSide = -side;
          T.armL = T.armR = 0.15;
          return this.pt > 0.35;
        }

        // 下面这几个阶段都扒在墙上
        if (pet.mode !== 'wall') return true; // 被别的事打断了（比如被你拎走了）
        pet.x = this.wallX(w);
        onWall(pet, side, this.climbed, w.scale);

        if (this.phase === 'up' || this.phase === 'down') {
          const up = this.phase === 'up';
          this.climbed += climbStroke(this, pet, dt, side, up, w.scale);
          if (up && this.climbed >= this.goal) {
            this.climbed = this.goal;
            this.next('cling');
            if (chance(0.25)) b.say('climb');
          } else if (!up && this.climbed <= 0) {
            this.climbed = 0;
            pet.mode = 'ground';
            pet.y = w.groundY;
            pet.squashSpring.kick(1.2);
            this.next('done');
            return false;
          } else if (!up && !this.decided && this.climbed < 150 * S) {
            this.decided = true; // 快到地面了：有时候干脆跳下去
            if (chance(0.35)) this.next('leap');
          }
          pet.y = w.groundY - this.climbed;
          return false;
        }

        // cling：两只爪子一高一低扒着墙（靠墙那只在上，偶尔轻轻挪一下着力），脚轻轻晃；转过头来东张西望
        s.fps = 30;
        s.gaze = 'none';
        s.tailAmp = 0.7;
        s.tailSpeed = 1.6;
        pet.y = w.groundY - this.climbed;
        wallPaws(T, side, 0.92 + Math.sin(t * 1.3) * 0.08);
        T.footLY = Math.max(0, Math.sin(t * 2.2)) * 2.5;
        T.footRY = Math.max(0, -Math.sin(t * 2.2)) * 2.5;
        if (this.pt < 1.1) {
          // 先看看脚下有多高
          T.facing = side * 0.3;
          T.lookX = -side * 0.3;
          T.lookY = 0.85;
        } else if (this.pt < 2.4) {
          // 再看看屋子那边
          T.facing = -side * 0.35;
          T.lookX = -side * 0.95;
          T.lookY = -0.05;
        } else {
          // 最后看看你，得意地笑
          if (b.world.pointer.inside) s.gaze = 'cursor';
          T.facing = -side * 0.15;
          T.mouth = 'smile';
          T.mouthOpen = 0.35;
          T.blush = 0.8;
        }
        if (this.pt >= this.clingFor) {
          // 不太高的话，常常直接跳下去；太高了就老老实实爬下去
          if (this.climbed < 320 * S && chance(0.55)) this.next('leap');
          else this.next('down');
        }
        return false;
      },
      exit(b) {
        // 爬到一半被打断（比如你把活动范围改了）：松开手掉下去
        if (b.pet.mode === 'wall') {
          b.pet.mode = 'air';
          b.pet.leapt = true;
          b.pet.vx = -this.side * 60 * b.world.scale;
          b.pet.vy = 0;
        }
      },
    };
  },

  // ------------------------------------------------------------ 站在窗口顶上

  /** 站在窗口上，从边上探头往下看看：好高呀 */
  peekDown: () => ({
    dur: rand(2.2, 3.4),
    dir: chance(0.5) ? 1 : -1,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      if (!pet.perch) return true; // 已经不在窗口上了
      pet.style.gaze = 'none';
      const u = easeInOut(clamp(t / 0.6, 0, 1)) * (1 - easeInOut(clamp((t - this.dur + 0.5) / 0.5, 0, 1)));
      T.facing = this.dir * 0.3 * u;
      T.lookX = this.dir * 0.3 * u;
      T.lookY = 0.95 * u;
      T.headTilt += this.dir * 0.12 * u;
      T.crouch = 0.3 * u;
      T.earDroop = -0.2 * u;
      if (t > this.dur * 0.45) {
        T.mouth = 'o';
        T.mouthOpen = 0.35 * u;
      }
      return t >= this.dur;
    },
  }),

  /**
   * 从窗口上跳下去：先低头看看下面、蹲下蓄力，然后往屋子中间那边跳。
   * 是往"你这边"（窗口前面）跳的，所以不会又落回同一个窗口上（见 pet.skipPerch）；落地是得意的笑脸
   */
  jumpDown: (b, p) => {
    const A = b.world.area;
    const dir = p.dir ?? (b.pet.x < (A.left + A.right) / 2 ? 1 : -1);
    return {
      phase: 'ready',
      pt: 0,
      jumped: false,
      update(b, dt, t) {
        const pet = b.pet;
        const T = pet.target;
        const s = pet.style;
        const S = b.world.scale;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        if (this.phase === 'ready') {
          if (pet.mode !== 'ground' || !pet.perch) return true; // 已经不在窗口上了（比如窗口刚好被关掉）
          const u = clamp((this.pt - 0.55) / 0.35, 0, 1);
          T.facing = dir * 0.6;
          T.lookX = dir * 0.35;
          T.lookY = 0.85 * (1 - u * 0.6);
          T.crouch = 0.45 * u; // 蹲下蓄力
          T.armL = T.armR = 0.35 * u;
          T.earDroop = -0.2;
          T.tailCurl = 1;
          if (this.pt >= 0.9) {
            this.phase = 'jump';
            this.pt = 0;
          }
          return false;
        }
        if (!this.jumped) {
          this.jumped = true;
          pet.skipPerch = pet.perch ? pet.perch.id : null;
          pet.perch = null;
          pet.mode = 'air';
          pet.airT = 1;
          pet.leapt = true; // 自己跳的：稳稳落地，不晕
          pet.vx = dir * rand(110, 170) * S;
          pet.vy = -rand(170, 240) * S;
          pet.vrot = dir * 0.8;
        }
        s.tailSide = -dir; // 尾巴别在半空中换边（换边那一下是侧着的，像一根细棍）
        T.facing = dir * 0.5;
        T.armL = T.armR = 1.5;
        T.eyes = 'happy';
        T.mouth = 'smile';
        T.mouthOpen = 0.6;
        T.tailCurl = 1;
        T.footLY = T.footRY = 3;
        return this.pt > 6; // 落地时大脑会换成"落地"动作；万一 6 秒还没落地，就不管了
      },
    };
  },

  /**
   * 自己跳上一个不太高的窗口（或者从一个窗口跳上更高的一个）：走到起跳的地方，抬头瞄准
   * （猫会压低身子扭扭屁股），蹲一下，跳！落在顶边上就站在那儿了，和你把它放上去一样。
   * p.only：只跳这一个窗口（自检用）
   */
  hopUp: (b, p) => {
    const plan = planHop(b, p.only);
    return {
      plan,
      phase: 'walk',
      pt: 0,
      face: plan && plan.to < plan.from ? -1 : 1, // 往哪边跳
      next(phase) {
        this.phase = phase;
        this.pt = 0;
      },
      update(b, dt, t) {
        const pet = b.pet;
        const T = pet.target;
        const w = b.world;
        const S = w.scale;
        const s = pet.style;
        const plan = this.plan;
        this.pt += dt;
        if (!plan) return true;
        if (this.phase === 'air') {
          upLeapPose(pet, this.face);
          return this.pt > 4; // 落地时大脑会换成"落地"动作；万一一直没落地，就不管了
        }
        // 还没跳：窗口还在吗？被拖动了就跟着改起跳点和落脚点；够不着了就算了
        const L = ledgeById(w, plan.id);
        if (!L || pet.mode !== 'ground') return true;
        const shift = L.x - plan.x;
        if (shift) {
          plan.x = L.x;
          plan.to += shift;
          const [lo, hi] = pet.spanX(34, 14);
          plan.from = clamp(plan.from + shift, lo, hi);
        }
        const h = pet.y - L.y;
        const landOk = L.segs.some(([a, c]) => plan.to >= a + 15 * S && plan.to <= c - 15 * S);
        if (h < 20 * S || h > hopReach(pet.sp) * S * 1.15 || !landOk) return true;

        if (this.phase === 'walk') {
          if (locomote(b, this, dt, plan.from, GAITS.walk, 1.1)) this.next('aim');
          return t > 20; // 怎么也走不到（不该发生）：算了
        }

        // 转过来对着要跳上去的地方，抬头看着它（几乎正下方起跳时，别来回转身）
        const cat = pet.sp.id === 'cat';
        if (Math.abs(plan.to - pet.x) > 10 * S) this.face = plan.to > pet.x ? 1 : -1;
        s.fps = 60;
        s.gaze = 'none';
        s.tailSide = -this.face;
        T.facing = this.face * 0.7;
        T.lookX = this.face * 0.35;
        T.lookY = -0.85;
        T.earDroop = -0.2;
        T.tailCurl = 1;
        if (this.phase === 'aim') {
          // 瞄准：猫压低身子，扭扭屁股
          T.eyes = 'wide';
          if (cat && this.pt > 0.35) {
            T.crouch = 0.5;
            T.lean += Math.sin(this.pt * 22) * 0.035;
            s.tailSpeed = 7;
            s.tailAmp = 0.8;
          }
          if (this.pt >= (cat ? 1.2 : 0.8)) this.next('crouch');
          return false;
        }
        // crouch：蹲一下蓄力，跳！
        const u = clamp(this.pt / 0.22, 0, 1);
        T.crouch = Math.max(cat ? 0.5 : 0, 0.6 * u);
        T.squash = 0.08 * u;
        T.armL = T.armR = -0.2 * u;
        if (this.pt >= 0.25) {
          leapTo(pet, w, plan.to, L.y, 28 * S);
          pet.squashSpring.kick(-1.5);
          this.next('air');
        }
        return false;
      },
    };
  },

  /**
   * 顺着窗口的侧边爬上去（窗口一直伸到地面的时候）：走到窗口旁边，扒着边往上爬（和爬墙一样，两只爪子轮流换手），
   * 爪子够着顶边以后，一翻身就上去了。爬的时候点它一下，或者窗口被关掉 / 拖走 / 被别的窗口挡住了，它就松手。
   * p.only：只爬这一个窗口（自检用）
   */
  climbUp: (b, p) => {
    const pet = b.pet;
    const plan = planClimb(b, p.only);
    const side = plan ? plan.side : 1;
    const armLen = 20 * ((pet.sp.build && pet.sp.build.armLen) || 1);
    return {
      plan,
      side,
      phase: 'walk',
      pt: 0,
      cyc: Math.PI / 2, // 手脚交替的节奏（见 climbStroke）
      climbed: 0, // 已经离地多高（像素）
      rate: pet.sp.id === 'cat' ? 7 : 5.5,
      pullReach: armLen * 0.95 * CLIMB_AMP,
      jumped: false,
      next(phase) {
        this.phase = phase;
        this.pt = 0;
      },
      /** 爬的时候被点了一下：蹬一下窗口边，跳下来 */
      letGo(b) {
        if (b.pet.mode === 'wall') this.next('leap');
      },
      update(b, dt, t) {
        const pet = b.pet;
        const T = pet.target;
        const w = b.world;
        const S = w.scale;
        this.pt += dt;
        if (!this.plan) return true;

        if (this.phase === 'leap') {
          wallLeap(this, pet, side, S);
          return this.pt > 6;
        }
        if (this.phase === 'over') {
          // 翻上去（在空中）：靠墙那只手一直举着；另一只先垂着换回自己那边，再举起来（不露出半透明的手，见 wallLeap）
          upLeapPose(pet, side);
          T.wallArm = this.pt < 0.12 ? side : 0;
          const farUp = this.pt < 0.22 ? 0 : 1.6;
          T.armL = side < 0 ? 1.6 : farUp;
          T.armR = side > 0 ? 1.6 : farUp;
          T.eyes = 'happy';
          return this.pt > 4; // 落地时大脑会换成"落地"动作
        }

        const L = ledgeById(w, this.plan.id);
        if (this.phase === 'walk' || this.phase === 'reach') {
          // 还没扒上去：窗口没了、挪走了、侧边被挡住了，就算了
          if (!L || pet.mode !== 'ground' || pet.perch || !wallClimbable(w, L, side, w.groundY)) return true;
          const foot = wallFoot(w, L, side);
          if (this.phase === 'walk') {
            if (locomote(b, this, dt, foot, GAITS.walk, 1.15)) this.next('reach');
            return t > 25; // 怎么也走不到（不该发生）：算了
          }
          if (Math.abs(foot - pet.x) > 30 * S) return true; // 正要扒上去，窗口被拖走了
          pet.x = foot;
          if (reachWall(pet, side, this.pt)) {
            pet.mode = 'wall';
            this.cyc = Math.PI / 2;
            this.next('up');
          }
          return false;
        }

        // 下面这两个阶段（up 往上爬、top 爪子扒住顶边）都扒在窗口边上
        if (pet.mode !== 'wall') return true; // 被别的事打断了（比如被你拎走了）
        const foot = L && wallFoot(w, L, side);
        if (!L || Math.abs(foot - pet.x) > 40 * S || !wallClimbable(w, L, side, pet.y)) {
          // 窗口关掉了、一下子被拖走了、侧边被别的窗口挡住了：扒不住，掉下去
          b.onSlip();
          return false;
        }
        pet.x = foot; // 窗口被慢慢拖动：跟着挪
        onWall(pet, side, this.climbed, S);
        const goal = Math.max(0, w.groundY - (L.y + HANG * S)); // 爬到这么高，爪子就够着顶边了（窗口上下挪了也跟着变）

        if (this.phase === 'up') {
          this.climbed += climbStroke(this, pet, dt, side, true, S);
          if (this.climbed >= goal) {
            this.climbed = goal;
            this.next('top');
          }
          pet.y = w.groundY - this.climbed;
          return false;
        }

        // top：两只爪子扒住顶边，抬头看看上面，然后一翻身上去
        this.climbed = goal;
        pet.y = w.groundY - this.climbed;
        pet.style.fps = 60;
        pet.style.gaze = 'none';
        wallPaws(T, side, 1);
        T.facing = side * 0.85;
        T.lookX = side * 0.3;
        T.lookY = -0.6;
        T.earDroop = -0.15;
        T.blush = 0.6;
        T.lift += bell(clamp(this.pt / 0.3, 0, 1)) * 2; // 使劲往上撑一下
        if (this.pt >= 0.3) {
          const seg = cornerSeg(w, L, side);
          const edge = side > 0 ? L.x : L.right;
          const to = seg ? clamp(edge + side * 45 * S, seg[0] + 30 * S, seg[1] - 30 * S) : edge + side * 45 * S;
          leapTo(pet, w, to, L.y, 26 * S);
          this.next('over');
        }
        return false;
      },
      exit(b) {
        // 爬到一半被打断（比如你把活动范围改了）：松开手掉下去
        if (b.pet.mode === 'wall') {
          b.pet.mode = 'air';
          b.pet.leapt = true;
          b.pet.airT = 1;
          b.pet.vx = -this.side * 60 * b.world.scale;
          b.pet.vy = 0;
        }
      },
    };
  },

  // ------------------------------------------------------------ 被拎起来、掉下去

  /**
   * 被你拎着，像拎小猫的后脖梗：
   *   - 刚被抓住：吓一跳，眼睛瞪圆，手往上一缩
   *   - 然后整个身子软软地垂下来（拉长一点，脚往下伸），手垂在身前，尾巴耷拉着
   *   - 跟着你的拖动前后荡；手、脚、尾巴慢半拍地甩，头比身子稳（被拎着的是脖子）
   *   - 拖得快：眼睛瞪圆、耳朵往后贴；停下来：低头看看地面，偶尔抬眼看你，一副"认命了"的样子
   *   - 挂久了时不时蹬蹬腿、扭一扭，想下来（偶尔嘟囔一句）；熊猫沉，扭得少、扭得慢
   */
  held: () => ({
    wriggleIn: rand(1.1, 2), // 过多久扭一下（只在你没怎么拖它的时候数）
    wriggle: -1, // 正在扭：已经扭了多久；-1 = 没在扭
    wriggleDur: 1,
    said: false,
    glanceIn: rand(1.2, 2.6), // 过多久抬眼看你一下
    glance: 0,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const S = b.world.scale;
      const p = b.world.pointer;
      const heavy = pet.sp.righting ?? 1; // 猫 1，熊猫 0.35
      const speed = p.speed / S; // 你拖着它走得多快（按宠物原始大小算的像素/秒）
      const startle = clamp(1 - t / 0.5, 0, 1); // 刚被抓住那一下
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.tailAmp = 0.12;
      pet.style.tailSpeed = 1.4;

      // 身子垂下来：拉长一点。往上拎得快时拉得更长，往下放时缩回来一点
      T.squash = -0.13 + clamp((p.vy / S) * 0.00006, -0.05, 0.05);
      // 手：像被拎着后脖子的小猫，两只爪子蜷在胸前；身子往一边荡，爪子慢半拍往另一边甩。
      // 刚被抓住时先往上一张（吓一跳），然后才蜷起来
      const armLag = clamp(pet.vrot * 0.09, -0.35, 0.35);
      T.armL = -0.5 + 1.4 * startle - armLag;
      T.armR = -0.5 + 1.4 * startle + armLag;
      // 脚：两只脚并拢、稍微缩起来；也慢半拍地甩，左右脚稍微错开一点，不像一块板
      const legLag = clamp(-pet.vrot * 2.4, -7, 7);
      T.footLX = 5 + legLag + wobble(t * 1.3, 5) * 1.2;
      T.footRX = -5 + legLag + wobble(t * 1.3, 6) * 1.2;
      T.footLY = 0.5;
      T.footRY = 0.5;
      // 尾巴整条垂下来（粗细不变，只是转下来、稍微短一点），跟着甩
      T.tailCurl = 1;
      T.tailHang = 1;
      T.tail += clamp(-pet.vrot * 0.25, -0.8, 0.8);
      // 被拎着的是脖子：身子歪的时候，头往回正一点
      T.headTilt = -pet.rot * 0.4 + wobble(t * 0.7, 7) * 0.05;
      T.earDroop = 0.4;

      // 看哪儿：被拖着走时看前面；停下来时低头看地面，偶尔抬眼看看你
      if (speed > 160) {
        T.lookX = clamp(p.vx / S / 500, -0.9, 0.9);
        T.lookY = 0.15;
      } else {
        T.lookY = 0.5;
        T.lookX = wobble(t * 0.4, 8) * 0.3;
        this.glanceIn -= dt;
        if (this.glanceIn <= 0) {
          this.glance = rand(0.8, 1.4);
          this.glanceIn = rand(2.5, 5);
        }
        if (this.glance > 0) {
          this.glance -= dt;
          T.lookY = -0.1;
          T.lookX = 0;
        }
      }

      // 挂久了：蹬蹬腿、扭一扭（扭的时候身子也跟着荡起来）
      if (this.wriggle < 0 && t > 1 && speed < 220 && pet.shake < 0.5) {
        this.wriggleIn -= dt;
        if (this.wriggleIn <= 0) {
          this.wriggle = 0;
          this.wriggleDur = rand(0.7, 1.1) * (heavy < 0.6 ? 1.3 : 1);
        }
      }
      let wriggling = false;
      if (this.wriggle >= 0) {
        this.wriggle += dt;
        const k = bell(this.wriggle / this.wriggleDur);
        const ph = this.wriggle * (heavy < 0.6 ? 10 : 15);
        const s = Math.sin(ph);
        T.footLY += s * 3.2 * k; // 两只脚轮流蹬
        T.footRY -= s * 3.2 * k;
        T.armL += s * 0.4 * k; // 手也跟着划
        T.armR -= s * 0.4 * k;
        T.headTilt += Math.sin(ph * 0.5) * 0.08 * k;
        pet.vrot += Math.sin(ph * 0.5) * (2.2 + 1.8 * heavy) * k * dt;
        wriggling = k > 0.2;
        if (!this.said && this.wriggle > 0.15) {
          this.said = true; // 每次拎起来最多嘟囔一句
          if (chance(0.45)) b.say('held', 2.2);
        }
        if (this.wriggle >= this.wriggleDur) {
          this.wriggle = -1;
          this.wriggleIn = rand(1.8, 3.6) / Math.sqrt(heavy);
        }
      }

      // 表情
      if (pet.shake > 0.75) {
        T.eyes = 'squeeze'; // 被晃得受不了
        T.mouth = 'wavy';
      } else if (t < 0.45) {
        T.eyes = 'wide'; // 吓一跳
        T.mouth = 'o';
        T.earDroop = -0.15;
      } else if (speed > 650) {
        T.eyes = 'wide'; // 呼——飞起来了
        T.mouth = 'o';
        T.earDroop = 0.7;
      } else if (wriggling) {
        T.eyes = 'annoyed'; // 放我下来！
        T.mouth = 'pout';
      } else {
        // 认命了：眼皮耷拉一点，乖乖挂着
        T.eyeL = 0.75;
        T.eyeR = 0.75;
        T.blush = 0.35;
      }
      return false; // 一直到松手
    },
  }),

  /** 在空中往下掉 */
  falling: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.blink = false;
      T.armL = 1.65 + wobble(t * 14, 3) * 0.3;
      T.armR = 1.65 + wobble(t * 14, 4) * 0.3;
      T.eyes = 'wide';
      T.mouth = 'o';
      T.squash = -0.09;
      T.tailCurl = 1;
      T.footLY = -1.5;
      T.footRY = -1.5;
      T.earDroop = -0.15;
      return false; // 一直到落地
    },
  }),

  /** 轻轻落地。happy：自己从墙上跳下来的，落地时是得意的笑脸 */
  landed: (b, p) => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      if (p.happy) {
        if (t < 0.6) {
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.5;
          T.blush = 0.8;
          T.armL = T.armR = t < 0.25 ? 0.6 : 0.9;
        }
        return t >= 0.75;
      }
      if (t < 0.22) {
        T.eyes = 'squeeze';
        T.armL = T.armR = 0.5;
      }
      return t >= 0.5;
    },
  }),

  /** 摔晕了 / 被晃晕了 */
  dizzy: (b, p) => ({
    dur: p.dur ?? rand(2.2, 3.2),
    sit: b.pet.sp.id === 'cat' ? 0 : 1, // 熊猫、卡皮巴拉沉，是一屁股坐在地上
    started: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.blink = false;
      if (!this.started) {
        this.started = true;
        for (let i = 0; i < 3; i++) {
          pet.fx.spawn('orbit', { life: this.dur, phase: (i / 3) * TAU, y: -112 + this.sit * 7 });
        }
        if (chance(0.5)) b.say('dizzy');
      }
      T.crouch = this.sit;
      if (t < this.dur) {
        T.eyes = 'dizzy';
        T.mouth = 'wavy';
        T.lean += Math.sin(t * 4.2) * 0.1;
        T.headTilt += Math.sin(t * 4.2 + 1) * 0.12;
        T.armL = T.armR = 0.35;
        T.earDroop = 0.4;
        return false;
      }
      // 甩甩头，清醒过来
      const u = (t - this.dur) / 0.55;
      T.lookX = Math.sin(u * TAU * 2) * 0.9;
      T.eyes = 'squeeze';
      return u >= 1;
    },
  }),

  /** 进场：从屏幕外面跑进来 */
  arrive: (b, p) => ({
    started: false,
    update(b, dt, t) {
      const pet = b.pet;
      const w = b.world;
      const S = w.scale;
      if (!this.started) {
        this.started = true;
        pet.unbounded = true;
        // 从活动范围的左边或右边外面跑进来（范围外面是看不见的，所以就像从边上钻出来）
        pet.x = p.from < 0 ? w.area.left - 70 * S : w.area.right + 70 * S;
        pet.pose.facing = pet.target.facing = p.from < 0 ? 1 : -1;
      }
      const arrived = locomote(b, this, dt, p.tx, GAITS.run, 1);
      return arrived || t > 12;
    },
    exit(b) {
      b.pet.unbounded = false;
    },
  }),
};

// 哪些动作可以被"更想做的事"打断（比如发呆时看到鼠标晃动，就去追）
// （招牌动作里的踩奶、抱着尾巴睡、趴在窗口边上睡也算：它们和坐着、打盹差不多，见 tricks.js）
export const INTERRUPTIBLE = new Set(['idle', 'lookAround', 'sit', 'nap', 'groom', 'walk', 'peekDown', 'orangeNap', 'knead', 'tailHug', 'drapeNap']);
// 这些是对你的操作做出的反应，进行中不会被摸头、戳一下打断
// （举着牌子提醒你待办时也一样：摸它不会打断，点它一下才是"知道了"）
export const REACTIVE = new Set(['held', 'falling', 'landed', 'dizzy', 'annoyed', 'arrive', 'hungry', 'eat', 'remind']);
