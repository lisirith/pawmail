// 招牌动作：每种动物自己才会的几个小动作（2026-11-23 加的，每种动物三个，见动物文件里的 tricks）。
//
//   橘猫     踩奶 knead、拍毛线球 yarn、钻纸箱 box（招财猫再多一个招手 beckon）
//   熊猫     缩成一团打个滚 roll、打瞌睡歪倒 topple、靠着墙蹭背 backScratch
//   卡皮巴拉 顶着橘子发呆 orangeNap（在 activities.js）、泡温泉 onsen、小鸟落在头上 bird
//   柴犬     赖着不走 stubborn（在 activities.js）、叼球给你 fetch、转圈追尾巴 chaseTail
//   小熊猫   举手吓唬人 bluff（在 activities.js）、趴在窗口边上睡 drapeNap、抱着尾巴睡 tailHug
//   兔子     开心扭跳 binky、洗脸洗耳朵 faceWash、摊成兔饼 flop
//   狐狸     扑雪捕鼠 pounce、藏葡萄 buryGrapes、大尾巴盖着鼻子睡 tailNap
//   企鹅     肚皮着地往前滑 bellySlide、拍着翅膀原地蹦 flapHop、滑一跤摔个屁股墩 slipFall
//   水獭     抛小石子玩杂耍 juggle、搓手手 pawRub、仰面漂着打盹 floatNap
//   大家都会 抱着自己爱吃的零食啃 snack（零食见动物文件里的 snack；企鹅一口吞、水獭仰面躺着敲贝壳，见 snackStyle）
//
// 写法和 activities.js 里的动作一样（工厂函数 → { update, exit }），大脑会把两边合在一起用。
// TRICK_INFO 是每个招牌动作"什么时候能做、平常想不想做、做完隔多久再做"，brain.js 按它打分。
// 道具（零食、纸箱、木盆、小鸟、球）的画法在 props.js；在桌面上滚的球、毛线球见 toy.js。

import { clamp, rand, chance, sign, wobble, bell, easeInOut, TAU } from '../util/math.js';
import { getGeometry } from './draw.js';
import { SNACK_CRUMB } from './props.js';
import { locomote, GAITS, pickWalkTarget, mouthPoint, hearts, sparks, wallDistances } from './activities.js';

// ------------------------------------------------------------ 小工具

/** 开头、结尾各用 edge 秒渐入渐出：0 … 1 … 0 */
const fade = (t, dur, edge = 0.35) => clamp(t / edge, 0, 1) * clamp((dur - t) / edge, 0, 1);

/** 打呼噜、小鸟唱歌冒出来的小音符 */
function note(pet, x, y, color) {
  pet.fx.spawn('note', { x, y, vx: rand(-6, 6), vy: -rand(14, 20), life: 1.4, size: rand(0.8, 1), phase: rand(0, 6), color });
}

/** 嚼东西掉的渣（颜色跟着零食） */
function crumbsOf(pet, color, n = 3) {
  const m = mouthPoint(pet);
  for (let i = 0; i < n; i++) {
    pet.fx.spawn('crumb', { x: m.x + rand(-7, 7), y: m.y + rand(-1, 4), vx: rand(-25, 25), vy: -rand(10, 40), ay: 260, life: 0.7, size: rand(0.7, 1.2), color });
  }
}

/** "啵"的一圈小泡泡：纸箱、木盆收起来的时候（x, y 是宠物坐标） */
function puffAt(pet, x, y, w = 50) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    pet.fx.spawn('puff', { x: x + Math.cos(a) * w * 0.5, y: y + Math.sin(a) * 12, vx: Math.cos(a) * 30, vy: Math.sin(a) * 14 - 12, life: 0.55, size: rand(0.8, 1.2) });
  }
}

/** 水花 */
function splash(pet, x, y, n = 8, spread = 36) {
  for (let i = 0; i < n; i++) {
    pet.fx.spawn('drop', { x: x + rand(-spread, spread), y: y + rand(-4, 2), vx: rand(-90, 90), vy: -rand(90, 170), ay: 520, life: 0.8, size: rand(0.8, 1.2) });
  }
}

/** 头顶转圈的小星星（晕乎乎） */
function stars(pet, life, y = -112) {
  for (let i = 0; i < 2; i++) pet.fx.spawn('orbit', { life, phase: i * Math.PI, y });
}

/**
 * 打滚、歪倒时要抬多高，才不会陷进地里：身子缩成一团，转到侧面时是大脑袋的侧面贴着地，
 * 整个倒过来时是头顶贴着地（头比脚离转轴远，所以要抬高一点）。角度 theta 是 roll
 */
function rollLift(theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const down = c >= 0 ? 47 : 60;
  return Math.hypot(46 * s, down * c) - 47;
}

/** 箱子、木盆收起来以后要不要等一下（还没完全消失时别结束动作，不然位置会跳） */
const gone = (v) => v < 0.03;

/**
 * 身子上的一个点（身子自己的坐标，和 draw.js 一样：先抬高 lift、再绕身子中间转 roll）在宠物坐标里的位置。
 * 特效不跟着身子转，所以仰面躺着、侧躺着的时候，要用它算嘴、肚子在哪儿
 */
function bodyPoint(pet, x, y) {
  const P = pet.pose;
  if (P.roll) {
    const g = getGeometry(pet.sp, P);
    const cy = (g.torsoCy + g.headCy) / 2;
    const c = Math.cos(P.roll);
    const s = Math.sin(P.roll);
    const dy = y - cy;
    [x, y] = [x * c - dy * s, cy + x * s + dy * c];
  }
  return { x, y: y - P.lift };
}

/** 头上的一个点（原点在头的中心，跟着歪头 headTilt 一起转）在宠物坐标里的位置 */
function headPoint(pet, hx, hy) {
  const P = pet.pose;
  const g = getGeometry(pet.sp, P);
  const c = Math.cos(P.headTilt);
  const s = Math.sin(P.headTilt);
  return bodyPoint(pet, g.headCx + hx * c - hy * s, g.headCy + hx * s + hy * c);
}

/**
 * 躺下（roll 转了 theta）时身子要抬多高（负数是往下放），身子最低的地方才正好贴着地。
 * 按这种动物自己的头、身子有多大来算（rollLift 是照着熊猫缩成一团的样子量的，企鹅、水獭伸直了躺用这个）。
 * tilt：躺着时脑袋自己又歪了多少（水獭仰面躺着时把脸转过来朝着你）
 */
function lieLift(pet, theta, tilt = 0) {
  const g = getGeometry(pet.sp, pet.pose);
  const cy = (g.torsoCy + g.headCy) / 2;
  const c = Math.cos(theta);
  const at = (y) => cy + (y - cy) * c; // 身子中线上的一点转过去以后有多高
  const ext = (rx, ry, a) => Math.hypot(rx * Math.sin(a), ry * Math.cos(a)); // 转了 a 的椭圆，最低的地方比中心低多少
  const head = at(g.headCy) + ext(g.head.rx, g.head.ry, theta + tilt);
  const body = at(g.torsoCy) + ext(g.torsoRxBot, g.torsoRy, theta);
  const feet = at(-4) + ext(14, 4, theta);
  return Math.max(head, body, feet);
}

/** 掏出来抱在胸前的零食在宠物坐标里的位置（往外扔、放进坑里的时候，特效从这里出发） */
function snackPoint(pet) {
  const g = getGeometry(pet.sp, pet.pose);
  return bodyPoint(pet, g.torsoCx, g.torsoCy + 1);
}

// ------------------------------------------------------------ 零食的另外两种吃法（动物文件里的 snackStyle）

/**
 * 企鹅：一口吞（snackStyle: 'gulp'）。掏出一整条小蓝鱼，看一眼，身子往下一沉、往上一抛，
 * 仰起头张大嘴，小鱼在空中转一圈、头朝下正好掉进嘴里，"咕咚"一口吞下去，拍拍肚子
 */
function gulpSnack(b) {
  const FLY = 0.95; // 小鱼在空中飞多久（抛得比头顶高出一大截）
  const G = 900;
  return {
    kind: b.pet.sp.snack,
    phase: 'take',
    pt: 0,
    said: false,
    loved: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      if (!this.kind) return true;
      this.pt += dt;
      s.fps = 60;
      s.gaze = 'none';
      s.tailAmp = 0.5;
      const hold = () => {
        T.snack = 1;
        T.armL = T.armR = -0.75;
      };
      switch (this.phase) {
        case 'take': // 掏出来
          hold();
          T.eyes = 'wide';
          T.lookY = 0.55;
          if (this.pt - dt <= 0) sparks(pet, 3);
          if (this.pt > 0.55) this.next('admire');
          return false;
        case 'admire':
          hold();
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.4;
          T.lookY = 0.5;
          T.blush = 0.9;
          if (!this.said) {
            this.said = true;
            if (chance(0.5)) b.say('snack', 2.2);
          }
          if (this.pt > 0.8) this.next('wind');
          return false;
        case 'wind': // 往下一沉，攒劲
          hold();
          T.squash += 0.1 * clamp(this.pt / 0.2, 0, 1);
          T.headY += 2;
          T.lookY = 0.3;
          if (this.pt > 0.28) this.next('toss');
          return false;
        case 'toss': {
          // 往上一抛：小鱼飞起来转一圈，头朝下落进嘴里。它仰着头、嘴越张越大
          if (this.pt - dt <= 0) {
            const from = snackPoint(pet);
            pet.pose.snack = 0; // 手里那条马上收起来（换成飞在空中的这条）
            const m = mouthPoint(pet);
            const to = { x: m.x, y: m.y - 6 };
            pet.fx.spawn('snack', {
              kind: this.kind,
              x: from.x,
              y: from.y,
              vx: (to.x - from.x) / FLY,
              vy: (to.y - from.y) / FLY - 0.5 * G * FLY,
              ay: G,
              life: FLY,
              solid: true,
              shrink: 0.75,
              rot: 0,
              vrot: (-2.5 * Math.PI) / FLY, // 转一圈多一点，落下来时鱼头正好朝下
            });
          }
          const u = clamp(this.pt / FLY, 0, 1);
          T.armL = T.armR = this.pt < 0.2 ? 1.2 : 0.35;
          T.lookY = -0.9;
          T.headY -= 2.5;
          T.eyes = 'wide';
          T.mouth = 'yawn';
          T.mouthOpen = clamp(u * 1.5, 0, 1);
          if (this.pt >= FLY) {
            pet.squashSpring.kick(1.1);
            this.next('gulp');
          }
          return false;
        }
        case 'gulp': // 咕咚：嘴一闭，身子一抖
          T.mouth = 'cat';
          T.eyes = this.pt < 0.35 ? 'squeeze' : 'happy';
          T.headY += 2.5 * bell(this.pt / 0.35);
          T.squash -= 0.05 * bell(this.pt / 0.35);
          T.armL = T.armR = 0.3;
          T.blush = 1;
          if (this.pt > 0.6) this.next('done');
          return false;
        default:
          // 吃完了，拍拍肚子
          T.armL = T.armR = -0.85 + Math.sin(this.pt * 9) * 0.14;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.45;
          T.blush = 1;
          if (this.pt > 0.3 && !this.loved) {
            this.loved = true;
            hearts(pet, 2);
            b.reward({ mood: 0.06 });
          }
          return this.pt > 1.5;
      }
    },
  };
}

/**
 * 水獭：仰面躺着敲贝壳（snackStyle: 'clam'）。翻过身仰面躺下，肚子上放一块小石头，两只爪子捧着蛤蜊
 * 举起来、往石头上一敲（"咚"地冒个小火星），敲几下壳就裂开了，捧着一点点吃掉，拍拍肚子，再翻回来坐好。
 * 它肚子朝着你，所以"举起来"画成离你近一点（大一点），见 props.js 的 snackClam
 */
function clamSnack(b) {
  const pet = b.pet;
  const [lo, hi] = pet.spanX(40, 20);
  const side = hi - pet.x >= pet.x - lo ? 1 : -1; // 脑袋朝空的那一边躺
  const LIE = 1.4;
  return {
    kind: pet.sp.snack,
    phase: 'lie',
    pt: 0,
    bite: 0,
    said: false,
    loved: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const T = pet.target;
      const s = pet.style;
      if (!this.kind) return true;
      this.pt += dt;
      s.fps = 60;
      s.gaze = 'none';
      s.tailAmp = 0.4;
      T.crouch = 0.2;
      T.bite = this.bite;
      const lying = (k = 1) => {
        // 仰面躺着：脸转过来朝着你、脑袋离身子远一点（肚子露出来），尾巴顺着身子伸到脚那头
        T.roll = side * LIE * k;
        T.headTilt += -side * 1.0 * k;
        T.headY -= 6 * k;
        T.lift = lieLift(pet, T.roll, -side * 1.0 * k);
        T.tailHang = 0.8 * k;
        T.tailCurl = 1 - k;
        T.footLY = T.footRY = -4 * k;
      };
      const hold = () => {
        T.snack = 1;
        T.armL = T.armR = -0.75;
      };
      const clamAt = () => snackPoint(pet);
      switch (this.phase) {
        case 'lie': {
          // 慢慢仰面躺下
          const u = clamp(this.pt / 0.7, 0, 1);
          lying(easeInOut(u));
          if (u >= 1) this.next('take');
          return false;
        }
        case 'take': // 肚子上摆好石头，掏出蛤蜊
          lying();
          hold();
          T.eyes = 'wide';
          if (this.pt - dt <= 0) sparks(pet, 3);
          if (this.pt > 0.5) this.next('admire');
          return false;
        case 'admire':
          lying();
          hold();
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.4;
          T.blush = 0.9;
          if (!this.said) {
            this.said = true;
            if (chance(0.5)) b.say('snack', 2.2);
          }
          if (this.pt > 0.7) this.next('raise');
          return false;
        case 'raise': // 举起来
          lying();
          hold();
          T.snackLift = 1;
          T.armL = T.armR = -0.9;
          T.eyes = 'wide';
          if (this.pt > 0.24) this.next('smash');
          return false;
        case 'smash': {
          // 往石头上一敲
          lying();
          hold();
          T.snackLift = 0;
          T.eyes = this.pt < 0.15 ? 'squeeze' : 'wide';
          if (!this.hit && this.pt > 0.06) {
            this.hit = true;
            const p = clamAt();
            pet.fx.spawn('spark', { x: p.x + rand(-4, 4), y: p.y - 4, vx: rand(-25, 25), vy: -rand(20, 40), life: 0.4, size: 0.75, vrot: rand(-3, 3) });
            pet.squashSpring.kick(0.5);
            this.bite = Math.min(0.4, this.bite + 0.1);
          }
          if (this.pt > 0.2) {
            this.hit = false;
            if (this.bite >= 0.4) {
              sparks(pet, 3);
              this.next('eat');
            } else {
              this.next('raise');
            }
          }
          return false;
        }
        case 'eat': {
          // 打开了：一点一点吃掉
          lying();
          hold();
          const c = Math.sin(this.pt * 15);
          T.mouth = c > 0.1 ? 'wavy' : 'o';
          T.mouthOpen = 0.5;
          T.eyes = 'happy';
          T.blush = 1;
          if (this.pt > 0.8) {
            this.bite = Math.min(1, this.bite + 0.2);
            const m = headPoint(pet, 0, (pet.sp.face?.noseY ?? 12) + 5);
            for (let i = 0; i < 2; i++) {
              pet.fx.spawn('crumb', { x: m.x + rand(-5, 5), y: m.y, vx: rand(-25, 25), vy: -rand(10, 40), ay: 260, life: 0.7, size: rand(0.7, 1.2), color: SNACK_CRUMB[this.kind] });
            }
            pet.squashSpring.kick(0.4);
            this.pt = 0;
            if (this.bite >= 0.999) this.next('done');
          }
          return false;
        }
        case 'done':
          // 吃完了，拍拍肚子
          lying();
          T.snack = 0;
          T.armL = T.armR = -0.85 + Math.sin(this.pt * 9) * 0.14;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.45;
          T.blush = 1;
          if (this.pt > 0.3 && !this.loved) {
            this.loved = true;
            hearts(pet, 2);
            b.reward({ mood: 0.06 });
          }
          if (this.pt > 1.3) this.next('up');
          return false;
        default: {
          // 翻回来坐好
          const u = clamp(this.pt / 0.6, 0, 1);
          lying(1 - easeInOut(u));
          T.crouch = 1;
          return u >= 1;
        }
      }
    },
  };
}

