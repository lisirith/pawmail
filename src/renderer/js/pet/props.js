// 宠物身上偶尔出现的小东西（不是衣服，也不是节日装扮）：
//   卡皮巴拉头顶的橘子；招牌动作里的零食、纸箱、小木盆、小鸟、球、毛线球、铜钱。
// 宠物身上（draw.js）、特效（fx.js）、桌面上滚来滚去的玩具（toy.js）用的是同一套画法。
// 全部用代码画（和宠物一样），每个函数的原点和大小都写在注释里。

import { TAU, clamp } from '../util/math.js';

const INK = '#7a4a2c';

function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function fillStroke(ctx, fill, width = 1.3, stroke = INK) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** 一个小橘子：原点在橘子中心，r 是半径。橘子蒂在上面，带一片小叶子 */
export function drawOrange(ctx, r = 10) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 橘子本身：稍微扁一点，左上亮、右下暗
  const fill = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  fill.addColorStop(0, '#ffd27a');
  fill.addColorStop(0.55, '#f8a440');
  fill.addColorStop(1, '#e5852a');
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 橘子皮上的几个小点
  ctx.fillStyle = 'rgba(200, 105, 30, 0.35)';
  for (const [x, y] of [[0.35, 0.15], [-0.15, 0.4], [0.5, -0.25], [-0.45, 0.05]]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  // 高光
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.38, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 248, 225, 0.75)';
  ctx.fill();
  // 蒂和小叶子
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.92);
  ctx.lineTo(0.5, -r * 1.12);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.5, -r * 1.05);
  ctx.bezierCurveTo(r * 0.3, -r * 1.45, r * 0.85, -r * 1.35, r * 0.95, -r * 1.12);
  ctx.bezierCurveTo(r * 0.6, -r * 0.92, r * 0.25, -r * 0.92, 0.5, -r * 1.05);
  ctx.closePath();
  ctx.fillStyle = '#8cc46a';
  ctx.fill();
  ctx.strokeStyle = '#4f7a3a';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

// ================================================================ 零食（招牌动作"抱着零食啃"）
//
// 原点是胸口（和手里拿的信、奶茶一样），bite：0 … 1 已经吃掉多少。
// 被咬掉的地方是真的"没了"（裁掉，透出后面的身子），边上是一排小牙印。

/**
 * 只留下"还没被咬掉"的那部分：从 x0 往 x1 方向咬，咬到 at 为止，切口是一排小圆弧（牙印）。
 * 横着的零食（小鱼干、肉干）用它。y0 / y1：零食的上下范围
 */
function clipBitten(ctx, at, dir, y0, y1) {
  const teeth = 4;
  const h = y1 - y0;
  ctx.beginPath();
  ctx.moveTo(at, y0 - 6);
  for (let i = 0; i < teeth; i++) {
    const ya = y0 + (h * i) / teeth;
    const yb = y0 + (h * (i + 1)) / teeth;
    ctx.quadraticCurveTo(at + dir * 3.2, (ya + yb) / 2, at, yb);
  }
  ctx.lineTo(at, y1 + 6);
  ctx.lineTo(at + dir * 60, y1 + 6);
  ctx.lineTo(at + dir * 60, y0 - 6);
  ctx.closePath();
  ctx.clip();
}

