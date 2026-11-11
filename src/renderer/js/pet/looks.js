// 节日装扮。一套"装扮"由几个部位组成，每个部位可以没有：
//   head   头顶（帽子、兔耳朵、柳条环……）     画在头的坐标里：原点是头的中心，头顶在 y = -head.ry
//   neck   脖子（围巾、香囊）                   画在身体的坐标里，挂在下巴下面
//   held   抱在胸前的东西（灯笼、月饼、蛋糕……）  原点就是胸口
//   cover  整个罩住（万圣节的白布）              最后画，盖住全身；lift 0…1 是白布撩起来多少
//   fx     身边飘的特效：snow 雪花 | confetti 彩带 | sparks 火花
//
// 所有动物共用这些装扮（它们的头和身体大小差不多）。以后做"换装"（阶段 3）也是用这几个部位。
// 想加一套装扮：在下面画好各个部位，再到 LOOKS 里组合起来，最后在 shared/festivals/catalog.js 里给节日写上它的名字。

import { TAU, clamp, lerp, easeInOut } from '../util/math.js';

const OUTLINE = '#5b3a24';
const LW = 2.4;

function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillStroke(ctx, fill, lw = LW) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function heartPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.3, s * 0.05, -s * 0.75, -s * 0.95, 0, -s * 0.3);
  ctx.bezierCurveTo(s * 0.75, -s * 0.95, s * 1.3, s * 0.05, 0, s * 0.9);
  ctx.closePath();
}

// ================================================================ 头顶

function partyHat(colors) {
  return (ctx, sp, P, lx) => {
    ctx.save();
    ctx.translate(lx * 4 + 7, -sp.head.ry + 4);
    ctx.rotate(0.2);
    const cone = () => {
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(0, -38);
      ctx.lineTo(13, 0);
      ctx.quadraticCurveTo(0, 5, -13, 0);
      ctx.closePath();
    };
    cone();
    ctx.fillStyle = colors[0];
    ctx.fill();
    ctx.save();
    cone();
    ctx.clip();
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = 4.5;
    for (let y = -34; y < 6; y += 10) {
      ctx.beginPath();
      ctx.moveTo(-16, y + 8);
      ctx.lineTo(16, y - 2);
      ctx.stroke();
    }
    ctx.restore();
    cone();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = LW;
    ctx.stroke();
    ellipse(ctx, 0, -39, 5.5, 5.5);
    fillStroke(ctx, colors[2], 2);
    ctx.restore();
  };
}

function santaHat(ctx, sp, P, lx) {
  ctx.save();
  ctx.translate(lx * 4, -sp.head.ry + 5);
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.quadraticCurveTo(-26, -34, 2, -40);
  ctx.quadraticCurveTo(30, -42, 42, -14);
  ctx.lineTo(35, -10);
  ctx.quadraticCurveTo(24, -27, 6, -24);
  ctx.quadraticCurveTo(18, -10, 30, 0);
  ctx.closePath();
  fillStroke(ctx, '#e2403c');
  roundRect(ctx, -34, -7, 68, 13, 6.5);
  fillStroke(ctx, '#ffffff');
  ellipse(ctx, 41, -12, 6.5, 6.5);
  fillStroke(ctx, '#ffffff', 2);
  ctx.restore();
}

function pumpkinHat(ctx, sp, P, lx) {
  ctx.save();
  ctx.translate(lx * 3, -sp.head.ry - 5);
  // 茎和叶子
  ctx.fillStyle = '#6b8e3a';
  roundRect(ctx, -2.5, -17, 5, 8, 2);
  ctx.fill();
  ellipse(ctx, 6.5, -14, 5.5, 2.6, -0.4);
  ctx.fillStyle = '#7fb24a';
  ctx.fill();
  // 南瓜：三瓣
  for (const [x, rx] of [
    [-9, 10],
    [9, 10],
    [0, 12],
  ]) {
    ellipse(ctx, x, 0, rx, 11.5);
    fillStroke(ctx, '#ff9a2e', 2.2);
  }
  // 南瓜灯的小脸
  ctx.fillStyle = '#7a3b10';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 6.5, -3.5);
    ctx.lineTo(s * 3, 1);
    ctx.lineTo(s * 9.5, 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-6, 4.5);
  ctx.quadraticCurveTo(0, 9.5, 6, 4.5);
  ctx.quadraticCurveTo(0, 7, -6, 4.5);
  ctx.fill();
  ctx.restore();
}

