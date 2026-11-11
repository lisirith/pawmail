// 猫（橘猫）。每种动物只需要提供：配色、头的大小、以及几个"只有它才有"的部位的画法
// （耳朵、尾巴、花纹、鼻子）。身体骨架、动作、表情都是共用的。

import { lerp } from '../../util/math.js';

const palette = {
  outline: '#5b3a24', // 轮廓线
  fur: '#f5a652', // 主毛色
  furDark: '#dc8430', // 条纹
  light: '#fff3e1', // 肚皮、嘴边
  limb: '#f5a652', // 手
  foot: '#fff3e1', // 脚（白手套）
  pawTip: '#fff3e1', // 手尖
  earInner: '#ffb9a8',
  nose: '#f38a86',
  eye: '#2c1d14',
  eyeLine: '#3d2617', // 闭眼、笑眼的线条
  eyeRim: null,
  blush: '#ff9a9a',
  pad: '#ffaeb0', // 肉垫
  mouthLine: '#5b3a24',
  mouthInside: '#8d3f3b',
  tongue: '#ff9aa4',
};

function drawEar(ctx, side, P, lx) {
  ctx.save();
  ctx.translate(side * 24 - lx * 2.5, -22);
  ctx.rotate(side * (0.4 + P.earDroop * 0.8) + (side < 0 ? P.earL : P.earR));
  // 圆角三角形
  ctx.beginPath();
  ctx.moveTo(-14, 7);
  ctx.quadraticCurveTo(-9.5, -13, -1.8, -26.5);
  ctx.quadraticCurveTo(0.4, -29.5, 2.6, -26.5);
  ctx.quadraticCurveTo(10.5, -13, 14, 7);
  ctx.closePath();
  ctx.fillStyle = palette.fur;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // 耳朵里面
  ctx.beginPath();
  ctx.moveTo(-7.5, 4);
  ctx.quadraticCurveTo(-5.2, -9, 0.2, -19);
  ctx.quadraticCurveTo(5.8, -9, 7.5, 4);
  ctx.closePath();
  ctx.fillStyle = palette.earInner;
  ctx.fill();
  ctx.restore();
}

/** 头上的花纹和浅色嘴周。调用时已经裁剪在头的轮廓之内。 */
function drawHeadMarkings(ctx, P, lx, ly, head) {
  const top = -head.ry;
  const mx = lx * 4;
  ctx.strokeStyle = palette.furDark;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  // 额头三道
  ctx.moveTo(mx, top - 1);
  ctx.lineTo(mx, top + 11.5);
  ctx.moveTo(mx - 9.5, top);
  ctx.lineTo(mx - 8.5, top + 9);
  ctx.moveTo(mx + 9.5, top);
  ctx.lineTo(mx + 8.5, top + 9);
  // 脸颊各两道
  for (const s of [-1, 1]) {
    const cx = s * head.rx + lx * 3;
    ctx.moveTo(cx + s * 2, 2 + ly * 2);
    ctx.lineTo(cx - s * 8.5, 3.5 + ly * 2);
    ctx.moveTo(cx + s * 2, 10 + ly * 2);
    ctx.lineTo(cx - s * 7, 10.5 + ly * 2);
  }
  ctx.stroke();
  // 嘴周浅色
  ctx.fillStyle = palette.light;
  ctx.beginPath();
  ctx.ellipse(lx * 8.5, 17.5 + ly * 4.5, 15.5, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 肚皮。调用时已经裁剪在身体轮廓之内。 */
function drawTorsoMarkings(ctx, P, g) {
  ctx.fillStyle = palette.light;
  ctx.beginPath();
  ctx.ellipse(g.facing * 5, g.torsoCy + g.torsoRy * 0.18, 14.5, g.torsoRy * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-3.1, -1.7);
  ctx.quadraticCurveTo(0, -2.7, 3.1, -1.7);
  ctx.quadraticCurveTo(2.7, 1.2, 0, 2.3);
  ctx.quadraticCurveTo(-2.7, 1.2, -3.1, -1.7);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

function drawWhiskers(ctx, lx, ly) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    const x0 = s * 30 + lx * 5;
    const x1 = s * 46 + lx * 3;
    const y = ly * 3;
    ctx.moveTo(x0, 12 + y);
    ctx.lineTo(x1, 9 + y);
    ctx.moveTo(x0, 15.5 + y);
    ctx.lineTo(x1, 17.5 + y);
  }
  ctx.stroke();
  ctx.restore();
}

function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
function bezierTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

/** 长尾巴：一条粗曲线。tailCurl 决定翘起还是下垂，tail 决定左右摆。 */
function drawTail(ctx, P, g) {
  const s = P.tailSide;
  const c = P.tailCurl;
  const sway = P.tail;
  const by = g.tailBaseY;
  const x0 = s * 13;
  const y0 = by;
  const x1 = s * 40;
  const y1 = by + lerp(10, -2, c);
  const x2 = s * 51 + sway * 8;
  const y2 = by + lerp(30, -24, c);
  const x3 = s * 39 + sway * 17;
  const y3 = by + lerp(43, -47, c);

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  };
  const w = 9.5;
  path();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = w + 5.2;
  ctx.stroke();
  path();
  ctx.strokeStyle = palette.fur;
  ctx.lineWidth = w;
  ctx.stroke();

  // 尾巴上的环纹
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = palette.furDark;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  for (const t of [0.5, 0.68, 0.86]) {
    const px = bezierPoint(x0, x1, x2, x3, t);
    const py = bezierPoint(y0, y1, y2, y3, t);
    const tx = bezierTangent(x0, x1, x2, x3, t);
    const ty = bezierTangent(y0, y1, y2, y3, t);
    const len = Math.hypot(tx, ty) || 1;
    const nx = (-ty / len) * (w / 2);
    const ny = (tx / len) * (w / 2);
    ctx.moveTo(px - nx, py - ny);
    ctx.lineTo(px + nx, py + ny);
  }
  ctx.stroke();
  ctx.restore();
}

export const cat = {
  id: 'cat',
  palette,
  head: { rx: 40, ry: 33 },
  // 托盘图标、命中检测用：耳朵尖大概伸出头顶多少
  earReach: 15,
  // 掉下来时翻正身体的本事：猫总是脚先着地
  righting: 1,
  drawEar,
  drawEyeBack: null,
  drawHeadMarkings,
  drawTorsoMarkings,
  drawNose,
  drawFaceExtras: drawWhiskers,
  drawTail,
};