/** 猫：小鱼干。横着抱在胸前，鱼头朝左；从鱼头那边开始吃 */
function snackFish(ctx, bite) {
  ctx.save();
  ctx.translate(1, 0);
  ctx.rotate(-0.1);
  const cut = -14 + bite * 25; // 咬到哪儿了
  if (bite > 0.02) clipBitten(ctx, cut, 1, -6, 6);
  ctx.beginPath(); // 尾巴
  ctx.moveTo(10, 0);
  ctx.lineTo(16.5, -5.5);
  ctx.quadraticCurveTo(14.5, 0, 16.5, 5.5);
  ctx.closePath();
  fillStroke(ctx, '#c98c45', 1.1);
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.bezierCurveTo(-11, -5.5, 4, -5.5, 11, -0.5);
    ctx.bezierCurveTo(4, 4.8, -11, 4.8, -14, 0);
    ctx.closePath();
  };
  body();
  const grad = ctx.createLinearGradient(0, -5, 0, 5);
  grad.addColorStop(0, '#b9884a');
  grad.addColorStop(0.45, '#f0c57c');
  grad.addColorStop(1, '#fbe8c2');
  fillStroke(ctx, grad, 1.2);
  ctx.save();
  body();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120, 80, 40, 0.45)'; // 鱼干上晒出来的纹路
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const x of [-4, 0, 4]) {
    ctx.moveTo(x, -4);
    ctx.quadraticCurveTo(x - 2, 0, x, 4);
  }
  ctx.stroke();
  ctx.restore();
  ellipse(ctx, -10, -1.2, 1.3, 1.3); // 眼睛
  ctx.fillStyle = '#3b2a22';
  ctx.fill();
  ctx.restore();
}