function bunnyEars(ctx, sp, P, lx, time = 0) {
  ctx.save();
  ctx.translate(lx * 3, 0);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 14, -sp.head.ry + 3);
    ctx.rotate(s * 0.2 + Math.sin(time * 2.1 + s) * 0.04);
    ellipse(ctx, 0, -21, 7.5, 21);
    fillStroke(ctx, '#ffffff');
    ellipse(ctx, 0, -20, 3.6, 14.5);
    ctx.fillStyle = '#ffc1d6';
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, -2, sp.head.rx - 4, sp.head.ry - 2, 0, Math.PI * 1.16, Math.PI * 1.84);
  ctx.strokeStyle = '#ff9ec4';
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.restore();
}

/** 清明插柳：头顶一圈柳条 */
function willowWreath(ctx, sp, P, lx) {
  const rx = sp.head.rx * 0.9;
  const ry = sp.head.ry * 0.9;
  ctx.save();
  ctx.translate(lx * 3, -3);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.strokeStyle = '#6f8f3c';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1.1 + (0.8 * i) / 10);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    ellipse(ctx, x, y, 6.5, 2.4, a + Math.PI / 2 + (i % 2 ? 0.55 : -0.55));
    ctx.fillStyle = i % 2 ? '#8dbf5a' : '#6fa54a';
    ctx.fill();
  }
  ctx.restore();
}

// ================================================================ 脖子（画在下巴下面）

function scarf(main, stripe) {
  return (ctx, g) => {
    const y = g.headCy + 31;
    const w = 50;
    ctx.save();
    ctx.translate(g.headCx * 0.5, 0);
    // 垂下来的一截（在左边，右手边留给灯笼）
    ctx.save();
    ctx.translate(-13, y + 3);
    ctx.rotate(-0.18);
    roundRect(ctx, -5, 0, 11, 22, 3);
    fillStroke(ctx, main);
    ctx.fillStyle = stripe;
    ctx.fillRect(-4, 8, 9, 3.2);
    ctx.strokeStyle = stripe;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const x of [-3, 0.5, 4]) {
      ctx.moveTo(x, 22);
      ctx.lineTo(x, 26);
    }
    ctx.stroke();
    ctx.restore();
    // 绕在脖子上的一圈
    roundRect(ctx, -w / 2, y - 5, w, 11, 5.5);
    fillStroke(ctx, main);
    ctx.fillStyle = stripe;
    ctx.fillRect(-w / 2 + 6, y - 1.5, w - 12, 3);
    ctx.restore();
  };
}

/** 端午的香囊：一根细绳挂在脖子上 */
function sachet(ctx, g) {
  const top = g.headCy + 30;
  const y = g.torsoCy + 4;
  ctx.save();
  ctx.translate(g.headCx * 0.4, 0);
  ctx.strokeStyle = '#d64545';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-9, top);
  ctx.lineTo(0, y - 8);
  ctx.lineTo(9, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, y - 9);
  ctx.quadraticCurveTo(10, y - 6, 8, y + 3);
  ctx.quadraticCurveTo(4, y + 10, 0, y + 11);
  ctx.quadraticCurveTo(-4, y + 10, -8, y + 3);
  ctx.quadraticCurveTo(-10, y - 6, 0, y - 9);
  ctx.closePath();
  fillStroke(ctx, '#f06292', 2);
  ctx.fillStyle = '#ffd54f';
  ellipse(ctx, 0, y + 1, 3, 3);
  ctx.fill();
  ctx.strokeStyle = '#ffb300';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const x of [-2, 0, 2]) {
    ctx.moveTo(x, y + 11);
    ctx.lineTo(x * 1.6, y + 19);
  }
  ctx.stroke();
  ctx.restore();
}

// ================================================================ 抱在胸前的东西（原点在胸口）

