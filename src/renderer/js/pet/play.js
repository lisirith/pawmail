// 陪它玩：每种动物自己的小游戏（2026-11-24 加的）。右键菜单「陪它玩…」开始，再点一次是"不玩了"（见 brain.js 的 play）。
//
//   橘猫 / 招财猫  逗猫棒 wand：鼠标变成一根逗猫棒，羽毛挂在绳子上荡；它扑上去、跳起来拍，按住了就抱着蹬
//   柴犬           叼球 fetch（在 tricks.js 里：它叼来球，你拖着扔出去）
//   狐狸           扑"老鼠" prey：鼠标贴着地面晃，那儿的雪就在动；它竖耳朵听、悄悄靠近、一头扎下去
//   小熊猫         递树枝 branch：鼠标拿着一根树枝；它跳上去趴着，你一晃它就荡，不动它就睡；点它一下就跳下来
//   熊猫           抢竹子 tug：按住竹子露在外面的那头拉；它抱着不撒手，被你拖着在地上滑
//   兔子           跳栏杆 hurdles：地上两个小栏杆，能拖着挪、点一下变高；它来回蹦着跳过去
//   卡皮巴拉       叠橘子 stack：在它头顶上方点一下就掉下来一个橘子，越叠越高，太高就倒
//   水獭           牵手 holdHands：鼠标变成一只小爪子；它伸手牵住你，你慢慢挪它就跟着走，不动它就躺下牵着你睡着了
//   企鹅           抛小鱼 fishToss：拖着小鱼扔出去（或者点一下）；它跑到鱼底下，仰头张嘴在空中接住
//
// 写法和 activities.js、tricks.js 的动作一样（工厂函数 → { update, exit }），另外还有：
//   stop(b)    菜单里点了"不玩了"：收个尾再结束
//   letGo(b)   （小熊猫趴在树枝上时）点它一下：跳下来（brain.onClick 对"扒在墙上"的动物就是调它）
// 留在桌面上的东西（跟着鼠标的道具、地上的栏杆）和"哪儿能点、能拖"放在 world.play（PlayStage），画和接鼠标在 app.js；
// 宠物身上的东西（竹子、身下的树枝、头顶一摞橘子）放在 pet.playProp，画在 draw.js。
// 你走开了、很久不理它，它就自己收工。

import { clamp, rand, chance, sign, bell, easeInOut, lerp, TAU } from '../util/math.js';
import { getGeometry } from './draw.js';
import { GRAVITY } from './pet.js';
import { HURDLE_HEIGHT } from './props.js';
import { locomote, GAITS, mouthPoint, hearts, sparks } from './activities.js';
import { bodyPoint, lieLift } from './tricks.js';

/** 正在玩的小游戏留在桌面上的东西（app.js 画、接鼠标） */
export class PlayStage {
  constructor() {
    this.version = 0;
    this.clear();
  }

  clear() {
    this.cursor = null; // 跟着鼠标的道具：{ kind, anchor: 'pointer' | 'ground', key, ... }（画法见 props.js 的 drawPlayCursor）
    this.ground = []; // 地上的东西（兔子的栏杆）：[{ kind: 'hurdle', x, level, fallen, hot }]
    this.handler = null; // 现在能点、能拖的东西：{ hit(x, y), press(x, y), drag(x, y), release(vx, vy, dragged, cancelled) }
    this.version += 1;
  }

  /** 地上的东西变了（挪了、变高了、倒了）：画面看到版本号变了才重画 */
  changed() {
    this.version += 1;
  }

  /** 鼠标停在能点、能拖的东西上（这时窗口要接住鼠标） */
  hit(x, y) {
    return !!(this.handler && this.handler.hit && this.handler.hit(x, y));
  }
}

/**
 * 每种动物玩什么：name 动作名、emoji 和 label 是菜单里那一项（label 是语言文件里的键）、
 * ground：要在真正的地上玩（站在窗口上的话先跳下来）
 */
export const PLAY_INFO = Object.freeze({
  cat: { name: 'wand', emoji: '🎣', label: 'menu.playWand', ground: true },
  shiba: { name: 'fetch', emoji: '🎾', label: 'menu.fetch', ground: true },
  fox: { name: 'prey', emoji: '❄️', label: 'menu.playPrey', ground: true },
  redpanda: { name: 'branch', emoji: '🌿', label: 'menu.playBranch', ground: true },
  panda: { name: 'tug', emoji: '🎋', label: 'menu.playTug', ground: false },
  bunny: { name: 'hurdles', emoji: '🚧', label: 'menu.playHurdles', ground: true },
  capybara: { name: 'stack', emoji: '🍊', label: 'menu.playStack', ground: false },
  otter: { name: 'holdHands', emoji: '🤝', label: 'menu.playHands', ground: true },
  penguin: { name: 'fishToss', emoji: '🐟', label: 'menu.playFish', ground: true },
});

const IDLE_END = 14; // 你多久不理它（鼠标不动、也没点）就收工（秒）
const MAX_TIME = 240; // 一回最多玩多久

// ------------------------------------------------------------ 小工具

/** 宠物坐标 → 窗口坐标（像素） */
const toWorld = (pet, lx, ly) => ({ x: pet.x + lx * pet.world.scale, y: pet.y + ly * pet.world.scale });

/** 窗口坐标 → 身子自己的坐标（躺着时把 roll 转回去；和 tricks.js 的 bodyPoint 正好相反） */
function bodyLocal(pet, wx, wy) {
  const S = pet.world.scale;
  const P = pet.pose;
  let x = (wx - pet.x) / S;
  let y = (wy - pet.y) / S + P.lift;
  if (P.roll) {
    const g = getGeometry(pet.sp, P);
    const cy = (g.torsoCy + g.headCy) / 2;
    const c = Math.cos(-P.roll);
    const s = Math.sin(-P.roll);
    const dy = y - cy;
    [x, y] = [x * c - dy * s, cy + x * s + dy * c];
  }
  return { x, y };
}

/**
 * 一只手的肩膀在身子坐标里的哪儿、手臂多长（和 draw.js 的 drawArm 一样算；
 * 举起来的手不收进胸前，所以那里的 fold、legs、rest 都是 0）
 */
function shoulder(pet, side) {
  const g = getGeometry(pet.sp, pet.pose);
  const b = g.build;
  return {
    x: side * (20.5 + g.loaf * 3 + g.sit * 1.5) * b.torso + g.facing * 2.5,
    y: g.torsoCy - g.torsoRy * 0.42,
    len: 20 * (b.armLen || 1) * (1 - g.loaf * 0.75),
  };
}

/** 手臂抬到 a 的时候，爪子（手臂末端那个圆）在身子坐标里的哪儿 */
function pawAt(pet, side, a) {
  const s0 = shoulder(pet, side);
  const phi = -side * (0.24 + a);
  return { x: s0.x - s0.len * Math.sin(phi), y: s0.y + s0.len * Math.cos(phi) };
}

/** 想让爪子指向身子坐标里的 (tx, ty)，手臂要抬多少（再高爪子会藏到大脑袋后面，所以最多 2.05） */
function aimArm(pet, side, tx, ty) {
  const s0 = shoulder(pet, side);
  const phi = Math.atan2(-(tx - s0.x), ty - s0.y);
  return clamp(-side * phi - 0.24, -0.4, 2.05);
}

/** 眼睛（和头）看向窗口里的一个点（和 pet.js 里"盯着鼠标"一样算） */
function lookAt(pet, wx, wy) {
  const S = pet.world.scale;
  const T = pet.target;
  const dx = wx - pet.x;
  const dy = wy - (pet.y - 70 * S);
  const k = 1.25 / (Math.hypot(dx, dy) + 110 * S);
  T.lookX = clamp(dx * k, -1, 1);
  T.lookY = clamp(dy * k, -1, 1);
}

/** 一句话只说一次（p：说的机会有多大） */
function once(st, b, key, p = 1, seconds = 2.2, params) {
  st.saidKeys = st.saidKeys || {};
  if (st.saidKeys[key]) return;
  st.saidKeys[key] = true;
  if (chance(p)) b.say(key, seconds, params);
}

/** 收工：坐下来，开心地（或者没劲地）说一句，冒个爱心。返回 true = 演完了 */
function wrapUp(b, st, dt, { happy = true, line = null } = {}) {
  const pet = b.pet;
  const T = pet.target;
  st.endT = (st.endT || 0) + dt;
  T.crouch = 1;
  if (happy) {
    T.eyes = 'happy';
    T.mouth = 'smile';
    T.mouthOpen = 0.4;
    T.blush = 0.9;
  } else {
    T.earDroop = 0.3;
    T.mouth = 'pout';
    T.eyes = 'annoyed';
  }
  if (!st.endSaid) {
    st.endSaid = true;
    if (happy) hearts(pet, 2);
    if (line && chance(0.7)) b.say(line, 2.4);
  }
  return st.endT > 1.6;
}

/** 鼠标在不在"贴着地面"的那一条里（陪狐狸扑雪地老鼠） */
function inGroundZone(w, p) {
  const S = w.scale;
  return p.inside && p.y > w.groundY - 70 * S && p.y < w.groundY + 24 * S && p.x > w.area.left + 12 * S && p.x < w.area.right - 12 * S;
}

/** 点 (px, py) 到线段 (ax, ay)-(bx, by) 的距离 */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** 头顶转圈的小星星（晕乎乎） */
function stars(pet, life, y) {
  for (let i = 0; i < 2; i++) pet.fx.spawn('orbit', { life, phase: i * Math.PI, y });
}

/** 小鱼在空中会怎么飞（和 toy.js 的 step 一样算）：往下掉、经过 catchY 的那一刻在哪儿（掉到地上也算） */
function predictFish(toy, w, catchY) {
  const S = w.scale;
  const r = toy.r * S;
  let { x, y, vx, vy } = toy;
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    vy += GRAVITY * 0.8 * S * dt;
    vx *= Math.pow(0.85, dt);
    x += vx * dt;
    y += vy * dt;
    if (x < w.area.left + r) {
      x = w.area.left + r;
      vx = Math.abs(vx) * 0.25;
    } else if (x > w.area.right - r) {
      x = w.area.right - r;
      vx = -Math.abs(vx) * 0.25;
    }
    if (vy > 0 && y - r >= catchY) return { x, t: i * dt, ground: false };
    if (y >= w.groundY) return { x, t: i * dt, ground: true };
  }
  return { x, t: 4, ground: true };
}

// ------------------------------------------------------------ 小游戏

