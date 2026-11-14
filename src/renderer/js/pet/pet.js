// 宠物本体：位置、姿势、物理（被拎起、下落、落地），以及那些"不由大脑决定"的小动作
// （呼吸、眨眼、抖耳朵、摇尾巴、眼睛看哪里）。
//
// 每一帧的流程：
//   pet.begin(dt)      清空目标姿势
//   大脑 / 当前动作     写入目标姿势（"我现在想这样站"）
//   pet.finish(dt)     物理 → 小动作 → 平滑 → 得到最终姿势
//   pet.draw(ctx)      画出来

import { TAU, clamp, damp, Spring, rand, chance, wobble, bell, sign, random, pickWeighted } from '../util/math.js';
import { makePose, resetPose, POSE_KEYS, HALF_LIFE } from './pose.js';
import { drawPet, hitTest, getGeometry, RIG } from './draw.js';
import { Fx, CONFETTI_COLORS } from './fx.js';
import { OUTFITS, OUTFIT_SLOTS } from './outfits.js';

const GRAVITY = 2400; // 像素/秒²（按宠物大小缩放）

export class Pet {
  constructor(species, world) {
    this.sp = species;
    this.world = world;

    this.pose = makePose(); // 平滑后的姿势
    this.target = makePose(); // 这一帧想摆成的姿势
    this.out = makePose(); // 最终画出来的姿势（再叠加眨眼、抖耳朵、落地回弹）

    // 位置 = 两脚中间踩着的那个点
    this.x = (world.area.left + world.area.right) / 2;
    this.y = world.groundY;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0; // 整个身体的旋转（被拎着晃、下落翻滚、扒在墙上往墙那边靠）
    this.vrot = 0;
    this.mode = 'ground'; // ground 在地上 | held 被拎着 | air 在空中 | wall 扒在墙上（位置由爬墙动作控制）
    this.pivot = { x: 0, y: -70 }; // 被抓住的是身体的哪个点
    this.shake = 0; // 被摇晃的剧烈程度（太大就会晕）
    this.bounced = false;
    this.leapt = false; // 这次在空中是它自己跳下来的（从墙上跳）：稳稳落地，不会摔晕
    this.unbounded = false; // true 时允许走到活动范围外面（进场时用）
    this.onLand = null; // 落地时通知大脑

    this.squashSpring = new Spring(260, 14); // 落地时"压扁再弹回"
    this.fx = new Fx();
    this.time = 0;
    this.seed = random() * 1000; // 每只宠物的小晃动节奏都不一样

    // 每一帧都会被重置、再由动作修改的"风格"
    this.style = {
      gaze: 'auto', // auto 自己决定 | cursor 盯着鼠标 | forward 看前进方向 | none 动作自己控制
      tailSpeed: 1.1,
      tailAmp: 0.45,
      breathPeriod: 3.4,
      breathDepth: 1,
      blink: true,
      fps: 30, // 这个动作需要多流畅
      carryLift: 0, // 手里的信举多高：0 抱在胸前 … 1 举过头顶
      sheetLift: 0, // 万圣节的白布撩起来多少：0 盖着 … 1 撩到头顶
      tilt: 0, // 整个身体想歪多少（弧度，正数往右歪）：扒在墙上时往墙那边靠一点
    };

    this.carry = false; // 手里有没有一封等你拆的信
    this.carryGold = false; // 没拆的信里有月报或年度回顾：拿的是金色信封
    this.carryLift = 0;

    this.look = null; // 节日装扮（见 looks.js）；null = 平常的样子
    this.outfit = null; // 穿着的衣服 { hat, glasses, top, bag, held }（衣服编号，见 outfits.js）；null = 什么都没穿
    this.sheetLift = 0;
    this.lookFxClock = 0;

    this.sleepy = 0; // 0…1：越困眼皮越重、眨眼越慢
    this.blink = { wait: rand(1, 3), t: -1, dur: 0.16, again: false };
    this.ear = { wait: rand(3, 8), t: -1, side: 1, again: false };
    this.breath = { phase: rand(0, TAU) };
    this.gaze = { kind: 'front', x: 0, y: 0, wait: rand(0.5, 2) };
  }

  setSpecies(species) {
    this.sp = species;
  }

  /** 换上（或脱下）节日装扮 */
  setLook(look) {
    this.look = look || null;
    this.lookFxClock = 0;
  }

