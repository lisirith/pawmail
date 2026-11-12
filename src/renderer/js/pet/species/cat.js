// 猫（橘猫）。造型照着 img resource 里的设定图画：大头、宽脸、三角大耳朵，
// 脸的下半部分是奶白色（在两眼中间尖尖地往上伸），额头三道条纹，豆豆眼，没有鼻子，嘴是 ":3"。
//
// 每种动物只需要提供：配色、头的大小、五官的位置，以及几个"只有它才有"的部位的画法
// （耳朵、尾巴、花纹、胡须）。身体骨架、动作、表情都是共用的（见 draw.js）。
//
// 毛色和花纹集中放在 COAT 里：以后加"三花招财猫"之类的花色，只要再写一份 COAT。

import { lerp } from '../../util/math.js';

const COAT = {
  palette: {
    outline: '#74432b', // 轮廓线：暖棕色
    fur: '#fbbc7b', // 主毛色：奶橘
    furDark: '#e19552', // 条纹
    light: '#fbeadd', // 脸的下半部分、胸口、白手套
    limb: '#fbbc7b', // 手
    foot: '#fbeadd', // 脚（白袜子）
    pawTip: '#fbeadd', // 手尖
    earInner: '#f9c4b8',
    eye: '#5e3a2c',
    eyeLine: '#5e3a2c', // 闭眼、笑眼的线条
    eyeRim: null,
    blush: '#f5a898',
    blushLine: '#ec9282',
    pad: '#f2a7a0', // 肉垫
    mouthLine: '#6a3d29',
    mouthInside: '#e0857a',
    tongue: '#f6b0a6',
  },
};
const palette = COAT.palette;

/** 圆角多边形：每个角按 r 磨圆 */
function roundedPoly(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.arcTo(p[0], p[1], q[0], q[1], Array.isArray(r) ? r[i] : r);
  }
  ctx.closePath();
}

/**
 * 三角形大耳朵，长在头的左上角、右上角，外侧的边顺着脸的轮廓往上长。
 * 画在头的下面一层，所以下半截被头挡住，只露出头顶上的那一截。
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(-lx * 2.5, 0);
  // 绕耳根转：耷拉、抖耳朵
  ctx.translate(side * 27, -18);
  ctx.rotate(side * P.earDroop * 0.75 + twitch);
  ctx.translate(-side * 27, 18);
  ctx.scale(side, 1); // 下面按"右耳"画，左耳左右翻过来
  roundedPoly(ctx, [[44, -2], [37, -45], [7, -29]], [2, 5.5, 2]);
  ctx.fillStyle = palette.fur;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  // 耳朵里面的粉色，偏向里侧
  roundedPoly(ctx, [[38.5, -9], [35, -39], [15, -27.5]], [2, 4.5, 2]);
  ctx.fillStyle = palette.earInner;
  ctx.fill();
  ctx.restore();
}

/** 头上的花纹：奶白色的脸、额头三道条纹、脸颊边上的短条纹。调用时已经裁剪在头的轮廓之内。 */
function drawHeadMarkings(ctx, P, lx, ly, head) {
  const { rx, ry } = head;
  const mx = lx * 5; // 视线转过去时，花纹跟着五官滑一点（伪 3D）
  const my = ly * 2;

  // 额头三道条纹：上粗下细
  ctx.fillStyle = palette.furDark;
  for (const [x, len, w] of [
    [-9.5, 9.5, 3.4],
    [0, 12.5, 3.8],
    [9.5, 9.5, 3.4],
  ]) {
    const cx = x + lx * 4;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, -ry - 2);
    ctx.lineTo(cx + w / 2, -ry - 2);
    ctx.quadraticCurveTo(cx + w * 0.42, -ry + len * 0.75, cx, -ry + len);
    ctx.quadraticCurveTo(cx - w * 0.42, -ry + len * 0.75, cx - w / 2, -ry - 2);
    ctx.fill();
  }
  // 脸颊外侧各一道短条纹
  ctx.strokeStyle = palette.furDark;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * (rx + 2) + lx * 2, -3 + my);
    ctx.lineTo(s * (rx - 6) + lx * 2, -2 + my);
  }
  ctx.stroke();

  // 奶白色的下半张脸：在两眼中间尖尖地往上伸，往两边斜着落到脸颊
  ctx.fillStyle = palette.light;
  ctx.beginPath();
  ctx.moveTo(-rx - 6, 15 + my);
  ctx.bezierCurveTo(-rx * 0.6 + mx, 11 + my, -12 + mx, 1 + my, -5 + mx, -5.5 + my);
  ctx.quadraticCurveTo(mx, -10.5 + my, 5 + mx, -5.5 + my);
  ctx.bezierCurveTo(12 + mx, 1 + my, rx * 0.6 + mx, 11 + my, rx + 6, 15 + my);
  ctx.lineTo(rx + 6, ry + 6);
  ctx.lineTo(-rx - 6, ry + 6);
  ctx.closePath();
  ctx.fill();
}

