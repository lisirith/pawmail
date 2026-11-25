// 桌面上滚来滚去的玩具：猫拍着玩的毛线球、柴犬叼来叼去的网球和骨头、扔给企鹅的小鱼。
//
// 它和宠物、特效不一样：会滚得很远（滚出宠物那块小画布），所以单独用一块小画布画，
// 画布的位置由 app.js 摆（没动就不去碰页面，省电）。这里只管它在哪儿、怎么弹、怎么滚、能不能点、能不能拖。
// 画法在 props.js（drawYarn / drawBall / drawBone）。动作（tricks.js）通过 b.world.toy 来扔它、叼它。
//
// 坐标和宠物一样是窗口里的像素；y 是玩具最下面碰到地的那个点（和宠物的"脚底"一样）。

import { GRAVITY } from './pet.js';

// 每种玩具：r 贴地时的半径（球就是半径；骨头横着躺，是它一半的高度）、hit 能点到的范围、
// bounce 落地弹多高、friction 在地上滑一秒还剩多少速度、roll 是滚着走（球）还是滑着走、在空中打转（骨头）
// flip：落地后转到最近的"平躺"角度，每隔多少弧度算一个（骨头两头一样，π；小鱼要肚子朝下，2π）
const KINDS = Object.freeze({
  yarn: { r: 8, hit: 20, bounce: 0.42, friction: 0.32, roll: true },
  ball: { r: 7.5, hit: 20, bounce: 0.5, friction: 0.32, roll: true },
  bone: { r: 5.5, hit: 22, bounce: 0.25, friction: 0.06, roll: false, flip: Math.PI },
  fish: { r: 5, hit: 24, bounce: 0.18, friction: 0.05, roll: false, flip: Math.PI * 2 }, // 企鹅的小鱼（见 play.js 的 fishToss）
});
export const TOY_RADIUS = Object.freeze(Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.r])));