/** 柴犬：肉干。一条红棕色的肉干，斜着拿；从上面那头开始吃 */
function snackJerky(ctx, bite) {
  ctx.save();
  ctx.translate(2, 0);
  ctx.rotate(-0.55);
  const cut = -14 + bite * 25;
  if (bite > 0.02) clipBitten(ctx, cut, 1, -5, 5);
  const strip = () => {
    ctx.beginPath();
    ctx.moveTo(-14, -3.6);
    ctx.bezierCurveTo(-6, -5.4, 4, -2.4, 14, -4.2);
    ctx.lineTo(14, 3.6);
    ctx.bezierCurveTo(4, 2, -6, 5.2, -14, 3.2);
    ctx.closePath();
  };
  strip();
  const grad = ctx.createLinearGradient(0, -5, 0, 5);
  grad.addColorStop(0, '#9a4a2e');
  grad.addColorStop(0.5, '#c0673f');
  grad.addColorStop(1, '#8d3f27');
  fillStroke(ctx, grad, 1.2);
  ctx.save();
  strip();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 210, 170, 0.35)'; // 肉的纹理
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const y of [-1.6, 1.4]) {
    ctx.moveTo(-14, y);
    ctx.bezierCurveTo(-5, y - 1.2, 5, y + 1.2, 14, y - 0.6);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/**
 * 熊猫：一截竹子。竖着抱在胸前，两只爪子握着下半截，上头差不多到嘴边；
 * 中间一小枝叶子往右边翘出去。从上面开始啃，啃到叶子那儿，叶子也吃掉
 */
function snackBamboo(ctx, bite, time) {
  ctx.save();
  ctx.translate(1, -1);
  ctx.rotate(0.12);
  const top = -27 + bite * 32; // 啃到哪儿了（往下是正数）
  // 叶子：还没啃到那一枝时才有
  const leaves = clamp((-12 - top) / 4, 0, 1);
  if (leaves > 0.02) {
    ctx.save();
    ctx.globalAlpha *= leaves;
    ctx.translate(2.5, -14);
    ctx.rotate(1.1 + Math.sin(time * 2.2) * 0.07);
    for (const [rot, len] of [[-0.35, 13], [0.35, 11]]) {
      ctx.save();
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(3.4, -len * 0.5, 0, -len);
      ctx.quadraticCurveTo(-3.4, -len * 0.5, 0, 0);
      ctx.closePath();
      fillStroke(ctx, '#7cbf55', 1.1);
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.save();
  if (bite > 0.02) {
    // 竹竿上面被啃掉的那截：裁掉，切口是一排牙印
    ctx.beginPath();
    ctx.moveTo(-6, top);
    for (let i = 0; i < 3; i++) ctx.quadraticCurveTo(-4 + i * 4, top - 2.6, -2 + i * 4, top);
    ctx.lineTo(6, top);
    ctx.lineTo(6, 40);
    ctx.lineTo(-6, 40);
    ctx.closePath();
    ctx.clip();
  }
  ctx.beginPath();
  ctx.roundRect(-3.3, -27, 6.6, 40, 3);
  const grad = ctx.createLinearGradient(-3.3, 0, 3.3, 0);
  grad.addColorStop(0, '#a6d77f');
  grad.addColorStop(1, '#6ea946');
  fillStroke(ctx, grad, 1.3);
  ctx.strokeStyle = '#4f8a34'; // 竹节
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const y of [-12, 2]) {
    ctx.moveTo(-3.3, y);
    ctx.quadraticCurveTo(0, y + 1.5, 3.3, y);
  }
  ctx.stroke();
  if (bite > 0.02) {
    // 啃过的切口露出浅色的竹肉
    ellipse(ctx, 0, top + 0.8, 3, 1.3);
    ctx.fillStyle = '#e8f3c8';
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

/** 卡皮巴拉：一角西瓜。尖朝上，绿皮在下面；从尖上开始啃 */
function snackWatermelon(ctx, bite) {
  ctx.save();
  ctx.translate(0, 1);
  const slice = () => {
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(14, 5);
    ctx.quadraticCurveTo(0, 12, -14, 5);
    ctx.closePath();
  };
  ctx.save();
  if (bite > 0.02) {
    // 被啃掉的尖：一排大圆牙印往下推
    const top = -17 + bite * 19;
    ctx.beginPath();
    ctx.moveTo(-20, top);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(-15 + i * 10, top - 5, -10 + i * 10, top);
    ctx.lineTo(25, top);
    ctx.lineTo(25, 20);
    ctx.lineTo(-20, 20);
    ctx.closePath();
    ctx.clip();
  }
  slice();
  ctx.fillStyle = '#ff6b6b'; // 红瓤
  ctx.fill();
  ctx.save();
  slice();
  ctx.clip();
  ctx.beginPath(); // 白色的一圈 + 绿皮
  ctx.moveTo(-16, 3.2);
  ctx.quadraticCurveTo(0, 9.8, 16, 3.2);
  ctx.lineTo(16, 16);
  ctx.lineTo(-16, 16);
  ctx.closePath();
  ctx.fillStyle = '#f3f7d8';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-16, 5.6);
  ctx.quadraticCurveTo(0, 12.2, 16, 5.6);
  ctx.lineTo(16, 16);
  ctx.lineTo(-16, 16);
  ctx.closePath();
  ctx.fillStyle = '#4f9a45';
  ctx.fill();
  ctx.fillStyle = '#3b2a22'; // 黑籽
  for (const [x, y] of [[-4, -5], [3, -7], [0, -1], [-7, 0], [6, -1], [-2, -11]]) {
    ellipse(ctx, x, y, 0.9, 1.4, x * 0.06);
    ctx.fill();
  }
  ctx.restore();
  slice();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** 小熊猫：红苹果。一口一口从边上咬，最后只剩一个果核 */
function snackApple(ctx, bite) {
  ctx.save();
  ctx.translate(1, 0);
  const bites = Math.round(clamp(bite, 0, 1) * 4); // 0 整个 … 4 只剩果核
  if (bites >= 4) {
    // 果核：上下两头还是红的，中间细细的一截
    ctx.beginPath();
    ctx.moveTo(-6.5, -8);
    ctx.quadraticCurveTo(0, -10.5, 6.5, -8);
    ctx.quadraticCurveTo(2, -4, 2.6, 0);
    ctx.quadraticCurveTo(2, 4, 6, 8);
    ctx.quadraticCurveTo(0, 10.5, -6, 8);
    ctx.quadraticCurveTo(-2, 4, -2.6, 0);
    ctx.quadraticCurveTo(-2, -4, -6.5, -8);
    ctx.closePath();
    fillStroke(ctx, '#fbf1d6', 1.2);
    ctx.fillStyle = '#7a4a2c';
    ellipse(ctx, -0.8, -1, 0.8, 1.3);
    ctx.fill();
    ellipse(ctx, 1, 1.4, 0.8, 1.3);
    ctx.fill();
  } else {
    const apple = () => {
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.bezierCurveTo(4, -11.5, 11.5, -9, 11.5, -1);
      ctx.bezierCurveTo(11.5, 7, 6, 11, 0, 9.5);
      ctx.bezierCurveTo(-6, 11, -11.5, 7, -11.5, -1);
      ctx.bezierCurveTo(-11.5, -9, -4, -11.5, 0, -8);
      ctx.closePath();
    };
    // 牙印：大小差不多的几个圆，依次在右边、左上、左下
    const marks = [[12.5, -1, 6.2], [-11, -6.5, 5.6], [-11.5, 6, 5.6]].slice(0, bites);
    ctx.save();
    if (marks.length) {
      ctx.beginPath();
      ctx.rect(-30, -30, 60, 60);
      for (const [x, y, r] of marks) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.clip('evenodd');
    }
    apple();
    const grad = ctx.createRadialGradient(-4, -4, 1, 0, 0, 13);
    grad.addColorStop(0, '#ff8a7a');
    grad.addColorStop(0.6, '#e8423f');
    grad.addColorStop(1, '#b82c2e');
    fillStroke(ctx, grad, 1.3);
    // 咬过的地方露出米色的果肉
    ctx.save();
    apple();
    ctx.clip();
    ctx.fillStyle = '#fbf1d6';
    for (const [x, y, r] of marks) {
      ctx.beginPath();
      ctx.arc(x, y, r + 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    ellipse(ctx, -4.2, -4.5, 2.2, 1.3, -0.6); // 高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
  }
  // 蒂和叶子
  ctx.beginPath();
  ctx.moveTo(0, -8.5);
  ctx.quadraticCurveTo(0.5, -12, 2, -13.5);
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1.5, -12);
  ctx.quadraticCurveTo(5, -15.5, 8.5, -13);
  ctx.quadraticCurveTo(5, -10.5, 1.5, -12);
  ctx.closePath();
  fillStroke(ctx, '#7cbf55', 0.9, '#4f7a3a');
  ctx.restore();
}

const SNACKS = { fish: snackFish, jerky: snackJerky, bamboo: snackBamboo, watermelon: snackWatermelon, apple: snackApple };
// 画多大：细长的小鱼干、肉干放大一点，不然抱在胸前被爪子一挡就看不清是什么了
const SNACK_SCALE = { fish: 1.35, jerky: 1.35, bamboo: 1.15, watermelon: 1.05, apple: 1 };

/** 零食的颜色（嚼的时候掉的渣用） */
export const SNACK_CRUMB = { fish: '#d9a660', jerky: '#a8563a', bamboo: '#8cc46a', watermelon: '#ff7b7b', apple: '#fbf1d6' };

/** 画一样零食：kind 见 SNACKS（每种动物爱吃的写在动物文件的 snack 里） */
export function drawSnack(ctx, kind, bite = 0, time = 0) {
  const draw = SNACKS[kind];
  if (!draw) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const k = SNACK_SCALE[kind] || 1;
  ctx.scale(k, k);
  draw(ctx, clamp(bite, 0, 1), time);
  ctx.restore();
}

// ================================================================ 纸箱（猫钻纸箱）
//
// 原点在箱子底边的中间（踩在地上）。猫坐在箱子里：先画 back（箱子里面、后面的翻盖），再画猫，
// 最后画 front（前面那堵墙）。前墙比猫的下巴低一点，猫的头和搭在箱沿上的爪子露在外面。

export const BOX = Object.freeze({ w: 92, h: 38 }); // 前墙的宽和高（按宠物原始大小算的像素）

/** 箱子后半截：后面那堵墙的里侧、左右两边的里侧、三片往外翻的盖子 */
export function drawBoxBack(ctx) {
  const { w, h } = BOX;
  const x0 = -w / 2;
  const x1 = w / 2;
  const back = -h - 11; // 透视：后墙的上沿比前墙高一点
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 后面的翻盖
  ctx.beginPath();
  ctx.moveTo(x0 + 9, back);
  ctx.lineTo(x0 + 3, back - 15);
  ctx.lineTo(x1 - 3, back - 15);
  ctx.lineTo(x1 - 9, back);
  ctx.closePath();
  fillStroke(ctx, '#d4a061', 1.3);
  // 左右的翻盖（往外撇）
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (w / 2), -h);
    ctx.lineTo(s * (w / 2 - 9), back);
    ctx.lineTo(s * (w / 2 + 4), back - 7);
    ctx.lineTo(s * (w / 2 + 11), -h - 5);
    ctx.closePath();
    fillStroke(ctx, '#c99355', 1.3);
  }
  // 箱子里面：后墙、两边的里侧（暗一点）
  ctx.beginPath();
  ctx.moveTo(x0, -h);
  ctx.lineTo(x0 + 9, back);
  ctx.lineTo(x1 - 9, back);
  ctx.lineTo(x1, -h);
  ctx.lineTo(x1, -h + 6);
  ctx.lineTo(x0, -h + 6);
  ctx.closePath();
  fillStroke(ctx, '#9c6a36', 1.3);
  ctx.beginPath(); // 后墙的里侧（亮一点的一条）
  ctx.moveTo(x0 + 9, back);
  ctx.lineTo(x1 - 9, back);
  ctx.lineTo(x1 - 9, back + 7);
  ctx.lineTo(x0 + 9, back + 7);
  ctx.closePath();
  ctx.fillStyle = '#b07a42';
  ctx.fill();
  ctx.restore();
}

/** 箱子前墙：瓦楞纸的颜色、一条胶带、印着一个小爪印 */
export function drawBoxFront(ctx) {
  const { w, h } = BOX;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h, w, h, 2.5);
  const grad = ctx.createLinearGradient(0, -h, 0, 0);
  grad.addColorStop(0, '#e3b273');
  grad.addColorStop(1, '#cf9a58');
  fillStroke(ctx, grad, 1.4);
  ctx.fillStyle = 'rgba(245, 225, 180, 0.55)'; // 胶带
  ctx.fillRect(-6, -h + 0.8, 12, h - 1.6);
  ctx.strokeStyle = 'rgba(150, 100, 50, 0.35)'; // 前墙上沿的折痕
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 3, -h + 4);
  ctx.lineTo(w / 2 - 3, -h + 4);
  ctx.stroke();
  // 印上去的小爪印
  ctx.fillStyle = 'rgba(122, 74, 44, 0.45)';
  ctx.save();
  ctx.translate(w * 0.27, -h * 0.42);
  ellipse(ctx, 0, 2, 4.2, 3.4);
  ctx.fill();
  for (const [x, y] of [[-4.4, -2.8], [-1.5, -5], [1.5, -5], [4.4, -2.8]]) {
    ellipse(ctx, x, y, 1.5, 1.8);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// ================================================================ 小木盆（卡皮巴拉泡温泉）
//
// 原点在木盆底边的中间。和纸箱一样分前后两半：back 是盆的里侧和水面的后半圈，front 是水面前半圈和盆的前壁。

export const TUB = Object.freeze({ w: 104, h: 32, ry: 9 }); // 宽、前壁高、盆口椭圆的半高

export function drawTubBack(ctx, time = 0) {
  const { w, h, ry } = TUB;
  ctx.save();
  ctx.lineJoin = 'round';
  // 盆的里侧（后半圈的木板）
  ellipse(ctx, 0, -h, w / 2, ry);
  fillStroke(ctx, '#9a6236', 1.4);
  // 水面（整圈先铺一遍，前半圈之后还会再盖一层）
  ellipse(ctx, 0, -h + 3, w / 2 - 4, ry - 2.6);
  ctx.fillStyle = '#8fcdec';
  ctx.fill();
  // 水面上一闪一闪的高光
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const s = Math.sin(time * 1.7) * 2;
  ctx.moveTo(-w * 0.34 + s, -h + 1);
  ctx.quadraticCurveTo(-w * 0.28 + s, -h - 0.5, -w * 0.22 + s, -h + 1);
  ctx.stroke();
  ctx.restore();
}

export function drawTubFront(ctx, time = 0) {
  const { w, h, ry } = TUB;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 水面的前半圈：盖住泡在水里的身子
  ctx.beginPath();
  ctx.ellipse(0, -h + 3, w / 2 - 4, ry - 2.6, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = 'rgba(143, 205, 236, 0.96)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // 水波
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const s = Math.sin(time * 1.3) * 2.5;
  for (const x of [-18, 14]) {
    ctx.moveTo(x - 7 + s, -h + 6.5);
    ctx.quadraticCurveTo(x + s, -h + 4.5, x + 7 + s, -h + 6.5);
  }
  ctx.stroke();
  // 盆的前壁：一圈木板，两道铜箍
  const wall = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h);
    ctx.ellipse(0, -h, w / 2, ry, 0, Math.PI, 0, true);
    ctx.lineTo(w / 2 - 5, -2);
    ctx.ellipse(0, -2, w / 2 - 5, ry - 1.5, 0, 0, Math.PI);
    ctx.closePath();
  };
  wall();
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, '#b77a45');
  grad.addColorStop(0.45, '#d9a066');
  grad.addColorStop(1, '#a96c3a');
  fillStroke(ctx, grad, 1.4);
  ctx.save();
  wall();
  ctx.clip();
  ctx.strokeStyle = 'rgba(110, 65, 30, 0.45)'; // 木板缝
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -4; i <= 4; i++) {
    const x = i * w * 0.105;
    ctx.moveTo(x, -h + ry);
    ctx.lineTo(x * 0.95, 8);
  }
  ctx.stroke();
  ctx.strokeStyle = '#b8893a'; // 铜箍
  ctx.lineWidth = 3;
  for (const y of [-h + 12, -6]) {
    ctx.beginPath();
    ctx.ellipse(0, y, w / 2, ry, 0, 0.12, Math.PI - 0.12);
    ctx.stroke();
  }
  ctx.restore();
  // 盆口的前沿
  ctx.beginPath();
  ctx.ellipse(0, -h, w / 2, ry, 0, 0, Math.PI);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

// ================================================================ 小鸟（落在卡皮巴拉头顶）
//
// 原点在小鸟的脚底（站的地方）。dir：朝哪边（1 右 / -1 左）；fly：0 站着 … 1 扑腾翅膀；time 用来扇翅膀

export function drawBird(ctx, { dir = 1, fly = 0, time = 0, peck = 0 } = {}) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.scale(dir, 1);
  // 小细腿（飞的时候收起来）
  if (fly < 0.6) {
    ctx.strokeStyle = '#d98a3a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (const x of [-1.6, 1.4]) {
      ctx.moveTo(x, -3.5);
      ctx.lineTo(x, 0);
    }
    ctx.stroke();
  }
  ctx.translate(0, -9);
  ctx.rotate(peck * 0.35);
  // 尾巴
  ctx.beginPath();
  ctx.moveTo(-6, -1);
  ctx.lineTo(-12.5, -4.5);
  ctx.lineTo(-11.5, 1.5);
  ctx.closePath();
  fillStroke(ctx, '#5d8fc4', 1);
  // 身子
  ellipse(ctx, 0, 0, 8, 6.4);
  fillStroke(ctx, '#7fb6e3', 1.1);
  ctx.save();
  ellipse(ctx, 0, 0, 8, 6.4);
  ctx.clip();
  ellipse(ctx, 2.5, 3.8, 6.5, 4.5); // 奶黄色的肚子
  ctx.fillStyle = '#fff2cf';
  ctx.fill();
  ctx.restore();
  // 头
  ellipse(ctx, 5.2, -5.4, 4.9, 4.6);
  fillStroke(ctx, '#7fb6e3', 1.1);
  ellipse(ctx, 6.9, -3.6, 1.5, 0.9); // 小腮红
  ctx.fillStyle = 'rgba(255, 150, 150, 0.6)';
  ctx.fill();
  ellipse(ctx, 6.4, -6.2, 1.1, 1.2); // 眼睛
  ctx.fillStyle = '#2b2430';
  ctx.fill();
  ctx.beginPath(); // 嘴
  ctx.moveTo(9.6, -6.4);
  ctx.lineTo(12.6, -5.2);
  ctx.lineTo(9.6, -4.2);
  ctx.closePath();
  fillStroke(ctx, '#f2a93b', 0.9);
  // 翅膀：站着时收在身上，飞的时候上下扇
  ctx.save();
  ctx.translate(-0.5, -1.5);
  const flap = fly > 0.05 ? Math.sin(time * 30) * 1.1 * fly : 0;
  ctx.rotate(-0.25 - flap);
  ellipse(ctx, -3, 0, 6, 3.6, -0.15);
  fillStroke(ctx, '#5d8fc4', 1);
  ctx.restore();
  ctx.restore();
}