/** 春节的红灯笼：用一根小竹竿提着，挂在身体右边 */
function redLantern(ctx, time = 0) {
  ctx.save();
  ctx.translate(22, 8);
  // 竹竿：从胸前的手伸出去
  ctx.strokeStyle = '#a07a3c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, -6);
  ctx.lineTo(4, -24);
  ctx.stroke();
  ctx.translate(2, -8);
  ctx.rotate(Math.sin(time * 1.7) * 0.08);
  ctx.strokeStyle = '#c8962d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(0, -12);
  ctx.stroke();
  ellipse(ctx, 0, 0, 12.5, 10.5);
  fillStroke(ctx, '#e8453c', 2.2);
  ctx.strokeStyle = 'rgba(120, 20, 10, 0.45)';
  ctx.lineWidth = 1.2;
  for (const k of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.abs(k) * 12.5 + 0.5, 10, 0, -Math.PI / 2, Math.PI / 2, k < 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#f2c14e';
  roundRect(ctx, -6, -12.5, 12, 4, 1.5);
  ctx.fill();
  roundRect(ctx, -6, 8.5, 12, 4, 1.5);
  ctx.fill();
  ctx.strokeStyle = '#f2a33a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const x of [-2, 0, 2]) {
    ctx.moveTo(x, 12.5);
    ctx.lineTo(x * 1.4, 21);
  }
  ctx.stroke();
  ctx.restore();
}

function rabbitLantern(ctx, time = 0) {
  ctx.save();
  ctx.rotate(Math.sin(time * 1.5) * 0.05);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, 'rgba(255, 220, 140, 0.45)');
  glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.fillStyle = glow;
  ellipse(ctx, 0, 0, 26, 22);
  ctx.fill();
  for (const s of [-1, 1]) {
    ellipse(ctx, 5 + s * 3.5, -11, 2.8, 8, s * 0.2);
    fillStroke(ctx, '#fff8f0', 1.8);
  }
  ellipse(ctx, 0, 1, 14, 9.5);
  fillStroke(ctx, '#fff8f0', 2.2);
  ellipse(ctx, 6, -5, 6.5, 5.5);
  fillStroke(ctx, '#fff8f0', 2);
  ellipse(ctx, 8, -6, 1.4, 1.6);
  ctx.fillStyle = '#e8453c';
  ctx.fill();
  ctx.fillStyle = '#ff9aa8';
  ellipse(ctx, -4, 3, 3, 2);
  ctx.fill();
  ctx.restore();
}

function mooncake(ctx) {
  ellipse(ctx, 0, 0, 12, 11);
  fillStroke(ctx, '#d8a25a', 2.2);
  ctx.strokeStyle = '#b07a35';
  ctx.lineWidth = 1.3;
  ellipse(ctx, 0, 0, 7.5, 7);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 9.6, Math.sin(a) * 9, 1.6, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(3, 0);
  ctx.moveTo(0, -3);
  ctx.lineTo(0, 3);
  ctx.stroke();
}

