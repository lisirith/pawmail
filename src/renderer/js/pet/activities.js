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

/** 嘴在哪里（宠物坐标）：喂给它的文件飞到这里就算进了嘴 */
function mouthPoint(pet) {
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

// 走路的几种步态。speed 是每秒走多少像素，stride 是一步的长度（脚才不会打滑）
const GAITS = {
  walk: { speed: 46, stride: 15, lift: 4.5, bob: 1.8, lean: 0.03, sway: 0.03, arm: 0.3 },
  trot: { speed: 95, stride: 20, lift: 6, bob: 3.4, lean: 0.08, sway: 0.05, arm: 0.45 },
  run: { speed: 150, stride: 24, lift: 8, bob: 4.5, lean: 0.13, sway: 0.04, arm: 0.6 },
};

/** 朝 tx 走一步，并摆出走路的姿势。走到了返回 true。 */
function locomote(b, st, dt, tx, gait, speedMul = 1) {
  const pet = b.pet;
  const T = pet.target;
  const S = b.world.scale;
  const A = b.world.area;
  // 目的地在活动范围外面（比如你刚把范围改小了）：走到边上就算到了，免得一直顶着边走
  if (!pet.unbounded) tx = clamp(tx, A.left + 34 * S, Math.max(A.left + 34 * S, A.right - 34 * S));
  const dx = tx - pet.x;
  const dir = dx >= 0 ? 1 : -1;
  T.facing = dir;
  pet.style.gaze = 'forward';
  pet.style.fps = 60;
  // 先转过身，再迈步
  if (pet.pose.facing * dir > 0.35) {
    const moved = Math.min(Math.abs(dx), gait.speed * speedMul * S * dt);
    pet.x += dir * moved;
    // 走了多远，腿就摆了多少（记在 walkPhase 里；别和动作自己的 phase 混在一起）
    st.walkPhase = (st.walkPhase || 0) + (moved / (gait.stride * S)) * Math.PI;
  }
  const s = Math.sin(st.walkPhase || 0);
  const c = Math.cos(st.walkPhase || 0);
  T.footLY = Math.max(0, s) * gait.lift;
  T.footRY = Math.max(0, -s) * gait.lift;
  T.footLX = -c * 4 * dir; // 抬起的脚从后往前迈，踩着的脚相对身体往后
  T.footRX = c * 4 * dir;
  T.lift += Math.abs(s) * gait.bob;
  T.lean += dir * gait.lean + s * gait.sway;
  T.armL += -s * gait.arm;
  T.armR += s * gait.arm;
  T.headTilt += -s * 0.025;
  return Math.abs(tx - pet.x) < 0.75;
}

/** 挑一个要走去的地方：离现在 minDist ~ maxDist，且不出活动范围 */
function pickWalkTarget(b, minDist, maxDist) {
  const pet = b.pet;
  const A = b.world.area;
  const S = b.world.scale;
  const lo = A.left + 56 * S;
  const hi = A.right - 56 * S;
  const mid = (A.left + A.right) / 2;
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

const hearts = (pet, n = 1) => {
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

const sparks = (pet, n = 4) => {
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
    return {
      side,
      phase: 'walk',
      pt: 0,
      cyc: 0, // 手脚交替的节奏
      climbed: 0, // 已经离地多高（像素）
      goal: p.goal ?? Math.min(room, Math.max(90 * S, rand(0.35, 1) * Math.min(room, 560 * S))),
      speed: (cat ? 62 : 42) * S, // 熊猫爬得慢吞吞
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
          // 转身面向墙，抬头看看上面，蹲一下，两只手举起来扒住
          const u = clamp(this.pt / 0.55, 0, 1);
          s.fps = 60;
          s.gaze = 'none';
          T.facing = side * 0.85;
          T.lookX = side * 0.3;
          T.lookY = -0.85;
          T.armL = T.armR = 1.8 * easeInOut(u);
          T.crouch = 0.3 * bell(u);
          T.earDroop = -0.15;
          if (u >= 1) {
            pet.mode = 'wall';
            this.next('up');
          }
          return false;
        }

        if (this.phase === 'leap') {
          // 蹬一下墙，往屋里跳
          if (!this.jumped) {
            this.jumped = true;
            pet.mode = 'air';
            pet.leapt = true;
            pet.vx = -side * rand(160, 230) * S;
            pet.vy = -rand(150, 260) * S;
            pet.vrot = -side * 1.2;
          }
          s.fps = 60;
          s.gaze = 'none';
          T.facing = -side * 0.5;
          T.armL = T.armR = 1.5;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.6;
          T.tailCurl = 1;
          T.footLY = T.footRY = 3;
          return this.pt > 6; // 落地时大脑会换成"落地"动作；万一 6 秒还没落地，就不管了
        }

        if (this.phase === 'done') {
          T.armL = T.armR = 0.4;
          return this.pt > 0.35;
        }

        // 下面这几个阶段都扒在墙上
        if (pet.mode !== 'wall') return true; // 被别的事打断了（比如被你拎走了）
        pet.x = this.wallX(w);
        T.footLX = T.footRX = side * 9; // 脚蹬着墙
        T.lean = side * 0.03;
        T.tailCurl = 0; // 尾巴垂下来
        s.tilt = side * 0.08; // 整个身子往墙那边靠一点

        if (this.phase === 'up' || this.phase === 'down') {
          const up = this.phase === 'up';
          s.fps = 60;
          s.gaze = 'none';
          s.tailAmp = 0.2;
          // 一下一下地往上够：两只手轮流往上伸、脚轮流往上蹬；使劲的那一下爬得快，换手时慢
          this.cyc += dt * (cat ? 6 : 4.4);
          const sn = Math.sin(this.cyc);
          const push = 0.2 + 0.8 * Math.abs(sn);
          this.climbed += (up ? 1 : -1.3) * this.speed * push * dt;
          // 靠墙的那只爪子扒在墙上，另一只爪子往上够；两只轮流使劲
          const near = 1.4 + 0.22 * sn;
          const far = 1.95 - 0.3 * sn;
          T.armL = side < 0 ? near : far;
          T.armR = side > 0 ? near : far;
          T.footLY = Math.max(0, -sn) * 7;
          T.footRY = Math.max(0, sn) * 7;
          T.lift += Math.abs(sn) * 1.5;
          T.facing = side * 0.85;
          T.lookX = side * 0.2;
          T.lookY = up ? -0.7 : 0.75; // 往上爬看上面，往下爬看脚下
          T.earDroop = -0.1;
          T.blush = 0.55;
          if (!cat && up) T.mouth = 'wavy'; // 熊猫爬得很吃力
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

        // cling：一只爪子扒着墙，另一只垂下来放松，脚轻轻晃；转过头来东张西望
        s.fps = 30;
        s.gaze = 'none';
        s.tailAmp = 0.7;
        s.tailSpeed = 1.6;
        pet.y = w.groundY - this.climbed;
        const hang = 0.45 + Math.sin(t * 1.7) * 0.12;
        T.armL = side < 0 ? 1.5 : hang;
        T.armR = side > 0 ? 1.5 : hang;
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

  // ------------------------------------------------------------ 被拎起来、掉下去

  /** 被鼠标拎着：四肢垂下来，跟着晃 */
  held: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      pet.style.fps = 60;
      pet.style.gaze = 'none';
      pet.style.tailAmp = 0.25;
      T.armL = 0.95 + wobble(t * 3, 1) * 0.12;
      T.armR = 0.95 + wobble(t * 3, 2) * 0.12;
      T.squash = -0.07;
      T.tailCurl = 0.02;
      T.earDroop = 0.25;
      const swing = clamp(-pet.vrot * 1.6, -5, 5);
      T.footLX = swing;
      T.footRX = swing;
      T.footLY = -1.5;
      T.footRY = -1.5;
      if (pet.shake > 0.75) {
        T.eyes = 'squeeze'; // 被晃得受不了
        T.mouth = 'wavy';
      } else if (t < 0.45) {
        T.eyes = 'wide';
        T.mouth = 'o';
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
    sit: b.pet.sp.id === 'panda' ? 1 : 0, // 熊猫是一屁股坐在地上
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
export const INTERRUPTIBLE = new Set(['idle', 'lookAround', 'sit', 'nap', 'groom', 'walk']);
// 这些是对你的操作做出的反应，进行中不会被摸头、戳一下打断
export const REACTIVE = new Set(['held', 'falling', 'landed', 'dizzy', 'annoyed', 'arrive', 'hungry', 'eat']);
