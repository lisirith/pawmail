// 小特效：爱心、Zzz、头顶转的星星、感叹号、生气符号、落地的灰尘……
// 坐标和宠物一样：原点在脚底中心，头顶是负数。特效不跟着身体旋转。

import { TAU, clamp, easeOutBack } from '../util/math.js';

const MAX_ITEMS = 48;
const FONT = '"Segoe UI", "Microsoft YaHei UI", sans-serif';

function heartPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.3, s * 0.05, -s * 0.75, -s * 0.95, 0, -s * 0.3);
  ctx.bezierCurveTo(s * 0.75, -s * 0.95, s * 1.3, s * 0.05, 0, s * 0.9);
  ctx.closePath();
}

function starPath(ctx, r, points = 5, inner = 0.46) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function text(ctx, str, px, fill) {
  ctx.font = `800 ${px}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, px * 0.22);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(str, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(str, 0, 0);
}

const DRAW = {
  heart(ctx, it, u, pop) {
    ctx.translate(it.x + Math.sin(it.age * 4 + it.phase) * 3, it.y);
    ctx.rotate(it.rot);
    heartPath(ctx, 6.5 * it.size * pop);
    ctx.fillStyle = '#ff6f8d';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  },
  zzz(ctx, it, u) {
    ctx.translate(it.x + Math.sin(it.age * 2.2 + it.phase) * 4, it.y);
    ctx.rotate(-0.14);
    text(ctx, 'Z', (9 + u * 9) * it.size, '#7f9bd9');
  },
  /** 晕的时候绕着头顶转的星星 */
  orbit(ctx, it) {
    const a = it.phase + it.age * 5.2;
    ctx.translate(it.x + Math.cos(a) * 27, it.y + Math.sin(a) * 7);
    ctx.rotate(a * 0.7);
    starPath(ctx, Math.sin(a) > 0 ? 6 : 4.8);
    ctx.fillStyle = '#ffd447';
    ctx.fill();
    ctx.strokeStyle = '#a8741a';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },
  spark(ctx, it, u, pop) {
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    starPath(ctx, 6 * it.size * pop * (1 - u * 0.4), 4, 0.32);
    ctx.fillStyle = '#ffe680';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },
  bang(ctx, it, u, pop) {
    ctx.translate(it.x, it.y);
    ctx.scale(pop, pop);
    text(ctx, '!', 20 * it.size, '#ff5a4d');
  },
  question(ctx, it, u, pop) {
    ctx.translate(it.x, it.y);
    ctx.rotate(0.15);
    ctx.scale(pop, pop);
    text(ctx, '?', 19 * it.size, '#5f84c9');
  },
  anger(ctx, it, u, pop) {
    ctx.translate(it.x, it.y);
    const s = pop * it.size * (1 + Math.sin(it.age * 14) * 0.08);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    for (const [color, width] of [
      ['#ffffff', 5],
      ['#ff4d4d', 2.6],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(2.6, -7.5);
        ctx.quadraticCurveTo(2.6, -2.6, 7.5, -2.6);
        ctx.stroke();
        ctx.restore();
      }
    }
  },
  dust(ctx, it, u) {
    ctx.beginPath();
    ctx.arc(it.x, it.y, (3 + u * 7) * it.size, 0, TAU);
    ctx.fillStyle = 'rgba(236, 226, 210, 0.85)';
    ctx.fill();
  },
  /** 圣诞节：慢慢飘下来的雪花 */
  snow(ctx, it) {
    ctx.translate(it.x + Math.sin(it.age * 1.3 + it.phase) * 8, it.y);
    ctx.rotate(it.rot);
    ctx.beginPath();
    const r = 5.5 * it.size;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
    }
    // 先画一圈淡蓝色的边，再画白色：在白墙和深色桌面上都看得见
    ctx.strokeStyle = 'rgba(90, 120, 180, 0.75)';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  },
  /** 新年、生日：彩带纸屑 */
  confetti(ctx, it) {
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.scale(1, Math.cos(it.age * 8 + it.phase)); // 翻转
    ctx.fillStyle = it.color;
    ctx.fillRect(-3.5 * it.size, -1.8 * it.size, 7 * it.size, 3.6 * it.size);
  },
  /** 吓你一下 */
  boo(ctx, it, u, pop) {
    ctx.translate(it.x, it.y);
    ctx.rotate(-0.12);
    ctx.scale(pop, pop);
    text(ctx, 'Boo!', 18 * it.size, '#6b5bd6');
  },
  /** 喂给它吃的文件：一张折了角的纸。shrink：飞进嘴里时越飞越小 */
  file(ctx, it, u) {
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const s = it.size * (1 - u * (it.shrink || 0));
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-6.5, -8.5);
    ctx.lineTo(2.8, -8.5);
    ctx.lineTo(6.5, -4.8);
    ctx.lineTo(6.5, 8.5);
    ctx.lineTo(-6.5, 8.5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#66768c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath(); // 折角
    ctx.moveTo(2.8, -8.5);
    ctx.lineTo(2.8, -4.8);
    ctx.lineTo(6.5, -4.8);
    ctx.stroke();
    ctx.strokeStyle = '#a7b4c6'; // 几行字
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const y of [-1.5, 1.5, 4.5]) {
      ctx.moveTo(-3.8, y);
      ctx.lineTo(3.8, y);
    }
    ctx.stroke();
  },
  /** 喂给它吃的文件夹：黄色的小文件夹 */
  folder(ctx, it, u) {
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    const s = it.size * (1 - u * (it.shrink || 0));
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ad7a17';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); // 后面那片和小耳朵
    ctx.moveTo(-8.5, -6.5);
    ctx.lineTo(-2.8, -6.5);
    ctx.lineTo(-1, -4.2);
    ctx.lineTo(8.5, -4.2);
    ctx.lineTo(8.5, 6.5);
    ctx.lineTo(-8.5, 6.5);
    ctx.closePath();
    ctx.fillStyle = '#f2b53a';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // 前面那片
    ctx.moveTo(-8.5, -1.5);
    ctx.lineTo(8.5, -1.5);
    ctx.lineTo(8.5, 6.5);
    ctx.lineTo(-8.5, 6.5);
    ctx.closePath();
    ctx.fillStyle = '#ffd36b';
    ctx.fill();
    ctx.stroke();
  },
  /** 嚼的时候掉下来的渣 */
  crumb(ctx, it) {
    ctx.beginPath();
    ctx.arc(it.x, it.y, 1.4 * it.size, 0, TAU);
    ctx.fillStyle = it.color || '#d8c8b0';
    ctx.fill();
  },
};

export const CONFETTI_COLORS = ['#ff6f8d', '#ffd54f', '#7fc8ff', '#8ed081', '#c39bff'];

export class Fx {
  constructor() {
    this.items = [];
  }

  get active() {
    return this.items.length > 0;
  }

  clear() {
    this.items.length = 0;
  }

  spawn(type, options = {}) {
    const item = {
      type,
      age: 0,
      life: 1.4,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      size: 1,
      rot: 0,
      vrot: 0,
      phase: 0,
      ...options,
    };
    this.items.push(item);
    if (this.items.length > MAX_ITEMS) this.items.shift();
    return item;
  }

  update(dt) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.delay > 0) {
        it.delay -= dt; // 还没轮到它出场（好几个文件一个接一个飞进嘴里）
        continue;
      }
      it.age += dt;
      if (it.age >= it.life) {
        items.splice(i, 1);
        continue;
      }
      if (it.to) {
        // 沿一条往上拱的弧线，从 from 飞到 to（喂给它的文件飞进嘴里）
        const u = it.age / it.life;
        const e = u * u * (3 - 2 * u);
        const k = 1 - e;
        const cx = (it.from.x + it.to.x) / 2;
        const cy = Math.min(it.from.y, it.to.y) - (it.arc ?? 18);
        it.x = k * k * it.from.x + 2 * k * e * cx + e * e * it.to.x;
        it.y = k * k * it.from.y + 2 * k * e * cy + e * e * it.to.y;
        it.rot += it.vrot * dt;
        continue;
      }
      it.vx += it.ax * dt;
      it.vy += it.ay * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
    }
  }

  draw(ctx) {
    for (const it of this.items) {
      const draw = DRAW[it.type];
      if (!draw || it.delay > 0) continue;
      const u = it.age / it.life;
      const pop = easeOutBack(clamp(it.age / 0.22, 0, 1)); // 出现时"啵"地弹一下
      ctx.save();
      ctx.globalAlpha = clamp((1 - u) / 0.3, 0, 1); // 最后 30% 的时间渐渐消失
      draw(ctx, it, u, pop);
      ctx.restore();
    }
  }
}