  /**
   * 换衣服。outfit：{ hat, glasses, top, bag, held }，每项是衣服编号或 null。
   * 返回 true = 真的换了（和原来不一样）。只在真的换了的时候才换成新对象，画面靠这个知道要重画。
   */
  setOutfit(outfit) {
    const next = {};
    for (const slot of OUTFIT_SLOTS) next[slot] = (outfit && OUTFITS[outfit[slot]] && OUTFITS[outfit[slot]].slot === slot) ? outfit[slot] : null;
    const empty = OUTFIT_SLOTS.every((slot) => !next[slot]);
    const before = JSON.stringify(this.outfit || {});
    const after = JSON.stringify(empty ? {} : next);
    if (before === after) return false;
    this.outfit = empty ? null : next;
    return true;
  }

  /** 手里有没有拿着衣柜里的东西（奶茶、小鱼……）。过节拿着灯笼时，节日的优先 */
  get holdsOutfitItem() {
    return !!(this.outfit && this.outfit.held && !(this.look && this.look.held));
  }

  /** 头顶（含耳朵）在宠物坐标里的 y，特效用它来决定从哪里冒出来 */
  headTop() {
    const g = getGeometry(this.sp, this.pose);
    return g.headCy - this.sp.head.ry - this.sp.earReach - this.pose.lift;
  }

  // ---------------------------------------------------------------- 每帧

  begin(dt) {
    this.time += dt;
    resetPose(this.target);
    const s = this.style;
    s.gaze = 'auto';
    s.tailSpeed = 1.1;
    s.tailAmp = 0.45;
    s.breathPeriod = 3.4;
    s.breathDepth = 1;
    s.blink = true;
    s.fps = 30;
    s.carryLift = 0;
    s.sheetLift = 0;
    s.tilt = 0;
  }

  finish(dt) {
    // 被拎着、在空中时，把一帧拆成几小步来算，这样即使帧率低，摆动和下落也不会算飞
    const steps = this.mode === 'held' || this.mode === 'air' ? Math.max(1, Math.ceil(dt / 0.02)) : 1;
    for (let i = 0; i < steps; i++) this.#physics(dt / steps);
    this.#micro(dt);
    this.carryLift = damp(this.carryLift, this.carry ? this.style.carryLift : 0, 0.07, dt);
    this.sheetLift = damp(this.sheetLift, this.look && this.look.cover ? this.style.sheetLift : 0, 0.09, dt);
    this.#lookFx(dt);

    const P = this.pose;
    const T = this.target;
    for (const k of POSE_KEYS) {
      P[k] = damp(P[k], T[k], HALF_LIFE[k] ?? HALF_LIFE.default, dt);
    }
    P.eyes = T.eyes;
    P.mouth = T.mouth;

    const O = this.out;
    for (const k of POSE_KEYS) O[k] = P[k];
    O.eyes = P.eyes;
    O.mouth = P.mouth;

    O.squash += this.squashSpring.step(0, dt);

    const blink = this.blink.t < 0 ? 1 : 1 - bell(this.blink.t / this.blink.dur);
    O.eyeL *= blink;
    O.eyeR *= blink;

    if (this.ear.t >= 0) {
      const flick = -Math.sin((this.ear.t / 0.2) * Math.PI) * 0.42;
      if (this.ear.side < 0) O.earL += flick;
      else O.earR -= flick;
    }

    this.fx.update(dt);
  }