const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Toy {
  constructor() {
    this.clear();
  }

  /** 收起来（桌面上什么都没有） */
  clear() {
    this.kind = null; // yarn 毛线球 | ball 网球 | bone 骨头 | null 没有
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.vrot = 0; // 在空中打转（骨头）
    this.alpha = 0; // 0 … 1：出现时淡入，收起来时淡出
    this.fading = 0; // 正在淡出：每秒少多少
    this.held = false; // 叼在嘴里：不画在桌面上（宠物自己画，见 draw.js 的 mouthBall）
    this.userHeld = false; // 你正用鼠标按着它拖（松手就扔出去）
    this.clickable = false; // 现在能不能点它、拖它（柴犬等着你扔的时候）
    this.clicked = false; // 被点了一下（没拖）：动作那边替你把它扔出去
    this.thrown = false; // 你拖着它扔出去了：动作那边看到了就去追
    this.ledgeId = null; // 在哪个窗口顶上滚；从边上掉下去以后是 null（落到地上）
    this.bounces = 0;
  }

  get active() {
    return this.kind !== null;
  }

  get spec() {
    return KINDS[this.kind] || KINDS.ball;
  }

  get r() {
    return this.spec.r;
  }

  /** 着地了、而且几乎不动了 */
  get resting() {
    return this.active && !this.held && !this.userHeld && this.vy === 0 && Math.abs(this.vx) < 1;
  }

  /** 放一个玩具到 (x, y)。ledgeId：放在哪个窗口顶上（不填 = 地上） */
  spawn(kind, x, y, { vx = 0, vy = 0, ledgeId = null, alpha = 0 } = {}) {
    this.clear();
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.alpha = alpha;
    this.ledgeId = ledgeId;
  }

  /** 慢慢淡掉，然后收起来 */
  fadeOut(seconds = 0.8) {
    if (!this.active) return;
    this.fading = 1 / Math.max(0.05, seconds);
    this.clickable = false;
    this.userHeld = false;
  }

  /** 拍一下 / 扔出去：给它一个速度（骨头还会打着转） */
  push(vx, vy) {
    this.held = false;
    this.userHeld = false;
    this.vx = vx;
    this.vy = vy;
    this.vrot = this.spec.roll ? 0 : vx / 55;
    this.bounces = 0;
  }

  /** 屏幕上的这个点有没有点到它（只有能点的时候才算） */
  hit(px, py, S) {
    if (!this.active || this.held || !this.clickable || this.alpha < 0.5) return false;
    return Math.hypot(px - this.x, py - (this.y - this.r * S)) < this.spec.hit * S;
  }

  // ------------------------------------------------------------ 你用鼠标拖着它（app.js 调）

  /** 按住它开始拖 */
  grab() {
    this.userHeld = true;
    this.vx = 0;
    this.vy = 0;
    this.vrot = 0;
    this.ledgeId = null;
  }

  /** 拖着走：玩具的中心跟着鼠标，不出活动范围、不钻到地下 */
  dragTo(px, py, world) {
    const S = world.scale;
    const A = world.area;
    const r = this.r * S;
    this.x = clampTo(px, A.left + r, A.right - r);
    this.y = clampTo(py + r, A.top + 2 * r, world.groundY);
  }

  /** 松手：带着鼠标的速度飞出去（太快的话限一下速，别一下飞没了） */
  release(vx, vy, S) {
    const max = 1300 * S;
    const speed = Math.hypot(vx, vy);
    const k = speed > max ? max / speed : 1;
    this.push(vx * k, vy * k);
    this.thrown = true;
    this.clickable = false;
  }

  // ------------------------------------------------------------ 每一帧

  /** 弹、滚、滑、撞墙、从窗口边上掉下去。world 和宠物用的是同一个 */
  step(dt, world) {
    if (!this.kind) return;
    if (this.fading > 0) {
      this.alpha -= this.fading * dt;
      if (this.alpha <= 0) {
        this.clear();
        return;
      }
    } else if (this.alpha < 1) {
      this.alpha = Math.min(1, this.alpha + dt * 6);
    }
    if (this.held || this.userHeld) return;
    const S = world.scale;
    const A = world.area;
    const spec = this.spec;
    const r = spec.r * S;
    // 脚下是什么：在窗口顶上滚、还没滚出那一段的话是窗口顶边，否则是地面
    let floor = world.groundY;
    if (this.ledgeId) {
      const L = (world.ledges || []).find((l) => l.id === this.ledgeId);
      if (L && L.segs.some(([a, b]) => this.x >= a - r * 0.3 && this.x <= b + r * 0.3)) floor = L.y;
      else this.ledgeId = null; // 滚出窗口边了：掉下去
    }
    const onFloor = this.y >= floor - 0.5 && this.vy >= 0;
    if (!onFloor) {
      this.vy += GRAVITY * 0.8 * S * dt;
      this.vx *= Math.pow(0.85, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= floor) {
      this.y = floor;
      if (this.vy > 110 * S && this.bounces < 4) {
        this.vy = -this.vy * spec.bounce; // 弹一下
        this.vrot *= 0.6;
        this.bounces += 1;
      } else {
        this.vy = 0;
      }
    }
    if (this.vy === 0) {
      // 在地上：越滚（滑）越慢
      this.vx *= Math.pow(spec.friction, dt);
      if (Math.abs(this.vx) < 6 * S) this.vx = 0;
    }
    // 撞到活动范围的左右两边：弹回来。在空中撞上去只弹回一点点（不然扔得太用力，撞了墙又飞回屏幕另一头）
    const wall = this.vy === 0 ? 0.5 : 0.25;
    if (this.x < A.left + r) {
      this.x = A.left + r;
      this.vx = Math.abs(this.vx) * wall;
    } else if (this.x > A.right - r) {
      this.x = A.right - r;
      this.vx = -Math.abs(this.vx) * wall;
    }
    if (spec.roll) {
      this.rot += (this.vx / r) * dt; // 球：滚多远转多少（不打滑）
    } else if (this.vy === 0) {
      // 骨头、小鱼：落到地上就平躺下来（转到最近的"横着"的角度）
      const step = spec.flip || Math.PI;
      const flat = Math.round(this.rot / step) * step;
      this.rot += (flat - this.rot) * Math.min(1, dt * 12);
      this.vrot = 0;
    } else {
      this.rot += this.vrot * dt; // 在空中打着转
    }
  }
}
