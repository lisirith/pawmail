// 礼物图标：全部用代码画（和宠物一个画风：暖棕色的描边、柔和的渐变、一点白色高光），代替以前的 emoji。
// 信里的礼物、信箱、图鉴、明信片都用这里的 drawGift。
//
// 每个图标都画在一个 40×40 的格子里（原点在中间，-20 … 20），drawGift 再按要的大小缩放。
// 礼物的编号和 src/shared/letters/catalog.js 的 GIFTS 一致（npm run letters 会核对每件都有画法）。

import { drawOrange, drawYarn, drawCoin, drawSnack } from '../pet/props.js';

const TAU = Math.PI * 2;
const INK = '#7a4a2c';
const LW = 1.6;

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

/** 填色 + 描边（描边默认是暖棕色） */
function fs(ctx, fill, lw = LW, stroke = INK) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** 线性渐变：从 (x0,y0) 到 (x1,y1)，颜色平均分布 */
function lin(ctx, x0, y0, x1, y1, ...colors) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
}

/** 球形的渐变：左上亮、右下暗 */
function rad(ctx, x, y, r, ...colors) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.15);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
}

/** 白色的小高光 */
function shine(ctx, x, y, rx, ry, rot = -0.5, alpha = 0.7) {
  ell(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill();
}

function starPath(ctx, x, y, r, inner = 0.45, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** 心形：尖朝下，原点在中间 */
function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.3, y + s * 0.05, x - s * 0.75, y - s * 0.95, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.75, y - s * 0.95, x + s * 1.3, y + s * 0.05, x, y + s * 0.9);
  ctx.closePath();
}

/** 叶子形：尖头朝上，原点在叶子中间 */
function leafPath(ctx, len, w) {
  ctx.beginPath();
  ctx.moveTo(0, len / 2);
  ctx.quadraticCurveTo(w, 0, 0, -len / 2);
  ctx.quadraticCurveTo(-w, 0, 0, len / 2);
  ctx.closePath();
}