/** 身体：奶白色的胸口，两侧各两道条纹。调用时已经裁剪在身体轮廓之内。 */
function drawTorsoMarkings(ctx, P, g) {
  // 两侧的条纹
  ctx.strokeStyle = palette.furDark;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (const dy of [-5, 5]) {
      const y = g.torsoCy + dy;
      ctx.moveTo(s * (g.torsoRxBot + 3), y - 1);
      ctx.quadraticCurveTo(s * (g.torsoRxBot - 4), y + 1, s * (g.torsoRxBot - 9), y + 2.5);
    }
  }
  ctx.stroke();
  // 胸口到肚子的奶白色
  ctx.fillStyle = palette.light;
  ctx.beginPath();
  ctx.ellipse(g.facing * 5, g.torsoCy + g.torsoRy * 0.1, 12.5, g.torsoRy * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 胡须：两边各两根，长在脸颊里面靠边的地方 */
function drawWhiskers(ctx, lx, ly) {
  ctx.save();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const rx = cat.head.rx;
  for (const s of [-1, 1]) {
    const ox = lx * 3.5;
    const oy = ly * 2.5;
    ctx.moveTo(s * (rx - 15) + ox, 3.2 + oy);
    ctx.quadraticCurveTo(s * (rx - 9) + ox, 1.2 + oy, s * (rx - 3) + ox, 2.4 + oy);
    ctx.moveTo(s * (rx - 14) + ox, 8.6 + oy);
    ctx.quadraticCurveTo(s * (rx - 8.5) + ox, 9 + oy, s * (rx - 3) + ox, 11.2 + oy);
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

/** 长尾巴：一条粗曲线，带四道环纹。tailCurl 决定翘起还是下垂，tail 决定左右摆。 */
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
  const w = 10;
  path();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = w + 4.8;
  ctx.stroke();
  path();
  ctx.strokeStyle = palette.fur;
  ctx.lineWidth = w;
  ctx.stroke();

  // 尾巴上的环纹
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = palette.furDark;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (const t of [0.4, 0.56, 0.72, 0.88]) {
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
  head: { rx: 44, ry: 31 },
  // 托盘图标、命中检测、头顶特效用：耳朵尖大概伸出头顶多少
  earReach: 13,
  // 掉下来时翻正身体的本事：猫总是脚先着地
  righting: 1,
  // 身材：和熊猫同一副骨架；坐下时两只前腿直直地撑在中间
  build: { torso: 1, arm: 0.95, foot: 0.92, sitSpread: 5, frontLegs: true },
  // 五官：豆豆眼（竖着的小椭圆、不画高光），没有鼻子，":3" 嘴就在两眼中间偏下
  face: { eyeX: 14.5, eyeY: 1.8, eyeRx: 3.4, eyeRy: 5.8, shine: false, noseY: 6.2, mouthDy: 0, mouthW: 6.4, blushX: 20.5, blushY: 12 },
  paw: { lines: 3 }, // 脚尖上画三道脚趾缝，不画肉垫
  drawEar,
  drawEyeBack: null,
  drawHeadMarkings,
  drawTorsoMarkings,
  drawNose: null,
  drawFaceExtras: drawWhiskers,
  drawTail,
};