// ================================================================ 球、毛线球、铜钱

/** 网球（柴犬叼球）：原点在球心，r 半径 */
export function drawBall(ctx, r = 7) {
  ctx.save();
  ctx.lineCap = 'round';
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, '#f2ff8a');
  grad.addColorStop(0.6, '#d6ec3f');
  grad.addColorStop(1, '#a9c22a');
  ellipse(ctx, 0, 0, r, r);
  fillStroke(ctx, grad, 1.2, '#6b7a1c');
  ctx.save();
  ellipse(ctx, 0, 0, r, r);
  ctx.clip();
  ctx.strokeStyle = '#ffffff'; // 网球上那两道白色的弧
  ctx.lineWidth = r * 0.17;
  ctx.beginPath();
  ctx.arc(-r * 1.25, 0, r * 0.95, -0.9, 0.9);
  ctx.moveTo(r * 1.25 + Math.cos(Math.PI - 0.9) * r * 0.95, Math.sin(Math.PI - 0.9) * r * 0.95);
  ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.9, Math.PI + 0.9);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/** 骨头（柴犬叼来叼去的）：横着的一根，两头各两个圆疙瘩。原点在中间，len 是全长 */
export function drawBone(ctx, len = 28) {
  const h = len / 2 - 4.5; // 中间那一截从中心到两头圆疙瘩的距离
  // 一根圆角长条 + 两头各两个圆，拼成一根骨头
  const shapes = () => {
    ctx.beginPath();
    ctx.roundRect(-h, -2.8, h * 2, 5.6, 2);
    for (const [x, y] of [[-h - 0.5, -3], [-h - 0.5, 3], [h + 0.5, -3], [h + 0.5, 3]]) {
      ctx.moveTo(x + 3.7, y);
      ctx.arc(x, y, 3.7, 0, TAU);
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  // 先描一圈粗边，再把颜色整个盖上去：拼接处多余的线都被盖住，只剩整根骨头最外面那一圈轮廓
  shapes();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  shapes();
  const grad = ctx.createLinearGradient(0, -6, 0, 6);
  grad.addColorStop(0, '#fffdf6');
  grad.addColorStop(1, '#eadcc2');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'; // 高光
  ctx.fillRect(-h + 1, -1.7, h * 2 - 2, 1.1);
  ctx.restore();
}

/** 毛线球（猫玩的）：粉红色，一圈圈缠着的线，拖着一小截线头 */
export function drawYarn(ctx, r = 8) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 线头
  ctx.beginPath();
  ctx.moveTo(r * 0.6, r * 0.75);
  ctx.bezierCurveTo(r * 1.2, r * 1.35, r * 1.9, r * 0.6, r * 2.3, r * 1.1);
  ctx.strokeStyle = '#e2627f';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, '#ffb3c3');
  grad.addColorStop(1, '#ef7d98');
  ellipse(ctx, 0, 0, r, r);
  fillStroke(ctx, grad, 1.2, '#b84862');
  ctx.save();
  ellipse(ctx, 0, 0, r, r);
  ctx.clip();
  ctx.strokeStyle = 'rgba(184, 72, 98, 0.55)'; // 缠着的线
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, k] of [[0.5, 0.45], [-0.7, 0.75], [1.6, 0.2], [2.4, -0.4]]) {
    ctx.moveTo(Math.cos(a) * -r * 1.2, Math.sin(a) * -r * 1.2);
    ctx.quadraticCurveTo(k * r, -k * r * 0.4, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/**
 * 待办提醒的小牌子：一张钉着红图钉的便签，上面画着一个小闹钟（不写字，中文、英文都看得懂）。
 * 原点在便签中间
 */
export function drawReminderSign(ctx) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(-19, -14, 38, 28, 4);
  fillStroke(ctx, '#fffaf0', 1.6);
  ctx.fillStyle = 'rgba(255, 214, 140, 0.55)'; // 便签上面那一条
  ctx.fillRect(-17.5, -12.5, 35, 5);
  // 小闹钟：两个铃铛、表盘、两根针、两只小脚
  ctx.save();
  ctx.translate(0, 2.5);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 5.6, -6.6, 3.1, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, '#ff8a7a', 1.1);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 4.5, 6.2);
    ctx.lineTo(s * 6.2, 8.6);
  }
  ctx.stroke();
  ellipse(ctx, 0, 0, 7.4, 7.4);
  fillStroke(ctx, '#ff8a7a', 1.3);
  ellipse(ctx, 0, 0, 5.4, 5.4);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -3.8);
  ctx.moveTo(0, 0);
  ctx.lineTo(2.8, 1.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  // 红图钉
  ellipse(ctx, 0, -12.5, 2.4, 2.4);
  fillStroke(ctx, '#e8423f', 1, '#a8302e');
  ctx.restore();
}