function bowl(ctx) {
  // 冬至的饺子
  ctx.fillStyle = '#fffaf2';
  for (const [x, r] of [
    [-6, -0.2],
    [5, 0.25],
    [0, 0],
  ]) {
    ctx.save();
    ctx.translate(x, -4);
    ctx.rotate(r);
    ctx.beginPath();
    ctx.moveTo(-6.5, 1.5);
    ctx.quadraticCurveTo(0, -8, 6.5, 1.5);
    ctx.closePath();
    fillStroke(ctx, '#fffaf2', 1.6);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(-14, -1);
  ctx.lineTo(14, -1);
  ctx.quadraticCurveTo(13, 11, 0, 11);
  ctx.quadraticCurveTo(-13, 11, -14, -1);
  ctx.closePath();
  fillStroke(ctx, '#ffffff', 2.2);
  ctx.strokeStyle = '#4f8fd6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, 2.5);
  ctx.lineTo(12, 2.5);
  ctx.stroke();
}

function cake(ctx, time = 0) {
  roundRect(ctx, -13, -4, 26, 14, 3);
  fillStroke(ctx, '#ffe0b2', 2.2);
  ctx.beginPath();
  ctx.moveTo(-13, -1);
  for (let i = 0; i <= 6; i++) ctx.quadraticCurveTo(-13 + i * 4.33 - 2.2, i % 2 ? 4 : -1, -13 + i * 4.33, 1.5);
  ctx.lineTo(13, -4);
  ctx.lineTo(-13, -4);
  ctx.closePath();
  ctx.fillStyle = '#ff9ec4';
  ctx.fill();
  ctx.fillStyle = '#7fc8ff';
  roundRect(ctx, -1.6, -13, 3.2, 9, 1);
  ctx.fill();
  const f = 1 + Math.sin(time * 9) * 0.12;
  ctx.beginPath();
  ctx.moveTo(0, -20 * f);
  ctx.quadraticCurveTo(3.5, -15, 0, -13);
  ctx.quadraticCurveTo(-3.5, -15, 0, -20 * f);
  ctx.fillStyle = '#ffb300';
  ctx.fill();
}

function heldHeart(ctx, time = 0) {
  ctx.save();
  const s = 10 * (1 + Math.sin(time * 4) * 0.05);
  heartPath(ctx, s);
  fillStroke(ctx, '#ff5d7a', 2.2);
  ctx.restore();
}

function easterEgg(ctx) {
  ellipse(ctx, 0, 0, 9.5, 12);
  ctx.save();
  ellipse(ctx, 0, 0, 9.5, 12);
  ctx.clip();
  ctx.fillStyle = '#b5e3ff';
  ctx.fillRect(-12, -14, 24, 28);
  ctx.fillStyle = '#ffd1e8';
  ctx.fillRect(-12, -3, 24, 6);
  ctx.strokeStyle = '#ffb300';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) ctx.lineTo(-12 + i * 4, i % 2 ? 5.5 : 9);
  ctx.stroke();
  ctx.restore();
  ellipse(ctx, 0, 0, 9.5, 12);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.stroke();
}

/** 仙女棒：一根细铁丝，顶上一团火花（再加上 fx: 'sparks' 往外飞的小火星） */
function sparkler(ctx, time = 0) {
  ctx.strokeStyle = '#5b3a24';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-4, 8);
  ctx.lineTo(14, -30);
  ctx.stroke();
  ctx.strokeStyle = '#b8b8c0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.translate(14, -30);
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
  glow.addColorStop(0, 'rgba(255, 236, 150, 0.95)');
  glow.addColorStop(1, 'rgba(255, 200, 80, 0)');
  ctx.fillStyle = glow;
  ellipse(ctx, 0, 0, 18, 18);
  ctx.fill();
  ctx.rotate(time * 4);
  ctx.strokeStyle = '#ffb300';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r = i % 2 ? 9 : 14;
    ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}

// ================================================================ 罩住全身：万圣节的白布

/**
 * lift：0 = 整个罩住（只露出两个眼洞）… 1 = 白布撩到额头，露出整张脸
 */