  /**
   * 节日装扮带的特效：圣诞节飘雪、新年和生日偶尔撒一把彩带、仙女棒冒火星。
   * 这些是"背景特效"（ambient），画面那边会用比较低的频率重画它们，免得过节那天特别费电。
   */
  #lookFx(dt) {
    const type = this.look && this.look.fx;
    if (!type || this.mode !== 'ground') return;
    this.lookFxClock -= dt;
    if (this.lookFxClock > 0) return;
    const top = this.headTop();
    if (type === 'snow') {
      this.lookFxClock = rand(0.6, 1.1);
      this.fx.spawn('snow', { ambient: true, x: rand(-120, 120), y: top - rand(10, 60), vy: rand(14, 22), life: rand(5, 7), size: rand(0.7, 1.15), rot: rand(0, 3), vrot: rand(-0.6, 0.6), phase: rand(0, 6) });
    } else if (type === 'confetti') {
      this.lookFxClock = rand(4, 7);
      for (let i = 0; i < 9; i++) {
        this.fx.spawn('confetti', { ambient: true, x: rand(-30, 30), y: top + 8, vx: rand(-70, 70), vy: -rand(60, 110), ay: 140, life: rand(1.6, 2.3), size: rand(0.8, 1.2), rot: rand(0, 3), vrot: rand(-6, 6), phase: rand(0, 6), color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] });
      }
    } else if (type === 'sparks' && !this.carry) {
      this.lookFxClock = rand(0.3, 0.5);
      const g = getGeometry(this.sp, this.pose);
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        this.fx.spawn('spark', { ambient: true, x: g.torsoCx + 14, y: g.torsoCy - 29, vx: Math.cos(a) * rand(25, 45), vy: Math.sin(a) * rand(25, 45) - 10, ay: 40, life: rand(0.35, 0.6), size: rand(0.35, 0.55), vrot: 4 });
      }
    }
  }

  /** 这一帧之后还有没有东西在动（决定要不要保持高帧率） */
  get busy() {
    return (
      this.mode === 'held' ||
      this.mode === 'air' || // 扒在墙上不算：爬的时候动作自己会要求流畅，挂着不动时不用那么勤快
      Math.abs(this.rot - this.style.tilt) > 0.01 ||
      Math.abs(this.vx) > 1 ||
      Math.abs(this.squashSpring.x) > 0.004 ||
      Math.abs(this.squashSpring.v) > 0.05
    );
  }

  // ---------------------------------------------------------------- 小动作

  #micro(dt) {
    const T = this.target;
    const s = this.style;
    const t = this.time;

    // 呼吸：周期本身也在慢慢变化，所以不会像节拍器一样死板
    this.breath.phase += (dt * TAU) / (s.breathPeriod * (1 + 0.08 * wobble(t * 0.13, this.seed)));
    const b = Math.sin(this.breath.phase);
    T.squash += b * 0.012 * s.breathDepth;
    T.headY += b * 0.7 * s.breathDepth;

    // 站着也会有极轻微的晃动
    T.lean += wobble(t * 0.45, this.seed + 1) * 0.006;
    T.headTilt += wobble(t * 0.33, this.seed + 2) * 0.018;

    // 尾巴
    T.tail += wobble(t * s.tailSpeed, this.seed + 3) * s.tailAmp;
    if (Math.abs(T.facing) > 0.3) T.tailSide = -sign(T.facing);
    else T.tailSide = this.pose.tailSide >= 0 ? 1 : -1;

    // 手里有信（或者节日的灯笼、月饼，衣柜里的奶茶、小鱼……）、而这个动作又没用到手：两只手抱在胸前
    const holding = this.carry || (this.look && this.look.held) || this.holdsOutfitItem;
    if (holding && this.mode === 'ground' && T.armL === 0 && T.armR === 0 && T.loaf < 0.5) {
      T.armL = -0.75;
      T.armR = -0.75;
    }

    // 困的时候眼皮下垂
    if (this.sleepy > 0.05 && T.eyes === 'open') {
      T.eyeL *= 1 - this.sleepy * 0.45;
      T.eyeR *= 1 - this.sleepy * 0.45;
    }

    this.#gaze(dt);

    // 眨眼
    const bl = this.blink;
    if (bl.t >= 0) {
      bl.t += dt;
      if (bl.t >= bl.dur) {
        bl.t = -1;
        if (bl.again) {
          bl.again = false;
          bl.wait = 0.1; // 偶尔连眨两下
        } else {
          bl.wait = rand(2.2, 6.5) * (1 + this.sleepy);
        }
      }
    } else if (s.blink) {
      bl.wait -= dt;
      if (bl.wait <= 0) {
        bl.t = 0;
        bl.dur = 0.15 + this.sleepy * 0.2;
        bl.again = chance(0.18);
      }
    }

    // 抖耳朵
    const ear = this.ear;
    if (ear.t >= 0) {
      ear.t += dt;
      if (ear.t >= 0.2) {
        ear.t = -1;
        if (ear.again) {
          ear.again = false;
          ear.wait = 0.08;
        } else {
          ear.wait = rand(4, 14);
        }
      }
    } else {
      ear.wait -= dt;
      if (ear.wait <= 0) {
        ear.t = 0;
        ear.side = chance(0.5) ? 1 : -1;
        ear.again = chance(0.3);
      }
    }
  }

  /** 决定眼睛（和头）看向哪里 */
  #gaze(dt) {
    const T = this.target;
    const s = this.style;
    const w = this.world;
    const g = this.gaze;
    const p = w.pointer;
    const S = w.scale;
    if (s.gaze === 'none') return;
    if (s.gaze === 'forward') {
      T.lookX += sign(T.facing) * 0.25;
      return;
    }

    let kind = s.gaze;
    if (kind === 'auto') {
      g.wait -= dt;
      // 鼠标凑得很近：立刻看过去
      const near = p.inside && Math.hypot(p.x - this.x, p.y - (this.y - 70 * S)) < 170 * S;
      if (near && g.kind !== 'cursor') {
        g.kind = 'cursor';
        g.wait = rand(1.5, 3);
      }
      if (g.wait <= 0) {
        const movedRecently = p.inside && w.time - p.lastMoveAt < 1.5;
        g.kind = pickWeighted([
          { item: 'cursor', weight: p.inside ? (movedRecently ? 3.2 : 0.7) : 0 },
          { item: 'front', weight: 1.6 }, // 看着屏幕外的你
          { item: 'point', weight: 1.3 }, // 随便看看周围
        ]);
        g.wait = g.kind === 'cursor' ? rand(1.5, 4.5) : rand(1, 3.2);
        if (g.kind === 'point') {
          g.x = this.x + rand(-420, 420) * S;
          g.y = this.y - rand(-10, 260) * S;
        }
      }
      kind = g.kind;
    }

    let px;
    let py;
    if (kind === 'cursor') {
      if (!p.inside) return;
      px = p.x;
      py = p.y;
    } else if (kind === 'point') {
      px = g.x;
      py = g.y;
    } else {
      return; // front：正视前方
    }
    const dx = px - this.x;
    const dy = py - (this.y - 76 * S);
    const k = 1.25 / (Math.hypot(dx, dy) + 110 * S);
    T.lookX += clamp(dx * k, -1, 1);
    T.lookY += clamp(dy * k, -1, 1);
  }

  // ---------------------------------------------------------------- 物理

  /** 抓起来。localX/localY 是鼠标点在宠物身上的位置（宠物坐标）。 */
  grab(localX, localY) {
    this.mode = 'held';
    this.pivot.x = clamp(localX, -30, 30);
    this.pivot.y = clamp(localY, -112, -20);
    this.shake = 0;
    this.vx = 0;
    this.vy = 0;
    this.bounced = false;
    this.leapt = false;
  }

  /** 松手。vx/vy 是松手瞬间鼠标的速度，所以可以把它"扔"出去。 */
  release(vx, vy) {
    if (this.mode !== 'held') return;
    const S = this.world.scale;
    const max = 1700 * S;
    const speed = Math.hypot(vx, vy);
    const k = speed > max ? max / speed : 1;
    this.vx = vx * k;
    this.vy = vy * k;
    this.mode = 'air';
    this.bounced = false;
  }

  /** 头顶最高能到哪里（脚的位置）：活动范围的上沿再往下一个身高 */
  ceilingY() {
    const w = this.world;
    return Math.min(w.area.top + 124 * w.scale, w.groundY - 10 * w.scale);
  }

  #physics(dt) {
    const w = this.world;
    const A = w.area; // 活动范围（没设置时就是整个屏幕）
    const S = w.scale;
    const p = w.pointer;
    const minX = A.left + 34 * S;
    const maxX = Math.max(minX, A.right - 34 * S);

    if (this.mode === 'held') {
      // 身体像钟摆一样挂在鼠标上：鼠标往右加速，身体就往左甩
      // 轻轻拎着走不会晕；用力来回甩一两秒，shake 才会涨到 1（晕）
      this.shake = Math.max(0, this.shake - dt * 0.6) + (Math.abs(p.ax) * dt) / (6000 * S);
      this.vrot += (-42 * this.rot - 4.5 * this.vrot + (p.ax / S) * 0.006) * dt;
      this.rot += this.vrot * dt;
      if (Math.abs(this.rot) > 1.2) {
        this.rot = clamp(this.rot, -1.2, 1.2);
        this.vrot *= -0.3;
      }
      const cos = Math.cos(this.rot);
      const sin = Math.sin(this.rot);
      const px = this.pivot.x * S;
      const py = this.pivot.y * S;
      // 拎着它往活动范围外面拖：它会停在边上，出不去
      const tx = clamp(p.x, A.left, A.right);
      const ty = clamp(p.y, A.top, A.bottom);
      const nx = tx - (px * cos - py * sin);
      const ny = Math.min(ty - (px * sin + py * cos), w.groundY);
      this.x = damp(this.x, nx, 0.012, dt);
      this.y = damp(this.y, ny, 0.012, dt);
      return;
    }

    if (this.mode === 'air') {
      this.vy += GRAVITY * S * dt;
      this.vx *= Math.pow(0.6, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // 在空中把身体翻正（猫很快，熊猫慢吞吞）
      const k = 8 + 34 * this.sp.righting;
      this.vrot += (-k * this.rot - 7 * this.vrot) * dt;
      this.rot += this.vrot * dt;
      // 撞到左右两边会弹回来
      if (this.x < minX) {
        this.x = minX;
        this.vx = Math.abs(this.vx) * 0.45;
      } else if (this.x > maxX) {
        this.x = maxX;
        this.vx = -Math.abs(this.vx) * 0.45;
      }
      // 撞到活动范围的顶
      const ceiling = this.ceilingY();
      if (this.y < ceiling && this.vy < 0) {
        this.y = ceiling;
        this.vy = Math.abs(this.vy) * 0.3;
      }
      // 落地
      if (this.y >= w.groundY) {
        const impact = this.vy;
        this.y = w.groundY;
        if (impact > 950 * S && !this.bounced && !this.leapt) {
          // 摔得重：先弹起来一下
          this.bounced = true;
          this.vy = -impact * 0.24;
          this.squashSpring.kick(clamp(impact / (260 * S), 1.5, 7));
          this.#dust();
        } else {
          const leapt = this.leapt;
          this.mode = 'ground';
          this.vy = 0;
          // 自己跳下来的：膝盖一弯就站稳了，压扁得没那么厉害
          this.squashSpring.kick(leapt ? clamp(impact / (330 * S), 0.8, 4) : clamp(impact / (200 * S), 0.8, 9));
          if (impact > 500 * S) this.#dust();
          const dizzy = !leapt && (this.bounced || this.shake > 1 || impact > 1500 * S);
          this.bounced = false;
          this.leapt = false;
          if (this.onLand) this.onLand(impact / S, dizzy, leapt);
        }
      }
      return;
    }

    if (this.mode === 'wall') {
      // 扒在墙上：位置由爬墙的动作决定，这里只保证它不爬出活动范围、不钻到地下
      this.vx = 0;
      this.vy = 0;
      this.vrot += (-140 * (this.rot - this.style.tilt) - 16 * this.vrot) * dt;
      this.rot += this.vrot * dt;
      this.y = clamp(this.y, this.ceilingY(), w.groundY);
      return;
    }

    // 在地上
    if (Math.abs(this.vx) > 1) {
      this.x += this.vx * dt; // 落地后滑一小段
      this.vx = damp(this.vx, 0, 0.07, dt);
    } else {
      this.vx = 0;
    }
    this.vrot += (-140 * (this.rot - this.style.tilt) - 16 * this.vrot) * dt;
    this.rot += this.vrot * dt;
    this.shake = Math.max(0, this.shake - dt * 0.5);
    if (!this.unbounded) this.x = clamp(this.x, minX, maxX);
    this.y = w.groundY;
  }

  #dust() {
    for (const s of [-1, 1]) {
      this.fx.spawn('dust', { x: s * 22, y: -3, vx: s * rand(30, 55), vy: -rand(4, 14), life: 0.5, size: rand(0.8, 1.1) });
    }
  }

  // ---------------------------------------------------------------- 鼠标

  /** 把屏幕上的点换算到宠物自己的坐标系 */
  toLocal(px, py) {
    const S = this.world.scale;
    const dx = (px - this.x) / S;
    const dy = (py - this.y) / S;
    const cos = Math.cos(-this.rot);
    const sin = Math.sin(-this.rot);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  /** 屏幕上的这个点有没有落在宠物身上？返回 'head' / 'body' / null */
  hit(px, py) {
    const S = this.world.scale;
    // 活动范围外面的部分是看不见的（比如刚从边上钻进来时），看不见的地方不能点，免得挡住你点下面的东西
    const c = this.world.clip;
    if (c && (px < c.left || px > c.right || py < c.top || py > c.bottom)) return null;
    if (Math.abs(px - this.x) > 150 * S || py < this.y - (200 + this.out.lift) * S || py > this.y + 40 * S) return null;
    const l = this.toLocal(px, py);
    return hitTest(this.sp, this.out, l.x, l.y);
  }

  // ---------------------------------------------------------------- 画

  /** ctx 已经按"屏幕缩放 × 宠物大小"缩放好，原点在小画布的左上角 */
  draw(ctx) {
    ctx.save();
    ctx.translate(RIG.anchorX, RIG.anchorY);
    ctx.save();
    ctx.rotate(this.rot);
    drawPet(ctx, this.sp, this.out, {
      time: this.time,
      shadow: this.mode === 'ground',
      carry: this.carry,
      carryLift: this.carryLift,
      carryGold: this.carryGold,
      look: this.look,
      outfit: this.outfit,
      sheetLift: this.sheetLift,
    });
    ctx.restore();
    this.fx.draw(ctx);
    ctx.restore();
  }
}