function stroke(ctx, color, lw, fn) {
  ctx.beginPath();
  fn();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** 一片带叶脉的叶子（茶叶、柳叶……） */
function leaf(ctx, x, y, rot, len, w, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  leafPath(ctx, len, w);
  fs(ctx, fill, 1.3);
  stroke(ctx, 'rgba(60, 110, 40, 0.55)', 0.9, () => {
    ctx.moveTo(0, len / 2 - 1);
    ctx.lineTo(0, -len / 2 + 2);
  });
  ctx.restore();
}

/** 羽毛：沿一根弯弯的羽轴，两边是羽片 */
function feather(ctx, light, dark, tip) {
  ctx.save();
  ctx.rotate(0.65);
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.bezierCurveTo(9, 8, 9, -10, 0, -19);
  ctx.bezierCurveTo(-9, -10, -9, 8, 0, 15);
  ctx.closePath();
  fs(ctx, lin(ctx, 0, 15, 0, -19, light, dark), 1.4);
  if (tip) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = tip;
    ctx.fillRect(-10, -20, 20, 12);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.bezierCurveTo(9, 8, 9, -10, 0, -19);
    ctx.bezierCurveTo(-9, -10, -9, 8, 0, 15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  stroke(ctx, 'rgba(255, 255, 255, 0.55)', 1, () => {
    for (const y of [-8, -2, 4]) {
      ctx.moveTo(0, y + 3);
      ctx.lineTo(5.5, y - 2);
      ctx.moveTo(0, y + 3);
      ctx.lineTo(-5.5, y - 2);
    }
  });
  stroke(ctx, INK, 1.5, () => {
    ctx.moveTo(0, 20);
    ctx.lineTo(0, -16);
  });
  ctx.restore();
}

// ================================================================ 所有礼物

const ICONS = {
  // ---------------------------------------------------------------- 普通

  /** 贝壳：扇形，一道道放射的棱，底下两只小"耳朵" */
  shell(ctx) {
    const cy = 11;
    const R = 17;
    const n = 6;
    const edge = () => {
      ctx.beginPath();
      ctx.moveTo(-3, cy + 2);
      for (let i = 0; i <= n; i++) {
        const a = Math.PI + (i / n) * Math.PI;
        const x = Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        if (i === 0) ctx.lineTo(x, y);
        else {
          const m = Math.PI + ((i - 0.5) / n) * Math.PI;
          ctx.quadraticCurveTo(Math.cos(m) * (R + 4.5), cy + Math.sin(m) * (R + 4.5), x, y);
        }
      }
      ctx.lineTo(3, cy + 2);
      ctx.closePath();
    };
    ctx.beginPath();
    ctx.roundRect(-7, cy - 1, 14, 7, 2);
    fs(ctx, '#f6a98f', 1.4);
    edge();
    fs(ctx, lin(ctx, 0, cy - R, 0, cy, '#ffe3d6', '#f7a58f'));
    stroke(ctx, 'rgba(160, 80, 60, 0.45)', 1, () => {
      for (let i = 1; i < n; i++) {
        const a = Math.PI + (i / n) * Math.PI;
        ctx.moveTo(0, cy + 1);
        ctx.lineTo(Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2));
      }
    });
    shine(ctx, -6, -1, 3, 1.6, -0.6, 0.6);
  },

  /** 小石子：圆滚滚的灰色鹅卵石，几个小斑点 */
  pebble(ctx) {
    ell(ctx, 0, 3, 16, 11.5, -0.12);
    fs(ctx, rad(ctx, 0, 3, 16, '#ece9e2', '#c2bdb3', '#a19a8f'));
    ctx.fillStyle = 'rgba(110, 100, 90, 0.35)';
    for (const [x, y] of [[5, 6], [-6, 8], [9, 0], [-2, 2]]) {
      ell(ctx, x, y, 1, 0.8);
      ctx.fill();
    }
    shine(ctx, -6, -3, 4.5, 2.2, -0.3);
  },

  /** 落叶：橘黄色，叶脉清楚，带一小截叶柄 */
  leaf(ctx) {
    ctx.save();
    ctx.rotate(-0.6);
    stroke(ctx, INK, 1.6, () => {
      ctx.moveTo(0, 14);
      ctx.lineTo(0, 20);
    });
    leafPath(ctx, 32, 15);
    fs(ctx, lin(ctx, 0, -16, 0, 16, '#ffc76a', '#e98a3a', '#c9642a'));
    stroke(ctx, 'rgba(130, 60, 20, 0.55)', 1, () => {
      ctx.moveTo(0, 15);
      ctx.lineTo(0, -13);
      for (const y of [-6, 0, 6]) {
        ctx.moveTo(0, y + 3);
        ctx.lineTo(6.5, y - 3);
        ctx.moveTo(0, y + 3);
        ctx.lineTo(-6.5, y - 3);
      }
    });
    ctx.restore();
  },

  /** 枫叶：五个尖角的红枫叶，叶脉从叶柄散开 */
  mapleLeaf(ctx) {
    const R = [[0, -18], [3.5, -10], [8.5, -13], [7.5, -5.5], [16.5, -7], [12.5, 0], [16, 3.5], [7, 5], [8, 11], [1.5, 8]];
    ctx.save();
    ctx.translate(0, -1);
    stroke(ctx, INK, 1.7, () => {
      ctx.moveTo(0, 7);
      ctx.quadraticCurveTo(1, 14, -2, 19);
    });
    ctx.beginPath();
    R.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    for (let i = R.length - 1; i >= 1; i--) ctx.lineTo(-R[i][0], R[i][1]);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, lin(ctx, 0, -18, 0, 12, '#ff8a5c', '#e5452f'));
    stroke(ctx, 'rgba(140, 30, 20, 0.5)', 1, () => {
      for (const [x, y] of [[0, -15], [14, -6], [13, 3], [-14, -6], [-13, 3]]) {
        ctx.moveTo(0, 6);
        ctx.lineTo(x * 0.85, y * 0.85);
      }
    });
    ctx.restore();
  },

  /** 栗子：深棕色，上面一个小尖，下面一圈浅色的底 */
  chestnut(ctx) {
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.bezierCurveTo(7, -12, 16, -4, 15, 6);
      ctx.bezierCurveTo(14, 14, 7, 16, 0, 16);
      ctx.bezierCurveTo(-7, 16, -14, 14, -15, 6);
      ctx.bezierCurveTo(-16, -4, -7, -12, 0, -16);
      ctx.closePath();
    };
    body();
    fs(ctx, rad(ctx, 0, 2, 16, '#c98652', '#8f5128', '#5e3418'));
    ctx.save();
    body();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.quadraticCurveTo(0, 4, 16, 8);
    ctx.lineTo(16, 18);
    ctx.lineTo(-16, 18);
    ctx.closePath();
    ctx.fillStyle = '#efd2a8';
    ctx.fill();
    ctx.restore();
    body();
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    stroke(ctx, 'rgba(120, 80, 50, 0.35)', 0.8, () => {
      ctx.moveTo(-15, 8.3);
      ctx.quadraticCurveTo(0, 4.3, 15, 8.3);
    });
    shine(ctx, -6, -4, 3.5, 6, 0.4, 0.45);
  },

  /** 羽毛：淡蓝色 */
  feather(ctx) {
    feather(ctx, '#e8f4ff', '#8fb8e8');
  },

  /** 小野花：六片奶白色的花瓣、橘黄色的花心，下面一小截茎和一片叶子 */
  wildflower(ctx) {
    stroke(ctx, '#5d9a46', 2, () => {
      ctx.moveTo(0, 4);
      ctx.quadraticCurveTo(2, 12, 0, 20);
    });
    leaf(ctx, 5, 14, 0.9, 9, 4, '#8fd06a');
    ctx.save();
    ctx.translate(0, -4);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i / 6) * TAU);
      ell(ctx, 0, -9, 4.6, 7.5);
      fs(ctx, lin(ctx, 0, -16, 0, -2, '#fffdf3', '#ffe27a'), 1.3);
      ctx.restore();
    }
    ell(ctx, 0, 0, 5.5, 5.5);
    fs(ctx, rad(ctx, 0, 0, 5.5, '#ffd27a', '#f29a2e'), 1.3);
    ctx.restore();
  },

  /** 蘑菇：红色的伞盖、白点点，奶白色的柄 */
  mushroom(ctx) {
    ctx.beginPath();
    ctx.moveTo(-6, 3);
    ctx.quadraticCurveTo(-8, 13, -6.5, 17);
    ctx.quadraticCurveTo(0, 19.5, 6.5, 17);
    ctx.quadraticCurveTo(8, 13, 6, 3);
    ctx.closePath();
    fs(ctx, lin(ctx, -7, 0, 7, 0, '#fff8ec', '#f1dcc0'));
    const cap = () => {
      ctx.beginPath();
      ctx.moveTo(-17, 4);
      ctx.bezierCurveTo(-17, -16, 17, -16, 17, 4);
      ctx.quadraticCurveTo(0, 8, -17, 4);
      ctx.closePath();
    };
    cap();
    fs(ctx, rad(ctx, 0, -4, 17, '#ff8a78', '#e5483b', '#c4352d'));
    ctx.save();
    cap();
    ctx.clip();
    ctx.fillStyle = '#fff8ec';
    for (const [x, y, r] of [[-8, -5, 3.2], [3, -9, 2.6], [10, -1, 2.4], [-2, 0, 2]]) {
      ell(ctx, x, y, r, r * 0.85);
      ctx.fill();
    }
    ctx.restore();
  },

  /** 小竹枝：斜着的一小截竹子，顶上几片叶子 */
  bambooSprig(ctx) {
    ctx.save();
    ctx.rotate(0.45);
    ctx.beginPath();
    ctx.roundRect(-3.2, -12, 6.4, 32, 3);
    fs(ctx, lin(ctx, -3, 0, 3, 0, '#a8da7f', '#6ea946'), 1.4);
    stroke(ctx, '#4f8a34', 1.2, () => {
      for (const y of [-2, 9]) {
        ctx.moveTo(-3.2, y);
        ctx.quadraticCurveTo(0, y + 1.5, 3.2, y);
      }
    });
    ctx.restore();
    leaf(ctx, -7, -10, -1.0, 15, 5, '#86c95e');
    leaf(ctx, 2, -14, -0.25, 17, 5.5, '#7cbf55');
    leaf(ctx, 8, -8, 0.7, 13, 4.5, '#93d26b');
  },

  /** 茶叶：两片嫩绿的叶子 */
  teaLeaf(ctx) {
    stroke(ctx, '#5d9a46', 1.8, () => {
      ctx.moveTo(-2, 18);
      ctx.quadraticCurveTo(-1, 10, 1, 4);
    });
    leaf(ctx, -6, -3, -0.45, 26, 11, lin(ctx, 0, -12, 0, 12, '#b5ec8c', '#5fae4a'));
    leaf(ctx, 7, 0, 0.55, 22, 9, lin(ctx, 0, -10, 0, 10, '#c6f29f', '#6cbc52'));
  },

  /** 书签：粉色的纸书签，下面剪成燕尾，上面一颗小白心、一根流苏 */
  bookmark(ctx) {
    stroke(ctx, '#f29ab2', 1.6, () => {
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(-7, -18, -10, -13);
    });
    ctx.beginPath();
    ctx.moveTo(-8, -17);
    ctx.lineTo(8, -17);
    ctx.lineTo(8, 17);
    ctx.lineTo(0, 11);
    ctx.lineTo(-8, 17);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, lin(ctx, 0, -17, 0, 17, '#ffb3c4', '#f27a96'));
    heartPath(ctx, 0, -5, 4.5);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ell(ctx, 0, -13, 1.6, 1.6);
    ctx.fillStyle = '#fff3f6';
    ctx.fill();
  },

  /** 铅笔：黄色的笔杆，粉色的橡皮，削尖的笔头 */
  pencil(ctx) {
    ctx.save();
    ctx.rotate(-0.78);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(10, -4.5);
    ctx.lineTo(19, 0);
    ctx.lineTo(10, 4.5);
    ctx.closePath();
    fs(ctx, '#f6d7a8', 1.4);
    ctx.beginPath();
    ctx.moveTo(16, -1.5);
    ctx.lineTo(19, 0);
    ctx.lineTo(16, 1.5);
    ctx.closePath();
    fs(ctx, '#5a4a42', 0);
    ctx.beginPath();
    ctx.rect(-12, -4.5, 22, 9);
    fs(ctx, lin(ctx, 0, -4.5, 0, 4.5, '#ffe27a', '#f5b829'), 1.4);
    stroke(ctx, 'rgba(180, 120, 20, 0.5)', 0.9, () => {
      ctx.moveTo(-12, -1.5);
      ctx.lineTo(10, -1.5);
      ctx.moveTo(-12, 1.5);
      ctx.lineTo(10, 1.5);
    });
    ctx.beginPath();
    ctx.rect(-16, -4.5, 4, 9);
    fs(ctx, '#c9c9d4', 1.3);
    ctx.beginPath();
    ctx.roundRect(-21, -4.5, 5.5, 9, [2.5, 0, 0, 2.5]);
    fs(ctx, '#ff9bb0', 1.3);
    ctx.restore();
  },

  /** 车票：两边各一个半圆的缺口，一道虚线，一颗星星 */
  ticket(ctx) {
    ctx.save();
    ctx.rotate(-0.22);
    ctx.beginPath();
    ctx.moveTo(-17, -10);
    ctx.lineTo(17, -10);
    ctx.lineTo(17, -4);
    ctx.arc(17, 0, 4, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(17, 10);
    ctx.lineTo(-17, 10);
    ctx.lineTo(-17, 4);
    ctx.arc(-17, 0, 4, Math.PI / 2, -Math.PI / 2, true);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, lin(ctx, 0, -10, 0, 10, '#ffe08a', '#f7bd45'));
    ctx.setLineDash([2.2, 2.2]);
    stroke(ctx, 'rgba(122, 74, 44, 0.6)', 1.1, () => {
      ctx.moveTo(6, -8);
      ctx.lineTo(6, 8);
    });
    ctx.setLineDash([]);
    starPath(ctx, -5, 0, 5.5);
    fs(ctx, '#ff8a5c', 1.1);
    ctx.restore();
  },

  /** 毛线球 */
  yarn(ctx) {
    ctx.translate(-3, -1);
    drawYarn(ctx, 13);
  },

  /** 团子：一根竹签串着粉、白、绿三颗 */
  dango(ctx) {
    stroke(ctx, '#c9a26b', 2.2, () => {
      ctx.moveTo(-15, 17);
      ctx.lineTo(14, -16);
    });
    for (const [x, y, c0, c1] of [
      [6.5, -7, '#c6ecaa', '#8fcc6a'],
      [-0.5, 1, '#ffffff', '#efe3d2'],
      [-7.5, 9, '#ffd0dc', '#ff9db5'],
    ]) {
      ell(ctx, x, y, 7, 6.6);
      fs(ctx, rad(ctx, x, y, 7, c0, c1), 1.4);
      shine(ctx, x - 2.5, y - 2.5, 1.8, 1.1, -0.6, 0.8);
    }
  },

  /** 糖果：彩色的糖纸，两头拧成小蝴蝶结 */
  candy(ctx) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 7, 0);
      ctx.lineTo(s * 18, -8);
      ctx.quadraticCurveTo(s * 15, 0, s * 18, 8);
      ctx.closePath();
      ctx.lineJoin = 'round';
      fs(ctx, s < 0 ? '#ffb3c4' : '#ffc98f', 1.4);
    }
    ell(ctx, 0, 0, 10, 8.5);
    fs(ctx, rad(ctx, 0, 0, 10, '#ffe3ec', '#ff8fb0'));
    ctx.save();
    ell(ctx, 0, 0, 10, 8.5);
    ctx.clip();
    stroke(ctx, 'rgba(255, 255, 255, 0.85)', 2.2, () => {
      for (const x of [-6, 0, 6]) {
        ctx.moveTo(x - 4, -9);
        ctx.quadraticCurveTo(x + 3, 0, x - 4, 9);
      }
    });
    ctx.restore();
    ell(ctx, 0, 0, 10, 8.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
  },

  /** 草莓：红红的，上面一圈绿叶子，表面一颗颗小籽 */
  strawberry(ctx) {
    const berry = () => {
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.bezierCurveTo(-14, 8, -16, -10, 0, -9);
      ctx.bezierCurveTo(16, -10, 14, 8, 0, 17);
      ctx.closePath();
    };
    berry();
    fs(ctx, rad(ctx, 0, 2, 15, '#ff8a8a', '#ef4748', '#c9303a'));
    ctx.fillStyle = '#ffe9a0';
    for (const [x, y] of [[-6, -2], [0, -3], [6, -2], [-8, 4], [-2, 4], [4, 4], [9, 3], [-5, 9], [1, 10], [5, 9]]) {
      ell(ctx, x, y, 0.9, 1.4);
      ctx.fill();
    }
    // 绿色的萼片和小梗
    ctx.save();
    ctx.translate(0, -9);
    ctx.beginPath();
    ctx.moveTo(-9, 1);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-5, -7);
    ctx.lineTo(0, -4);
    ctx.lineTo(5, -7);
    ctx.lineTo(4, -3);
    ctx.lineTo(9, 1);
    ctx.lineTo(3, 0.5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-3, 0.5);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, '#7cc456', 1.3);
    stroke(ctx, '#5d9a46', 1.8, () => {
      ctx.moveTo(0, -4);
      ctx.lineTo(1, -10);
    });
    ctx.restore();
  },

  /** 小橘子 */
  tangerine(ctx) {
    ctx.translate(0, 3);
    drawOrange(ctx, 14);
  },

  /** 苹果 */
  apple(ctx) {
    ctx.translate(0, 2);
    ctx.scale(1.4, 1.4);
    drawSnack(ctx, 'apple', 0, 0);
  },

  /** 小鱼干 */
  driedFish(ctx) {
    ctx.rotate(-0.35);
    ctx.scale(0.95, 0.95);
    drawSnack(ctx, 'fish', 0, 0);
  },

  /** 气球：红气球，打个结，一根弯弯的线 */
  balloon(ctx) {
    stroke(ctx, INK, 1.3, () => {
      ctx.moveTo(0, 10);
      ctx.bezierCurveTo(4, 13, -3, 16, 2, 20);
    });
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(3, 12);
    ctx.lineTo(-3, 12);
    ctx.closePath();
    fs(ctx, '#e5483b', 1.2);
    ell(ctx, 0, -5, 12.5, 14);
    fs(ctx, rad(ctx, 0, -5, 14, '#ff9a8a', '#ef4b45', '#c9353a'));
    shine(ctx, -5, -11, 3, 5, 0.35, 0.65);
  },

  /** 小爪印：粉色的肉垫 */
  pawprint(ctx) {
    ctx.translate(0, 2);
    ell(ctx, 0, 6, 9.5, 8);
    fs(ctx, rad(ctx, 0, 6, 9.5, '#ffd3dd', '#ff9bb0'));
    for (const [x, y, r] of [[-10.5, -3, 3.8], [-4, -10, 4], [4, -10, 4], [10.5, -3, 3.8]]) {
      ell(ctx, x, y, r, r * 1.15, x * 0.03);
      fs(ctx, rad(ctx, x, y, r, '#ffd3dd', '#ff9bb0'), 1.4);
    }
  },

  // ---------------------------------------------------------------- 稀有

  /** 铜钱 */
  coin(ctx) {
    drawCoin(ctx, 15);
    shine(ctx, -6, -7, 3, 1.6, -0.6, 0.6);
  },

  /** 旧钥匙：铜色，一个圆圈当把手，前面两个齿 */
  oldKey(ctx) {
    ctx.save();
    ctx.rotate(0.7);
    const gold = lin(ctx, -18, -6, 18, 6, '#fbe39a', '#e0aa3e', '#b9812a');
    ctx.beginPath();
    ctx.rect(-6, -2.3, 22, 4.6);
    fs(ctx, gold, 1.4);
    ctx.beginPath();
    ctx.rect(12, 2, 3.2, 6);
    ctx.rect(6.5, 2, 3.2, 4.2);
    fs(ctx, gold, 1.3);
    ctx.beginPath();
    ctx.ellipse(-11, 0, 8, 8, 0, 0, TAU);
    ctx.moveTo(-7.5, 0);
    ctx.ellipse(-11, 0, 3.5, 3.5, 0, 0, TAU);
    ctx.fillStyle = gold;
    ctx.fill('evenodd');
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    shine(ctx, -14, -4, 2.2, 1.2, -0.7, 0.7);
    ctx.restore();
  },

  /** 铃铛：金色的，底下一颗小铃舌，顶上一个红蝴蝶结 */
  bell(ctx) {
    ell(ctx, 0, 13, 3.2, 3.2);
    fs(ctx, '#d9a13a', 1.3);
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.quadraticCurveTo(-11, 7, -10, -2);
    ctx.bezierCurveTo(-9, -15, 9, -15, 10, -2);
    ctx.quadraticCurveTo(11, 7, 14, 10);
    ctx.closePath();
    fs(ctx, rad(ctx, 0, -2, 15, '#fff1a8', '#f5c542', '#d99b1f'));
    ctx.beginPath();
    ctx.roundRect(-15, 8.5, 30, 4, 2);
    fs(ctx, '#e8b13a', 1.3);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(s * 9, -20, s * 9, -13);
      ctx.quadraticCurveTo(s * 7, -9, 0, -12);
      ctx.closePath();
      fs(ctx, '#ff6b6b', 1.2);
    }
    ell(ctx, 0, -12, 2.2, 2);
    fs(ctx, '#e5483b', 1.1);
    shine(ctx, -5, -3, 2, 4.5, 0.25, 0.6);
  },

  /** 指南针：金色的外圈，白色的表盘，一根红蓝的指针 */
  compass(ctx) {
    ell(ctx, 0, -16.5, 3, 3);
    fs(ctx, '#e8b84a', 1.3);
    ell(ctx, 0, 1, 16, 16);
    fs(ctx, rad(ctx, 0, 1, 16, '#ffe9a0', '#e2a93a'));
    ell(ctx, 0, 1, 12, 12);
    fs(ctx, '#fffaf0', 1.3);
    stroke(ctx, 'rgba(122, 74, 44, 0.6)', 1.1, () => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r0 = i % 2 === 0 ? 8.5 : 10;
        ctx.moveTo(Math.cos(a) * r0, 1 + Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * 11.2, 1 + Math.sin(a) * 11.2);
      }
    });
    ctx.save();
    ctx.translate(0, 1);
    ctx.rotate(0.35);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(3, 0);
    ctx.lineTo(-3, 0);
    ctx.closePath();
    fs(ctx, '#ef4b45', 1);
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(3, 0);
    ctx.lineTo(-3, 0);
    ctx.closePath();
    fs(ctx, '#6d8fc9', 1);
    ctx.restore();
    ell(ctx, 0, 1, 1.6, 1.6);
    fs(ctx, '#e8b84a', 0.9);
  },

  /** 红灯笼：红色的灯身，金色的竖条和上下盖，下面一串流苏 */
  lantern(ctx) {
    stroke(ctx, INK, 1.4, () => {
      ctx.moveTo(0, -19);
      ctx.lineTo(0, -15);
    });
    ctx.beginPath();
    ctx.roundRect(-6, -15, 12, 4, 1.5);
    fs(ctx, '#f5c542', 1.3);
    ell(ctx, 0, 0, 14.5, 11.5);
    fs(ctx, rad(ctx, 0, 0, 14.5, '#ff8a6b', '#e5352f', '#b92424'));
    ctx.save();
    ell(ctx, 0, 0, 14.5, 11.5);
    ctx.clip();
    stroke(ctx, 'rgba(255, 210, 120, 0.75)', 1.1, () => {
      for (const x of [-7.5, 0, 7.5]) {
        ctx.moveTo(x, -12);
        ctx.quadraticCurveTo(x * 1.6, 0, x, 12);
      }
    });
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(-6, 10.5, 12, 4, 1.5);
    fs(ctx, '#f5c542', 1.3);
    stroke(ctx, '#f0a12e', 1.4, () => {
      for (const x of [-2.5, 0, 2.5]) {
        ctx.moveTo(x, 14.5);
        ctx.lineTo(x * 1.3, 20);
      }
    });
    shine(ctx, -6, -4, 2, 4, 0.3, 0.5);
  },

  /** 风铃：透明的玻璃小钟，画着几颗小点，下面挂着一张粉色的纸条 */
  windChime(ctx) {
    stroke(ctx, INK, 1.2, () => {
      ctx.moveTo(0, -19);
      ctx.lineTo(0, -11);
      ctx.moveTo(0, 3);
      ctx.lineTo(0, 7);
    });
    ctx.beginPath();
    ctx.roundRect(-3.5, 7, 7, 12, 1.5);
    fs(ctx, lin(ctx, 0, 7, 0, 19, '#ffe3ea', '#ffb8c8'), 1.2);
    stroke(ctx, 'rgba(230, 90, 110, 0.6)', 1, () => {
      ctx.moveTo(-1.5, 11);
      ctx.lineTo(1.5, 13);
      ctx.moveTo(-1.5, 14.5);
      ctx.lineTo(1.5, 16.5);
    });
    ctx.beginPath();
    ctx.moveTo(-12, 3);
    ctx.quadraticCurveTo(-12, -13, 0, -13);
    ctx.quadraticCurveTo(12, -13, 12, 3);
    ctx.closePath();
    fs(ctx, 'rgba(180, 222, 255, 0.85)');
    ctx.fillStyle = '#5d9ad6';
    for (const [x, y] of [[-5, -5], [3, -7], [6, -1], [-2, 0]]) {
      ell(ctx, x, y, 1.3, 1.3);
      ctx.fill();
    }
    ell(ctx, 0, 3, 12, 2.2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    shine(ctx, -6, -6, 1.8, 3.5, 0.4, 0.7);
  },

  /** 四叶草：四片心形的小叶子，一根弯弯的茎 */
  clover(ctx) {
    stroke(ctx, '#4f9a3f', 2.2, () => {
      ctx.moveTo(1, 2);
      ctx.quadraticCurveTo(4, 12, 10, 19);
    });
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(0, -1);
      ctx.rotate((i / 4) * TAU + Math.PI / 4);
      ctx.translate(0, -7.5); // 心形的尖朝下 = 朝着中间
      heartPath(ctx, 0, 0, 7.5);
      fs(ctx, lin(ctx, 0, -7, 0, 7, '#b5ec8c', '#55a845'), 1.3);
      ctx.restore();
    }
    ell(ctx, 0, -1, 1.6, 1.6);
    ctx.fillStyle = '#4f9a3f';
    ctx.fill();
  },

  /** 风筝：菱形的四块颜色，十字的骨架，一条带蝴蝶结的尾巴 */
  kite(ctx) {
    stroke(ctx, INK, 1.2, () => {
      ctx.moveTo(1, 11);
      ctx.bezierCurveTo(6, 14, -2, 17, 4, 20);
    });
    for (const [x, y, c] of [[3, 14.5, '#ff8fb0'], [1.5, 18.5, '#7fc8ff']]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3.5, y - 2.2);
      ctx.lineTo(x - 3.5, y + 2.2);
      ctx.closePath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3.5, y - 2.2);
      ctx.lineTo(x + 3.5, y + 2.2);
      ctx.closePath();
      fs(ctx, c, 1);
    }
    ctx.save();
    ctx.rotate(0.12);
    const P = [[0, -18], [12, -4], [0, 11], [-12, -4]];
    const C = ['#ff6b6b', '#ffd54f', '#7fc8ff', '#8ed081'];
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(...P[i]);
      ctx.lineTo(...P[(i + 1) % 4]);
      ctx.closePath();
      ctx.fillStyle = C[i];
      ctx.fill();
    }
    ctx.beginPath();
    P.forEach((p, i) => (i === 0 ? ctx.moveTo(...p) : ctx.lineTo(...p)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    stroke(ctx, 'rgba(122, 74, 44, 0.7)', 1, () => {
      ctx.moveTo(0, -18);
      ctx.lineTo(0, 11);
      ctx.moveTo(-12, -4);
      ctx.lineTo(12, -4);
    });
    ctx.restore();
  },

  /** 围巾：红色的毛线围巾，几道白条纹，尾巴上有流苏 */
  scarf(ctx) {
    const red = lin(ctx, -16, 0, 16, 0, '#ff8a8a', '#e5483b');
    ctx.beginPath();
    ctx.moveTo(3, -4);
    ctx.lineTo(12, -6);
    ctx.lineTo(14, 14);
    ctx.lineTo(5, 15);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, red);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#fff3e6';
    for (const y of [3, 9]) ctx.fillRect(0, y, 18, 2.2);
    ctx.restore();
    stroke(ctx, '#e5483b', 1.6, () => {
      for (const x of [6.5, 9, 11.5]) {
        ctx.moveTo(x, 14.5);
        ctx.lineTo(x + 0.3, 19);
      }
    });
    ctx.beginPath();
    ctx.moveTo(-16, -12);
    ctx.quadraticCurveTo(0, -17, 16, -12);
    ctx.lineTo(16, -2);
    ctx.quadraticCurveTo(0, -7, -16, -2);
    ctx.closePath();
    fs(ctx, red);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#fff3e6';
    for (const x of [-9, 1, 11]) ctx.fillRect(x, -18, 2.2, 18);
    ctx.restore();
    stroke(ctx, 'rgba(255, 255, 255, 0.4)', 0.9, () => {
      ctx.moveTo(-14, -7);
      ctx.quadraticCurveTo(0, -12, 14, -7);
    });
  },

  /** 雪花：六个角，每个角上两根小枝，淡蓝色的边、白色的芯 */
  snowflake(ctx) {
    const arms = () => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(0, 0);
        ctx.lineTo(c * 17, s * 17);
        for (const [d, l] of [[8, 5], [12.5, 3.5]]) {
          const bx = c * d;
          const by = s * d;
          for (const t of [-1, 1]) {
            const b = a + t * 0.75;
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(b) * l, by + Math.sin(b) * l);
          }
        }
      }
    };
    arms();
    ctx.strokeStyle = '#7fa8dd';
    ctx.lineWidth = 4.2;
    ctx.stroke();
    arms();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    starPath(ctx, 0, 0, 4, 0.7, 6, 0);
    fs(ctx, '#ffffff', 1.4, '#7fa8dd');
  },

  /** 玻璃珠：紫色的玻璃球，里面一道白色的花纹，一大块高光 */
  marble(ctx) {
    ell(ctx, 0, 1, 16, 16);
    fs(ctx, rad(ctx, 0, 1, 16, '#efe1ff', '#b48cf2', '#7454c9'));
    ctx.save();
    ell(ctx, 0, 1, 16, 16);
    ctx.clip();
    stroke(ctx, 'rgba(255, 255, 255, 0.6)', 2.4, () => {
      ctx.moveTo(-14, 6);
      ctx.bezierCurveTo(-6, -6, 6, 14, 14, -2);
    });
    stroke(ctx, 'rgba(255, 190, 240, 0.7)', 1.6, () => {
      ctx.moveTo(-12, 11);
      ctx.bezierCurveTo(-3, 2, 5, 18, 13, 6);
    });
    ctx.restore();
    shine(ctx, -6, -6, 5, 3, -0.6, 0.75);
    shine(ctx, 7, 9, 1.6, 1.1, -0.6, 0.5);
  },

  // ---------------------------------------------------------------- 传说

  /** 彩虹：六道颜色，两头各一朵白云 */
  rainbow(ctx) {
    const colors = ['#ff6b6b', '#ffa94d', '#ffe066', '#8ed081', '#74c0fc', '#b197fc'];
    colors.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(0, 9, 17 - i * 2.2, Math.PI, 0);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    });
    stroke(ctx, INK, 1.2, () => {
      ctx.arc(0, 9, 18.3, Math.PI, 0);
    });
    stroke(ctx, INK, 1.2, () => {
      ctx.arc(0, 9, 4.6, Math.PI, 0);
    });
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 14, 11, 4.5, 0, TAU);
      ctx.arc(s * 9.5, 12.5, 3.8, 0, TAU);
      ctx.arc(s * 18.5, 13, 3.4, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 6, 16);
      ctx.lineTo(s * 21.5, 16);
      ctx.strokeStyle = 'rgba(122, 74, 44, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  },

  /** 流星：一颗黄色的星星，拖着长长的尾巴 */
  fallenStar(ctx) {
    for (const [dx, dy, w, a] of [[0, 0, 3.2, 0.9], [4, -3, 2, 0.6], [-4, 3, 2, 0.6]]) {
      const g = ctx.createLinearGradient(-16 + dx, 16 + dy, 4 + dx, -4 + dy);
      g.addColorStop(0, 'rgba(255, 220, 120, 0)');
      g.addColorStop(1, `rgba(255, 200, 80, ${a})`);
      ctx.beginPath();
      ctx.moveTo(-17 + dx, 17 + dy);
      ctx.lineTo(3 + dx, -3 + dy);
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    starPath(ctx, 6, -6, 11, 0.47);
    ctx.lineJoin = 'round';
    fs(ctx, rad(ctx, 6, -6, 11, '#fff6c2', '#ffd23f', '#f5a623'));
    starPath(ctx, -10, -12, 3, 0.4, 4, 0);
    ctx.fillStyle = '#ffe680';
    ctx.fill();
  },

  /** 宝石：切面闪闪的蓝绿色钻石 */
  gem(ctx) {
    const T = [[-9, -10], [9, -10], [16, -2], [0, 17], [-16, -2]];
    ctx.beginPath();
    T.forEach((p, i) => (i === 0 ? ctx.moveTo(...p) : ctx.lineTo(...p)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, lin(ctx, 0, -10, 0, 17, '#d8fbff', '#62d0ef', '#2a9cc9'));
    // 切面：上面一排三角，下面几道往尖上收的线
    const facet = (pts, fill) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(...p) : ctx.lineTo(...p)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    facet([[-9, -10], [-4, -2], [-16, -2]], 'rgba(255, 255, 255, 0.55)');
    facet([[9, -10], [4, -2], [16, -2]], 'rgba(20, 110, 160, 0.25)');
    facet([[-4, -2], [4, -2], [0, 17]], 'rgba(255, 255, 255, 0.25)');
    stroke(ctx, 'rgba(30, 100, 140, 0.55)', 1, () => {
      ctx.moveTo(-16, -2);
      ctx.lineTo(16, -2);
      ctx.moveTo(-9, -10);
      ctx.lineTo(-4, -2);
      ctx.lineTo(0, -10);
      ctx.lineTo(4, -2);
      ctx.lineTo(9, -10);
      ctx.moveTo(-4, -2);
      ctx.lineTo(0, 17);
      ctx.lineTo(4, -2);
    });
    starPath(ctx, -10, -13, 3.5, 0.35, 4, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  },

  /** 一小块月亮：弯弯的月牙，几个浅浅的坑，旁边一颗小星星 */
  moonPiece(ctx) {
    const moon = () => {
      ctx.beginPath();
      ctx.arc(-2, 1, 15, 0, TAU);
      ctx.moveTo(18, -3);
      ctx.arc(5, -3, 13, 0, TAU, true);
    };
    moon();
    ctx.fillStyle = rad(ctx, -2, 1, 15, '#fffbe0', '#ffe27a', '#f5b829');
    ctx.fill('evenodd');
    ctx.save();
    moon();
    ctx.clip('evenodd');
    ctx.fillStyle = 'rgba(230, 170, 40, 0.35)';
    for (const [x, y, r] of [[-10, 3, 2.4], [-6, 10, 1.8], [-12, -5, 1.5]]) {
      ell(ctx, x, y, r, r);
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(-2, 1, 15, 0, TAU);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-20, -20, 40, 40);
    ctx.arc(5, -3, 13, 0, TAU, true);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(-2, 1, 15, 0, TAU);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(-2, 1, 15, 0, TAU);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(5, -3, 13, 0, TAU);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    ctx.restore();
    starPath(ctx, 13, 10, 4.5, 0.42, 4, 0);
    fs(ctx, '#fff2a8', 1, '#d9a13a');
  },

  /** 藏宝图：卷着两头的羊皮纸，一条虚线小路通到红色的叉 */
  treasureMap(ctx) {
    ctx.beginPath();
    ctx.rect(-13, -12, 26, 24);
    fs(ctx, lin(ctx, 0, -12, 0, 12, '#fbefcf', '#efd49a'), 1.4);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(s * 13 - 3.5, -14, 7, 28, 3.5);
      fs(ctx, lin(ctx, s * 13 - 3.5, 0, s * 13 + 3.5, 0, '#f6e2b3', '#d9b46a'), 1.4);
    }
    ctx.setLineDash([2.2, 2]);
    stroke(ctx, 'rgba(122, 74, 44, 0.75)', 1.2, () => {
      ctx.moveTo(-8, 8);
      ctx.bezierCurveTo(-4, -2, 2, 8, 5, -4);
    });
    ctx.setLineDash([]);
    stroke(ctx, '#e5352f', 2.2, () => {
      ctx.moveTo(3, -8);
      ctx.lineTo(8, -3);
      ctx.moveTo(8, -8);
      ctx.lineTo(3, -3);
    });
    ctx.beginPath();
    ctx.moveTo(-8, -7);
    ctx.lineTo(-5.5, -2);
    ctx.lineTo(-10.5, -2);
    ctx.closePath();
    fs(ctx, '#8ed081', 1);
  },

  // ---------------------------------------------------------------- 节日限定

  /** 礼花筒：彩色条纹的小圆锥，彩带和纸屑从口里喷出来 */
  partyPopper(ctx) {
    ctx.save();
    ctx.translate(-6, 6);
    ctx.rotate(-0.75);
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-7, -6);
    ctx.lineTo(7, -6);
    ctx.closePath();
    ctx.lineJoin = 'round';
    fs(ctx, '#ffd54f');
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ff6b8b';
    for (const y of [-2, 6]) ctx.fillRect(-8, y, 16, 3);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-7, -6);
    ctx.lineTo(7, -6);
    ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    ctx.restore();
    stroke(ctx, '#74c0fc', 1.6, () => {
      ctx.moveTo(-1, -1);
      ctx.bezierCurveTo(2, -10, 8, -6, 10, -15);
    });
    stroke(ctx, '#ff6b8b', 1.6, () => {
      ctx.moveTo(0, 1);
      ctx.bezierCurveTo(8, -1, 10, 6, 17, 2);
    });
    for (const [x, y, c, r] of [[4, -14, '#8ed081', 0.4], [14, -9, '#ffd54f', -0.3], [16, -16, '#b197fc', 0.8], [9, 8, '#ff9a6b', 0.2], [-2, -17, '#ff6b8b', 0.5]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.fillStyle = c;
      ctx.fillRect(-2, -1.2, 4, 2.4);
      ctx.restore();
    }
  },

  /** 生日蛋糕：粉色的奶油往下流，顶上一根蜡烛、几颗草莓 */
  birthdayCake(ctx) {
    ctx.beginPath();
    ctx.roundRect(-15, -2, 30, 17, 3);
    fs(ctx, lin(ctx, 0, -2, 0, 15, '#fff1dc', '#f3d2a2'));
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.lineTo(-15, -1);
    ctx.quadraticCurveTo(-15, -4, -12, -4);
    ctx.lineTo(12, -4);
    ctx.quadraticCurveTo(15, -4, 15, -1);
    ctx.lineTo(15, 4);
    for (let i = 0; i < 5; i++) {
      const x = 15 - i * 7.5;
      ctx.quadraticCurveTo(x - 1.5, 9, x - 3.75, 4);
      ctx.quadraticCurveTo(x - 6, 1, x - 7.5, 4);
    }
    ctx.closePath();
    fs(ctx, '#ffb3c7', 1.3);
    ctx.fillStyle = '#ef4b5c';
    for (const x of [-9, 0, 9]) {
      ell(ctx, x, -6, 2.6, 2.4);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(-1.8, -16, 3.6, 10, 1);
    fs(ctx, '#7fc8ff', 1.1);
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.quadraticCurveTo(3, -19, 0, -17);
    ctx.quadraticCurveTo(-3, -19, 0, -23);
    ctx.closePath();
    fs(ctx, '#ffb347', 1, '#e5852a');
  },

  /** 纪念相册：绿色的布面本子，封面中间一颗心，一根丝带书签 */
  memoryAlbum(ctx) {
    ctx.beginPath();
    ctx.moveTo(4, 14);
    ctx.lineTo(4, 20);
    ctx.lineTo(6.5, 18);
    ctx.lineTo(9, 20);
    ctx.lineTo(9, 14);
    ctx.closePath();
    fs(ctx, '#ff6b8b', 1.1);
    ctx.beginPath();
    ctx.roundRect(-13, -16, 27, 31, 3);
    fs(ctx, lin(ctx, -13, 0, 14, 0, '#8ccf9b', '#4f9a6b'));
    ctx.beginPath();
    ctx.rect(-13, -16, 5, 31);
    fs(ctx, '#3f8058', 1.3);
    ctx.beginPath();
    ctx.roundRect(-5, -8, 15, 13, 2);
    fs(ctx, '#fff6e6', 1.2);
    heartPath(ctx, 2.5, -1.5, 4.2);
    ctx.fillStyle = '#ff6b8b';
    ctx.fill();
  },

  /** 鞭炮：红色的一截，金色的箍，顶上一根引线冒着火星 */
  firecracker(ctx) {
    ctx.save();
    ctx.rotate(-0.35);
    stroke(ctx, INK, 1.4, () => {
      ctx.moveTo(0, -12);
      ctx.bezierCurveTo(4, -15, -2, -18, 3, -21);
    });
    ctx.beginPath();
    ctx.roundRect(-6.5, -12, 13, 28, 3);
    fs(ctx, lin(ctx, -6.5, 0, 6.5, 0, '#ff7b6b', '#e5352f', '#b92424'));
    ctx.beginPath();
    ctx.rect(-6.5, -9, 13, 3);
    ctx.rect(-6.5, 10, 13, 3);
    fs(ctx, '#f5c542', 1.1);
    ctx.restore();
    starPath(ctx, 9, -19, 4.5, 0.4, 6, 0);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  },

  /** 红包：红色的信封，上面的封口深一点，中间一个金色的圆扣 */
  redEnvelope(ctx) {
    ctx.beginPath();
    ctx.roundRect(-12, -16, 24, 32, 3);
    fs(ctx, lin(ctx, 0, -16, 0, 16, '#ff6b5c', '#d92f2a'));
    ctx.beginPath();
    ctx.moveTo(-12, -13);
    ctx.quadraticCurveTo(0, 2, 12, -13);
    ctx.lineTo(12, -13);
    ctx.quadraticCurveTo(12, -16, 9, -16);
    ctx.lineTo(-9, -16);
    ctx.quadraticCurveTo(-12, -16, -12, -13);
    ctx.closePath();
    fs(ctx, '#c92424', 1.3);
    ell(ctx, 0, -3, 5.5, 5.5);
    fs(ctx, rad(ctx, 0, -3, 5.5, '#fff1a8', '#f5c542', '#d99b1f'), 1.2);
    starPath(ctx, 0, -3, 2.8, 0.45, 4, 0);
    ctx.fillStyle = '#e5352f';
    ctx.fill();
    stroke(ctx, 'rgba(255, 210, 120, 0.7)', 1, () => {
      ctx.moveTo(-8, 10);
      ctx.lineTo(8, 10);
    });
  },

  /** 汤圆：一碗白白胖胖的汤圆，冒着热气 */
  tangyuan(ctx) {
    stroke(ctx, 'rgba(150, 150, 170, 0.6)', 1.3, () => {
      for (const x of [-6, 4]) {
        ctx.moveTo(x, -9);
        ctx.bezierCurveTo(x - 3, -12, x + 3, -14, x, -18);
      }
    });
    for (const [x, y] of [[-6, -2], [5, -2], [0, -5]]) {
      ell(ctx, x, y, 6, 5.5);
      fs(ctx, rad(ctx, x, y, 6, '#ffffff', '#efe6dc'), 1.3);
    }
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.quadraticCurveTo(-16, 16, 0, 16);
    ctx.quadraticCurveTo(16, 16, 17, 0);
    ctx.closePath();
    fs(ctx, lin(ctx, 0, 0, 0, 16, '#e3f0ff', '#a9c8ec'));
    stroke(ctx, '#ff8a8a', 1.6, () => {
      ctx.moveTo(-15, 5);
      ctx.quadraticCurveTo(0, 9, 15, 5);
    });
    ell(ctx, 0, 0, 17, 3);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  },

  /** 柳枝：一根垂下来的细枝，挂满细细的柳叶 */
  willowSprig(ctx) {
    stroke(ctx, '#8a6a3c', 1.6, () => {
      ctx.moveTo(14, -18);
      ctx.bezierCurveTo(4, -14, -6, -2, -9, 18);
    });
    const pts = [[11, -16.5, 0.4], [6, -12.5, -0.9], [3, -8, 0.6], [-1, -3.5, -0.8], [-3.5, 2, 0.7], [-6, 7.5, -0.7], [-7.5, 12.5, 0.5]];
    for (const [x, y, r] of pts) leaf(ctx, x + Math.sign(r) * 3, y + 3, r + 0.3, 11, 3.2, '#9fd96f');
  },

  /** 粽子：三角形，裹着绿色的粽叶，中间系一道绳子 */
  zongzi(ctx) {
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(2, -16, 4, -12);
      ctx.lineTo(15, 10);
      ctx.quadraticCurveTo(16, 14, 12, 14);
      ctx.lineTo(-12, 14);
      ctx.quadraticCurveTo(-16, 14, -15, 10);
      ctx.lineTo(-4, -12);
      ctx.quadraticCurveTo(-2, -16, 0, -16);
      ctx.closePath();
    };
    body();
    fs(ctx, lin(ctx, -15, 0, 15, 0, '#a8da7f', '#5fa84a'));
    ctx.save();
    body();
    ctx.clip();
    stroke(ctx, 'rgba(50, 110, 40, 0.45)', 1, () => {
      for (const x of [-8, -2, 4, 10]) {
        ctx.moveTo(x - 6, 14);
        ctx.lineTo(x + 2, -14);
      }
    });
    ctx.fillStyle = '#f1dcae';
    ctx.fillRect(-16, 1, 32, 3.4);
    ctx.restore();
    body();
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    stroke(ctx, '#d9b46a', 1.4, () => {
      ctx.moveTo(5, 2.5);
      ctx.quadraticCurveTo(11, -2, 9, 5);
      ctx.moveTo(5, 2.5);
      ctx.quadraticCurveTo(12, 6, 7, 8);
    });
  },

  /** 喜鹊羽毛：黑白相间，羽尖带一点蓝绿色的光泽 */
  magpieFeather(ctx) {
    feather(ctx, '#ffffff', '#3b4a63', '#3f8aa8');
  },

  /** 月饼：金黄色、一圈花边，中间印着一朵花 */
  mooncake(ctx) {
    const n = 14;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const m = ((i - 0.5) / n) * TAU;
      if (i === 0) ctx.moveTo(Math.cos(a) * 15.5, 1 + Math.sin(a) * 15.5);
      else ctx.quadraticCurveTo(Math.cos(m) * 18, 1 + Math.sin(m) * 18, Math.cos(a) * 15.5, 1 + Math.sin(a) * 15.5);
    }
    ctx.closePath();
    fs(ctx, rad(ctx, 0, 1, 17, '#ffd98f', '#e8a94e', '#c9853a'));
    ell(ctx, 0, 1, 10.5, 10.5);
    ctx.strokeStyle = 'rgba(140, 80, 30, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    stroke(ctx, 'rgba(140, 80, 30, 0.55)', 1.2, () => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.moveTo(Math.cos(a) * 2.5, 1 + Math.sin(a) * 2.5);
        ctx.quadraticCurveTo(Math.cos(a + 0.5) * 8, 1 + Math.sin(a + 0.5) * 8, Math.cos(a + 0.25) * 8.5, 1 + Math.sin(a + 0.25) * 8.5);
      }
    });
    ell(ctx, 0, 1, 2.2, 2.2);
    ctx.fillStyle = 'rgba(140, 80, 30, 0.55)';
    ctx.fill();
  },

  /** 饺子：两个白白的饺子，上面一道道捏出来的褶 */
  dumplings(ctx) {
    for (const [x, y, s] of [[-6, 3, 0.95], [6, -2, 1]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.moveTo(-13, 4);
      ctx.bezierCurveTo(-12, -9, 12, -9, 13, 4);
      ctx.quadraticCurveTo(0, 11, -13, 4);
      ctx.closePath();
      fs(ctx, rad(ctx, 0, 0, 13, '#ffffff', '#f3ead9'), 1.4);
      stroke(ctx, 'rgba(160, 130, 90, 0.55)', 1, () => {
        for (const px of [-6, -2, 2, 6]) {
          ctx.moveTo(px, -4.5);
          ctx.quadraticCurveTo(px + 1.5, -2, px + 0.5, 0.5);
        }
      });
      ctx.restore();
    }
  },

  /** 奖牌：红蓝两条绶带，金色的牌子上一颗星 */
  medal(ctx) {
    for (const [s, c] of [[-1, '#ff6b6b'], [1, '#6d9ee8']]) {
      ctx.beginPath();
      ctx.moveTo(s * 11, -18);
      ctx.lineTo(s * 4, -18);
      ctx.lineTo(-s * 4, -2);
      ctx.lineTo(s * 3, -2);
      ctx.closePath();
      ctx.lineJoin = 'round';
      fs(ctx, c, 1.3);
    }
    ell(ctx, 0, 6, 11.5, 11.5);
    fs(ctx, rad(ctx, 0, 6, 11.5, '#fff1a8', '#f5c542', '#d99b1f'));
    ell(ctx, 0, 6, 8, 8);
    ctx.strokeStyle = 'rgba(170, 110, 20, 0.6)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    starPath(ctx, 0, 6.5, 5.5, 0.45);
    fs(ctx, '#fff6c2', 1, '#c9952b');
  },

  /** 旅行照片：一张拍立得，里面是蓝天、绿山和太阳 */
  travelPhoto(ctx) {
    ctx.save();
    ctx.rotate(-0.12);
    ctx.beginPath();
    ctx.roundRect(-14, -16, 28, 33, 2);
    fs(ctx, '#ffffff');
    ctx.beginPath();
    ctx.rect(-11, -13, 22, 20);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = lin(ctx, 0, -13, 0, 7, '#9fd4ff', '#e7f5ff');
    ctx.fillRect(-11, -13, 22, 20);
    ell(ctx, 5, -7, 3, 3);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, 8);
    ctx.lineTo(-4, -3);
    ctx.lineTo(1, 3);
    ctx.lineTo(5, -1);
    ctx.lineTo(12, 8);
    ctx.closePath();
    ctx.fillStyle = '#7cc456';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.rect(-11, -13, 22, 20);
    ctx.strokeStyle = 'rgba(122, 74, 44, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },

  /** 巧克力：一颗心形的巧克力，淋了一道白巧克力 */
  chocolate(ctx) {
    heartPath(ctx, 0, 1, 15);
    fs(ctx, rad(ctx, 0, 0, 16, '#a8683f', '#6e3b1c', '#4a2410'));
    ctx.save();
    heartPath(ctx, 0, 1, 15);
    ctx.clip();
    stroke(ctx, '#fff1e0', 1.8, () => {
      ctx.moveTo(-16, -4);
      ctx.bezierCurveTo(-8, 2, -4, -8, 2, -1);
      ctx.bezierCurveTo(7, 5, 10, -5, 16, 0);
    });
    ctx.restore();
    shine(ctx, -7, -6, 3, 1.6, -0.7, 0.45);
  },

  /** 彩蛋：淡紫色的蛋，一道黄色的锯齿花纹、几个小圆点 */
  easterEgg(ctx) {
    const egg = () => {
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.bezierCurveTo(10, -17, 14, 2, 13, 7);
      ctx.bezierCurveTo(12, 14, 6, 17, 0, 17);
      ctx.bezierCurveTo(-6, 17, -12, 14, -13, 7);
      ctx.bezierCurveTo(-14, 2, -10, -17, 0, -17);
      ctx.closePath();
    };
    egg();
    fs(ctx, rad(ctx, 0, 0, 16, '#f3e6ff', '#c9a7ff'));
    ctx.save();
    egg();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    for (let i = 0; i < 8; i++) ctx.lineTo(-15 + (i + 0.5) * 3.75, i % 2 === 0 ? -4 : 2);
    ctx.lineTo(15, 0);
    ctx.lineTo(15, 4);
    for (let i = 7; i >= 0; i--) ctx.lineTo(-15 + (i + 0.5) * 3.75, (i % 2 === 0 ? -4 : 2) + 4);
    ctx.lineTo(-15, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffd54f';
    ctx.fill();
    ctx.fillStyle = '#ff8fb0';
    for (const [x, y] of [[-5, -10], [4, -11], [-6, 10], [3, 11], [9, 7]]) {
      ell(ctx, x, y, 1.8, 1.8);
      ctx.fill();
    }
    ctx.restore();
    egg();
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
  },

  /** 南瓜糖：一颗南瓜形状的橘色糖果，画着南瓜灯的笑脸，顶上一截绿梗 */
  pumpkinCandy(ctx) {
    stroke(ctx, '#5d9a46', 2.4, () => {
      ctx.moveTo(0, -11);
      ctx.quadraticCurveTo(1, -16, 4, -17);
    });
    for (const [x, rx] of [[-7, 8.5], [7, 8.5], [0, 9]]) {
      ell(ctx, x, 2, rx, 13);
      fs(ctx, rad(ctx, x, 2, 13, '#ffc27a', '#f5892e', '#d96a1f'), 1.4);
    }
    ctx.fillStyle = '#5a3418';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 7, -3);
      ctx.lineTo(s * 3, 2);
      ctx.lineTo(s * 10, 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.quadraticCurveTo(0, 13, 8, 6);
    ctx.quadraticCurveTo(0, 9, -8, 6);
    ctx.closePath();
    ctx.fill();
  },

  /** 礼物盒：红盒子、黄丝带，顶上一个蝴蝶结 */
  presentBox(ctx) {
    ctx.beginPath();
    ctx.rect(-13, -3, 26, 19);
    fs(ctx, lin(ctx, 0, -3, 0, 16, '#ff8a8a', '#e5483b'));
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(-2.5, -3, 5, 19);
    ctx.beginPath();
    ctx.rect(-15.5, -9, 31, 7);
    fs(ctx, lin(ctx, 0, -9, 0, -2, '#ffa0a0', '#ef5a50'));
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(-2.5, -9, 5, 7);
    ctx.beginPath();
    ctx.rect(-15.5, -9, 31, 7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LW;
    ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.bezierCurveTo(s * 4, -19, s * 13, -17, s * 8, -10);
      ctx.quadraticCurveTo(s * 5, -8, 0, -9);
      ctx.closePath();
      fs(ctx, '#ffd54f', 1.3);
    }
    ell(ctx, 0, -9.5, 2.5, 2.2);
    fs(ctx, '#f5b829', 1.2);
  },

  /** 仙女棒：一根细细的棒子，头上噼里啪啦冒着金色的火花 */
  sparkler(ctx) {
    stroke(ctx, '#8a7a6a', 2, () => {
      ctx.moveTo(-14, 18);
      ctx.lineTo(4, -4);
    });
    stroke(ctx, '#5a4a42', 2.6, () => {
      ctx.moveTo(1, 0);
      ctx.lineTo(6, -6);
    });
    stroke(ctx, '#ffc94a', 1.3, () => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const r0 = 3;
        const r1 = i % 2 === 0 ? 13 : 9;
        ctx.moveTo(7 + Math.cos(a) * r0, -7 + Math.sin(a) * r0);
        ctx.lineTo(7 + Math.cos(a) * r1, -7 + Math.sin(a) * r1);
      }
    });
    starPath(ctx, 7, -7, 5, 0.45, 4, 0.4);
    ctx.fillStyle = '#fff6c2';
    ctx.fill();
    for (const [x, y] of [[17, -16], [-1, -17], [18, 2]]) {
      starPath(ctx, x, y, 2, 0.4, 4, 0);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
  },

  /** 派：烤得金黄的派皮，上面一格一格的网，下面是派盘 */
  pie(ctx) {
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(-13, 11);
    ctx.quadraticCurveTo(0, 15, 13, 11);
    ctx.lineTo(17, 0);
    ctx.closePath();
    fs(ctx, lin(ctx, 0, 0, 0, 14, '#cfe3f5', '#8fb3d6'));
    ell(ctx, 0, 0, 17, 7.5);
    fs(ctx, '#c9643a');
    ctx.save();
    ell(ctx, 0, 0, 15, 6.2);
    ctx.clip();
    ctx.fillStyle = '#b5482a';
    ctx.fillRect(-16, -7, 32, 14);
    ctx.fillStyle = '#f3c27a';
    for (const x of [-9, -3, 3, 9]) ctx.fillRect(x - 1.6, -7, 3.2, 14);
    for (const y of [-3, 1.5]) ctx.fillRect(-16, y - 1.4, 32, 2.8);
    ctx.restore();
    ell(ctx, 0, 0, 17, 7.5);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#e8a95a';
    ctx.stroke();
    ell(ctx, 0, 0, 18.6, 9);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  },
};

/** 有画法的礼物编号（npm run letters 用它核对目录） */
export const GIFT_ICON_IDS = Object.freeze(Object.keys(ICONS));

/**
 * 画一件礼物。画在 (0, 0) 周围、边长 size 的正方形里。没有画法（不认识的编号）时画一个问号
 */
export function drawGift(ctx, id, size = 40) {
  const draw = ICONS[id];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.scale(size / 42, size / 42); // 留一点边：描边、高光不会贴着格子的边
  if (draw) {
    draw(ctx);
  } else {
    ctx.font = '700 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c4a98a';
    ctx.fillText('?', 0, 1);
  }
  ctx.restore();
}
