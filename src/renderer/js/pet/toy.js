// 桌面上滚来滚去的玩具：猫拍着玩的毛线球、柴犬叼来叼去的网球。
//
// 它和宠物、特效不一样：会滚得很远（滚出宠物那块小画布），所以单独用一块小画布画，
// 画布的位置由 app.js 摆（没动就不去碰页面，省电）。这里只管它在哪儿、怎么弹、怎么滚、能不能点。
// 画法在 props.js（drawYarn / drawBall）。动作（activities.js）通过 b.world.toy 来扔它、叼它。
//
// 坐标和宠物一样是窗口里的像素；y 是玩具最下面碰到地的那个点（和宠物的"脚底"一样）。

import { GRAVITY } from './pet.js';

export const TOY_RADIUS = Object.freeze({ yarn: 8, ball: 7.5 }); // 按宠物原始大小算的半径

export class Toy {
  constructor() {
    this.clear();
  }

  /** 收起来（桌面上什么都没有） */
  clear() {
    this.kind = null; // yarn 毛线球 | ball 网球 | null 没有
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.alpha = 0; // 0 … 1：出现时淡入，收起来时淡出
    this.fading = 0; // 正在淡出：每秒少多少
    this.held = false; // 叼在嘴里：不画在桌面上（宠物自己画，见 draw.js 的 mouthBall）
    this.clickable = false; // 现在能不能点它（柴犬等着你扔球的时候）
    this.clicked = false; // 被点过一下（动作每帧来看，看到了就把它清掉）
    this.ledgeId = null; // 在哪个窗口顶上滚；从边上掉下去以后是 null（落到地上）
    this.bounces = 0;
  }

  get active() {
    return this.kind !== null;
  }

  get r() {
    return TOY_RADIUS[this.kind] || 8;
  }

  /** 着地了、而且几乎不滚了 */
  get resting() {
    return this.active && !this.held && this.vy === 0 && Math.abs(this.vx) < 1;
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
  }

  /** 拍一下 / 扔出去：给它一个速度 */
  push(vx, vy) {
    this.held = false;
    this.vx = vx;
    this.vy = vy;
    this.bounces = 0;
  }

  /** 屏幕上的这个点有没有点到它（只有 clickable 的时候才算） */
  hit(px, py, S) {
    if (!this.active || this.held || !this.clickable || this.alpha < 0.5) return false;
    return Math.hypot(px - this.x, py - (this.y - this.r * S)) < (this.r + 12) * S;
  }

  /** 每一帧：弹、滚、撞墙、从窗口边上掉下去。world 和宠物用的是同一个 */
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
    if (this.held) return;
    const S = world.scale;
    const A = world.area;
    const r = this.r * S;
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
        this.vy = -this.vy * 0.42; // 弹一下
        this.bounces += 1;
      } else {
        this.vy = 0;
      }
    }
    if (this.vy === 0) {
      // 在地上滚：越滚越慢
      this.vx *= Math.pow(0.32, dt);
      if (Math.abs(this.vx) < 6 * S) this.vx = 0;
    }
    // 撞到活动范围的左右两边：弹回来
    if (this.x < A.left + r) {
      this.x = A.left + r;
      this.vx = Math.abs(this.vx) * 0.5;
    } else if (this.x > A.right - r) {
      this.x = A.right - r;
      this.vx = -Math.abs(this.vx) * 0.5;
    }
    this.rot += (this.vx / r) * dt; // 滚多远转多少（不打滑）
  }
}