export const PLAYS = {
  // ============================================================ 猫：逗猫棒

  wand: (b) => {
    const pet = b.pet;
    const w = b.world;
    const STICK = [-26, 20]; // 棍子从鼠标尖往左下伸多远（宠物原始大小的像素）
    const ROPE = 44; // 绳子多长
    return {
      phase: 'start',
      pt: 0,
      theta: 0.35, // 绳子偏离竖直多少（弧度）
      omega: 0, // 绳子转得多快
      piv: null, // 棍子头上一帧在哪儿（窗口坐标）
      pivV: { x: 0, y: 0 },
      fx: 0, // 羽毛在哪儿（窗口坐标）
      fy: 0,
      fv: 0, // 羽毛动得多快
      caught: false, // 被它按住了
      catches: 0,
      dir: 1,
      wiggle: 0.6,
      movedAt: w.time, // 羽毛上一次动是什么时候
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 羽毛：挂在棍子头上的钟摆（你晃鼠标它就荡）；被按住时就在它爪子那儿，你拽得太远就扯出来了 */
      swing(dt) {
        const p = w.pointer;
        const S = w.scale;
        const piv = { x: p.x + STICK[0] * S, y: p.y + STICK[1] * S };
        if (!this.piv) this.piv = piv;
        const vx = (piv.x - this.piv.x) / dt;
        const vy = (piv.y - this.piv.y) / dt;
        const lim = 60000 * S;
        const ax = clamp((vx - this.pivV.x) / dt, -lim, lim);
        const ay = clamp((vy - this.pivV.y) / dt, -lim, lim);
        this.piv = piv;
        this.pivV = { x: vx, y: vy };
        const L = ROPE * S;
        const ox = this.fx;
        const oy = this.fy;
        if (this.caught) {
          const g = getGeometry(pet.sp, pet.pose);
          const hold = toWorld(pet, pet.pose.facing * 4, g.torsoCy + 2 - pet.pose.lift);
          this.fx = hold.x;
          this.fy = hold.y;
          if (Math.hypot(this.fx - piv.x, this.fy - piv.y) > L * 1.7) {
            // 你把羽毛从它爪子里扯出来了
            this.caught = false;
            this.theta = clamp(Math.atan2(this.fx - piv.x, this.fy - piv.y), -2.6, 2.6);
            this.omega = -this.theta * 4;
            this.next('lost');
          }
        } else {
          const G = 1900 * S;
          const acc = (-(G + ay) * Math.sin(this.theta) - ax * Math.cos(this.theta)) / L - 1.6 * this.omega;
          this.omega = clamp(this.omega + acc * dt, -30, 30);
          this.theta += this.omega * dt;
          if (Math.abs(this.theta) > 2.8) {
            this.theta = sign(this.theta) * 2.8;
            this.omega *= -0.3;
          }
          this.fx = piv.x + Math.sin(this.theta) * L;
          this.fy = Math.min(piv.y + Math.cos(this.theta) * L, w.groundY - 3 * S); // 太低就拖在地上
        }
        this.fv = Math.hypot(this.fx - ox, this.fy - oy) / dt;
        if (this.fv > 40 * S) this.movedAt = w.time;
        const rx = (this.fx - p.x) / S;
        const ry = (this.fy - p.y) / S;
        w.play.cursor = { kind: 'wand', anchor: 'pointer', stick: STICK, feather: [rx, ry], taut: this.caught, key: `${rx.toFixed(1)}|${ry.toFixed(1)}|${this.caught}` };
      },
      grab() {
        this.caught = true;
        this.holdFor = rand(1.6, 2.6);
        this.next('caught');
      },
      update(b, dt, t) {
        const T = pet.target;
        const s = pet.style;
        const S = w.scale;
        const p = w.pointer;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        this.swing(dt);
        const dx = this.fx - pet.x;
        const d = sign(dx) || this.dir;
        const adx = Math.abs(dx) / S;
        const hu = (w.groundY - this.fy) / S; // 羽毛离地多高
        if (!this.ending) {
          const idle = w.time - Math.max(this.movedAt, p.lastMoveAt);
          if (b.userAway || idle > IDLE_END || t > MAX_TIME) this.ending = 'bored';
          else if (this.catches >= 7) this.ending = 'tired';
        }
        const flying = this.phase === 'pounce' || this.phase === 'jump';
        if (this.ending && !flying) {
          if (this.caught) {
            this.caught = false;
            this.omega = 4 * d;
          }
          lookAt(pet, this.fx, this.fy);
          const done = wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : 'wandEnd' });
          if (this.ending === 'tired') T.loaf = 0.8; // 玩累了：趴下来
          return done;
        }
        switch (this.phase) {
          case 'start':
            lookAt(pet, this.fx, this.fy);
            T.eyes = 'wide';
            T.earDroop = -0.3;
            T.crouch = 0.6;
            if (this.pt - dt <= 0) pet.fx.spawn('bang', { x: 26, y: pet.headTop() + 4, life: 0.6 });
            if (this.pt > 0.3) once(this, b, 'wandStart', 0.7);
            if (this.pt > 0.7) this.next('watch');
            return false;
          case 'watch': {
            // 坐着盯着羽毛，尾巴尖一甩一甩；羽毛一动就准备扑
            lookAt(pet, this.fx, this.fy);
            T.crouch = 1;
            T.facing = d * 0.35;
            T.eyes = this.fv > 80 * S ? 'wide' : 'open';
            T.earDroop = -0.25;
            T.tailCurl = 0.7;
            s.tailAmp = 0.5;
            s.tailSpeed = 3.5;
            const fresh = w.time - this.movedAt < 1.2;
            if (adx > 150) {
              this.next('chase');
            } else if (hu < 70 && this.pt > 0.3) {
              this.dir = d;
              this.wiggle = rand(0.45, 0.85);
              this.next('stalk');
            } else if (hu < 210 && fresh && this.pt > 0.35) {
              this.dir = d;
              this.jumpH = clamp(hu - 85, 18, 150);
              this.swatted = false;
              this.next('jump');
            } else if (hu >= 210) {
              // 太高了够不着：站起来伸爪子
              T.crouch = 0;
              T.armL = T.armR = 1.7 + 0.15 * Math.sin(this.pt * 9);
              T.lift += 3;
            }
            return false;
          }
          case 'chase':
            if (locomote(b, this, dt, this.fx - d * 70 * S, GAITS.trot, 1.1) || adx < 110) this.next('watch');
            s.gaze = 'none';
            lookAt(pet, this.fx, this.fy);
            return false;
          case 'stalk': {
            // 压低身子盯着，扭屁股
            lookAt(pet, this.fx, this.fy);
            const u = clamp(this.pt / 0.25, 0, 1);
            T.facing = this.dir;
            T.crouch = 0.5 * u;
            T.squash += 0.1 * u;
            T.lean += this.dir * 0.12 * u + Math.sin(this.pt * 30) * 0.035 * u;
            T.eyes = 'wide';
            T.earDroop = -0.3;
            T.tailCurl = 0.9;
            if (hu > 95) {
              this.next('watch'); // 羽毛被你提起来了
            } else if (this.pt > this.wiggle) {
              const [lo, hi] = pet.spanX(34, 14);
              this.x0 = pet.x;
              this.tx = clamp(this.fx - this.dir * 16 * S, lo, hi);
              this.next('pounce');
            }
            return false;
          }
          case 'pounce': {
            // 扑上去，两只前爪往前按
            const D = 0.42;
            const u = clamp(this.pt / D, 0, 1);
            pet.x = lerp(this.x0, this.tx, easeInOut(u));
            T.facing = this.dir;
            T.lift = 26 * 4 * u * (1 - u);
            T.armL = T.armR = 1.35;
            T.footLY = T.footRY = 4 * bell(u);
            T.eyes = 'wide';
            T.mouth = 'o';
            lookAt(pet, this.fx, this.fy);
            if (u >= 1) {
              pet.squashSpring.kick(1.2);
              const paw = toWorld(pet, this.dir * 20, -14);
              if (Math.hypot(this.fx - paw.x, this.fy - paw.y) < 34 * S) this.grab();
              else this.next('miss');
            }
            return false;
          }
          case 'jump': {
            // 跳起来拍：到最高的那一下挥爪子，拍中了羽毛就荡开（偶尔一把抓住）
            const D = 0.5;
            const u = clamp(this.pt / D, 0, 1);
            T.lift = this.jumpH * 4 * u * (1 - u);
            T.facing = this.dir * 0.5;
            const near = this.dir > 0 ? 'armR' : 'armL';
            T[near] = 2 + Math.sin(this.pt * 20) * 0.1;
            T[this.dir > 0 ? 'armL' : 'armR'] = 1.1;
            T.eyes = 'wide';
            lookAt(pet, this.fx, this.fy);
            if (!this.swatted && u > 0.45) {
              this.swatted = true;
              const tip = pawAt(pet, this.dir, 2);
              const paw = toWorld(pet, tip.x, tip.y - pet.pose.lift);
              if (Math.hypot(this.fx - paw.x, this.fy - paw.y) < 44 * S) {
                if (chance(0.3)) {
                  this.caught = true;
                  this.holdFor = rand(1.4, 2.2);
                } else {
                  this.omega += this.dir * 7;
                  pet.fx.spawn('spark', { x: (this.fx - pet.x) / S, y: (this.fy - pet.y) / S, vx: this.dir * 30, vy: -20, life: 0.4, size: 0.7, vrot: 3 });
                }
              }
            }
            if (u >= 1) {
              pet.squashSpring.kick(1);
              this.next(this.caught ? 'caught' : 'watch');
            }
            return false;
          }
          case 'caught': {
            // 按住了！抱着羽毛，后腿一下一下地蹬
            T.crouch = 1;
            T.loaf = 0.35;
            T.armL = T.armR = -0.8;
            const k = Math.sin(this.pt * 22);
            T.footLY = 4 + 3 * k;
            T.footRY = 4 - 3 * k;
            T.lean += Math.sin(this.pt * 11) * 0.04;
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.4;
            T.blush = 1;
            T.lookY = 0.6;
            s.tailAmp = 0.8;
            s.tailSpeed = 4;
            if (this.pt - dt <= 0) {
              this.catches += 1;
              sparks(pet, 3);
              if (this.catches === 1 || chance(0.35)) b.say('wandCatch', 1.8);
            }
            if (this.pt > this.holdFor) {
              // 松开爪子：羽毛弹出去，接着玩
              this.caught = false;
              this.theta = clamp(Math.atan2(this.fx - this.piv.x, this.fy - this.piv.y), -2.5, 2.5);
              this.omega = (chance(0.5) ? 1 : -1) * 6;
              this.next('watch');
            }
            return false;
          }
          case 'lost':
            // 羽毛被你扯走了：愣一下
            lookAt(pet, this.fx, this.fy);
            T.eyes = 'wide';
            T.crouch = 0.6;
            if (this.pt - dt <= 0) pet.fx.spawn('bang', { x: 26, y: pet.headTop() + 4, life: 0.5 });
            if (this.pt > 0.35) this.next('watch');
            return false;
          case 'miss':
          default:
            // 扑空了：歪头看看
            lookAt(pet, this.fx, this.fy);
            T.crouch = 0.8;
            T.headTilt += 0.15 * this.dir;
            if (this.pt > 0.45) this.next('watch');
            return false;
        }
      },
      exit(b) {
        b.world.play.clear();
      },
    };
  },

  // ============================================================ 狐狸：扑雪地里的"老鼠"

  prey: (b) => {
    const pet = b.pet;
    const w = b.world;
    const DIVE = -44; // 扎进去多深（和 tricks.js 的 pounce 一样）
    const TURN = 2.9;
    return {
      phase: 'start',
      pt: 0,
      rustleAt: -Infinity, // 上一次"雪地里有动静"是什么时候
      rx: pet.x, // 动静在哪儿（窗口 x）
      catches: 0,
      hideUntil: 0, // 刚抓到：这一会儿雪地里没动静
      startAt: w.time,
      dir: 1,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 看鼠标是不是贴着地面在动：是的话，那儿的雪就在动（鼠标底下画一小堆抖动的雪） */
      sense() {
        const p = w.pointer;
        const zone = inGroundZone(w, p);
        const moving = w.time - p.lastMoveAt < 0.25;
        const shown = zone && w.time > this.hideUntil;
        if (shown && moving) {
          this.rustleAt = w.time;
          this.rx = p.x;
        }
        w.play.cursor = shown ? { kind: 'rustle', anchor: 'ground', k: moving ? 1 : 0.25, key: moving ? String(Math.round(w.time * 12)) : 'still' } : null;
      },
      snowAt(n) {
        const x = this.dir * 14;
        for (let i = 0; i < n; i++) {
          pet.fx.spawn('puff', { x: x + rand(-16, 16), y: -rand(0, 5), vx: rand(-45, 45), vy: -rand(20, 55), life: rand(0.45, 0.7), size: rand(0.8, 1.3) });
        }
        for (let i = 0; i < Math.ceil(n / 2); i++) {
          pet.fx.spawn('snow', { x: x + rand(-12, 12), y: -rand(2, 8), vx: rand(-60, 60), vy: -rand(80, 140), ay: 300, life: rand(0.7, 1), size: rand(0.6, 0.9), rot: rand(0, 3) });
        }
      },
      update(b, dt, t) {
        const T = pet.target;
        const s = pet.style;
        const S = w.scale;
        const p = w.pointer;
        this.pt += dt;
        this.sense();
        s.gaze = 'none';
        const recent = w.time - this.rustleAt < 1.2;
        const dx = this.rx - pet.x;
        const d = sign(dx) || 1;
        const adx = Math.abs(dx) / S;
        if (!this.ending) {
          if (b.userAway || w.time - Math.max(this.rustleAt, this.startAt) > IDLE_END || t > MAX_TIME) this.ending = 'bored';
          else if (this.catches >= 5) this.ending = 'tired';
        }
        const busy = this.phase === 'leap' || this.phase === 'stuck' || this.phase === 'pull';
        if (this.ending && !busy) {
          s.fps = 30;
          return wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : 'preyEnd' });
        }
        switch (this.phase) {
          case 'start':
            // 竖起耳朵："鼠标贴着地面晃一晃～"
            s.fps = 30;
            T.earDroop = -0.35;
            T.eyes = 'wide';
            if (this.pt > 0.2) once(this, b, 'preyStart', 1, 3.2);
            if (this.pt > 0.8) this.next('listen');
            return false;
          case 'listen':
            s.fps = 30;
            T.earDroop = -0.35;
            if (recent) {
              // 听见了：歪着头一会儿听左边、一会儿听右边
              const tilt = Math.sin(this.pt * 2.6);
              T.facing = d * 0.55;
              T.headTilt += tilt * 0.2;
              T.lookX = clamp(dx / (150 * S), -1, 1) * 0.8;
              T.lookY = 0.8;
              T.eyes = 'wide';
              if (adx > 175) this.next('sneak');
              else if (adx < 50) {
                const [lo, hi] = pet.spanX(34, 14);
                this.backTx = clamp(pet.x - d * 70 * S, lo, hi); // 太近了：往后退一点
                this.next('back');
              } else if (this.pt > 0.7) {
                this.next('crouch');
              }
            } else {
              // 没动静：竖着耳朵东张西望
              T.crouch = 0.6;
              T.lookX = Math.sin(this.pt * 0.9) * 0.6;
              T.lookY = 0.5;
            }
            return false;
          case 'sneak':
            // 压低身子，悄悄靠近
            if (locomote(b, this, dt, this.rx - d * 125 * S, GAITS.walk, 0.8) || (!recent && this.pt > 1.5)) this.next('listen');
            s.gaze = 'none';
            T.crouch = 0.3;
            T.headY += 4;
            T.lookY = 0.8;
            T.earDroop = -0.3;
            return false;
          case 'back':
            if (locomote(b, this, dt, this.backTx, GAITS.walk, 1) || this.pt > 2) this.next('listen');
            return false;
          case 'crouch': {
            // 蹲低、扭屁股，攒劲
            s.fps = 60;
            const u = clamp(this.pt / 0.4, 0, 1);
            T.facing = d;
            T.crouch = 0.45 * u;
            T.squash += 0.12 * u;
            T.lean += d * 0.1 * u + Math.sin(this.pt * 28) * 0.035 * u;
            T.earDroop = -0.3;
            T.lookX = d * 0.7;
            T.lookY = 0.85;
            T.eyes = 'wide';
            T.tailCurl = 0.95;
            if (this.pt > 0.5) {
              // 扑向它现在听到的那个地方（扑出去以后你挪开了，它就扑空）
              const [lo, hi] = pet.spanX(34, 14);
              this.dir = d;
              this.target = this.rx;
              this.x0 = pet.x;
              this.x1 = clamp(this.target - d * 14 * S, lo, hi);
              this.next('leap');
            }
            return false;
          }
          case 'leap': {
            // 高高跳起，在空中翻过身，一头扎下去（和招牌动作 pounce 一样）
            s.fps = 60;
            const D = 0.62;
            const u = clamp(this.pt / D, 0, 1);
            pet.x = lerp(this.x0, this.x1, u);
            T.facing = this.dir;
            T.lift = 72 * 4 * u * (1 - u) + DIVE * u * u;
            T.roll = this.dir * (TURN * easeInOut((u - 0.15) / 0.85) - 0.3 * bell(u / 0.4));
            T.armL = T.armR = 1.25;
            T.footLY = T.footRY = 4 * u;
            T.earDroop = -0.25;
            T.eyes = 'wide';
            T.mouth = 'o';
            T.mouthOpen = 0.5;
            T.tailCurl = 1 - clamp((u - 0.35) / 0.4, 0, 1);
            if (u >= 1) {
              pet.squashSpring.kick(1.2);
              this.snowAt(9);
              // 你的"老鼠"（鼠标）还在扎下去的地方：抓到了
              this.caught = inGroundZone(w, p) && Math.abs(p.x - this.target) < 34 * S;
              if (this.caught) this.hideUntil = w.time + 2.6;
              this.next('stuck');
            }
            return false;
          }
          case 'stuck': {
            // 脑袋扎在雪里，屁股和后腿露在外面蹬一蹬，尾巴甩来甩去
            s.fps = 60;
            const k = Math.sin(this.pt * 17);
            T.facing = this.dir;
            T.roll = this.dir * (TURN + Math.sin(this.pt * 11) * 0.035);
            T.lift = DIVE + Math.abs(Math.sin(this.pt * 9)) * 1.2;
            T.armL = T.armR = 1.25;
            T.footLY = -3 + 4 * k;
            T.footRY = -3 - 4 * k;
            T.tailCurl = 0;
            s.tailAmp = 1;
            s.tailSpeed = 6;
            if (this.pt > 0.7) this.next('pull');
            return false;
          }
          case 'pull': {
            // 拔出来：往后一仰，蹦一下，落回地上
            s.fps = 60;
            const u = clamp(this.pt / 0.45, 0, 1);
            const e = easeInOut(u);
            T.facing = this.dir;
            T.roll = this.dir * TURN * (1 - e);
            T.lift = DIVE * (1 - e) + 18 * bell(u);
            T.eyes = 'squeeze';
            T.armL = T.armR = 0.6 * (1 - u);
            if (this.pt - dt <= 0) this.snowAt(7);
            if (u >= 1) {
              pet.squashSpring.kick(0.8);
              this.next('result');
            }
            return false;
          }
          case 'result':
          default:
            s.fps = 30;
            T.facing = this.dir * 0.4;
            if (this.caught) {
              // 抓到了：得意地冒星星
              T.eyes = 'happy';
              T.mouth = 'smile';
              T.mouthOpen = 0.45;
              T.blush = 0.9;
              T.tailCurl = 1;
              s.tailAmp = 0.8;
              s.tailSpeed = 3;
              if (this.pt - dt <= 0) {
                this.catches += 1;
                sparks(pet, 4);
                b.reward({ mood: 0.04 });
                if (this.catches === 1 || chance(0.4)) b.say('preyCatch', 2);
              }
            } else {
              // 扑空了：满头雪，歪着头冒个问号
              const amp = clamp(1 - this.pt / 0.5, 0, 1);
              T.headTilt += Math.sin(this.pt * 32) * amp * 0.2 + 0.15 * this.dir * (1 - amp);
              T.mouth = 'wavy';
              T.blush = 0.8;
              if (this.pt - dt <= 0) {
                pet.fx.spawn('question', { x: this.dir * 26, y: pet.headTop() + 4, life: 1 });
                if (chance(0.45)) b.say('pounceMiss', 1.8);
              }
            }
            if (this.pt > 1.2) this.next('listen');
            return false;
        }
      },
      exit(b) {
        b.world.play.clear();
      },
    };
  },

  // ============================================================ 水獭：牵手

  holdHands: (b) => {
    const pet = b.pet;
    const w = b.world;
    const LIE = 1.42;
    return {
      phase: 'start',
      pt: 0,
      side: 1, // 用哪只手牵你（你在它哪一边）
      holding: false,
      lying: 0, // 0 站着 … 1 仰面躺着（平滑地变过去）
      still: 0, // 你的爪子多久没动了
      slipT: 0,
      zz: 1.5,
      ripple: 0.5,
      lastActive: w.time,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      update(b, dt, t) {
        const T = pet.target;
        const s = pet.style;
        const S = w.scale;
        const p = w.pointer;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        w.play.cursor = p.inside ? { kind: 'paw', anchor: 'pointer', held: this.holding, key: this.holding ? 'held' : 'free' } : null;
        const moving = w.time - p.lastMoveAt < 0.2;
        this.still = moving ? 0 : this.still + dt;
        if (moving || this.holding) this.lastActive = w.time;
        if (!this.ending && (b.userAway || w.time - this.lastActive > IDLE_END || t > MAX_TIME + 120)) this.ending = 'bored';
        // 躺下、坐起来：平滑地变（各 0.6 秒）
        const wantLie = this.phase === 'float' && !this.ending;
        this.lying = clamp(this.lying + (wantLie ? dt : -dt) / 0.6, 0, 1);
        const k = easeInOut(this.lying);
        if (k > 0) {
          // 仰面躺着（像漂在水上）：牵着你的那只手朝天，脸转过来朝着你
          T.roll = -this.side * LIE * k;
          T.headTilt += this.side * 1.0 * k;
          T.headY -= 6 * k;
          T.lift = lieLift(pet, T.roll, this.side * 1.0 * k) + 1.5 * k;
          T.tailHang = 0.8 * k;
          T.tailCurl = 1 - k;
          T.footLY = T.footRY = -4 * k;
          T.crouch = 0.2;
        }
        if (this.ending) {
          this.holding = false;
          if (this.lying > 0.01) return false; // 先坐起来
          lookAt(pet, p.x, p.y);
          return wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : 'handsEnd' });
        }
        const arm = (side) => (side < 0 ? 'armL' : 'armR');
        switch (this.phase) {
          case 'start':
            // 张开手：牵我！
            lookAt(pet, p.x, p.y);
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.4;
            T.blush = 0.9;
            T.armL = T.armR = 0.9 + Math.sin(this.pt * 14) * 0.25;
            if (this.pt > 0.2) once(this, b, 'handsStart', 0.8);
            if (this.pt > 0.7) this.next('come');
            return false;
          case 'come': {
            if (!p.inside) {
              T.crouch = 1;
              T.lookX = Math.sin(this.pt) * 0.5;
              return false;
            }
            // 跑到你的爪子旁边：伸手那一边正好在它底下
            this.side = sign(p.x - pet.x) || this.side;
            const [lo, hi] = pet.spanX(34, 14);
            const gx = clamp(p.x - this.side * 34 * S, lo, hi);
            const far = Math.abs(gx - pet.x) > 160 * S;
            if (locomote(b, this, dt, gx, far ? GAITS.trot : GAITS.walk, 1) || Math.abs(gx - pet.x) < 8 * S) this.next('reach');
            s.gaze = 'none';
            lookAt(pet, p.x, p.y);
            return false;
          }
          case 'reach':
          case 'hold': {
            if (!p.inside) {
              this.holding = false;
              this.next('come');
              return false;
            }
            // 手伸向你的爪子，伸出去的爪子一直待在你的爪子底下（你挪它就跟着走）
            const lx = (p.x - pet.x) / S;
            const ly = (p.y - pet.y) / S + pet.pose.lift;
            const a = aimArm(pet, this.side, lx, ly);
            const tip = pawAt(pet, this.side, a);
            const tw = toWorld(pet, tip.x, tip.y - pet.pose.lift);
            const dist = Math.hypot(tw.x - p.x, tw.y - p.y) / S;
            const [lo, hi] = pet.spanX(34, 14);
            const gx = clamp(p.x - tip.x * S, lo, hi);
            if (Math.abs(gx - pet.x) > 3 * S) locomote(b, this, dt, gx, Math.abs(gx - pet.x) > 90 * S ? GAITS.trot : GAITS.walk, 1);
            s.gaze = 'none';
            T.facing = this.side * 0.4;
            lookAt(pet, p.x, p.y);
            T[arm(this.side)] = a;
            if (this.phase === 'reach') {
              T[arm(-this.side)] = 0.4;
              T.eyes = 'wide';
              T.mouth = 'o';
              T.mouthOpen = 0.3;
              // 够不着（你的爪子太高）：踮脚一蹦一蹦地够
              if (a >= 2 && dist > 22) {
                const hop = this.pt % 0.8;
                if (hop < 0.25) T.lift += bell(hop / 0.25) * 9;
              }
              if (dist < 22) {
                this.holding = true;
                hearts(pet, 1);
                this.next('hold');
              } else if (Math.abs(p.x - pet.x) > 170 * S) {
                this.next('come');
              }
              return false;
            }
            // 牵着：开心、脸红，时不时冒爱心
            T[arm(-this.side)] = -0.5;
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.35;
            T.blush = 1;
            s.tailAmp = 0.6;
            s.tailSpeed = 2.5;
            if (this.pt > 0.8) once(this, b, 'handsHold', 0.6);
            if (this.pt % 2.4 < dt) hearts(pet, 1);
            // 挪得太快、太远：手松开了
            this.slipT = dist > 36 || p.speed > 900 * S ? this.slipT + dt : 0;
            if (this.slipT > 0.12) {
              this.next('slip');
            } else if (this.still > 2.2 && p.y > w.groundY - 95 * S) {
              this.next('float'); // 你一直不动（而且爪子不太高）：躺下来，牵着你的手漂着
            }
            return false;
          }
          case 'float': {
            if (!p.inside) {
              this.next('slip');
              return false;
            }
            // 朝天的那只手牵着你；你慢慢挪，它就被你拖着漂
            const lt = bodyLocal(pet, p.x, p.y);
            const a = aimArm(pet, this.side, lt.x, lt.y);
            const tip = pawAt(pet, this.side, a);
            const tp = bodyPoint(pet, tip.x, tip.y);
            const tw = toWorld(pet, tp.x, tp.y);
            const dist = Math.hypot(tw.x - p.x, tw.y - p.y) / S;
            T[arm(this.side)] = a;
            T[arm(-this.side)] = -0.75;
            const [lo, hi] = pet.spanX(34, 14);
            if (this.lying > 0.6) pet.x = clamp(pet.x + (p.x - tw.x) * Math.min(1, dt * 3), lo, hi);
            this.ripple -= dt;
            if (this.ripple <= 0) {
              this.ripple = rand(1.1, 1.6);
              for (const sd of [-1, 1]) pet.fx.spawn('ripple', { x: sd * rand(34, 50), y: -1, life: 1.6, size: rand(0.8, 1.1) });
            }
            const asleep = this.still > 3;
            T.eyes = asleep ? 'sleep' : 'happy';
            T.mouth = asleep ? 'cat' : 'smile';
            T.blush = 0.9;
            s.blink = !asleep;
            if (asleep) {
              s.breathDepth = 2;
              once(this, b, 'handsSleep', 0.6);
              this.zz -= dt;
              if (this.zz <= 0) {
                this.zz = rand(2, 2.8);
                const g = getGeometry(pet.sp, pet.pose);
                const h = bodyPoint(pet, g.headCx, g.headCy - pet.sp.head.ry);
                pet.fx.spawn('zzz', { x: h.x, y: h.y - 8, vx: -this.side * rand(4, 8), vy: -rand(13, 18), life: 2.3, phase: rand(0, 6) });
              }
            }
            this.slipT = this.lying > 0.9 && (dist > 34 || p.speed > 700 * S) ? this.slipT + dt : 0;
            if (this.slipT > 0.12) this.next('slip');
            return false;
          }
          case 'slip':
          default:
            // 手松开了：咦？你去哪了？坐起来找你
            this.holding = false;
            if (this.pt - dt <= 0) {
              pet.fx.spawn('question', { x: this.side * 26, y: pet.headTop() + 4, life: 0.9 });
              if (chance(0.5)) b.say('handsSlip', 1.8);
            }
            T.eyes = 'wide';
            T.armL = T.armR = 0.3;
            lookAt(pet, p.x, p.y);
            if (this.pt > 0.9 && this.lying < 0.02) this.next('come');
            return false;
        }
      },
      exit(b) {
        b.world.play.clear();
      },
    };
  },

  // ============================================================ 小熊猫：递树枝

  branch: (b) => {
    const pet = b.pet;
    const w = b.world;
    return {
      phase: 'start',
      pt: 0,
      riding: false, // 趴在树枝上
      tilt: 0, // 身子荡到哪儿了（弧度）
      tiltV: 0,
      lastVx: 0,
      jolt: 0, // 被来回猛晃的那股劲：太大就掉下去
      lastDx: 0,
      still: 0,
      cooldown: 0, // 刚下来：歇一下再跳上去
      zz: 1.5,
      dir: 1,
      lastActive: w.time,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 趴在树枝上时被点了一下：跳下来 */
      letGo() {
        if (this.riding) this.next('hopOff');
      },
      update(b, dt, t) {
        const T = pet.target;
        const s = pet.style;
        const S = w.scale;
        const p = w.pointer;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        const moving = w.time - p.lastMoveAt < 0.2;
        this.still = moving ? 0 : this.still + dt;
        if (moving) this.lastActive = w.time;
        w.play.cursor = p.inside && !this.riding ? { kind: 'branch', anchor: 'pointer', key: 'branch' } : null;
        pet.playProp = this.riding ? { kind: 'branch', counter: -pet.rot } : null;
        if (!this.ending) {
          // 趴在树枝上睡着了可以多待一会儿（你不动它就一直睡），但也不能一直挂在半空
          const limit = this.riding ? 60 : IDLE_END;
          if ((b.userAway && !this.riding) || w.time - this.lastActive > limit || t > MAX_TIME) this.ending = 'bored';
        }
        const airborne = this.phase === 'jump' || this.phase === 'hopOff' || this.phase === 'fall';
        if (this.ending && !airborne) {
          if (this.riding) {
            this.next('hopOff');
          } else if (this.phase !== 'dizzy') {
            lookAt(pet, p.x, p.y);
            return wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : 'branchEnd' });
          }
        }
        const [lo, hi] = pet.spanX(34, 14);
        const h = (w.groundY - p.y) / S; // 树枝离地多高
        switch (this.phase) {
          case 'start':
            lookAt(pet, p.x, p.y);
            T.eyes = 'wide';
            T.earDroop = -0.3;
            if (this.pt > 0.2) once(this, b, 'branchStart', 0.8);
            if (this.pt > 0.6) this.next('come');
            return false;
          case 'come': {
            if (!p.inside) {
              T.crouch = 1;
              return false;
            }
            const gx = clamp(p.x, lo, hi);
            if (Math.abs(gx - pet.x) > 10 * S) {
              locomote(b, this, dt, gx, Math.abs(gx - pet.x) > 160 * S ? GAITS.trot : GAITS.walk, 1);
              s.gaze = 'none';
              lookAt(pet, p.x, p.y);
              return false;
            }
            lookAt(pet, p.x, p.y);
            if (h > 225) {
              // 太高了：站起来伸手够
              T.armL = T.armR = 1.9 + Math.sin(this.pt * 10) * 0.1;
              T.lift += 2 + bell((this.pt % 0.7) / 0.7) * 5;
              T.eyes = 'wide';
              if (this.pt > 0.6) once(this, b, 'branchReach', 0.7);
              return false;
            }
            if (h < 25 || this.cooldown > 0) {
              // 树枝快贴地了 / 刚下来：坐着歇一下
              this.cooldown -= dt;
              T.crouch = 1;
              return false;
            }
            this.next('crouch');
            return false;
          }
          case 'crouch':
            lookAt(pet, p.x, p.y);
            T.squash += 0.14 * clamp(this.pt / 0.2, 0, 1);
            T.armL = T.armR = 0.4;
            T.eyes = 'wide';
            if (Math.abs(p.x - pet.x) > 30 * S || h > 225 || h < 25) {
              this.next('come');
            } else if (this.pt > 0.25) {
              this.x0 = pet.x;
              this.y0 = pet.y;
              pet.mode = 'wall'; // 位置由这个动作管（和扒在墙上一样），物理只保证它不出范围
              pet.perch = null;
              this.next('jump');
            }
            return false;
          case 'jump': {
            // 跳上去：落点一直对着树枝（你在挪的话它也跟着）
            const D = 0.42;
            const u = clamp(this.pt / D, 0, 1);
            const e = 1 - (1 - u) * (1 - u);
            const tx = clamp(p.x, w.area.left + 30 * S, w.area.right - 30 * S);
            const ty = clamp(p.y, pet.ceilingY(), w.groundY);
            pet.x = lerp(this.x0, tx, e);
            pet.y = lerp(this.y0, ty, e) - 22 * S * 4 * u * (1 - u);
            T.armL = T.armR = 1.7;
            T.squash -= 0.08 * bell(u);
            T.eyes = 'wide';
            T.tailCurl = 1;
            T.loaf = clamp((u - 0.6) / 0.4, 0, 1);
            if (u >= 1) {
              this.riding = true;
              pet.squashSpring.kick(0.8);
              this.next('ride');
            }
            return false;
          }
          case 'ride': {
            // 趴在树枝上：跟着树枝走，身子像钟摆一样荡，大尾巴跟着甩
            const nx = clamp(p.x, w.area.left + 30 * S, w.area.right - 30 * S);
            const ny = clamp(p.y, pet.ceilingY(), w.groundY);
            const dx = nx - pet.x;
            pet.x = nx;
            pet.y = ny;
            if (ny > w.groundY - 12 * S) {
              this.next('hopOff'); // 树枝都贴到地上了：下来
              return false;
            }
            const ax = clamp((p.vx - this.lastVx) / Math.max(dt, 0.001) / S, -9000, 9000);
            this.lastVx = p.vx;
            this.tiltV += (-60 * this.tilt - 3 * this.tiltV - ax * 0.0009) * dt;
            this.tilt = clamp(this.tilt + this.tiltV * dt, -0.6, 0.6);
            s.tilt = this.tilt;
            // 来回猛晃（方向一变、又挺快）：抓不住了
            this.jolt = Math.max(0, this.jolt - dt * 0.7);
            if (Math.abs(dx) > 6 * S && this.lastDx && Math.sign(dx) !== Math.sign(this.lastDx)) this.jolt += 0.25 + Math.min(0.3, Math.abs(dx) / (60 * S));
            if (Math.abs(dx) > 2 * S) this.lastDx = dx;
            if (this.jolt > 1.3) {
              this.next('fall');
              return false;
            }
            T.loaf = 1;
            T.drape = 1;
            T.footLY = T.footRY = -15;
            T.tailHang = 1;
            T.tailCurl = 1;
            T.tail += -this.tilt * 2.2;
            T.headY += 5;
            const asleep = this.still > 3;
            if (asleep) {
              // 你不动：趴在树枝上睡着了
              T.eyes = 'sleep';
              T.headTilt += 0.22;
              s.blink = false;
              s.breathDepth = 2;
              once(this, b, 'branchNap', 0.5);
              this.zz -= dt;
              if (this.zz <= 0) {
                this.zz = rand(1.8, 2.6);
                pet.fx.spawn('zzz', { x: 22, y: pet.headTop() + 6, vx: rand(5, 9), vy: -rand(13, 18), life: 2.3, phase: rand(0, 6) });
              }
            } else if (Math.abs(this.tiltV) > 1.2) {
              T.eyes = 'wide'; // 荡得厉害：抓紧！
              T.mouth = 'o';
              T.mouthOpen = 0.5;
            } else {
              T.eyes = 'happy';
              T.mouth = 'smile';
              T.mouthOpen = 0.3;
              T.blush = 0.9;
              if (this.pt > 1) once(this, b, 'branchRide', 0.6);
            }
            return false;
          }
          case 'hopOff': {
            // 从树枝上轻轻跳下来，四脚落地
            if (this.pt - dt <= 0) {
              this.riding = false;
              this.x0 = pet.x;
              this.y0 = pet.y;
              this.dir = pet.x > (w.area.left + w.area.right) / 2 ? -1 : 1;
              pet.mode = 'wall';
            }
            const D = 0.45;
            const u = clamp(this.pt / D, 0, 1);
            s.tilt = 0;
            pet.x = clamp(this.x0 + this.dir * 30 * S * u, lo, hi);
            pet.y = lerp(this.y0, w.groundY, u * u) - 16 * S * 4 * u * (1 - u);
            T.loaf = 1 - u;
            T.armL = T.armR = 0.8 * (1 - u);
            T.eyes = 'wide';
            if (u >= 1) {
              pet.mode = 'ground';
              pet.y = w.groundY;
              pet.squashSpring.kick(1);
              this.cooldown = 2;
              this.next('come');
            }
            return false;
          }
          case 'fall': {
            // 被你晃下来了：翻个跟头掉下去
            if (this.pt - dt <= 0) {
              this.riding = false;
              this.x0 = pet.x;
              this.y0 = pet.y;
              this.vx = clamp(p.vx * 0.25, -260 * S, 260 * S);
              this.spin = sign(this.vx) || 1;
              pet.mode = 'wall';
              if (chance(0.7)) b.say('branchFall', 1.6);
            }
            const D = 0.5;
            const u = clamp(this.pt / D, 0, 1);
            s.tilt = 0;
            pet.x = clamp(this.x0 + this.vx * this.pt, lo, hi);
            pet.y = lerp(this.y0, w.groundY, u * u);
            T.roll = this.spin * Math.PI * 2 * easeInOut(u);
            T.lift = 20 * bell(u);
            T.eyes = 'wide';
            T.mouth = 'o';
            T.armL = T.armR = 1.6;
            if (u >= 1) {
              pet.mode = 'ground';
              pet.y = w.groundY;
              pet.pose.roll = 0; // 刚好翻了一整圈：直接当成 0，免得它又倒着转回去
              pet.squashSpring.kick(2);
              stars(pet, 1.4, pet.headTop() - 6);
              this.next('dizzy');
            }
            return false;
          }
          case 'dizzy':
          default:
            T.crouch = 1;
            T.eyes = 'dizzy';
            T.mouth = 'wavy';
            if (this.pt > 1.4) {
              this.cooldown = 2.5;
              this.next('come');
            }
            return false;
        }
      },
      exit(b) {
        b.world.play.clear();
        pet.playProp = null;
        pet.style.tilt = 0;
        if (pet.mode === 'wall') {
          // 还在树枝上（被别的事打断了）：轻轻落下来
          pet.mode = 'air';
          pet.vx = 0;
          pet.vy = 0;
          pet.airT = 0;
          pet.leapt = true;
        }
      },
    };
  },

  // ============================================================ 熊猫：抢竹子

  tug: (b) => {
    const pet = b.pet;
    const w = b.world;
    const L = 74; // 竹子多长
    const WIN = 130; // 你拉得够狠（被拖着滑了多远 + 绷紧了多久）就抢到了
    const st = {
      phase: 'start',
      pt: 0,
      held: false, // 你正按着竹子那头
      side: 1, // 竹子往哪边伸（你在哪边）
      angle: -0.5, // 没人抓时竹子往上翘多少（弧度）
      round: 0,
      progress: 0,
      offerT: 0,
      dustT: 0,
      lastActive: w.time,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 它抱着竹子的地方（胸口，窗口坐标） */
      grip() {
        const g = getGeometry(pet.sp, pet.pose);
        return toWorld(pet, g.torsoCx + this.side * 3, g.torsoCy - 4 - pet.pose.lift);
      },
      /** 竹子露在外面的那一头（你抓的那头）在哪儿 */
      freeEnd() {
        if (this.held) return { x: w.pointer.x, y: w.pointer.y };
        const G = this.grip();
        const S = w.scale;
        return { x: G.x + Math.cos(this.angle) * this.side * L * S, y: G.y + Math.sin(this.angle) * L * S };
      },
    };
    st.handler = {
      // 竹子外面那一半都能抓
      hit: (x, y) => {
        if (st.phase !== 'offer' || st.ending) return false;
        const G = st.grip();
        const E = st.freeEnd();
        return segDist(x, y, lerp(G.x, E.x, 0.45), lerp(G.y, E.y, 0.45), E.x, E.y) < 15 * w.scale;
      },
      press: () => {
        st.held = true;
        st.progress = 0;
        st.lastActive = w.time;
        st.next('tug');
      },
      release: () => {
        if (!st.held) return;
        st.held = false;
        st.lastActive = w.time;
        if (st.phase === 'tug') st.next('pandaWins'); // 你先松手了：它赢
      },
    };
    st.update = function update(b, dt, t) {
      const T = pet.target;
      const s = pet.style;
      const S = w.scale;
      const p = w.pointer;
      this.pt += dt;
      s.fps = 60;
      s.gaze = 'none';
      w.play.handler = this.phase === 'offer' || this.phase === 'tug' ? this.handler : null;
      if (!this.ending && (b.userAway || t > MAX_TIME || this.round >= 3)) this.ending = this.round >= 3 ? 'tired' : 'bored';
      const showStick = this.phase === 'offer' || this.phase === 'tug';
      if (showStick) {
        const G = this.grip();
        const E = this.freeEnd();
        pet.playProp = { kind: 'bamboo', from: [(G.x - pet.x) / S, (G.y - pet.y) / S + pet.pose.lift], to: [(E.x - pet.x) / S, (E.y - pet.y) / S + pet.pose.lift], len: L };
      } else {
        pet.playProp = null;
      }
      if (this.ending && (this.phase === 'offer' || this.phase === 'start' || this.phase === 'next')) {
        lookAt(pet, p.x, p.y);
        return wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : 'tugEnd' });
      }
      switch (this.phase) {
        case 'start':
          // 从身后掏出一根竹子，得意地抱着
          T.crouch = 1;
          T.armL = T.armR = -0.95;
          lookAt(pet, p.x, p.y);
          if (p.inside) this.side = sign(p.x - pet.x) || this.side;
          if (this.pt - dt <= 0) sparks(pet, 3);
          if (this.pt > 0.3) once(this, b, 'tugStart', 0.8);
          if (this.pt > 0.5) {
            this.offerT = 0;
            this.next('offer');
          }
          return false;
        case 'offer': {
          // 竹子另一头朝你那边翘着，晃一晃：来抢呀～
          T.crouch = 1;
          T.armL = T.armR = -0.95;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.3;
          T.blush = 0.8;
          lookAt(pet, p.x, p.y);
          if (p.inside && Math.abs(p.x - pet.x) > 20 * S) this.side = sign(p.x - pet.x);
          this.angle = -0.5 + Math.sin(this.pt * 2.2) * 0.12;
          this.offerT += dt;
          if (this.offerT > 12) {
            // 没人来抢：那我自己吃啦
            this.ending = this.ending || 'bored';
            this.next('pandaWins');
          }
          return false;
        }
        case 'tug': {
          // 你拽着那头：它抱着不撒手，往后坐着使劲，被你拖着在地上滑
          const G = this.grip();
          const vx = p.x - G.x;
          const dist = Math.hypot(vx, p.y - G.y) / S;
          if (Math.abs(vx) > 4 * S) this.side = sign(vx);
          let strain = 0.35;
          if (dist > L) {
            const over = dist - L;
            const [lo, hi] = pet.spanX(34, 14);
            const nx = clamp(pet.x + sign(vx) * Math.min(over * 6, 260) * S * dt, lo, hi);
            this.progress += Math.abs(nx - pet.x) / S + over * dt * 0.8;
            pet.x = nx;
            strain = 1;
            this.dustT -= dt;
            if (this.dustT <= 0) {
              this.dustT = 0.12;
              pet.fx.spawn('dust', { x: -this.side * rand(10, 22), y: -2, vx: -this.side * rand(20, 40), vy: -rand(6, 14), life: 0.4, size: rand(0.6, 0.9) });
            }
          } else {
            this.progress = Math.max(0, this.progress - 6 * dt);
          }
          this.lastActive = w.time;
          T.crouch = 1;
          T.armL = T.armR = -0.95;
          T.lean += -this.side * (0.1 + 0.16 * strain) + Math.sin(this.pt * 40) * 0.015 * strain;
          T.squash += 0.05 * strain;
          T.footLX = T.footRX = this.side * 4 * strain;
          T.headTilt += -this.side * 0.12 * strain;
          T.eyes = strain > 0.8 ? 'squeeze' : 'annoyed';
          T.mouth = strain > 0.8 ? 'wavy' : 'pout';
          T.blush = 1;
          lookAt(pet, p.x, p.y);
          if (this.pt > 0.6) once(this, b, 'tugPull', 0.7);
          if (this.progress > WIN) this.next('youWin');
          return false;
        }
        case 'youWin': {
          // 你抢到了：竹子被你拿走，它往后一仰一屁股坐下，撅嘴
          if (this.pt - dt <= 0) {
            this.held = false;
            this.round += 1;
            pet.squashSpring.kick(1.6);
            if (chance(0.75)) b.say('tugLose', 2.2);
          }
          const u = clamp(this.pt / 0.6, 0, 1);
          T.roll = -this.side * 0.9 * bell(u);
          T.crouch = 1;
          T.eyes = this.pt < 0.5 ? 'squeeze' : 'annoyed';
          T.mouth = 'pout';
          T.earDroop = 0.4;
          T.blush = 1;
          w.play.cursor = this.pt < 1.6 && p.inside ? { kind: 'bamboo', anchor: 'pointer', rot: this.side > 0 ? Math.PI * 0.75 : Math.PI * 0.25, key: 'won' } : null;
          if (this.pt > 2.2) {
            w.play.cursor = null;
            this.next('next');
          }
          return false;
        }
        case 'pandaWins': {
          // 它赢了：抱着竹子开心地啃
          T.crouch = 1;
          T.snack = 1;
          T.armL = T.armR = -0.75;
          const bites = clamp(this.pt / 3, 0, 1);
          T.bite = bites;
          const c = Math.sin(this.pt * 15);
          T.mouth = c > 0.1 ? 'wavy' : 'cat';
          T.eyes = 'happy';
          T.blush = 1;
          T.headY += Math.abs(c) * 1.2;
          if (this.pt - dt <= 0) {
            this.round += 1;
            if (chance(0.75)) b.say('tugWin', 2);
          }
          if (this.pt > 0.3 && chance(dt * 3)) pet.fx.spawn('crumb', { x: rand(-6, 6), y: -60, vx: rand(-25, 25), vy: -rand(10, 40), ay: 260, life: 0.7, size: rand(0.7, 1.1), color: '#8cc46a' });
          if (this.pt > 3.4) this.next('next');
          return false;
        }
        case 'next':
        default:
          // 再来一回（最多三回）
          T.crouch = 1;
          lookAt(pet, p.x, p.y);
          if (this.pt > 0.5) this.next('start');
          return false;
      }
    };
    st.exit = function exit(b) {
      b.world.play.clear();
      pet.playProp = null;
    };
    return st;
  },

  // ============================================================ 卡皮巴拉：叠橘子

  stack: (b) => {
    const pet = b.pet;
    const w = b.world;
    const R = 9; // 橘子半径
    const STEP = R * 1.68; // 一个橘子叠一个，中心隔多远
    const st = {
      phase: 'start',
      pt: 0,
      stack: [], // 头顶的一摞：[{ dx, rot }]
      sway: 0, // 整摞往一边歪多少
      swayV: 0,
      limit: Math.round(rand(6, 9)), // 这一摞叠到几个就倒
      falling: null, // 正往下掉、对准了的那个（坐标相对于头顶那一摞的底）
      loose: [], // 没对准的、倒下来的：在地上滚（坐标是脚底的坐标）
      lastActive: w.time,
      blink: 0,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 头顶那一摞的底（窗口坐标） */
      base() {
        const g = getGeometry(pet.sp, pet.pose);
        const lx = clamp(pet.pose.lookX + g.facing * 0.55, -1, 1);
        return toWorld(pet, g.headCx + lx * 4, g.headCy - pet.sp.head.ry + 3 - pet.pose.lift);
      },
      /** 这一摞（不算晃）有多高 */
      height() {
        return this.stack.length ? 2 * R + (this.stack.length - 1) * STEP : 0;
      },
      /** 最上面那个的顶，相对于底（摞得歪，越往上偏得越多） */
      topAt() {
        let x = 0;
        let y = -R;
        for (let i = 1; i < this.stack.length; i++) {
          x += Math.sin(this.sway * i) * STEP;
          y -= Math.cos(this.sway * i) * STEP;
        }
        return this.stack.length ? { x, y: y - R } : { x: 0, y: 0 };
      },
      /** 在 (x, y) 松开一个橘子：对准了就落到那一摞顶上，没对准就从旁边掉下去 */
      drop(x, y) {
        if (this.falling || this.ending || this.phase === 'start') return;
        const S = w.scale;
        const ox = x + 6 * S; // 手里那个橘子画在鼠标尖右下方一点（见 props.js 的 drawPlayCursor）
        const oy = y + 13 * S;
        const b0 = this.base();
        const top = this.topAt();
        const rx = (ox - b0.x) / S;
        const ry = (oy - b0.y) / S;
        if (Math.abs(rx - top.x) < 22) {
          this.falling = { x: rx, y: Math.min(ry, top.y - R - 2), vy: 0, rot: rand(-0.4, 0.4) };
        } else {
          this.loose.push({ x: (ox - pet.x) / S, y: Math.min((oy - pet.y) / S, -R - 2), vx: sign(rx - top.x) * rand(25, 50), vy: 0, rot: 0, life: 2.6 });
        }
        this.lastActive = w.time;
      },
      /** 太高了、晃得太厉害：哗啦一下全倒了，在地上滚开 */
      topple(b) {
        const b0 = this.base();
        const S = w.scale;
        let x = 0;
        let y = -R;
        this.stack.forEach((o, i) => {
          if (i > 0) {
            x += Math.sin(this.sway * i) * STEP;
            y -= Math.cos(this.sway * i) * STEP;
          }
          const dirx = sign(this.sway) || (chance(0.5) ? 1 : -1);
          this.loose.push({ x: (b0.x - pet.x) / S + x + o.dx, y: (b0.y - pet.y) / S + y, vx: dirx * rand(30, 70) + i * this.sway * 80, vy: -rand(40, 140), rot: o.rot, life: 2.8 });
        });
        const n = this.stack.length;
        this.stack = [];
        this.sway = 0;
        this.swayV = 0;
        this.limit = Math.round(rand(6, 9));
        this.blink = 0.35;
        pet.squashSpring.kick(0.6);
        if (n >= 3 && chance(0.7)) b.say('stackFall', 2);
      },
    };
    st.handler = {
      // 头顶上方那一竖条：在里面点一下就往下掉一个橘子
      hit: (x, y) => {
        if (st.ending || st.phase === 'start') return false;
        const S = w.scale;
        const b0 = st.base();
        const topY = b0.y + st.topAt().y * S;
        return Math.abs(x - b0.x) < 70 * S && y < topY - 10 * S && y > topY - 240 * S && y > b0.y - 300 * S;
      },
      press: (x, y) => st.drop(x, y),
    };
    st.update = function update(b, dt, t) {
      const T = pet.target;
      const s = pet.style;
      const S = w.scale;
      const p = w.pointer;
      this.pt += dt;
      s.fps = this.falling || this.loose.length || Math.abs(this.swayV) > 0.02 ? 60 : 30;
      s.gaze = 'none';
      s.breathDepth = 0.6;
      w.play.handler = this.handler;
      w.play.cursor = p.inside && !this.ending ? { kind: 'orange', anchor: 'pointer', key: 'orange' } : null;
      if (!this.ending && (b.userAway || w.time - this.lastActive > IDLE_END + 1 || t > MAX_TIME)) this.ending = 'bored';
      // 正往下掉的那个（对准了的）：落到顶上就叠上去
      if (this.falling) {
        const f = this.falling;
        const top = this.topAt();
        f.vy += 1400 * dt;
        f.y += f.vy * dt;
        f.rot += dt * 2;
        if (f.y >= top.y - R) {
          const off = clamp(f.x - top.x, -6, 6);
          this.stack.push({ dx: off * 0.5, rot: f.rot });
          this.swayV += off * 0.012 + rand(-0.08, 0.08) * (1 + this.stack.length / 4);
          this.falling = null;
          pet.squashSpring.kick(0.35);
          this.blink = 0.2;
          const n = this.stack.length;
          if (n === 3 || n === 5 || n === 7 || n === 9) b.say('stackCount', 2, { n });
        }
      }
      // 一摞橘子在头上晃：越高越不稳
      const n = this.stack.length;
      this.swayV += (-26 * this.sway - (1.2 + 0.1 * n) * this.swayV) * dt;
      if (n >= 3) this.swayV += Math.sin(w.time * 2.3) * 0.02 * n * dt;
      this.sway += this.swayV * dt;
      if (n > 0 && (n >= this.limit || Math.abs(this.sway) * n > 0.85)) this.topple(b);
      if (this.ending && n > 0 && !this.falling && !this.tipped) {
        this.tipped = true; // 收工：歪一歪脑袋，让它们滚下去
        this.swayV += 0.5;
      }
      // 没对准的、倒下来的：掉到地上弹一下，越滚越慢，然后淡掉
      for (const o of this.loose) {
        o.vy += 1400 * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.y > -R) {
          o.y = -R;
          if (!o.bounced && o.vy > 120) {
            o.vy = -o.vy * 0.35;
            o.bounced = true;
          } else {
            o.vy = 0;
          }
          o.vx *= Math.pow(0.4, dt);
        }
        o.rot += (o.vx / R) * dt;
        o.life -= dt;
      }
      this.loose = this.loose.filter((o) => o.life > 0).slice(-12);
      pet.playProp = {
        kind: 'oranges',
        hideHat: true, // 帽子上放不了橘子：玩的时候先把帽子摘了
        stack: this.stack.slice(),
        sway: this.sway,
        falling: this.falling ? { x: this.falling.x, y: this.falling.y, rot: this.falling.rot } : null,
        loose: this.loose.map((o) => ({ x: o.x, y: o.y, rot: o.rot, a: clamp(o.life / 0.5, 0, 1) })),
      };
      // 它自己：一动不动，眯着眼；有橘子掉下来时往上瞄一眼
      T.crouch = 1;
      T.eyes = 'open';
      this.blink -= dt;
      const up = !!this.falling;
      T.eyeL = T.eyeR = this.blink > 0 ? 0.05 : up ? 0.7 : 0.45;
      T.lookY = up ? -0.7 : 0;
      T.blush = 0.6;
      T.headTilt += -this.sway * 0.3;
      if (this.phase === 'start') {
        if (this.pt > 0.3) once(this, b, 'stackStart', 0.8);
        if (this.pt > 0.6) this.next('play');
        return false;
      }
      if (this.ending && !this.stack.length && !this.falling && !this.loose.length) {
        return wrapUp(b, this, dt, { happy: true, line: 'stackEnd' });
      }
      return false;
    };
    st.exit = function exit(b) {
      b.world.play.clear();
      pet.playProp = null;
    };
    return st;
  },

  // ============================================================ 兔子：跳栏杆

  hurdles: (b) => {
    const pet = b.pet;
    const w = b.world;
    const st = {
      phase: 'setup',
      pt: 0,
      hurdles: [],
      dir: 1,
      jumps: 0,
      drag: null,
      h: null, // 正要跳的那个栏杆
      big: false,
      knock: false,
      lastActive: w.time,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 鼠标停在哪个栏杆上 */
      hurdleAt(x, y) {
        const S = w.scale;
        return this.hurdles.find((h) => {
          const H = h.fallen ? 8 : HURDLE_HEIGHT[h.level];
          const half = h.fallen ? 30 : 24;
          return Math.abs(x - h.x) < half * S && y > w.groundY - (H + 12) * S && y < w.groundY + 6 * S;
        }) || null;
      },
    };
    st.handler = {
      hit: (x, y) => {
        const h = st.phase === 'setup' ? null : st.hurdleAt(x, y);
        // 鼠标停在上面的那个亮一点
        for (const o of st.hurdles) {
          const hot = o === h;
          if (o.hot !== hot) {
            o.hot = hot;
            w.play.changed();
          }
        }
        return !!h;
      },
      press: (x, y) => {
        const h = st.hurdleAt(x, y);
        st.drag = h ? { h, x0: h.x, px: x } : null;
      },
      drag: (x) => {
        if (!st.drag) return;
        const S = w.scale;
        st.drag.h.x = clamp(st.drag.x0 + (x - st.drag.px), w.area.left + 26 * S, w.area.right - 26 * S);
        st.lastActive = w.time;
        w.play.changed();
      },
      release: (vx, vy, dragged) => {
        const d = st.drag;
        st.drag = null;
        if (!d || dragged) return;
        // 点一下：倒了的扶起来；立着的变高一档（最高三档，再点回到最矮）
        const h = d.h;
        if (h.fallen) h.fallen = 0;
        else {
          h.level = (h.level % 3) + 1;
          h.okTall = false;
        }
        st.lastActive = w.time;
        w.play.changed();
      },
    };
    st.update = function update(b, dt, t) {
      const T = pet.target;
      const s = pet.style;
      const S = w.scale;
      const p = w.pointer;
      this.pt += dt;
      s.fps = 60;
      s.gaze = 'none';
      w.play.handler = this.handler;
      const [lo, hi] = pet.spanX(34, 14);
      if (!this.ending) {
        if (b.userAway || t > MAX_TIME || this.jumps >= 14) this.ending = this.jumps >= 14 ? 'tired' : 'bored';
        else if (this.jumps >= 6 && w.time - this.lastActive > 30) this.ending = 'tired';
      }
      const midJump = this.phase === 'jump';
      if (this.ending && !midJump) {
        if (this.hurdles.length) {
          // 收起栏杆："啵"
          for (const h of this.hurdles) for (let i = 0; i < 5; i++) pet.fx.spawn('puff', { x: (h.x - pet.x) / S + rand(-14, 14), y: -rand(4, 26), vx: rand(-30, 30), vy: -rand(10, 30), life: 0.5, size: rand(0.8, 1.1) });
          this.hurdles = [];
          w.play.ground = this.hurdles;
          w.play.changed();
        }
        lookAt(pet, p.x, p.y);
        return wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : 'hurdleEnd' });
      }
      switch (this.phase) {
        case 'setup': {
          if (this.pt - dt <= 0) {
            // 在它两边各摆一个小栏杆（地方不够就摆在空的那一边）
            const [a0, c0] = pet.spanX(60, 20);
            let a = pet.x - 95 * S;
            let c = pet.x + 95 * S;
            if (a < a0) {
              a = a0;
              c = Math.min(c0, a + 190 * S);
            }
            if (c > c0) {
              c = c0;
              a = Math.max(a0, c - 190 * S);
            }
            const xs = c - a >= 100 * S ? [a, c] : [(a + c) / 2];
            this.hurdles = xs.map((x) => ({ kind: 'hurdle', x, level: 1, fallen: 0, hot: false, okTall: false }));
            w.play.ground = this.hurdles;
            w.play.changed();
            for (const h of this.hurdles) for (let i = 0; i < 6; i++) pet.fx.spawn('puff', { x: (h.x - pet.x) / S + rand(-14, 14), y: -rand(4, 24), vx: rand(-30, 30), vy: -rand(10, 30), life: 0.5, size: rand(0.8, 1.1) });
            this.dir = hi - pet.x >= pet.x - lo ? 1 : -1;
          }
          T.eyes = 'wide';
          T.earDroop = -0.2;
          lookAt(pet, this.hurdles.length ? this.hurdles[0].x : pet.x, w.groundY - 20 * S);
          if (this.pt > 0.3) once(this, b, 'hurdleStart', 0.8);
          if (this.pt > 0.8) this.next('run');
          return false;
        }
        case 'run': {
          if (!this.hurdles.length) return true;
          const xs = this.hurdles.map((h) => h.x);
          const L = clamp(Math.min(...xs) - 70 * S, lo, hi);
          const R = clamp(Math.max(...xs) + 70 * S, lo, hi);
          const end = this.dir > 0 ? R : L;
          // 前面最近的、还立着的栏杆：快到了就跳
          let ahead = null;
          for (const h of this.hurdles) {
            if (h.fallen || (h.x - pet.x) * this.dir <= 4 * S) continue;
            if (!ahead || Math.abs(h.x - pet.x) < Math.abs(ahead.x - pet.x)) ahead = h;
          }
          if (ahead && Math.abs(ahead.x - pet.x) < 46 * S) {
            this.h = ahead;
            this.big = false;
            this.knock = false;
            this.next(ahead.level >= 3 && !ahead.okTall ? 'hesitate' : 'jump');
            return false;
          }
          if (locomote(b, this, dt, end, GAITS.trot, 1)) {
            this.dir = -this.dir; // 跑到头了：掉头接着跳
            this.next('turn');
          }
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.3;
          return false;
        }
        case 'turn':
          T.facing = this.dir * 0.4;
          lookAt(pet, p.x, p.y);
          if (this.pt > 0.3) this.next('run');
          return false;
        case 'hesitate': {
          // 这个有点高……先停下来看看栏杆，再看看你
          const h = this.h;
          T.crouch = 0.4;
          T.facing = this.dir * 0.6;
          T.eyes = 'wide';
          if (this.pt < 0.6) lookAt(pet, h.x, w.groundY - 30 * S);
          else lookAt(pet, p.x, p.y);
          if (this.pt - dt <= 0) pet.fx.spawn('question', { x: this.dir * 24, y: pet.headTop() + 2, life: 1 });
          if (this.pt > 0.5) once(this, b, 'hurdleTall', 0.6);
          if (this.pt > 1.3) {
            h.okTall = true;
            this.big = true;
            this.knock = chance(0.3);
            this.next('jump');
          }
          return false;
        }
        case 'jump': {
          // 跳过去：一跳的距离从栏杆这边到那边，越高跳得越久；最高那档使劲一跳，在空中扭一下（偶尔把它撞倒）
          const h = this.h;
          const H = HURDLE_HEIGHT[h.level] + (this.big ? 34 : 16);
          const D = (this.big ? 0.7 : 0.48) + h.level * 0.04;
          if (this.pt - dt <= 0) {
            this.x0 = pet.x;
            this.x1 = clamp(h.x + this.dir * 40 * S, lo, hi);
            pet.squashSpring.kick(-0.6);
          }
          const u = clamp(this.pt / D, 0, 1);
          pet.x = lerp(this.x0, this.x1, u);
          T.facing = this.dir;
          T.lift = (this.knock ? H * 0.55 : H) * 4 * u * (1 - u);
          T.footLY = T.footRY = 4 * bell(u);
          T.footLX = T.footRX = -this.dir * 4 * bell(u);
          T.armL = T.armR = 0.5;
          T.earDroop = 0.25 * bell(u);
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.5;
          if (this.big && !this.knock) T.roll = 0.35 * Math.sin(u * TAU) * this.dir;
          if (this.knock && u > 0.42 && !h.fallen) {
            h.fallen = this.dir; // 撞倒了
            w.play.changed();
            pet.fx.spawn('bang', { x: this.dir * 20, y: pet.headTop() + 2, life: 0.5 });
          }
          if (u >= 1) {
            pet.squashSpring.kick(this.big ? 1.4 : 0.9);
            pet.fx.spawn('dust', { x: -this.dir * 14, y: -3, vx: -this.dir * 30, vy: -6, life: 0.4 });
            this.jumps += 1;
            if (this.knock) this.next('oops');
            else if (this.big || this.jumps % 4 === 0) this.next('cheer');
            else this.next('run');
          }
          return false;
        }
        case 'oops':
          // 撞倒了：一屁股坐下，不好意思
          T.crouch = 1;
          T.eyes = this.pt < 0.4 ? 'squeeze' : 'happy';
          T.mouth = 'wavy';
          T.blush = 1;
          T.earDroop = 0.3;
          if (this.pt > 0.3) once(this, b, 'hurdleOops', 0.8);
          if (this.pt > 1.4) {
            if (this.saidKeys) this.saidKeys.hurdleOops = false; // 下次撞倒还可以再说
            this.next('run');
          }
          return false;
        case 'cheer':
        default:
          // 开心地蹦一下
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.6;
          T.blush = 0.9;
          T.lift = 12 * 4 * clamp(this.pt / 0.35, 0, 1) * (1 - clamp(this.pt / 0.35, 0, 1));
          if (this.pt - dt <= 0) sparks(pet, 3);
          if (this.pt > 0.6) this.next('run');
          return false;
      }
    };
    st.exit = function exit(b) {
      b.world.play.clear();
    };
    return st;
  },

  // ============================================================ 企鹅：抛小鱼

  fishToss: (b) => {
    const pet = b.pet;
    const w = b.world;
    const FULL = 6; // 吃几条就饱了
    return {
      phase: 'start',
      pt: 0,
      caught: 0,
      eaten: 0,
      combo: 0,
      waitT: 0,
      lastActive: w.time,
      ending: null,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      stop() {
        if (!this.ending) this.ending = 'stop';
      },
      /** 一条新的小鱼"啪"地蹦到你鼠标底下的地上（鼠标不在屏幕上就蹦到它跟前），等你扔 */
      newFish() {
        const toy = w.toy;
        const S = w.scale;
        const p = w.pointer;
        const [lo, hi] = pet.spanX(40, 20);
        const x = p.inside ? clamp(p.x, w.area.left + 24 * S, w.area.right - 24 * S) : clamp(pet.x + 60 * S, lo, hi);
        toy.spawn('fish', x, w.groundY, { vy: -260 * S, alpha: 0 });
        toy.clickable = true;
        this.waitT = 0;
      },
      update(b, dt, t) {
        const T = pet.target;
        const s = pet.style;
        const S = w.scale;
        const p = w.pointer;
        const toy = w.toy;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        const fishOut = toy.active && toy.kind === 'fish';
        if (!this.ending && (b.userAway || t > MAX_TIME)) this.ending = 'bored';
        if (this.ending && (this.phase === 'wait' || this.phase === 'start')) {
          if (fishOut) toy.fadeOut(0.4);
          lookAt(pet, p.x, p.y);
          return wrapUp(b, this, dt, { happy: this.ending !== 'bored', line: this.ending === 'bored' ? 'playBored' : null });
        }
        const flap = Math.sin(this.pt * 26);
        switch (this.phase) {
          case 'start':
            T.eyes = 'wide';
            T.armL = T.armR = 0.9 + flap * 0.3;
            lookAt(pet, p.x, p.y);
            if (this.pt > 0.2) once(this, b, 'fishStart', 0.8);
            if (this.pt > 0.5) {
              this.newFish();
              this.next('wait');
            }
            return false;
          case 'wait': {
            // 拍着小翅膀，盯着小鱼：快扔呀！
            if (!fishOut) {
              this.newFish();
              return false;
            }
            this.waitT += dt;
            lookAt(pet, toy.x, toy.y - toy.r * S);
            T.facing = sign(toy.x - pet.x) * 0.4;
            T.eyes = toy.userHeld ? 'wide' : 'happy';
            T.mouth = 'o';
            T.mouthOpen = 0.4;
            T.armL = T.armR = (toy.userHeld ? 1.1 : 0.7) + flap * (toy.userHeld ? 0.45 : 0.2);
            const hop = this.pt % 1.4;
            if (hop < 0.3) T.lift += bell(hop / 0.3) * (toy.userHeld ? 8 : 4);
            if (toy.userHeld) this.waitT = Math.min(this.waitT, 3);
            if (toy.thrown) {
              toy.thrown = false;
              this.lastActive = w.time;
              this.next('track');
            } else if (toy.clicked) {
              // 只点了一下：它替你往上抛，朝它自己这边落下来
              toy.clicked = false;
              toy.clickable = false;
              const FLY = 0.9;
              toy.push(((pet.x - toy.x) / FLY) * 1.06, -0.5 * GRAVITY * 0.8 * S * FLY + 60 * S);
              this.lastActive = w.time;
              this.next('track');
            } else if (this.waitT > 15) {
              // 一直不扔：那我自己去吃了
              this.ending = 'bored';
              toy.clickable = false;
              this.next('walkToFish');
            }
            return false;
          }
          case 'track': {
            // 跑到鱼要掉下来的地方，仰着头，嘴张得大大的
            if (!fishOut) {
              this.next('wait');
              return false;
            }
            const m = mouthPoint(pet);
            const beak = toWorld(pet, m.x, m.y);
            const pred = predictFish(toy, w, beak.y);
            const [lo, hi] = pet.spanX(34, 14);
            const gx = clamp(pred.x - m.x * S, lo, hi);
            if (Math.abs(gx - pet.x) > 4 * S) locomote(b, this, dt, gx, Math.abs(gx - pet.x) > 120 * S ? GAITS.run : GAITS.trot, 1.2);
            s.gaze = 'none';
            const fy = toy.y - toy.r * S;
            lookAt(pet, toy.x, fy);
            const coming = toy.vy > 0 && Math.hypot(toy.x - beak.x, fy - beak.y) < 170 * S;
            T.mouth = coming ? 'yawn' : 'o';
            T.mouthOpen = coming ? 1 : 0.5;
            T.eyes = 'wide';
            T.armL = T.armR = 0.6 + flap * 0.25;
            if (toy.vy > 0 && Math.hypot(toy.x - beak.x, fy - beak.y) < 30 * S) {
              toy.clear(); // 啊呜！
              this.combo += 1;
              this.caught += 1;
              this.next('gulp');
            } else if (toy.resting) {
              this.combo = 0;
              this.next('walkToFish'); // 没接住：鱼掉在地上了
            }
            return false;
          }
          case 'gulp': {
            // 一口吞下去，开心地拍翅膀
            T.mouth = 'cat';
            T.eyes = this.pt < 0.3 ? 'squeeze' : 'happy';
            T.blush = 1;
            T.headY += 2.5 * bell(this.pt / 0.35);
            T.armL = T.armR = 0.9 + flap * 0.4;
            if (this.pt - dt <= 0) {
              pet.squashSpring.kick(1.1);
              sparks(pet, 3);
              if (this.combo >= 3) b.say('fishCombo', 1.8, { n: this.combo });
              else if (this.caught === 1 || chance(0.35)) b.say('fishCatch', 1.6);
            }
            if (this.pt > 0.9) this.next(this.caught + this.eaten >= FULL ? 'full' : 'wait');
            return false;
          }
          case 'walkToFish': {
            if (!fishOut) {
              this.next('wait');
              return false;
            }
            const d = sign(toy.x - pet.x) || 1;
            if (locomote(b, this, dt, toy.x - d * 14 * S, GAITS.walk, 1) || Math.abs(toy.x - pet.x) < 18 * S) this.next('eatGround');
            s.gaze = 'none';
            lookAt(pet, toy.x, toy.y);
            return false;
          }
          case 'eatGround': {
            // 低头把地上的鱼吃掉
            T.headY += 6;
            T.lookY = 0.95;
            T.mouth = this.pt < 0.5 ? 'o' : 'cat';
            T.mouthOpen = 0.8;
            if (this.pt > 0.5 && fishOut) {
              toy.clear();
              this.eaten += 1;
              pet.squashSpring.kick(0.6);
              if (chance(0.4)) b.say('fishMiss', 1.8);
            }
            if (this.pt > 1) {
              if (this.ending) return true;
              this.next(this.caught + this.eaten >= FULL ? 'full' : 'wait');
            }
            return false;
          }
          case 'full':
          default:
            // 吃饱了：拍拍肚子
            T.armL = T.armR = -0.85 + Math.sin(this.pt * 9) * 0.14;
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.45;
            T.blush = 1;
            if (this.pt - dt <= 0) {
              hearts(pet, 2);
              b.reward({ mood: 0.08 });
              b.say('fishFull', 2.2);
            }
            return this.pt > 1.8;
        }
      },
      exit(b) {
        const toy = b.world.toy;
        if (toy && toy.kind === 'fish') toy.fadeOut(0.4);
        b.world.play.clear();
      },
    };
  },
};

/** 这些小游戏正在玩的时候：你摸它不算"摸头"（不会打断），菜单那一项变成"不玩了" */
export const PLAYING = new Set(Object.keys(PLAYS));