const SNACK_STYLES = { gulp: gulpSnack, clam: clamSnack };

// ------------------------------------------------------------ 动作

export const TRICKS = {
  // ============================================================ 橘猫

  /**
   * 踩奶：坐着，两只前爪轮流一下一下地往下踩（坐着时手就是两条前腿，抬一点点就是"踩"），
   * 眯着眼、脸红红的、身子跟着左右晃，冒出呼噜的小音符。踩完有时直接打个盹
   */
  knead: () => ({
    dur: rand(6, 9.5),
    noteIn: 0.9,
    said: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const k = fade(t, this.dur, 0.5);
      s.gaze = 'none';
      s.fps = 30;
      s.tailAmp = 0.3;
      s.tailSpeed = 0.8;
      s.breathDepth = 1.3;
      T.crouch = 1;
      T.tailCurl = 0.4;
      const sn = Math.sin(t * TAU * 1.2); // 每秒左右各踩 1.2 下
      T.armL = 0.34 * Math.max(0, sn) * k;
      T.armR = 0.34 * Math.max(0, -sn) * k;
      T.lean += sn * 0.014 * k;
      T.headY += (1.5 + Math.abs(sn) * 0.6) * k;
      T.headTilt += sn * 0.025 * k;
      T.eyeL = T.eyeR = 1 - 0.68 * k; // 眯着眼，一脸享受
      T.blush = 0.6 + 0.4 * k;
      T.earDroop = 0.2 * k;
      T.lift += Math.sin(t * 40) * 0.22 * k; // 呼噜呼噜的小震动（和被摸时一样）
      this.noteIn -= dt;
      if (t > 1 && this.noteIn <= 0 && t < this.dur - 1) {
        this.noteIn = rand(1.1, 1.8);
        note(pet, rand(16, 28), pet.headTop() + 10, '#e98aa8');
      }
      if (!this.said && t > 1.2) {
        this.said = true;
        if (chance(0.45)) b.say('knead', 2.4);
      }
      if (t < this.dur) return false;
      if (chance(0.35)) b.queue.unshift(['nap', {}]); // 踩舒服了，眯一会儿
      return true;
    },
  }),

  /**
   * 拍毛线球：一个毛线球骨碌碌滚过来（站在窗口上时是从天上掉下来），猫盯上它、压低身子扭屁股、扑过去，
   * 一爪子拍飞，追上去再拍……拍上几回，最后一下拍得远远的（在窗口上的话，球就从窗口边上掉下去了，它探头看）。
   * 毛线球在桌面上真的会滚、会弹（见 toy.js），所以它是追着球跑的
   */
  yarn: (b) => {
    const pet = b.pet;
    const [lo, hi] = pet.spanX(40, 18);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1; // 球从空的那一边来
    return {
      phase: 'arrive',
      pt: 0,
      rounds: 0,
      maxRounds: Math.round(rand(2, 4)),
      dir,
      pushed: false,
      jump: null,
      started: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
        this.pushed = false;
      },
      begin(b) {
        const w = b.world;
        const S = w.scale;
        const toy = w.toy;
        if (pet.perch) {
          // 站在窗口上：一个毛线球从上面掉下来，落在旁边
          toy.spawn('yarn', clamp(pet.x + dir * 58 * S, lo, hi), pet.y - 130 * S, { ledgeId: pet.perch.id, alpha: 1 });
        } else {
          // 在地上：从空的那一边滚过来，停在它跟前（地上的摩擦：滚 v / 1.14 那么远才停）
          const x0 = clamp(pet.x + dir * rand(190, 240) * S, w.area.left + 12 * S, w.area.right - 12 * S);
          toy.spawn('yarn', x0, w.groundY, { vx: (pet.x + dir * 60 * S - x0) * 1.14 });
        }
      },
      update(b, dt, t) {
        const T = pet.target;
        const s = pet.style;
        const w = b.world;
        const S = w.scale;
        const ball = w.toy;
        if (!ball) return true;
        if (!this.started) {
          this.started = true;
          this.begin(b);
        }
        if (ball.kind !== 'yarn') return true; // 球被收走了
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        const dx = ball.x - pet.x;
        const d = sign(dx) || this.dir;
        const lookAt = () => {
          T.lookX = clamp(dx / (150 * S), -1, 1) * 0.9;
          T.lookY = clamp((ball.y - (pet.y - 50 * S)) / (160 * S), -0.4, 1);
        };
        if (t > 30 && this.phase !== 'watch') this.next('watch'); // 保险：玩太久了
        switch (this.phase) {
          case 'arrive': // 等球滚过来、掉下来
            T.facing = d * 0.3;
            lookAt();
            if (this.pt > 0.3 && (ball.resting || this.pt > 2.5)) {
              pet.fx.spawn('bang', { x: d * 26, y: pet.headTop() + 4, life: 0.6 });
              this.next('notice');
            }
            return false;
          case 'notice':
            T.facing = d * 0.5;
            lookAt();
            T.eyes = 'wide';
            T.earDroop = -0.25;
            if (this.pt > 0.6) this.next(Math.abs(dx) > 52 * S ? 'stalk' : 'swipe');
            return false;
          case 'stalk': // 压低身子、扭屁股
            T.facing = d;
            lookAt();
            T.eyes = 'wide';
            T.crouch = 0.55;
            T.tailCurl = 0.7;
            T.lean += Math.sin(this.pt * 22) * 0.035;
            s.tailSpeed = 7;
            s.tailAmp = 0.8;
            if (this.pt > 0.75) {
              this.jump = { from: pet.x, to: ball.x - d * 30 * S, d };
              this.next('pounce');
            }
            return false;
          case 'pounce': {
            const j = this.jump;
            const u = clamp(this.pt / 0.42, 0, 1);
            const [a, c] = pet.spanX(34, 14);
            pet.x = clamp(j.from + (j.to - j.from) * easeInOut(u), a, c);
            T.facing = j.d * 0.6;
            T.lift = bell(u) * 20;
            T.armL = T.armR = 0.3 + 1.5 * bell(u);
            T.eyes = 'wide';
            T.mouth = 'smile';
            T.mouthOpen = 0.5;
            lookAt();
            if (u >= 1) {
              pet.squashSpring.kick(2);
              this.next('swipe');
            }
            return false;
          }
          case 'swipe': {
            // 靠球那边的爪子抬起来，"啪"地往下拍
            const u = clamp(this.pt / 0.32, 0, 1);
            const arm = u < 0.45 ? 1.4 * easeInOut(u / 0.45) : 1.4 * (1 - easeInOut((u - 0.45) / 0.55));
            if (d > 0) T.armR = arm + 0.1;
            else T.armL = arm + 0.1;
            T.facing = d * 0.6;
            T.lean += d * 0.06;
            T.crouch = 0.25;
            T.eyes = 'wide';
            lookAt();
            if (!this.pushed && u > 0.5) {
              this.pushed = true;
              if (Math.abs(dx) < 50 * S) {
                const last = this.rounds + 1 >= this.maxRounds;
                ball.push(d * (last ? rand(420, 520) : rand(230, 360)) * S, -rand(40, 140) * S);
                this.rounds += 1;
              }
            }
            if (u >= 1) this.next(this.rounds >= this.maxRounds ? 'watch' : 'chase');
            return false;
          }
          case 'chase': {
            // 追过去：追上了、球也慢下来了，再拍一下
            locomote(b, this, dt, ball.x - d * 32 * S, GAITS.trot, 1.1);
            lookAt();
            T.eyes = 'wide';
            const close = Math.abs(ball.x - pet.x) < 46 * S;
            if (close && Math.abs(ball.vx) < 160 * S && ball.vy === 0 && Math.abs(ball.y - pet.y) < 30 * S) this.next('swipe');
            else if (this.pt > 4) this.next('watch'); // 追不上了（比如从窗口边上掉下去了）
            return false;
          }
          case 'watch':
          default: {
            // 看着球滚远：要是从窗口边上掉下去了，探头往下看
            const below = ball.y > pet.y + 20 * S;
            T.facing = d * 0.4;
            lookAt();
            if (below) {
              T.lookY = 1;
              T.headTilt += d * 0.12;
              T.crouch = 0.3;
            }
            T.mouth = this.pt < 1.1 ? 'o' : 'smile';
            T.mouthOpen = 0.3;
            if (this.pt > 1.1) T.eyes = 'happy';
            if (this.pt < 2.2) return false;
            ball.fadeOut(0.8);
            return true;
          }
        }
      },
      exit(b) {
        const toy = b.world.toy;
        if (toy && toy.kind === 'yarn') toy.fadeOut(0.6);
      },
    };
  },

  /**
   * 钻纸箱：旁边"啵"地冒出一个纸箱，猫愣一下、歪头看看，蹲下一跳——钻进去了，只露出脑袋和搭在箱沿上的爪子。
   * 在里面待一会儿：时不时缩下去只露出耳朵尖，再探出头来；鼠标猛地冲过来时也会缩下去躲一躲。
   * 待够了跳出来，箱子"啵"地收起来
   */
  box: (b) => {
    const pet = b.pet;
    const S = b.world.scale;
    const [lo, hi] = pet.spanX(80, 40);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1;
    const bx = clamp(pet.x + dir * 80 * S, lo, hi); // 箱子放在哪儿（窗口坐标，放好就不动了）
    return {
      phase: 'appear',
      pt: 0,
      bx,
      dir,
      inside: rand(8, 13),
      peekIn: rand(2.5, 4),
      duck: 0,
      said: false,
      asked: false,
      puffed: false,
      from: 0,
      to: 0,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        const w = b.world;
        this.pt += dt;
        s.fps = 60;
        T.box = this.phase === 'appear' && this.pt < 0.2 ? 1.15 : this.phase === 'bye' ? 0 : 1; // 出现时弹一下
        T.boxX = (this.bx - pet.x) / S;
        const d = sign(this.bx - pet.x) || this.dir;
        switch (this.phase) {
          case 'appear':
            s.gaze = 'none';
            T.facing = d * 0.4;
            T.lookX = d * 0.8;
            T.lookY = 0.3;
            T.eyes = 'wide';
            T.earDroop = -0.25;
            if (!this.asked && this.pt > 0.3) {
              this.asked = true;
              pet.fx.spawn('question', { x: d * 28, y: pet.headTop() - 2, life: 0.9 });
            }
            if (this.pt > 1.2) this.next('ready');
            return false;
          case 'ready': // 蹲下，盯着箱子，准备跳
            s.gaze = 'none';
            T.facing = d * 0.8;
            T.lookX = d * 0.5;
            T.lookY = 0.4;
            T.crouch = 0.45;
            T.tailCurl = 1;
            T.eyes = 'wide';
            if (this.pt > 0.35) {
              this.from = pet.x;
              this.next('hopIn');
            }
            return false;
          case 'hopIn': {
            const u = clamp(this.pt / 0.5, 0, 1);
            pet.x = this.from + (this.bx - this.from) * easeInOut(u);
            T.lift = bell(u) * 50; // 跳得比箱子的前墙高
            T.facing = this.dir * 0.6 * (1 - u);
            T.armL = T.armR = 1.3 * bell(u);
            T.eyes = 'happy';
            T.tailCurl = 1;
            if (u >= 1) {
              pet.x = this.bx;
              pet.squashSpring.kick(1.6);
              this.next('inside');
            }
            return false;
          }
          case 'inside': {
            // 坐在箱子里：脑袋露在外面，两只爪子搭在箱沿上，尾巴尖从后面翘出来
            T.crouch = 1;
            T.facing = 0;
            T.tailCurl = 1;
            T.armL = T.armR = 1.95;
            T.blush = 0.85;
            s.gaze = 'cursor';
            s.tailAmp = 0.6;
            if (!this.said && this.pt > 0.5) {
              this.said = true;
              if (chance(0.5)) b.say('box', 2.4);
            }
            // 缩下去躲一躲（只露出耳朵尖），再探出头来；鼠标猛地冲过来时马上缩下去
            const p = w.pointer;
            const rush = p.inside && p.speed > 900 * S && Math.hypot(p.x - pet.x, p.y - (pet.y - 60 * S)) < 170 * S;
            this.peekIn -= dt;
            if (this.duck <= 0 && this.pt > 1 && (this.peekIn <= 0 || rush)) {
              this.duck = rand(1.1, 1.9);
              this.peekIn = rand(3, 5);
            }
            if (this.duck > 0) {
              this.duck -= dt;
              T.headY += 52;
              T.loaf = 0.3;
              T.armL = T.armR = 0;
              if (this.duck <= 0) {
                pet.squashSpring.kick(1.4); // 探出头来！
                pet.fx.spawn('bang', { x: 26, y: pet.headTop() + 2, life: 0.5, size: 0.8 });
              }
            } else {
              T.eyes = this.pt % 4 < 0.8 ? 'happy' : 'open';
            }
            if (this.pt > this.inside && this.duck <= 0) {
              const [a, c] = pet.spanX(34, 14);
              this.from = pet.x;
              this.to = clamp(this.bx + this.dir * 88 * S, a, c);
              if (Math.abs(this.to - this.bx) < 60 * S) this.to = clamp(this.bx - this.dir * 88 * S, a, c); // 前面没地方：往回跳
              this.next('hopOut');
            }
            return false;
          }
          case 'hopOut': {
            const u = clamp(this.pt / 0.5, 0, 1);
            const out = sign(this.to - this.from) || 1;
            pet.x = this.from + (this.to - this.from) * easeInOut(u);
            T.lift = bell(u) * 50;
            T.facing = out * 0.6;
            T.armL = T.armR = 1.3 * bell(u);
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.4;
            if (u >= 1) {
              pet.squashSpring.kick(1.4);
              this.next('bye');
            }
            return false;
          }
          case 'bye':
          default:
            // 回头看一眼，箱子"啵"地收起来
            if (!this.puffed) {
              this.puffed = true;
              puffAt(pet, T.boxX, -20, 70);
            }
            s.gaze = 'none';
            T.facing = d * 0.3;
            T.lookX = d * 0.6;
            T.eyes = 'happy';
            return this.pt > 0.6 && gone(pet.pose.box);
        }
      },
      exit(b) {
        // 被打断了（被拎起来、被摸……）：箱子直接收起来，免得留在原地慢慢变小时位置跟着跳
        if (b.pet.pose.box > 0.1 && !this.puffed) puffAt(b.pet, b.pet.pose.boxX, -20, 70);
        b.pet.pose.box = 0;
      },
    };
  },

  /** 招财猫招手：坐着，一只爪子举在脸旁边一下一下往回招（下去快、回来慢），蹦出几个小铜钱 */
  beckon: () => ({
    dur: rand(3.6, 5),
    coinIn: 0.5,
    said: false,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const k = fade(t, this.dur, 0.35);
      s.gaze = 'none';
      s.fps = 60;
      s.tailAmp = 0.6;
      T.crouch = 1;
      const cyc = (t * 1.5) % 1;
      const wave = cyc < 0.35 ? easeInOut(cyc / 0.35) : 1 - easeInOut((cyc - 0.35) / 0.65);
      // 在脸颊旁边招（1.2～1.65）：再高的话爪子就藏到大脑袋后面了
      T.armR = (1.65 - 0.45 * wave) * k;
      T.headTilt += 0.08 * k;
      T.eyes = 'happy';
      T.mouth = 'smile';
      T.mouthOpen = 0.35 * k;
      T.blush = 1;
      this.coinIn -= dt;
      if (this.coinIn <= 0 && t > 0.5 && t < this.dur - 0.6) {
        this.coinIn = rand(0.55, 0.9);
        pet.fx.spawn('coin', { x: rand(26, 40), y: -92, vx: rand(-45, 45), vy: -rand(90, 140), ay: 420, life: 1.3, size: rand(0.85, 1.1), phase: rand(0, 6) });
      }
      if (!this.said && t > 0.4) {
        this.said = true;
        if (chance(0.6)) b.say('beckon', 2.4);
      }
      return t >= this.dur;
    },
  }),

  // ============================================================ 熊猫

  /**
   * 打滚：坐下抱住腿、缩成一团，往空的那边骨碌滚一整圈（滚多远转多少，不打滑），
   * 坐起来晕乎乎的，头顶转小星星，然后乐呵呵的
   */
  roll: (b) => {
    const pet = b.pet;
    const [lo, hi] = pet.spanX(40, 20);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1;
    const R = 46; // 缩成一团时身子的"半径"（滚一圈走 2πR）
    return {
      phase: 'tuck',
      pt: 0,
      dir,
      x0: 0,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        const S = b.world.scale;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        const tuck = () => {
          T.crouch = 1;
          T.armL = T.armR = -1.0; // 抱住腿
          T.lookY = 0.7;
          T.headY += 4;
          T.tailCurl = 0.3;
        };
        if (this.phase === 'tuck') {
          tuck();
          T.facing = this.dir * 0.3;
          if (this.pt > 0.2) T.eyes = 'squeeze';
          if (this.pt > 0.55) {
            this.x0 = pet.x;
            this.next('roll');
          }
          return false;
        }
        if (this.phase === 'roll') {
          tuck();
          T.eyes = 'squeeze';
          const u = clamp(this.pt / 1.15, 0, 1);
          const e = easeInOut(u);
          const theta = this.dir * TAU * e;
          T.roll = theta;
          T.lift = rollLift(theta);
          const [a, c] = pet.spanX(34, 14);
          pet.x = clamp(this.x0 + this.dir * R * S * TAU * e, a, c);
          if (u >= 1) {
            // 转了一整圈 = 没转：直接把角度归零（看起来一样），不然会倒着转回去
            pet.pose.roll -= this.dir * TAU;
            T.roll = 0;
            pet.squashSpring.kick(1.8);
            stars(pet, 1.1, -112 + 7);
            this.next('dazed');
          }
          return false;
        }
        // 坐起来，晕乎乎的
        T.crouch = 1;
        if (this.pt < 1) {
          T.eyes = 'dizzy';
          T.mouth = 'wavy';
          T.headTilt += Math.sin(this.pt * 5) * 0.12;
          T.lean += Math.sin(this.pt * 5 + 1) * 0.05;
        } else {
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.45;
          T.blush = 0.9;
          if (!this.said) {
            this.said = true;
            if (chance(0.5)) b.say('roll', 2.2);
          }
        }
        return this.pt > 1.9;
      },
    };
  },

  /**
   * 打瞌睡歪倒：坐着打瞌睡，脑袋一点一点的，身子越歪越厉害——咕咚，倒在一边。
   * 吓醒了，手脚乱蹬几下，赶紧爬起来坐好，左看看右看看，脸红红的："……我没睡！"
   */
  topple: (b) => {
    const pet = b.pet;
    const [lo, hi] = pet.spanX(40, 20);
    const side = hi - pet.x >= pet.x - lo ? 1 : -1; // 往空的那边倒
    return {
      phase: 'doze',
      pt: 0,
      doze: rand(3.2, 5),
      side,
      zzd: false,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        T.crouch = 1;
        const LIE = 1.5; // 倒下去转多少（弧度，差不多躺平）
        if (this.phase === 'doze') {
          s.fps = 30;
          s.blink = false;
          s.breathDepth = 1.6;
          T.eyes = 'sleep';
          T.earDroop = 0.3;
          const u = (this.pt % 2.1) / 2.1;
          const droop = u < 0.85 ? easeInOut(u / 0.85) : 1 - (u - 0.85) / 0.15;
          T.headY += droop * 4;
          T.roll = this.side * 0.17 * easeInOut(this.pt / this.doze); // 越歪越厉害
          T.lift = rollLift(T.roll);
          if (!this.zzd && this.pt > 1) {
            this.zzd = true;
            pet.fx.spawn('zzz', { x: this.side * 20, y: pet.headTop() + 6, vx: this.side * 7, vy: -15, life: 2.2, phase: rand(0, 6) });
          }
          if (this.pt > this.doze) this.next('fall');
          return false;
        }
        if (this.phase === 'fall') {
          // 越倒越快（像真的倒下去）
          s.fps = 60;
          const u = clamp(this.pt / 0.42, 0, 1);
          T.roll = this.side * (0.17 + (LIE - 0.17) * u * u);
          T.lift = rollLift(T.roll);
          T.eyes = 'sleep';
          if (u >= 1) {
            pet.squashSpring.kick(2.4);
            pet.fx.spawn('dust', { x: this.side * 50, y: -3, vx: this.side * 40, vy: -8, life: 0.5 });
            this.next('lie');
          }
          return false;
        }
        if (this.phase === 'lie') {
          s.fps = 60;
          T.roll = this.side * LIE;
          T.lift = rollLift(T.roll);
          if (this.pt < 0.45) {
            T.eyes = 'sleep';
          } else {
            if (this.pt - dt < 0.45) pet.fx.spawn('bang', { x: -this.side * 30, y: -70, life: 0.7 });
            T.eyes = 'wide';
            T.mouth = 'o';
            T.armL = 0.6 + wobble(this.pt * 14, 1) * 0.5; // 手脚乱蹬
            T.armR = 0.6 + wobble(this.pt * 14, 2) * 0.5;
            T.footLY = 3 + wobble(this.pt * 12, 3) * 3;
            T.footRY = 3 + wobble(this.pt * 12, 4) * 3;
          }
          if (this.pt > 1.25) this.next('up');
          return false;
        }
        if (this.phase === 'up') {
          s.fps = 60;
          const u = clamp(this.pt / 0.55, 0, 1);
          T.roll = this.side * LIE * (1 - easeInOut(u));
          T.lift = rollLift(T.roll);
          T.eyes = 'wide';
          if (u >= 1) this.next('shy');
          return false;
        }
        // 左看看右看看，脸红红的：刚才什么都没发生
        s.fps = 60;
        T.blush = 1;
        T.eyes = this.pt < 0.9 ? 'open' : 'happy';
        T.lookX = this.pt < 0.9 ? Math.sin(this.pt * 7) * 0.8 : 0;
        T.headTilt += this.side * 0.1;
        if (!this.said && this.pt > 0.3) {
          this.said = true;
          if (chance(0.7)) b.say('topple', 2.4);
        }
        return this.pt > 1.8;
      },
    };
  },

  /**
   * 蹭背挠痒痒：走到最近的墙（活动范围的边）旁边，背靠着墙、身子往墙那边歪，
   * 一上一下地蹭，眯着眼张着嘴，一脸"啊～就是这儿～"。蹭完抖一抖
   */
  backScratch: (b) => {
    const d = wallDistances(b);
    const side = d.left <= d.right ? -1 : 1; // 墙在哪边
    const A = b.world.area;
    const S = b.world.scale;
    return {
      tx: side < 0 ? A.left + 34 * S : A.right - 34 * S,
      side,
      phase: 'walk',
      pt: 0,
      dur: rand(4, 6),
      said: false,
      heartIn: 1,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const pet = b.pet;
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        if (this.phase === 'walk') {
          if (locomote(b, this, dt, this.tx, GAITS.walk) || this.pt > 15) this.next('lean');
          return false;
        }
        s.fps = 60;
        s.gaze = 'none';
        const lean = this.phase === 'lean' ? easeInOut(clamp(this.pt / 0.5, 0, 1)) : this.phase === 'shake' ? 1 - clamp(this.pt / 0.3, 0, 1) : 1;
        T.facing = -this.side * 0.25 * lean; // 背朝着墙
        s.tilt = this.side * 0.07 * lean; // 身子往墙那边靠
        T.lean += this.side * 0.04 * lean;
        T.lookX = -this.side * 0.2;
        if (this.phase === 'lean') {
          if (this.pt > 0.5) this.next('rub');
          return false;
        }
        if (this.phase === 'rub') {
          const ph = this.pt * TAU * 1.8;
          T.crouch = 0.22 + 0.2 * Math.sin(ph); // 一上一下地蹭
          T.headTilt += this.side * 0.12 + Math.sin(ph) * 0.03;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.55;
          T.blush = 1;
          T.earDroop = 0.3;
          T.armL = T.armR = 0.35 + 0.12 * Math.sin(ph * 0.5);
          s.tailAmp = 0.8;
          s.tailSpeed = 3;
          this.heartIn -= dt;
          if (this.heartIn <= 0) {
            this.heartIn = rand(1.2, 2);
            hearts(pet);
          }
          if (!this.said && this.pt > 0.6) {
            this.said = true;
            if (chance(0.6)) b.say('scratch', 2.4);
          }
          if (this.pt > this.dur) this.next('shake');
          return false;
        }
        // 抖一抖，走开
        T.lean += Math.sin(this.pt * 30) * 0.05 * (1 - clamp(this.pt / 0.6, 0, 1));
        T.eyes = 'happy';
        return this.pt > 0.7;
      },
    };
  },

  // ============================================================ 卡皮巴拉

  /**
   * 泡温泉：往上一蹦，脚底下"啵"地冒出一个小木盆，扑通坐进热水里，水花四溅。
   * 眯着眼、脸红红的泡着，热气一团团往上冒；过一会儿头顶落下一个橘子（和顶着橘子发呆一样）。
   * 泡够了跳出来，木盆收起来，甩甩身上的水
   */
  onsen: (b) => ({
    phase: 'hop',
    pt: 0,
    soak: rand(16, 26),
    steamIn: 0.3,
    said: false,
    puffed: false,
    orange: !(b.pet.outfit && b.pet.outfit.hat) && !(b.pet.look && b.pet.look.head) && b.pet.sp.headProp === 'orange',
    landed: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      this.pt += dt;
      s.gaze = 'none';
      if (this.phase === 'hop') {
        s.fps = 60;
        const u = clamp(this.pt / 0.5, 0, 1);
        T.lift = bell(u) * 38;
        T.armL = T.armR = 1.2 * bell(u);
        T.tub = u > 0.15 ? 1 : 0; // 跳到半空时木盆冒出来
        T.eyes = 'happy';
        if (u >= 1) {
          pet.squashSpring.kick(1.4);
          splash(pet, 0, -32, 10, 40);
          this.next('soak');
        }
        return false;
      }
      if (this.phase === 'soak') {
        T.tub = 1;
        T.crouch = 1;
        T.eyeL = T.eyeR = 0.35; // 眯着眼，好舒服
        T.blush = 1;
        T.earDroop = 0.15;
        s.breathPeriod = 4.6;
        s.breathDepth = 1.3;
        s.tailAmp = 0.1;
        s.fps = this.pt < 1 ? 60 : 20;
        this.steamIn -= dt;
        if (this.steamIn <= 0) {
          this.steamIn = rand(0.5, 0.9);
          pet.fx.spawn('steam', { ambient: true, x: rand(-42, 42), y: -36, vy: -rand(10, 16), life: rand(2.2, 3), size: rand(0.8, 1.3), phase: rand(0, 6) });
        }
        // 泡了一会儿，头顶落下一个橘子（戴着帽子、节日头饰时不落）
        const DROP = 2;
        if (this.orange && this.pt > DROP) {
          const u = this.pt - DROP;
          T.prop = 1;
          if (u < 0.45) {
            s.fps = 60;
            const k = u / 0.45;
            T.propY = 90 * (1 - k * k);
          } else {
            if (!this.landed) {
              this.landed = true;
              pet.squashSpring.kick(0.8);
            }
            T.propY = u < 0.8 ? Math.sin(((u - 0.45) / 0.35) * Math.PI) * 5 : 0;
          }
        }
        if (!this.said && this.pt > 2.6) {
          this.said = true;
          if (chance(0.6)) b.say('onsen', 2.6);
        }
        if (this.pt > this.soak) {
          this.dropOrange(pet);
          this.next('out');
        }
        return false;
      }
      if (this.phase === 'out') {
        s.fps = 60;
        const u = clamp(this.pt / 0.5, 0, 1);
        T.lift = bell(u) * 38;
        T.armL = T.armR = 1.2 * bell(u);
        T.tub = u < 0.55 ? 1 : 0;
        T.eyes = 'happy';
        if (u >= 0.55 && !this.puffed) {
          this.puffed = true;
          splash(pet, 0, -30, 6, 40);
          puffAt(pet, 0, -16, 90);
        }
        if (u >= 1) {
          pet.squashSpring.kick(1.2);
          this.next('shake');
        }
        return false;
      }
      // 甩甩身上的水
      s.fps = 60;
      const k = 1 - clamp(this.pt / 0.9, 0, 1);
      T.lean += Math.sin(this.pt * 34) * 0.06 * k;
      T.headTilt += Math.sin(this.pt * 34 + 1) * 0.08 * k;
      T.eyes = 'squeeze';
      if (this.pt < 0.5 && chance(dt * 22)) splash(pet, 0, -50, 2, 30);
      return this.pt > 1 && gone(pet.pose.tub);
    },
    /** 橘子从头顶滚下去（泡完了、被打断了） */
    dropOrange(pet) {
      if (pet.pose.prop < 0.3) {
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
      pet.pose.prop = 0;
      this.orange = false;
    },
    exit(b) {
      const pet = b.pet;
      this.dropOrange(pet);
      if (pet.pose.tub > 0.1 && !this.puffed) {
        splash(pet, 0, -30, 6, 40);
        puffAt(pet, 0, -16, 90);
      }
      pet.pose.tub = 0;
    },
  }),

  /**
   * 小鸟落在头上：卡皮巴拉坐着发呆，一只小鸟扑腾着翅膀飞过来，落在它头顶上，蹦一蹦、唱两句。
   * 卡皮巴拉抬眼看了看，就不管了，接着发呆。过一会儿小鸟飞走，它目送一下
   */
  bird: () => ({
    phase: 'sit',
    pt: 0,
    dir: chance(0.5) ? 1 : -1, // 小鸟从哪边飞来
    stay: rand(7, 12),
    hopIn: rand(1.2, 2.5),
    hop: null,
    chirpIn: rand(0.8, 1.6),
    said: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      this.pt += dt;
      s.gaze = 'none';
      s.breathPeriod = 4.2;
      T.crouch = 1;
      T.blush = 0.7;
      T.eyeL = T.eyeR = 0.5; // 一脸淡定
      if (this.phase === 'sit') {
        s.fps = 20;
        if (this.pt > 0.8) {
          pet.birdDir = -this.dir;
          this.next('fly');
        }
        return false;
      }
      if (this.phase === 'fly') {
        s.fps = 60;
        const u = clamp(this.pt / 1.2, 0, 1);
        const e = easeInOut(u);
        T.bird = 1;
        T.birdFly = 1;
        T.birdX = this.dir * 118 * (1 - e);
        T.birdY = 140 * (1 - e) + Math.sin(u * Math.PI) * 22;
        T.lookX = this.dir * 0.6 * (1 - e);
        T.lookY = -0.5;
        if (u >= 1) this.next('land');
        return false;
      }
      if (this.phase === 'land') {
        s.fps = 60;
        T.bird = 1;
        T.birdFly = 0;
        if (this.pt < dt * 1.5) pet.squashSpring.kick(0.5);
        // 抬眼看看头顶：哦，是小鸟啊
        T.lookY = -0.9;
        T.eyeL = T.eyeR = 1;
        if (this.pt > 1.2) this.next('perch');
        return false;
      }
      if (this.phase === 'perch') {
        T.bird = 1;
        T.birdFly = 0;
        s.fps = 20;
        // 小鸟时不时蹦一下、转个身
        this.hopIn -= dt;
        if (!this.hop && this.hopIn <= 0) {
          this.hop = { t: 0, from: pet.pose.birdX, to: rand(-7, 7) };
          if (chance(0.5)) pet.birdDir = -pet.birdDir;
        }
        if (this.hop) {
          s.fps = 60;
          this.hop.t += dt;
          const u = clamp(this.hop.t / 0.22, 0, 1);
          T.birdX = this.hop.from + (this.hop.to - this.hop.from) * u;
          T.birdY = bell(u) * 5;
          if (u >= 1) {
            this.hop = null;
            this.hopIn = rand(1.5, 3);
          }
        } else {
          T.birdX = pet.pose.birdX;
        }
        // 唱两句
        this.chirpIn -= dt;
        if (this.chirpIn <= 0) {
          this.chirpIn = rand(1.4, 2.6);
          const g = getGeometry(pet.sp, pet.pose);
          note(pet, g.headCx + pet.pose.birdX + pet.birdDir * 8, g.headCy - pet.sp.head.ry - 18, '#5d8fc4');
        }
        // 卡皮巴拉偶尔抬眼看一下
        if (this.pt % 5 > 4) T.lookY = -0.7;
        if (!this.said && this.pt > 1.5) {
          this.said = true;
          if (chance(0.4)) b.say('bird', 2.4);
        }
        if (this.pt > this.stay && !this.hop) {
          pet.birdDir = -this.dir;
          this.from = pet.pose.birdX;
          this.next('leave');
        }
        return false;
      }
      // 飞走：往另一边飞，目送一下
      s.fps = 60;
      const u = clamp(this.pt / 1.1, 0, 1);
      const e = easeInOut(u);
      T.birdFly = 1;
      T.birdX = (this.from || 0) - this.dir * 118 * e;
      T.birdY = 150 * e;
      T.bird = 1 - clamp((u - 0.7) / 0.3, 0, 1);
      T.lookX = -this.dir * 0.6 * e;
      T.lookY = -0.5;
      return u >= 1;
    },
  }),

  // ============================================================ 柴犬

  /**
   * 叼球：跑到一个地方低头闻闻，叼起一个网球，跑到你（鼠标）跟前把球放下，坐着摇尾巴眼巴巴地等你。
   * 你点一下球，球就飞出去，它追过去叼回来，再放到你跟前……玩几回就心满意足地趴下了。
   * 不理它的话，等一会儿它就不高兴地走开了
   */
  fetch: (b, p) => ({
    phase: p.quick ? 'sniff' : 'find', // quick：右键「陪它玩球」，不用先跑开，原地就叼出来
    kind: chance(0.5) ? 'ball' : 'bone', // 这一回玩的是网球还是骨头
    pt: 0,
    round: 0,
    maxRounds: Math.round(rand(2, 4)),
    tx: pickWalkTarget(b, 60, 200),
    said: false,
    dropped: false,
    final: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
      this.dropped = false;
    },
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const w = b.world;
      const S = w.scale;
      const p = w.pointer;
      const toy = w.toy;
      if (!toy || t > 70) return true;
      this.pt += dt;
      s.fps = 60;
      const wag = () => {
        s.tailSpeed = 8;
        s.tailAmp = 1;
      };
      switch (this.phase) {
        case 'find': // 跑去一个地方
          if (locomote(b, this, dt, this.tx, GAITS.trot, 1) || this.pt > 6) this.next('sniff');
          return false;
        case 'sniff': // 低头闻一闻，叼起一个球
          s.gaze = 'none';
          T.facing = 0;
          T.lookY = 0.95;
          T.headY += 5;
          T.headTilt += Math.sin(this.pt * 18) * 0.03;
          T.earDroop = -0.2;
          if (this.pt > 0.9) {
            sparks(pet, 3);
            pet.mouthToy = this.kind;
            this.next('bring');
          }
          return false;
        case 'bring': {
          // 叼着球跑到你跟前（鼠标旁边）
          T.mouthBall = 1;
          wag();
          const side = sign(pet.x - p.x) || 1;
          const target = p.inside ? p.x + side * 75 * S : (w.area.left + w.area.right) / 2;
          if (locomote(b, this, dt, target, GAITS.trot, 1.05) || this.pt > 8) this.next('drop');
          return false;
        }
        case 'drop': {
          // 把球放下（掉在你那边的地上）
          s.gaze = 'none';
          T.facing = 0;
          T.lookY = 0.5;
          T.mouthBall = this.pt < 0.25 ? 1 : 0;
          wag();
          if (this.pt >= 0.25 && !this.dropped) {
            this.dropped = true;
            const m = mouthPoint(pet);
            const toward = p.inside ? sign(p.x - pet.x) || 1 : 1;
            toy.spawn(this.kind, pet.x + m.x * S, pet.y + (m.y + 13) * S, { vx: toward * 60 * S, vy: -40 * S, alpha: 1, ledgeId: pet.perch ? pet.perch.id : null });
            toy.clickable = !this.final;
            pet.pose.mouthBall = 0; // 球已经掉出来了：嘴里那个马上拿掉，免得同时看到两个
          }
          if (this.pt > 0.6) this.next(this.final ? 'rest' : 'wait');
          return false;
        }
        case 'wait': {
          // 坐着摇尾巴，眼巴巴地看着你：扔呀！
          if (toy.kind !== this.kind) return true;
          wag();
          T.crouch = 1;
          s.gaze = 'cursor';
          T.mouth = 'smile';
          T.mouthOpen = 0.45 + 0.1 * Math.sin(this.pt * 12); // 哈哈地喘气
          T.earDroop = -0.15;
          T.blush = 0.8;
          const hop = this.pt % 1.6;
          if (hop < 0.3) T.lift += bell(hop / 0.3) * 6; // 激动得蹦一下
          if (!this.said && this.pt > 0.4) {
            this.said = true;
            if (chance(0.6)) b.say('fetch', 2.4);
          }
          if (toy.userHeld) {
            // 你按着它拖来拖去：它盯着看，激动得原地蹦（这时候不算等太久）
            this.pt = Math.min(this.pt, 3);
            T.lift += Math.abs(Math.sin(t * 9)) * 4;
            T.eyes = 'wide';
          }
          if (toy.thrown) {
            // 你拖着它扔出去了：追！
            toy.thrown = false;
            b.reward({ mood: 0.05, boredom: -0.3, social: -0.12 });
            pet.fx.spawn('bang', { x: 26, y: pet.headTop() + 4, life: 0.5 });
            this.next('chase');
            return false;
          }
          if (toy.clicked) {
            // 你只点了一下：它替你往空的那一边扔出去，再追
            toy.clicked = false;
            toy.clickable = false;
            const [lo, hi] = pet.spanX(40, 20);
            const dir = hi - toy.x >= toy.x - lo ? 1 : -1;
            toy.push(dir * rand(380, 520) * S, -rand(320, 440) * S);
            b.reward({ mood: 0.05, boredom: -0.3, social: -0.12 });
            pet.fx.spawn('bang', { x: 26, y: pet.headTop() + 4, life: 0.5 });
            this.next('chase');
            return false;
          }
          if (this.pt > 9) this.next('sulk'); // 不理它
          return false;
        }
        case 'chase': {
          if (toy.kind !== this.kind) return true;
          wag();
          T.mouth = 'smile';
          T.mouthOpen = 0.5;
          T.eyes = 'wide';
          const d = sign(toy.x - pet.x) || 1;
          locomote(b, this, dt, toy.x - d * 22 * S, GAITS.run, 1.1);
          const close = Math.abs(toy.x - pet.x) < 30 * S && Math.abs(toy.y - pet.y) < 30 * S;
          if (close && toy.vy === 0 && Math.abs(toy.vx) < 90 * S) this.next('grab');
          else if (this.pt > 8) this.next('sulk');
          return false;
        }
        case 'grab': {
          // 低头叼起来
          s.gaze = 'none';
          T.lookY = 0.9;
          T.headY += 5;
          wag();
          if (this.pt > 0.25 && !toy.held) {
            toy.held = true;
            toy.vx = 0;
            pet.mouthToy = toy.kind;
          }
          if (toy.held) T.mouthBall = 1;
          if (this.pt > 0.45) {
            this.round += 1;
            this.final = this.round >= this.maxRounds;
            this.next('bring');
          }
          return false;
        }
        case 'rest': {
          // 玩够了：趴在球旁边，心满意足地哈气
          wag();
          T.loaf = 0.85;
          T.mouth = 'smile';
          T.mouthOpen = 0.45 + 0.1 * Math.sin(this.pt * 10);
          T.eyes = 'happy';
          T.blush = 1;
          s.gaze = 'none';
          if (!this.loved && this.pt > 0.5) {
            this.loved = true;
            hearts(pet, 2);
          }
          if (this.pt < 2.6) return false;
          toy.fadeOut(1.2);
          return true;
        }
        case 'sulk':
        default:
          // 不理我……不玩了
          s.gaze = 'none';
          T.earDroop = 0.55;
          T.mouth = 'pout';
          T.eyes = 'annoyed';
          T.lookX = -0.6;
          s.tailAmp = 0.15;
          if (!this.said2) {
            this.said2 = true;
            if (chance(0.45)) b.say('fetchBored', 2.2);
            toy.fadeOut(1.2);
          }
          return this.pt > 1.6;
      }
    },
    exit(b) {
      const toy = b.world.toy;
      if (toy && (toy.kind === 'ball' || toy.kind === 'bone')) toy.fadeOut(0.6);
    },
  }),

  /**
   * 追尾巴：突然发现了自己的尾巴（瞪眼、耳朵竖起来），转着圈追它，越转越快……
   * 转晕了，头顶冒小星星，然后傻乐
   */
  chaseTail: (b) => ({
    phase: 'notice',
    pt: 0,
    spins: rand(2.5, 4),
    side: chance(0.5) ? 1 : -1,
    x0: b.pet.x,
    said: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const S = b.world.scale;
      this.pt += dt;
      s.fps = 60;
      s.gaze = 'none';
      if (this.phase === 'notice') {
        T.facing = this.side * 0.5;
        T.lookX = -this.side * 0.9; // 回头看尾巴
        T.lookY = 0.3;
        T.eyes = 'wide';
        T.earDroop = -0.3;
        if (this.pt - dt < 0.1 && this.pt >= 0.1) pet.fx.spawn('bang', { x: -this.side * 28, y: pet.headTop() + 4, life: 0.6 });
        if (!this.said && this.pt > 0.2) {
          this.said = true;
          if (chance(0.5)) b.say('chaseTail', 2);
        }
        if (this.pt > 0.7) this.next('spin');
        return false;
      }
      if (this.phase === 'spin') {
        // 转圈：朝向一会儿左一会儿右，尾巴跟着从身后绕到另一边；一直回头看着尾巴，原地小步蹦着转
        const dur = this.spins / 1.4;
        const phi = this.pt * 1.4 * TAU * this.side;
        const f = Math.sin(phi);
        T.facing = f;
        T.lookX = -(sign(f) || 1) * 0.85;
        T.lookY = 0.25;
        T.lift = Math.abs(Math.sin(phi * 2)) * 5;
        T.lean = Math.cos(phi) * 0.06;
        T.eyes = 'wide';
        T.mouth = 'smile';
        T.mouthOpen = 0.5;
        s.tailSpeed = 9;
        s.tailAmp = 1;
        const [lo, hi] = pet.spanX(34, 14);
        pet.x = clamp(this.x0 + Math.sin(phi) * 12 * S, lo, hi);
        if (this.pt > dur) {
          stars(pet, 1.1);
          this.next('dizzy');
        }
        return false;
      }
      // 转晕了
      const k = 1 - clamp(this.pt / 1.4, 0, 1);
      T.eyes = this.pt < 0.9 ? 'dizzy' : 'happy';
      T.mouth = this.pt < 0.9 ? 'wavy' : 'smile';
      T.mouthOpen = 0.4;
      T.lean += Math.sin(this.pt * 5) * 0.08 * k;
      T.headTilt += Math.sin(this.pt * 5 + 1) * 0.1 * k;
      return this.pt > 1.5;
    },
  }),

  // ============================================================ 小熊猫

  /**
   * 趴在窗口边上睡：站在窗口顶上时，往边上一趴，四只爪子和大尾巴从边上垂下去，脑袋歪在一边睡着了
   * （真的小熊猫就是这样趴在树枝上睡觉的）。只在窗口上做
   */
  drapeNap: () => ({
    dur: rand(20, 34),
    side: chance(0.5) ? 1 : -1,
    zz: 1.4,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      if (!pet.perch) return true; // 窗口没了，掉下去了
      const k = clamp(t / 0.9, 0, 1) * clamp((this.dur - t) / 0.8, 0, 1);
      T.loaf = 1;
      T.drape = k;
      T.footLY = T.footRY = -15 * k; // 后脚从边上垂下去
      T.armL = 0.05 + wobble(t * 0.7, 1) * 0.04;
      T.armR = 0.05 + wobble(t * 0.7, 2) * 0.04;
      T.tailCurl = 1;
      T.tailHang = k; // 尾巴也垂下去
      T.headY += 5 * k;
      T.headTilt += this.side * 0.22 * k;
      T.lookY = 0.2;
      T.eyes = t > 1 ? 'sleep' : 'open';
      if (t <= 1) T.eyeL = T.eyeR = 0.45;
      T.blush = 0.6;
      T.earDroop = 0.3;
      s.gaze = 'none';
      s.blink = false;
      s.breathPeriod = 5;
      s.breathDepth = 2.2;
      s.tailAmp = 0.05;
      s.fps = t < 1.2 || t > this.dur - 1 ? 30 : 15;
      this.zz -= dt;
      if (t > 1.6 && this.zz <= 0 && t < this.dur - 1) {
        this.zz = rand(1.8, 2.6);
        pet.fx.spawn('zzz', { x: this.side * 22 + rand(-3, 3), y: pet.headTop() + 8, vx: this.side * rand(5, 9), vy: -rand(13, 18), life: 2.3, phase: rand(0, 6) });
      }
      return t >= this.dur;
    },
  }),

  /** 抱着尾巴睡：趴成一团，把大尾巴绕到身子前面抱着，脑袋枕在尾巴上，打个小盹 */
  tailHug: () => ({
    dur: rand(18, 30),
    side: chance(0.5) ? 1 : -1,
    zz: 1.4,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      T.loaf = 1;
      T.tailWrap = 1;
      T.tailCurl = 0.15;
      T.headY += 3;
      T.headTilt += this.side * 0.12;
      T.eyes = t > 1 ? 'sleep' : 'open';
      if (t <= 1) T.eyeL = T.eyeR = 0.45;
      T.blush = 0.65;
      T.earDroop = 0.3;
      s.gaze = 'none';
      s.blink = false;
      s.breathPeriod = 5;
      s.breathDepth = 2.4;
      s.tailAmp = 0.05;
      s.fps = t < 1.5 ? 30 : 15;
      this.zz -= dt;
      if (t > 1.6 && this.zz <= 0) {
        this.zz = rand(1.8, 2.6);
        pet.fx.spawn('zzz', { x: this.side * 20 + rand(-3, 3), y: pet.headTop() + 6, vx: this.side * rand(5, 9), vy: -rand(13, 18), life: 2.3, phase: rand(0, 6) });
      }
      return t >= this.dur;
    },
  }),

  // ============================================================ 兔子

  /**
   * 开心扭跳（binky）：兔子开心到极点真的会这样——蹲一下，原地蹦得老高，在半空中把身子一扭、后腿往旁边一蹬、
   * 两只耳朵甩起来；落地以后再连蹦两下小的，一脸得意，冒小星星。往空的那边挪一点点
   */
  binky: (b) => {
    const pet = b.pet;
    const [lo, hi] = pet.spanX(40, 20);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1;
    return {
      phase: 'crouch',
      pt: 0,
      hops: 0,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        const S = b.world.scale;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        s.tailAmp = 0.8;
        s.tailSpeed = 3;
        T.eyes = 'happy';
        T.mouth = 'smile';
        T.mouthOpen = 0.6;
        T.blush = 0.9;
        const drift = (px) => {
          const [a, c] = pet.spanX(34, 14);
          pet.x = clamp(pet.x + dir * px * S, a, c);
        };
        if (this.phase === 'crouch') {
          // 蹲下来，攒劲
          const u = clamp(this.pt / 0.3, 0, 1);
          T.squash += 0.16 * u;
          T.armL = T.armR = 0.15;
          T.earDroop = 0.25 * u;
          if (u >= 1) this.next('jump');
          return false;
        }
        if (this.phase === 'jump') {
          // 蹦起来：在空中扭一下（绕着身子中间转过去再转回来），后腿往旁边一蹬，耳朵甩来甩去
          const D = 0.72;
          const u = clamp(this.pt / D, 0, 1);
          const tw = Math.sin(u * TAU);
          T.lift = 46 * 4 * u * (1 - u);
          drift((dt / D) * 24);
          T.roll = 0.42 * tw * dir;
          T.footLX = -12 * tw;
          T.footRX = -12 * tw;
          T.footLY = 7 * bell(u);
          T.footRY = 4 * bell(u);
          T.armL = 1.05 + 0.4 * tw;
          T.armR = 1.05 - 0.4 * tw;
          T.earL = -0.25 * tw; // 耳朵自己还会跟着跳和扭甩起来（pet.js 的 #earBounce），这里只给一点点
          T.earR = 0.25 * tw;
          T.earDroop = 0.2;
          if (u >= 1) {
            pet.squashSpring.kick(1.6);
            pet.fx.spawn('dust', { x: -dir * 18, y: -3, vx: -dir * 30, vy: -6, life: 0.4 });
            this.next('hop');
          }
          return false;
        }
        if (this.phase === 'hop') {
          // 落地以后再连蹦两下小的
          const H = this.hops === 0 ? 14 : 8;
          const D = 0.32;
          const u = clamp(this.pt / D, 0, 1);
          T.lift = H * 4 * u * (1 - u);
          drift((dt / D) * 10);
          T.footLY = T.footRY = 2.5 * bell(u);
          T.earDroop = 0.14 * bell(u);
          if (u >= 1) {
            pet.squashSpring.kick(0.9);
            this.hops += 1;
            this.pt = 0;
            if (this.hops >= 2) this.next('proud');
          }
          return false;
        }
        // 一脸得意
        T.armL = T.armR = 0.3;
        T.headTilt += 0.06 * dir;
        if (!this.said) {
          this.said = true;
          sparks(pet, 4);
          b.reward({ mood: 0.05, boredom: -0.15 });
          if (chance(0.55)) b.say('binky', 2.2);
        }
        return this.pt > 1.1;
      },
    };
  },

  /**
   * 洗脸：坐好，两只前爪捧着脸上下搓一搓；然后歪着头把一只长耳朵拉下来（从脸的外侧一直拉到下巴边），
   * 两只爪子捧着舔一舔、捋一捋；最后甩甩脑袋，耳朵"啪"地弹回去，一脸清爽
   */
  faceWash: () => ({
    phase: 'sit',
    pt: 0,
    side: chance(0.5) ? -1 : 1,
    rub: rand(1.8, 2.6),
    lick: rand(2, 2.8),
    said: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      this.pt += dt;
      s.fps = 30;
      s.gaze = 'none';
      T.crouch = 1;
      T.tailCurl = 0.35;
      const side = this.side;
      switch (this.phase) {
        case 'sit':
          if (this.pt > 0.4) this.next('rub');
          return false;
        case 'rub': {
          // 两只前爪捧着脸上下搓（手往里抬到嘴边，画在脸的前面）
          const c = Math.sin(this.pt * TAU * 2.2);
          const k = clamp(this.pt / 0.3, 0, 1);
          T.armL = T.armR = (-2.4 + c * 0.13) * k;
          T.headY += (2 + c) * k;
          T.headTilt += c * 0.05 * k;
          T.lookY = 0.4;
          T.eyes = 'sleep';
          T.earDroop = 0.15;
          if (!this.said && this.pt > 0.6) {
            this.said = true;
            if (chance(0.45)) b.say('faceWash', 2);
          }
          if (this.pt > this.rub) this.next('ear');
          return false;
        }
        case 'ear': {
          // 歪头，把一只耳朵拉到脸前面，舔一舔（嘴一张一合），爪子跟着一下一下地捋
          const e = easeInOut(clamp(this.pt / 0.45, 0, 1));
          const lickNow = Math.sin(this.pt * 13) > 0.2;
          T.earPull = side * e;
          T.headTilt += side * 0.2 * e;
          T.headY += 2.5;
          T.lookX = side * 0.35 * e;
          T.lookY = 0.5;
          T.armL = T.armR = -2.45 + Math.sin(this.pt * 6.5) * 0.1;
          T.eyes = 'sleep';
          T.mouth = lickNow && e > 0.8 ? 'o' : 'cat';
          T.mouthOpen = 0.4;
          if (this.pt > this.lick) this.next('shake');
          return false;
        }
        case 'shake': {
          // 甩甩脑袋：耳朵弹回去，左右甩两下
          const amp = clamp(1 - this.pt / 0.6, 0, 1);
          const w = Math.sin(this.pt * 30) * amp;
          T.headTilt += w * 0.16;
          T.earL = -w * 0.45;
          T.earR = w * 0.45;
          T.eyes = 'squeeze';
          if (this.pt > 0.6) this.next('done');
          return false;
        }
        default:
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.35;
          T.blush = 0.8;
          if (this.pt - dt <= 0) sparks(pet, 3);
          return this.pt > 1;
      }
    },
  }),

  /**
   * 摊成兔饼（flop）：兔子觉得特别安心才会这样——往旁边"啪叽"一倒、侧躺着，后腿往后一伸，
   * 眯着眼打个小盹，耳朵软软地搭着，偶尔蹬蹬腿；醒了慢慢翻回来坐好，抖抖毛
   */
  flop: (b) => {
    const pet = b.pet;
    const [lo, hi] = pet.spanX(40, 20);
    const side = hi - pet.x >= pet.x - lo ? 1 : -1; // 往空的那边倒
    return {
      phase: 'ready',
      pt: 0,
      nap: rand(5, 8),
      zzIn: 1.6,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        T.crouch = 1;
        const LIE = 1.42; // 侧躺：差不多转到平
        if (this.phase === 'ready') {
          // 左右看一眼，觉得很安全
          s.fps = 30;
          T.lookX = Math.sin(this.pt * 7) * 0.6;
          if (this.pt > 0.5) this.next('flop');
          return false;
        }
        if (this.phase === 'flop') {
          // 啪叽：一下子倒下去（越倒越快）
          s.fps = 60;
          const u = clamp(this.pt / 0.24, 0, 1);
          T.roll = side * LIE * u * u;
          T.lift = rollLift(T.roll);
          T.eyes = 'sleep';
          if (u >= 1) {
            pet.squashSpring.kick(1.8);
            pet.fx.spawn('dust', { x: side * 50, y: -3, vx: side * 36, vy: -6, life: 0.45 });
            this.next('lie');
          }
          return false;
        }
        if (this.phase === 'lie') {
          // 侧躺着打盹：后腿往后伸直，耳朵软软地搭着，呼吸深一点，偶尔蹬一下腿
          s.fps = 30;
          s.blink = false;
          s.breathDepth = 1.7;
          T.roll = side * LIE;
          T.lift = rollLift(T.roll);
          T.eyes = 'sleep';
          T.mouth = 'cat';
          T.blush = 0.85;
          T.earDroop = 0.5;
          T.footLY = T.footRY = -4;
          T.footLX = T.footRX = -side * 5;
          const kick = Math.max(0, Math.sin(this.pt * 2.3) - 0.92) * 12;
          T.footRY -= kick * 3;
          T.armL = T.armR = 0.35;
          if (!this.said && this.pt > 0.6) {
            this.said = true;
            hearts(pet, 1);
            if (chance(0.5)) b.say('flop', 2.2);
          }
          this.zzIn -= dt;
          if (this.zzIn <= 0) {
            this.zzIn = rand(2.2, 3.2);
            pet.fx.spawn('zzz', { x: side * 26, y: pet.headTop() + 22, vx: side * 6, vy: -14, life: 2.2, phase: rand(0, 6) });
          }
          if (this.pt > this.nap) this.next('up');
          return false;
        }
        if (this.phase === 'up') {
          // 慢慢翻回来坐好
          s.fps = 60;
          const u = clamp(this.pt / 0.7, 0, 1);
          T.roll = side * LIE * (1 - easeInOut(u));
          T.lift = rollLift(T.roll);
          T.eyes = u > 0.5 ? 'open' : 'sleep';
          if (u >= 1) this.next('shake');
          return false;
        }
        // 抖抖毛
        s.fps = 60;
        const amp = clamp(1 - this.pt / 0.55, 0, 1);
        const w = Math.sin(this.pt * 32) * amp;
        T.lean += w * 0.05;
        T.earL = -w * 0.35;
        T.earR = w * 0.35;
        T.eyes = 'squeeze';
        return this.pt > 0.7;
      },
    };
  },

  // ============================================================ 狐狸

  /**
   * 扑雪捕鼠：听见地底下有小动静——竖起耳朵、歪着头左听右听，压低身子扭一扭屁股，高高跳起来，
   * 在空中翻过身、一头扎进地里（地面以下在活动范围外面，被裁掉，看起来就是脑袋扎进了雪里），
   * 屁股和后腿露在外面蹬两下，再把脑袋拔出来、甩掉头上的雪。多半什么也没抓到（冒个问号），有时得意地冒星星。
   * 站在窗口上不做：窗口顶边下面是看得见的，脑袋会露在窗口里
   */
  pounce: (b) => {
    const pet = b.pet;
    const S = b.world.scale;
    const [lo, hi] = pet.spanX(40, 20);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1;
    const reach = clamp((dir > 0 ? hi - pet.x : pet.x - lo) / S - 10, 0, 70); // 往前扑多远（按宠物原始大小算的像素）
    const DIVE = -44; // 扎进去多深：两只眼睛都在地面以下
    const TURN = 2.9; // 翻过去多少（弧度）：差不多倒立，稍微往前斜，屁股和尾巴高高地翘在外面
    return {
      phase: 'listen',
      pt: 0,
      listen: rand(1.3, 2.1),
      stuck: rand(0.8, 1.2),
      caught: chance(0.35),
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        // 扎下去、拔出来的地方溅起来的雪
        const snowAt = (n) => {
          const x = dir * 14;
          for (let i = 0; i < n; i++) {
            pet.fx.spawn('puff', { x: x + rand(-16, 16), y: -rand(0, 5), vx: rand(-45, 45), vy: -rand(20, 55), life: rand(0.45, 0.7), size: rand(0.8, 1.3) });
          }
          for (let i = 0; i < Math.ceil(n / 2); i++) {
            pet.fx.spawn('snow', { x: x + rand(-12, 12), y: -rand(2, 8), vx: rand(-60, 60), vy: -rand(80, 140), ay: 300, life: rand(0.7, 1), size: rand(0.6, 0.9), rot: rand(0, 3) });
          }
        };
        switch (this.phase) {
          case 'listen': {
            // 竖起耳朵，歪着头听，眼睛盯着前面的地
            s.fps = 30;
            const tilt = Math.sin(this.pt * 2.6);
            T.facing = dir * 0.55;
            T.earDroop = -0.35;
            T.earL = tilt > 0.7 ? 0.18 : 0;
            T.earR = tilt < -0.7 ? -0.18 : 0;
            T.headTilt += tilt * 0.22;
            T.lookX = dir * 0.6;
            T.lookY = 0.8;
            T.eyes = 'wide';
            T.tailCurl = 0.8;
            s.tailAmp = 0.12;
            if (!this.said && this.pt > 0.5) {
              this.said = true;
              if (chance(0.5)) b.say('pounce', 2);
            }
            if (this.pt > this.listen) this.next('crouch');
            return false;
          }
          case 'crouch': {
            // 压低身子，屁股扭一扭，攒劲
            s.fps = 60;
            const u = clamp(this.pt / 0.45, 0, 1);
            T.facing = dir;
            T.crouch = 0.45 * u;
            T.squash += 0.12 * u;
            T.lean += dir * 0.1 * u + Math.sin(this.pt * 28) * 0.035 * u;
            T.earDroop = -0.3;
            T.lookX = dir * 0.7;
            T.lookY = 0.85;
            T.eyes = 'wide';
            T.tailCurl = 0.95;
            if (this.pt > 0.6) this.next('leap');
            return false;
          }
          case 'leap': {
            // 高高跳起来，在空中翻过身：先仰着头往上蹿，过了最高点一头往下栽，两只前爪伸在前面
            s.fps = 60;
            const D = 0.62;
            const u = clamp(this.pt / D, 0, 1);
            const [a, c] = pet.spanX(34, 14);
            pet.x = clamp(pet.x + dir * (dt / D) * reach * S, a, c);
            T.facing = dir;
            T.lift = 72 * 4 * u * (1 - u) + DIVE * u * u;
            T.roll = dir * (TURN * easeInOut((u - 0.15) / 0.85) - 0.3 * bell(u / 0.4));
            T.armL = T.armR = 1.25;
            T.footLY = T.footRY = 4 * u;
            T.earDroop = -0.25;
            T.eyes = 'wide';
            T.mouth = 'o';
            T.mouthOpen = 0.5;
            T.tailCurl = 1 - clamp((u - 0.35) / 0.4, 0, 1); // 翻过来以后尾巴"垂下来"，倒立着看就是翘向天
            if (u >= 1) {
              pet.squashSpring.kick(1.2);
              snowAt(9);
              this.next('stuck');
            }
            return false;
          }
          case 'stuck': {
            // 脑袋扎在地里，屁股和后腿露在外面蹬一蹬，尾巴甩来甩去
            s.fps = 60;
            const k = Math.sin(this.pt * 17);
            T.facing = dir;
            T.roll = dir * (TURN + Math.sin(this.pt * 11) * 0.035);
            T.lift = DIVE + Math.abs(Math.sin(this.pt * 9)) * 1.2;
            T.armL = T.armR = 1.25;
            // 倒立着：脚往身子"下面"伸（看起来是朝天蹬），尾巴"垂下来"（看起来是朝天翘着甩）
            T.footLY = -3 + 4 * k;
            T.footRY = -3 - 4 * k;
            T.tailCurl = 0;
            s.tailAmp = 1;
            s.tailSpeed = 6;
            if (chance(dt * 3)) snowAt(1);
            if (this.pt > this.stuck) this.next('pull');
            return false;
          }
          case 'pull': {
            // 把脑袋拔出来：往后一仰，蹦一下，四只脚落回地上
            s.fps = 60;
            const u = clamp(this.pt / 0.45, 0, 1);
            const e = easeInOut(u);
            T.facing = dir;
            T.roll = dir * TURN * (1 - e);
            T.lift = DIVE * (1 - e) + 18 * bell(u);
            T.eyes = 'squeeze';
            T.armL = T.armR = 0.6 * (1 - u);
            if (this.pt - dt <= 0) snowAt(7);
            if (u >= 1) {
              pet.squashSpring.kick(0.8);
              this.next('shake');
            }
            return false;
          }
          case 'shake': {
            // 甩甩头，把雪甩掉
            s.fps = 60;
            const amp = clamp(1 - this.pt / 0.6, 0, 1);
            const w = Math.sin(this.pt * 32) * amp;
            T.headTilt += w * 0.2;
            T.earL = -w * 0.4;
            T.earR = w * 0.4;
            T.eyes = 'squeeze';
            if (this.pt - dt <= 0) {
              for (let i = 0; i < 5; i++) {
                pet.fx.spawn('snow', { x: rand(-30, 30), y: pet.headTop() + rand(4, 16), vx: rand(-70, 70), vy: -rand(20, 70), ay: 240, life: rand(0.6, 0.9), size: rand(0.5, 0.8), rot: rand(0, 3) });
              }
            }
            if (this.pt > 0.65) this.next('result');
            return false;
          }
          default: {
            // 什么都没抓到：歪着头冒个问号；抓到了：得意地冒星星
            s.fps = 30;
            T.facing = dir * 0.4;
            if (this.caught) {
              T.eyes = 'happy';
              T.mouth = 'smile';
              T.mouthOpen = 0.4;
              T.blush = 0.9;
              T.tailCurl = 1;
              s.tailAmp = 0.8;
              s.tailSpeed = 3;
              if (this.pt - dt <= 0) {
                sparks(pet, 4);
                b.reward({ mood: 0.05 });
              }
            } else {
              T.headTilt += 0.18 * dir;
              T.lookX = dir * 0.5;
              T.lookY = 0.6;
              T.mouth = 'wavy';
              T.blush = 0.8;
              if (this.pt - dt <= 0) {
                pet.fx.spawn('question', { x: dir * 26, y: pet.headTop() + 4, life: 1.1 });
                if (chance(0.6)) b.say('pounceMiss', 2);
              }
            }
            return this.pt > 1.3;
          }
        }
      },
    };
  },

  /**
   * 藏葡萄：狐狸会把吃不完的东西埋起来，留着以后吃。先左右看看，在旁边刨个小坑（土块往后飞），
   * 从怀里掏出一串葡萄放进去，把土扒回去盖好、拍一拍压实，再左看右看、偷偷地笑。小土堆过一会儿就看不出来了
   */
  buryGrapes: (b) => {
    const pet = b.pet;
    const [lo, hi] = pet.spanX(40, 20);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1;
    const holeX = dir * 38; // 坑挖在前面一点（宠物坐标）
    return {
      phase: 'look',
      pt: 0,
      dirt: null,
      dropped: false,
      patted: 0,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        s.fps = 30;
        const dirt = () => {
          if (!this.dirt) this.dirt = pet.fx.spawn('dirt', { x: holeX + dir * 18, y: 0, k: 0, hole: 0, holeX: -dir * 18, life: 120, solid: true, size: 1.35 });
          return this.dirt;
        };
        const lean = (k) => {
          // 面朝着坑，压低身子、低头看着
          T.facing = dir;
          T.crouch = 0.45;
          T.lean += dir * 0.28 * k;
          T.headY += 6 * k;
          T.lookX = dir * 0.6;
          T.lookY = 0.95;
        };
        switch (this.phase) {
          case 'look': // 左看看、右看看：没人注意吧？
            T.lookX = Math.sin(this.pt * 5.5) * 0.85;
            T.earDroop = -0.2;
            if (this.pt > 1.1) this.next('dig');
            return false;
          case 'dig': {
            // 两只前爪轮流刨土，土块往后飞
            s.fps = 60;
            lean(clamp(this.pt / 0.25, 0, 1));
            const c = Math.sin(this.pt * 17);
            const near = 0.5 + 0.45 * c; // 靠坑那边的爪子刨得欢
            const far = 0.3 - 0.25 * c;
            T.armL = dir < 0 ? near : far;
            T.armR = dir > 0 ? near : far;
            T.tailCurl = 0.9;
            s.tailAmp = 0.5;
            s.tailSpeed = 3;
            const d = dirt();
            d.hole = clamp(this.pt / 1.3, 0, 1);
            d.k = clamp(this.pt / 1.6, 0, 1);
            if (chance(dt * 14)) {
              // 土块从坑里贴着地往后飞，从两只脚中间飞到身后去
              pet.fx.spawn('crumb', { x: holeX + rand(-8, 4) * dir, y: -rand(1, 4), vx: -dir * rand(90, 170), vy: -rand(50, 110), ay: 520, life: 0.6, size: rand(1.8, 3), color: chance(0.5) ? '#8f6440' : '#a8774c' });
            }
            if (this.pt > 1.9) this.next('drop');
            return false;
          }
          case 'drop':
            // 从怀里掏出一串葡萄，看一眼，放进坑里
            s.fps = 60;
            if (this.pt < 0.75) {
              T.facing = dir * 0.5;
              T.crouch = 0.3;
              T.snack = 1;
              T.armL = T.armR = -0.75;
              T.lookY = 0.5;
              T.eyes = 'happy';
              if (this.pt - dt <= 0) sparks(pet, 2);
            } else {
              lean(1);
              T.armL = T.armR = 0.35;
              if (!this.dropped) {
                this.dropped = true;
                const from = snackPoint(pet);
                pet.pose.snack = 0; // 手里那串马上收起来（换成往坑里落的这一串）
                pet.fx.spawn('snack', { kind: pet.sp.snack, x: from.x, y: from.y, from, to: { x: holeX, y: -3 }, arc: 14, life: 0.42, solid: true, shrink: 0.7, vrot: dir * 2 });
              }
            }
            if (this.pt > 1.3) this.next('cover');
            return false;
          case 'cover': {
            // 把土扒回去：两只爪子一起往坑里推
            s.fps = 60;
            lean(1);
            const c = Math.sin(this.pt * 12);
            T.armL = T.armR = 0.4 + 0.25 * c;
            const d = dirt();
            d.hole = clamp(1 - this.pt / 0.9, 0, 1);
            d.k = 1 - 0.55 * clamp(this.pt / 1.2, 0, 1);
            if (this.pt > 1.3) this.next('pat');
            return false;
          }
          case 'pat': {
            // 拍一拍，压实
            s.fps = 60;
            lean(1);
            const c = Math.sin(this.pt * 13);
            T.armL = T.armR = 0.3 + 0.35 * Math.max(0, c);
            if (c < -0.9 && this.pt - this.patted > 0.3) {
              this.patted = this.pt;
              pet.fx.spawn('dust', { x: holeX + rand(-6, 6), y: -2, vx: rand(-20, 20), vy: -8, life: 0.35, size: 0.7 });
            }
            dirt().k = 0.45 - 0.25 * clamp(this.pt, 0, 1);
            if (this.pt > 1.1) this.next('sly');
            return false;
          }
          default: {
            // 站好，左右看看有没有人看见，嘿嘿一笑。土堆慢慢看不出来了
            T.crouch = 0.2;
            if (this.pt < 1.1) {
              T.lookX = Math.sin(this.pt * 5.5) * 0.8;
            } else {
              T.eyes = 'happy';
              T.mouth = 'smile';
              T.mouthOpen = 0.3;
              T.blush = 0.9;
              s.tailAmp = 0.6;
              s.tailSpeed = 2.5;
              if (!this.said) {
                this.said = true;
                if (chance(0.6)) b.say('bury', 2.2);
              }
            }
            if (this.pt > 1.4) this.exit();
            return this.pt > 2.4;
          }
        }
      },
      exit() {
        // 土堆淡掉（半秒）；被打断时也一样，免得一堆土跟着它走
        const d = this.dirt;
        if (d && d.dieAt == null) {
          d.dieAt = d.age;
          d.life = d.age + 0.55;
        }
      },
    };
  },

  /**
   * 用大尾巴盖着鼻子睡：先原地转一圈（像小狗睡觉前那样找个舒服的姿势），趴下来，
   * 大尾巴绕到前面、白尾巴尖塞在鼻子底下（画法见 species/fox.js 的 drawTail）；睡着睡着偷偷睁一只眼看看你，接着睡
   */
  tailNap: () => ({
    phase: 'circle',
    pt: 0,
    dur: rand(16, 26),
    side: chance(0.5) ? 1 : -1,
    peekAt: rand(4, 8),
    zz: 1.6,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      this.pt += dt;
      s.gaze = 'none';
      if (this.phase === 'circle') {
        // 原地转一圈：先扭向一边、再扭向另一边，脚下踏着小碎步
        s.fps = 60;
        const u = clamp(this.pt / 1.5, 0, 1);
        T.facing = Math.sin(u * TAU) * this.side;
        const st = Math.sin(this.pt * 16);
        T.footLY = Math.max(0, st) * 3;
        T.footRY = Math.max(0, -st) * 3;
        T.lookY = 0.6;
        T.tailCurl = 0.6;
        if (u >= 1) this.next('lie');
        return false;
      }
      // 趴下，尾巴绕过来盖住鼻子
      const settled = this.pt > 0.8;
      T.loaf = 1;
      T.tailWrap = 1;
      T.tailCurl = 0.15;
      T.headY += 3;
      T.headTilt += this.side * 0.1;
      T.blush = 0.65;
      T.earDroop = 0.3;
      s.blink = false;
      s.breathPeriod = 5;
      s.breathDepth = 2.4;
      s.tailAmp = 0.04;
      s.fps = this.pt < 1.5 ? 30 : 15;
      const peek = this.pt > this.peekAt && this.pt < this.peekAt + 1.3;
      if (peek) {
        // 偷偷睁一只眼看你
        s.fps = 30;
        T.eyes = 'open';
        T.eyeL = this.side < 0 ? 0.5 : 0.06;
        T.eyeR = this.side > 0 ? 0.5 : 0.06;
      } else {
        T.eyes = settled ? 'sleep' : 'open';
        if (!settled) T.eyeL = T.eyeR = 0.45;
      }
      this.zz -= dt;
      if (this.pt > 1.6 && this.zz <= 0 && !peek) {
        this.zz = rand(1.8, 2.6);
        pet.fx.spawn('zzz', { x: this.side * 22 + rand(-3, 3), y: pet.headTop() + 6, vx: this.side * rand(5, 9), vy: -rand(13, 18), life: 2.3, phase: rand(0, 6) });
      }
      return this.pt >= this.dur;
    },
  }),

  // ============================================================ 企鹅

  /**
   * 肚皮着地往前滑：看看前面，小碎步往前冲几步，往前一扑趴在地上，"咻——"地滑出去，越滑越慢，
   * 翅膀贴在身边、脚在后面扑腾；停下来乐一会儿，翻回来站好，开心地拍拍翅膀
   */
  bellySlide: (b) => {
    const pet = b.pet;
    const S = b.world.scale;
    const [lo, hi] = pet.spanX(40, 20);
    const dir = hi - pet.x >= pet.x - lo ? 1 : -1;
    const LIE = 1.4;
    return {
      phase: 'ready',
      pt: 0,
      v: 0,
      trail: 0,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        s.fps = 60;
        const [a, c] = pet.spanX(34, 14);
        const edge = dir > 0 ? c : a;
        const ahead = Math.abs(edge - pet.x) / S; // 前面还有多远（原始像素）
        const lying = (k) => {
          T.facing = dir;
          T.roll = dir * LIE * k;
          T.headTilt += -dir * 0.3 * k; // 脑袋稍微抬起来看着前面
          T.lift = lieLift(pet, T.roll, -dir * 0.3 * k);
        };
        switch (this.phase) {
          case 'ready': // 看看前面，翅膀往后一甩
            T.facing = dir;
            T.lookX = dir * 0.8;
            T.eyes = 'wide';
            T.armL = T.armR = 0.5 * clamp(this.pt / 0.3, 0, 1);
            T.lean += dir * 0.08;
            if (this.pt > 0.6) this.next('run');
            return false;
          case 'run': // 小碎步往前冲几步
            locomote(b, this, dt, edge, GAITS.trot, 1.3);
            T.eyes = 'wide';
            if (this.pt > 0.6 || ahead < 150) this.next('dive');
            return false;
          case 'dive': {
            // 往前一扑，肚皮着地
            const u = clamp(this.pt / 0.24, 0, 1);
            lying(u * u);
            T.lift += 10 * bell(u);
            T.armL = T.armR = 0.15;
            T.eyes = 'happy';
            pet.x = clamp(pet.x + dir * 120 * S * dt, a, c);
            if (u >= 1) {
              pet.squashSpring.kick(1.2);
              pet.fx.spawn('dust', { x: dir * 30, y: -3, vx: dir * 30, vy: -6, life: 0.45 });
              this.v = clamp(ahead * 1.3, 90, 260); // 前面地方小，就滑得慢一点
              this.next('slide');
            }
            return false;
          }
          case 'slide': {
            // 滑出去：越滑越慢，脚在后面扑腾
            this.v = Math.max(0, this.v - 170 * dt);
            const step = Math.min(this.v * S * dt, Math.abs(edge - pet.x));
            pet.x += dir * step;
            if (Math.abs(edge - pet.x) < 0.5) this.v = 0;
            lying(1);
            T.armL = T.armR = 0.12;
            const k = Math.sin(this.pt * 20);
            T.footLY = 3 + 2 * k;
            T.footRY = 3 - 2 * k;
            T.eyes = 'happy';
            T.mouth = 'o';
            T.blush = 0.9;
            this.trail -= dt;
            if (this.v > 30 && this.trail <= 0) {
              // 身后扬起的雪沫（往后飘，看起来留在原地）
              this.trail = 0.06;
              pet.fx.spawn('puff', { x: -dir * rand(20, 40), y: -rand(1, 4), vx: -dir * this.v * 0.8, vy: -rand(5, 15), life: 0.4, size: rand(0.6, 0.9) });
            }
            if (!this.said && this.pt > 0.3) {
              this.said = true;
              if (chance(0.6)) b.say('bellySlide', 2);
            }
            if (this.v <= 0) this.next('rest');
            return false;
          }
          case 'rest': // 停下来，趴着乐一会儿
            lying(1);
            T.armL = T.armR = 0.12 + 0.1 * Math.sin(this.pt * 10);
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.4;
            T.blush = 0.9;
            if (this.pt > 0.7) this.next('up');
            return false;
          case 'up': {
            // 翻回来站好
            const u = clamp(this.pt / 0.55, 0, 1);
            lying(1 - easeInOut(u));
            T.facing = dir * (1 - u);
            if (u >= 1) this.next('flap');
            return false;
          }
          default: // 开心地拍拍翅膀
            T.armL = T.armR = 0.9 + 0.4 * Math.sin(this.pt * 26) * clamp(1 - this.pt / 0.8, 0, 1);
            T.eyes = 'happy';
            T.mouth = 'smile';
            T.mouthOpen = 0.4;
            if (this.pt - dt <= 0) {
              sparks(pet, 3);
              b.reward({ mood: 0.05, boredom: -0.1 });
            }
            return this.pt > 0.9;
        }
      },
    };
  },

  /** 拍着翅膀原地蹦：开心起来，两只小翅膀扑棱扑棱地拍，原地蹦几下、抬头看天——可惜还是飞不起来 */
  flapHop: () => ({
    phase: 'ready',
    pt: 0,
    t: 0,
    hops: 0,
    n: Math.round(rand(3, 5)),
    said: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      this.pt += dt;
      this.t += dt;
      s.fps = 60;
      s.gaze = 'none';
      const flap = Math.sin(this.t * 30);
      T.eyes = 'happy';
      T.mouth = 'o';
      T.mouthOpen = 0.5;
      T.blush = 0.9;
      if (this.phase === 'ready') {
        // 蹲一下
        T.squash += 0.12 * clamp(this.pt / 0.2, 0, 1);
        T.armL = T.armR = 1 + 0.5 * flap;
        if (this.pt > 0.22) this.next('hop');
        return false;
      }
      if (this.phase === 'hop') {
        const D = 0.36;
        const u = clamp(this.pt / D, 0, 1);
        T.lift = 13 * 4 * u * (1 - u);
        T.footLY = T.footRY = 3 * bell(u);
        T.armL = T.armR = 1 + 0.55 * flap;
        T.lookY = -0.5;
        if (!this.said && this.hops === 1) {
          this.said = true;
          if (chance(0.6)) b.say('flapHop', 2);
        }
        if (u >= 1) {
          pet.squashSpring.kick(0.9);
          this.hops += 1;
          this.next(this.hops >= this.n ? 'done' : 'hop');
        }
        return false;
      }
      // 停下来，翅膀慢慢放下：有点得意，又有点遗憾
      const k = clamp(1 - this.pt / 0.5, 0, 1);
      T.armL = T.armR = 0.45 + 0.4 * flap * k;
      T.mouth = 'smile';
      T.mouthOpen = 0.35;
      if (this.pt - dt <= 0) {
        sparks(pet, 3);
        b.reward({ mood: 0.04 });
      }
      return this.pt > 1;
    },
  }),

  /**
   * 滑一跤：走着走着脚下一滑，一只脚往前一蹬、身子往后仰、两只翅膀乱扑腾，"噗通"一屁股坐在地上，冒小星星；
   * 愣一下，不好意思地挠挠头，爬起来拍拍
   */
  slipFall: (b) => {
    const pet = b.pet;
    const S = b.world.scale;
    const tx = pickWalkTarget(b, 60, 110);
    const dir = tx >= pet.x ? 1 : -1;
    return {
      phase: 'walk',
      pt: 0,
      slipAt: rand(0.9, 1.5),
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        s.fps = 60;
        switch (this.phase) {
          case 'walk':
            if (locomote(b, this, dt, tx, GAITS.walk) || this.pt > this.slipAt) this.next('slip');
            return false;
          case 'slip': {
            // 脚下一滑：前面那只脚往前一蹬，身子往后仰，翅膀乱扑腾
            const u = clamp(this.pt / 0.32, 0, 1);
            const [a, c] = pet.spanX(34, 14);
            pet.x = clamp(pet.x + dir * 50 * (1 - u) * S * dt, a, c);
            T.facing = dir;
            if (dir > 0) {
              T.footRX = 12 * u;
              T.footRY = 8 * u;
            } else {
              T.footLX = -12 * u;
              T.footLY = 8 * u;
            }
            T.lean += -dir * 0.42 * u;
            T.lift += 7 * bell(u);
            const fl = Math.sin(this.pt * 42);
            T.armL = 1.45 + 0.45 * fl;
            T.armR = 1.45 - 0.45 * fl;
            T.eyes = 'wide';
            T.mouth = 'o';
            T.mouthOpen = 1;
            if (this.pt - dt <= 0) pet.fx.spawn('bang', { x: dir * 24, y: pet.headTop() + 2, life: 0.55 });
            if (u >= 1) {
              pet.squashSpring.kick(2.2);
              for (const sd of [-1, 1]) pet.fx.spawn('dust', { x: sd * 30, y: -3, vx: sd * 34, vy: -8, life: 0.45 });
              stars(pet, 1.5, -100);
              this.next('thud');
            }
            return false;
          }
          case 'thud': // 噗通：一屁股坐在地上，晕乎乎的
            T.crouch = 1;
            T.facing = dir * 0.3;
            T.lean += -dir * 0.1 * clamp(1 - this.pt / 0.4, 0, 1);
            T.footLY = T.footRY = 3;
            T.armL = T.armR = 0.5;
            T.eyes = this.pt < 0.7 ? 'dizzy' : 'squeeze';
            T.mouth = 'wavy';
            T.blush = 1;
            if (this.pt > 1.4) this.next('sheepish');
            return false;
          case 'sheepish': {
            // 不好意思地挠挠头
            T.crouch = 1;
            T.eyes = 'happy';
            T.mouth = 'wavy';
            T.blush = 1;
            T.headTilt += 0.12 * dir;
            const scratch = 1.85 + Math.sin(this.pt * 14) * 0.12;
            if (dir > 0) T.armR = scratch;
            else T.armL = scratch;
            if (!this.said) {
              this.said = true;
              if (chance(0.7)) b.say('slipFall', 2.2);
            }
            if (this.pt > 1.4) this.next('up');
            return false;
          }
          default: // 爬起来，拍拍
            T.armL = T.armR = 0.3 + 0.25 * Math.max(0, Math.sin(this.pt * 16));
            return this.pt > 0.7;
        }
      },
    };
  },

  // ============================================================ 水獭

  /**
   * 抛小石子玩杂耍：坐好，两只爪子里各一颗小石子——左爪往上高高一抛、右爪接住，右爪再低低地递回左爪，
   * 两颗石子在空中轮流飞（眼睛跟着高的那颗转）。最后多半稳稳接住、得意地冒星星；
   * 有时候最后一颗抛歪了，"咚"地砸在自己脑袋上，冒小星星，石子弹到地上
   */
  juggle: () => {
    const HIGH = 0.68; // 左爪抛给右爪：抛得高（秒），差不多抛到眼睛那么高
    const LOW = 0.3; // 右爪递回左爪：低低的
    const DWELL = 0.12; // 接住以后在爪子里停多久再抛
    const G = 760;
    const SIZE = 1.35; // 石子画大一点，不然在桌面上看不清
    return {
      phase: 'sit',
      pt: 0,
      throws: 0,
      n: Math.round(rand(8, 12)),
      bonk: chance(0.3),
      said: false,
      stones: null,
      kickL: 0,
      kickR: 0,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      /** 爪子在哪儿（坐着时在下巴下面的两边，石子停在爪子上面） */
      hand(pet, side) {
        const g = getGeometry(pet.sp, pet.pose);
        return { x: g.torsoCx + side * 17, y: g.torsoCy + 2 - pet.pose.lift };
      },
      /** 石子停在爪子里（画在爪子上，停 dur 秒） */
      rest(pet, st, dur) {
        const h = this.hand(pet, st.side);
        st.fx = pet.fx.spawn('pebble', { x: h.x, y: h.y, life: dur, solid: true, rot: st.rot || 0, size: SIZE });
      },
      /** 抛出去：to = 'head' 时砸到自己头上 */
      toss(pet, st, t, to) {
        const from = this.hand(pet, st.side);
        const head = to === 'head';
        const target = head ? { x: 0, y: pet.headTop() + 6 } : this.hand(pet, -st.side);
        const F = head ? 0.75 : st.side < 0 ? HIGH : LOW;
        if (st.fx) st.fx.life = st.fx.age; // 爪子里那颗不画了（换成飞起来的这颗）
        if (st.side < 0) this.kickL = 1;
        else this.kickR = 1;
        st.air = true;
        st.until = t + F;
        st.side = -st.side;
        st.rot = rand(0, 3);
        st.fx = pet.fx.spawn('pebble', { x: from.x, y: from.y, vx: (target.x - from.x) / F, vy: (target.y - from.y) / F - 0.5 * G * F, ay: G, life: F, solid: true, rot: st.rot, vrot: rand(-7, 7), size: SIZE });
        this.throws += 1;
      },
      update(b, dt) {
        const pet = b.pet;
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.fps = 60;
        s.gaze = 'none';
        s.tailAmp = 0.5;
        T.crouch = 1;
        T.tailCurl = 0.4;
        // 抛的那一下爪子往上一扬（角度越小越往里收、越高）
        this.kickL = Math.max(0, this.kickL - dt * 6);
        this.kickR = Math.max(0, this.kickR - dt * 6);
        T.armL = -0.62 - 0.38 * this.kickL;
        T.armR = -0.62 - 0.38 * this.kickR;
        T.eyes = 'wide';
        T.mouth = 'smile';
        T.mouthOpen = 0.3;
        T.blush = 0.8;
        if (this.phase === 'sit') {
          if (this.pt > 0.45) {
            this.stones = [{ side: -1, air: false, until: 0.05 }, { side: 1, air: false, until: 0.3 }];
            for (const st of this.stones) this.rest(pet, st, st.until);
            this.next('juggle');
          }
          return false;
        }
        if (this.phase === 'juggle') {
          const t = this.pt;
          let watch = null;
          for (const st of this.stones) {
            if (t < st.until) {
              if (st.air) watch = !watch || st.fx.y < watch.y ? st.fx : watch;
              continue;
            }
            if (st.air) {
              // 接住了
              st.air = false;
              st.until = t + DWELL;
              this.rest(pet, st, this.throws >= this.n ? 2.5 : DWELL + 0.02);
            } else if (this.throws < this.n) {
              // 最后一抛：有时候抛歪了，砸到自己头上
              const last = this.throws === this.n - 1;
              this.toss(pet, st, t, last && this.bonk ? 'head' : null);
              if (last && this.bonk) st.bonk = true;
            } else {
              st.done = true;
            }
          }
          if (watch) {
            T.lookX = clamp(watch.x / 30, -1, 1) * 0.8;
            T.lookY = clamp((watch.y + 62) / 30, -0.9, 0.6);
          }
          if (!this.said && this.throws === 3) {
            this.said = true;
            if (chance(0.5)) b.say('juggle', 2);
          }
          const bonked = this.stones.find((st) => st.bonk && !st.air);
          if (bonked) {
            // 咚！砸到头了：石子弹到地上，另一颗也掉了
            for (const st of this.stones) if (st.fx) st.fx.life = st.fx.age;
            pet.fx.spawn('bang', { x: 18, y: pet.headTop() - 4, life: 0.6 });
            stars(pet, 1.6);
            pet.squashSpring.kick(1.2);
            const h = pet.headTop();
            pet.fx.spawn('pebble', { x: 4, y: h + 4, vx: rand(50, 80), vy: -90, ay: 700, life: 0.72, rot: 1, vrot: 9, size: SIZE });
            const other = this.hand(pet, 1);
            pet.fx.spawn('pebble', { x: other.x, y: other.y, vx: 20, vy: -30, ay: 700, life: 0.32, rot: 2, vrot: -5, size: SIZE });
            this.next('bonk');
            return false;
          }
          if (this.stones.every((st) => st.done)) this.next('proud');
          return false;
        }
        if (this.phase === 'bonk') {
          // 晕乎乎的，揉揉脑袋
          T.eyes = this.pt < 0.6 ? 'squeeze' : 'dizzy';
          T.mouth = 'wavy';
          T.blush = 1;
          T.armL = T.armR = -0.75;
          T.armR = 1.85 + Math.sin(this.pt * 13) * 0.12;
          if (!this.said2) {
            this.said2 = true;
            if (chance(0.7)) b.say('juggleBonk', 2);
          }
          return this.pt > 1.6;
        }
        // 接住了，一脸得意
        T.eyes = 'happy';
        T.mouth = 'smile';
        T.mouthOpen = 0.45;
        T.lookX = 0;
        T.lookY = 0;
        if (this.pt - dt <= 0) {
          sparks(pet, 4);
          b.reward({ mood: 0.05, boredom: -0.1 });
        }
        if (this.pt > 1.2) {
          for (const st of this.stones) if (st.fx) st.fx.life = Math.min(st.fx.life, st.fx.age + 0.3);
          return true;
        }
        return false;
      },
      exit() {
        // 被打断：爪子里的石子收起来
        for (const st of this.stones || []) if (st.fx && !st.air) st.fx.life = st.fx.age;
      },
    };
  },

  /** 搓手手：坐着，两只小爪子在下巴底下搓呀搓，眯着眼嘿嘿笑，一脸期待（有好吃的吗？） */
  pawRub: () => ({
    dur: rand(3.2, 4.6),
    said: false,
    sparkIn: 0.9,
    update(b, dt, t) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      const k = fade(t, this.dur, 0.35);
      s.fps = 30;
      s.gaze = 'none';
      s.tailAmp = 0.5;
      s.tailSpeed = 2.5;
      T.crouch = 1;
      const c = Math.sin(t * 15);
      // 两只爪子都收到下巴底下（画在脸前面），一上一下地搓
      T.armL = -1.45 + 0.12 * c * k;
      T.armR = -1.45 - 0.12 * c * k;
      T.eyes = 'happy';
      T.mouth = 'smile';
      T.mouthOpen = 0.3;
      T.blush = 0.95;
      T.headTilt += Math.sin(t * 2.2) * 0.08;
      T.lift += Math.abs(c) * 0.5 * k; // 激动得一颠一颠
      this.sparkIn -= dt;
      if (this.sparkIn <= 0 && t < this.dur - 0.5) {
        this.sparkIn = rand(0.8, 1.3);
        pet.fx.spawn('spark', { x: rand(-10, 10), y: -30 + rand(-4, 4), vx: rand(-15, 15), vy: -rand(15, 30), life: 0.5, size: 0.6, vrot: rand(-3, 3) });
      }
      if (!this.said && t > 0.6) {
        this.said = true;
        if (chance(0.6)) b.say('pawRub', 2.2);
      }
      return t >= this.dur;
    },
  }),

  /**
   * 仰面漂着打盹：慢慢翻过身、仰面躺下，两只爪子搭在肚子上，像漂在水面上一样轻轻地一起一伏、
   * 慢慢往一边漂，身边一圈圈小水波；睡一会儿，再翻回来坐好
   */
  floatNap: (b) => {
    const pet = b.pet;
    const S = b.world.scale;
    const [lo, hi] = pet.spanX(40, 20);
    const side = hi - pet.x >= pet.x - lo ? 1 : -1; // 脑袋朝空的那一边躺
    const LIE = 1.42;
    return {
      phase: 'lie',
      pt: 0,
      dur: rand(14, 22),
      zz: 1.8,
      ripple: 0.4,
      drift: chance(0.5) ? 1 : -1,
      said: false,
      next(p) {
        this.phase = p;
        this.pt = 0;
      },
      update(b, dt) {
        const T = pet.target;
        const s = pet.style;
        this.pt += dt;
        s.gaze = 'none';
        T.crouch = 0.2;
        const lying = (k, bob = 0) => {
          // 仰面躺着：脸转过来朝着你、脑袋离身子远一点（肚子露出来），爪子搭在肚子上，尾巴顺着身子伸到脚那头
          T.roll = side * (LIE + bob * 0.025) * k;
          T.headTilt += -side * 1.0 * k;
          T.headY -= 6 * k;
          T.lift = lieLift(pet, T.roll, -side * 1.0 * k) + (1.5 + bob * 1.6) * k;
          T.armL = T.armR = -0.75 * k;
          T.tailHang = 0.8 * k;
          T.tailCurl = 1 - k;
          T.footLY = T.footRY = -4 * k;
        };
        if (this.phase === 'lie') {
          // 慢慢仰面躺下
          s.fps = 30;
          const u = clamp(this.pt / 0.8, 0, 1);
          lying(easeInOut(u));
          T.eyes = u > 0.6 ? 'sleep' : 'open';
          if (u >= 1) this.next('float');
          return false;
        }
        if (this.phase === 'float') {
          s.fps = 15;
          s.blink = false;
          s.breathPeriod = 5;
          s.breathDepth = 2;
          s.tailAmp = 0.05;
          const bob = Math.sin(this.pt * 1.6);
          lying(1, bob);
          T.eyes = 'sleep';
          T.mouth = 'cat';
          T.blush = 0.85;
          const [a, c] = pet.spanX(40, 20);
          pet.x = clamp(pet.x + this.drift * 5 * S * dt, a, c); // 慢慢往一边漂
          this.ripple -= dt;
          if (this.ripple <= 0) {
            this.ripple = rand(1.1, 1.6);
            for (const sd of [-1, 1]) pet.fx.spawn('ripple', { x: sd * rand(34, 50), y: -1, life: 1.6, size: rand(0.8, 1.1) });
          }
          this.zz -= dt;
          if (this.zz <= 0) {
            this.zz = rand(2, 2.8);
            const h = headPoint(pet, 0, -pet.sp.head.ry); // 头顶上面一点
            pet.fx.spawn('zzz', { x: h.x, y: h.y - 8, vx: side * rand(4, 8), vy: -rand(13, 18), life: 2.3, phase: rand(0, 6) });
          }
          if (!this.said && this.pt > 1.5) {
            this.said = true;
            if (chance(0.4)) b.say('floatNap', 2.2);
          }
          if (this.pt > this.dur) this.next('up');
          return false;
        }
        // 翻回来坐好
        s.fps = 30;
        const u = clamp(this.pt / 0.7, 0, 1);
        lying(1 - easeInOut(u));
        T.eyes = u > 0.4 ? 'open' : 'sleep';
        T.crouch = 1;
        return u >= 1;
      },
    };
  },

  // ============================================================ 大家都会

  /**
   * 抱着零食啃：坐下，从怀里掏出自己最爱吃的（猫小鱼干、熊猫竹子、卡皮巴拉西瓜、柴犬肉干、小熊猫苹果、兔子胡萝卜、狐狸葡萄），
   * 两只爪子捧着，低头啃一口、嚼一嚼，掉一点渣……一口一口吃完，拍拍肚子，冒爱心。
   * 企鹅（一口吞下小鱼）和水獭（仰面躺着敲贝壳）吃法不一样，见上面的 gulpSnack、clamSnack
   */
  snack: (b) => SNACK_STYLES[b.pet.sp.snackStyle]?.(b) ?? ({
    kind: b.pet.sp.snack,
    phase: 'sit',
    pt: 0,
    bite: 0,
    bites: 4,
    said: false,
    loved: false,
    next(p) {
      this.phase = p;
      this.pt = 0;
    },
    update(b, dt) {
      const pet = b.pet;
      const T = pet.target;
      const s = pet.style;
      if (!this.kind) return true;
      this.pt += dt;
      s.fps = 60;
      s.gaze = 'none';
      s.tailAmp = 0.7;
      s.tailSpeed = 2.2;
      T.crouch = 1;
      T.bite = this.bite;
      const crumb = SNACK_CRUMB[this.kind];
      const hold = () => {
        T.snack = 1;
        T.armL = T.armR = -0.75;
      };
      switch (this.phase) {
        case 'sit':
          if (this.pt > 0.35) this.next('take');
          return false;
        case 'take': // 掏出来
          hold();
          T.eyes = 'wide';
          T.lookY = 0.55;
          if (this.pt - dt <= 0) sparks(pet, 3);
          if (this.pt > 0.55) this.next('admire');
          return false;
        case 'admire': // 看一眼，好开心
          hold();
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.4;
          T.lookY = 0.5;
          T.blush = 0.9;
          if (!this.said) {
            this.said = true;
            if (chance(0.5)) b.say('snack', 2.2);
          }
          if (this.pt > 0.8) this.next('bite');
          return false;
        case 'bite': {
          // 低头张嘴，咬一口
          hold();
          const u = clamp(this.pt / 0.3, 0, 1);
          T.headY += 4 * bell(u);
          T.lookY = 0.8;
          T.mouth = 'o';
          T.mouthOpen = 0.8;
          if (u >= 1) {
            this.bite = Math.min(1, this.bite + 1 / this.bites);
            pet.squashSpring.kick(0.8);
            crumbsOf(pet, crumb, 3);
            this.next('chew');
          }
          return false;
        }
        case 'chew': {
          // 吧唧吧唧
          hold();
          const c = Math.sin(this.pt * 16);
          T.mouth = c > 0.1 ? 'wavy' : 'cat';
          T.eyes = 'happy';
          T.blush = 1;
          T.headY += Math.abs(c) * 1.2;
          T.squash += c * 0.02;
          if (this.pt > 0.3 && chance(dt * 3)) crumbsOf(pet, crumb, 1);
          if (this.pt > 0.85) this.next(this.bite >= 0.999 ? 'done' : 'bite');
          return false;
        }
        case 'done':
        default:
          // 吃完了，拍拍肚子
          T.snack = 0;
          T.armL = T.armR = -0.85 + Math.sin(this.pt * 9) * 0.14;
          T.eyes = 'happy';
          T.mouth = 'smile';
          T.mouthOpen = 0.45;
          T.blush = 1;
          if (this.pt > 0.3 && !this.loved) {
            this.loved = true;
            hearts(pet, 2);
            b.reward({ mood: 0.06 });
          }
          return this.pt > 1.6;
      }
    },
  }),
};

