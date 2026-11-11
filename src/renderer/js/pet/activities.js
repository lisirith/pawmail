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

/** 挑一个要走去的地方：离现在 minDist ~ maxDist，且不出屏幕 */
function pickWalkTarget(b, minDist, maxDist) {
  const pet = b.pet;
  const w = b.world;
  const S = w.scale;
  const lo = 56 * S;
  const hi = w.width - 56 * S;
  if (hi <= lo) return w.width / 2;
  for (let i = 0; i < 6; i++) {
    const tx = pet.x + rand(minDist, maxDist) * S * (chance(0.5) ? 1 : -1);
    if (tx >= lo && tx <= hi) return tx;
  }
  return clamp(pet.x + (pet.x > w.width / 2 ? -1 : 1) * rand(minDist, maxDist) * S, lo, hi);
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
      T.armR = (1.95 + Math.sin(t * 15) * 0.32) * k;
      T.mouth = 'smile';
      T.mouthOpen = 0.45 * k;
      T.headTilt += 0.07 * k;
      if (t > 0.5 && t < 1.3) T.eyes = 'happy';
      return t >= this.dur;
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
          this.tx = clamp(p.x + side * 80 * S, 56 * S, w.width - 56 * S);
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
        const tx = clamp(p.x, 50 * S, w.width - 50 * S);
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
      T.armL = 1.9 + wobble(t * 14, 3) * 0.35;
      T.armR = 1.9 + wobble(t * 14, 4) * 0.35;
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

  /** 轻轻落地 */
  landed: () => ({
    update(b, dt, t) {
      const pet = b.pet;
      pet.style.fps = 60;
      if (t < 0.22) {
        pet.target.eyes = 'squeeze';
        pet.target.armL = pet.target.armR = 0.5;
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
        pet.x = p.from < 0 ? -70 * S : w.width + 70 * S;
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
export const REACTIVE = new Set(['held', 'falling', 'landed', 'dizzy', 'annoyed', 'arrive']);