/** 小枕头（深夜催你睡觉时抱在怀里）：淡蓝色，四个角鼓鼓的，上面几颗小星星。原点在枕头中间 */
export function drawPillow(ctx) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const pillow = () => {
    ctx.beginPath();
    ctx.moveTo(-20, -11);
    ctx.quadraticCurveTo(0, -15, 20, -11);
    ctx.quadraticCurveTo(24, 0, 20, 11);
    ctx.quadraticCurveTo(0, 15, -20, 11);
    ctx.quadraticCurveTo(-24, 0, -20, -11);
    ctx.closePath();
  };
  pillow();
  const grad = ctx.createLinearGradient(0, -13, 0, 13);
  grad.addColorStop(0, '#eef6ff');
  grad.addColorStop(1, '#c8dcf5');
  fillStroke(ctx, grad, 1.4);
  ctx.save();
  pillow();
  ctx.clip();
  ctx.fillStyle = '#ffe58a'; // 小星星
  for (const [x, y, r] of [[-9, -3, 2.6], [6, 4, 2.2], [12, -5, 1.7], [-3, 6, 1.6]]) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(122, 74, 44, 0.35)'; // 中间那道缝
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-16, 0.5);
  ctx.quadraticCurveTo(0, 2.5, 16, 0.5);
  ctx.stroke();
  ctx.restore();
}