function ghostSheet(ctx, sp, P, g, lift, time) {
  const k = easeInOut(clamp(lift, 0, 1));
  const cx = g.headCx;
  const domeCy = g.headCy - 2;
  const domeRx = sp.head.rx + 7;
  const domeRy = sp.head.ry + 11;
  const hemDown = 3;
  const hemUp = g.headCy - 12;
  const hemY = lerp(hemDown, hemUp, k);
  const hemHalf = lerp(g.torsoRxBot + 13, domeRx - 2, k);

  const hem = (fromX, toX) => {
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const x = fromX + ((toX - fromX) * i) / n;
      const mid = fromX + ((toX - fromX) * (i - 0.5)) / n;
      ctx.quadraticCurveTo(mid, hemY + (i % 2 ? 6.5 : -1.5) + Math.sin(time * 3 + i) * 1.4, x, hemY);
    }
  };

  ctx.save();
  ctx.translate(cx, 0);
  ctx.beginPath();
  if (hemY >= domeCy) {
    ctx.moveTo(-domeRx, domeCy);
    ctx.ellipse(0, domeCy, domeRx, domeRy, 0, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(domeRx + 3, (domeCy + hemY) / 2, hemHalf, hemY);
    hem(hemHalf, -hemHalf);
    ctx.quadraticCurveTo(-domeRx - 3, (domeCy + hemY) / 2, -domeRx, domeCy);
  } else {
    // 撩到头顶了：只剩上面一截
    const s = clamp((hemY - domeCy) / domeRy, -0.95, 0);
    const a = Math.asin(s);
    const half = domeRx * Math.cos(a);
    ctx.moveTo(-half, hemY);
    ctx.ellipse(0, domeCy, domeRx, domeRy, 0, Math.PI - a, Math.PI * 2 + a);
    hem(half, -half);
  }
  ctx.closePath();
  ctx.fillStyle = '#fbfbff';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = LW;
  ctx.stroke();

  // 布的褶皱
  ctx.strokeStyle = 'rgba(150, 150, 180, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    const x0 = s * domeRx * 0.55;
    ctx.moveTo(x0, domeCy + 6);
    ctx.quadraticCurveTo(x0 + s * 4, (domeCy + hemY) / 2, x0 + s * 2, Math.max(domeCy + 8, hemY - 6));
  }
  if (hemY > domeCy + 12) ctx.stroke();

  // 眼洞：白布还盖着眼睛的时候才有
  const lx = clamp(P.lookX + g.facing * 0.55, -1, 1);
  if (hemY > g.headCy + 12) {
    ctx.fillStyle = '#2b2b33';
    for (const s of [-1, 1]) {
      ellipse(ctx, s * 13.5 + lx * 6, g.headCy + 3.5, 5, 6.5);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ================================================================ 组合成一套套装扮

const HEAD = {
  partyHat: partyHat(['#7fc8ff', '#ffd54f', '#ff7aa8']),
  partyHatPink: partyHat(['#ff9ec4', '#ffffff', '#ffd54f']),
  santa: santaHat,
  pumpkin: pumpkinHat,
  bunnyEars,
  willow: willowWreath,
};
const NECK = {
  redScarf: scarf('#e2403c', '#ffd54f'),
  autumnScarf: scarf('#e07b39', '#f2c14e'),
  sachet,
};
const HELD = {
  redLantern,
  rabbitLantern,
  mooncake,
  bowl,
  cake,
  heart: heldHeart,
  egg: easterEgg,
  sparkler,
};
const COVER = { sheet: ghostSheet };

/** 节日装扮 → 用到哪些部位（见 shared/festivals/catalog.js 里每个节日的 look） */
export const LOOKS = Object.freeze({
  party: { head: 'partyHat', fx: 'confetti' },
  birthday: { head: 'partyHatPink', held: 'cake', fx: 'confetti' },
  springFestival: { neck: 'redScarf', held: 'redLantern' },
  lantern: { held: 'rabbitLantern' },
  willow: { head: 'willow' },
  sachet: { neck: 'sachet' },
  mooncake: { held: 'mooncake' },
  bowl: { held: 'bowl' },
  heart: { held: 'heart' },
  bunny: { head: 'bunnyEars', held: 'egg' },
  ghost: { cover: 'sheet' },
  pumpkin: { head: 'pumpkin' },
  santa: { head: 'santa', fx: 'snow' },
  sparkler: { held: 'sparkler', fx: 'sparks' },
  autumn: { neck: 'autumnScarf' },
});

export function lookById(id) {
  return (id && LOOKS[id]) || null;
}

export function drawLookHead(ctx, look, sp, P, lx, time) {
  const draw = look && HEAD[look.head];
  if (draw) draw(ctx, sp, P, lx, time);
}

export function drawLookNeck(ctx, look, g) {
  const draw = look && NECK[look.neck];
  if (draw) draw(ctx, g);
}

/** 画抱着的东西。原点已经在胸口 */
export function drawHeldItem(ctx, look, time) {
  const draw = look && HELD[look.held];
  if (draw) draw(ctx, time);
}

export function drawLookCover(ctx, look, sp, P, g, lift, time) {
  const draw = look && COVER[look.cover];
  if (draw) draw(ctx, sp, P, g, lift, time);
}