// ------------------------------------------------------------ 什么时候做（brain.js 按这个打分）
//
// can(b)：现在能不能做（在地上、你在不在、地方够不够、手里有没有信……）
// weight(b)：平常想不想做（分数，和 brain.js 里别的动作放在一起抽签）
// cd：做完以后隔多少秒才恢复到正常的分数（冷却）
// 模拟器（npm run sim）里每个大约一小时两三次。

const ground = (b) => b.pet.mode === 'ground' && !b.userAway;
const tired = (b) => clamp((0.5 - b.needs.energy) / 0.5, 0, 1);
const covered = (b) => !!(b.pet.look && b.pet.look.cover); // 万圣节披着白布
const bareHead = (b) => !(b.pet.outfit && b.pet.outfit.hat) && !(b.pet.look && b.pet.look.head);
const toyFree = (b) => !!b.world.toy && !b.world.toy.active;
/** 往某一边至少有多少地方（按宠物原始大小算的像素） */
function room(b, need) {
  const [lo, hi] = b.pet.spanX(40, 20);
  return Math.max(hi - b.pet.x, b.pet.x - lo) >= need * b.world.scale;
}

export const TRICK_INFO = {
  knead: { cd: 900, can: (b) => ground(b), weight: (b) => 0.03 + 0.05 * b.mood },
  yarn: { cd: 900, can: (b) => ground(b) && toyFree(b) && b.needs.energy > 0.3 && !covered(b), weight: (b) => 0.03 + 0.1 * b.needs.boredom },
  box: { cd: 900, can: (b) => ground(b) && !b.perched && !b.hasMail && !covered(b) && room(b, 140), weight: (b) => 0.035 + 0.05 * b.needs.boredom },
  beckon: { cd: 600, can: (b) => ground(b), weight: () => 0.06 },
  roll: { cd: 900, can: (b) => ground(b) && !b.perched && b.needs.energy > 0.3 && !b.hasMail && !covered(b) && room(b, 300), weight: (b) => 0.03 + 0.08 * b.needs.boredom },
  topple: { cd: 900, can: (b) => ground(b) && !b.hasMail && !covered(b) && room(b, 70), weight: (b) => 0.03 + 0.14 * tired(b) },
  backScratch: { cd: 900, can: (b) => ground(b) && !b.perched && b.needs.energy > 0.25, weight: () => 0.035 },
  onsen: { cd: 1200, can: (b) => ground(b) && !b.perched && !b.hasMail && !covered(b), weight: (b) => 0.04 + 0.05 * tired(b) },
  bird: { cd: 900, can: (b) => ground(b) && bareHead(b), weight: () => 0.045 },
  fetch: { cd: 900, can: (b) => ground(b) && !b.perched && !b.hasMail && toyFree(b) && b.world.pointer.inside && b.needs.energy > 0.35, weight: (b) => 0.05 + 0.15 * b.needs.boredom },
  chaseTail: { cd: 900, can: (b) => ground(b) && b.needs.energy > 0.3, weight: (b) => 0.025 + 0.05 * b.mood },
  drapeNap: { cd: 600, can: (b) => b.perched && b.pet.mode === 'ground', weight: (b) => 0.25 + 0.4 * tired(b) },
  tailHug: { cd: 900, can: (b) => b.pet.mode === 'ground', weight: (b) => 0.03 + 0.18 * tired(b) },
  binky: { cd: 1100, can:(b) => ground(b) && b.needs.energy > 0.35 && !b.hasMail && !covered(b), weight: (b) => 0.022 + 0.06 * b.mood },
  faceWash: { cd: 900, can: (b) => b.pet.mode === 'ground' && !b.hasMail, weight: () => 0.04 },
  flop: { cd: 900, can: (b) => ground(b) && !b.hasMail && !covered(b) && room(b, 80), weight: (b) => 0.03 + 0.12 * tired(b) },
  // 狐狸：扑雪要在真正的地上（窗口顶边下面看得见，脑袋会露出来）
  pounce: { cd: 900, can: (b) => ground(b) && !b.perched && b.needs.energy > 0.35 && !b.hasMail && !covered(b) && room(b, 110), weight: (b) => 0.03 + 0.08 * b.needs.boredom },
  buryGrapes: { cd: 1100, can: (b) => ground(b) && !b.perched && !b.hasMail && !covered(b) && room(b, 80), weight: (b) => 0.035 + 0.04 * b.needs.boredom },
  tailNap: { cd: 900, can: (b) => b.pet.mode === 'ground', weight: (b) => 0.03 + 0.18 * tired(b) },
  // 企鹅
  bellySlide: { cd: 900, can: (b) => ground(b) && !b.perched && b.needs.energy > 0.3 && !b.hasMail && !covered(b) && room(b, 220), weight: (b) => 0.03 + 0.08 * b.needs.boredom },
  flapHop: { cd: 700, can: (b) => ground(b) && b.needs.energy > 0.25 && !covered(b), weight: (b) => 0.025 + 0.06 * b.mood },
  slipFall: { cd: 1100, can: (b) => ground(b) && !b.perched && !b.hasMail && !covered(b) && room(b, 90), weight: () => 0.03 },
  // 水獭
  juggle: { cd: 900, can: (b) => ground(b) && !b.hasMail && !covered(b), weight: (b) => 0.035 + 0.08 * b.needs.boredom },
  pawRub: { cd: 700, can: (b) => b.pet.mode === 'ground' && !b.hasMail, weight: () => 0.04 },
  floatNap: { cd: 900, can: (b) => b.pet.mode === 'ground' && !b.perched && !b.hasMail && !covered(b) && room(b, 70), weight: (b) => 0.03 + 0.16 * tired(b) },
  // 大家都会。水獭要仰面躺下来吃，旁边得有地方
  snack: { cd: 1500, can: (b) => ground(b) && !b.hasMail && !covered(b) && !!b.pet.sp.snack && (b.pet.sp.snackStyle !== 'clam' || room(b, 70)), weight: () => 0.03 },
};

/** 费劲的招牌动作：做的时候精力掉得快（和走路、爬墙一样，见 brain.js 的 ENERGETIC） */
export const ENERGETIC_TRICKS = ['yarn', 'fetch', 'chaseTail', 'roll', 'backScratch', 'binky', 'pounce', 'bellySlide', 'flapHop'];