/** 快没电的电池（笔记本电量低时冒在头顶）：红色的一小截电，旁边一个感叹号。原点在电池中间 */
export function drawLowBattery(ctx, level = 0.15) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(-12, -7, 22, 14, 3);
  fillStroke(ctx, '#ffffff', 1.6);
  ctx.beginPath();
  ctx.roundRect(10.5, -3, 3.2, 6, 1.2);
  fillStroke(ctx, '#ffffff', 1.3);
  ctx.beginPath();
  ctx.roundRect(-9.5, -4.5, Math.max(2.5, 17 * clamp(level, 0, 1)), 9, 1.5);
  ctx.fillStyle = '#ff5a4d';
  ctx.fill();
  ctx.restore();
}

/** 铜钱（招财猫招手时冒出来）：原点在中间，r 半径 */
export function drawCoin(ctx, r = 6) {
  ctx.save();
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, '#fff2a8');
  grad.addColorStop(0.6, '#f5c542');
  grad.addColorStop(1, '#d99b1f');
  ellipse(ctx, 0, 0, r, r);
  fillStroke(ctx, grad, 1.1, '#a8741a');
  ctx.beginPath(); // 中间的方孔
  ctx.rect(-r * 0.28, -r * 0.28, r * 0.56, r * 0.56);
  ctx.fillStyle = 'rgba(168, 116, 26, 0.85)';
  ctx.fill();
  ctx.restore();
}
