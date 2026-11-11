// 把宠物画出来。
//
// 坐标系：原点在两脚中间的地面上，x 向右，y 向下（所以头顶是负数）。
// 调用 drawPet 之前，外面已经把画布移到宠物站的位置、并按大小缩放好了。
//
// 画的顺序（从后到前）：影子 → 尾巴 → 脚 → 身体 → 手 → 头（耳朵 → 头 → 花纹 → 五官）。
// 以后的衣服就插在这些层之间：下装/上衣在"身体"之后，帽子在"头"之后。

import { TAU, clamp } from '../util/math.js';

export const RIG = Object.freeze({
  // 宠物所在的小画布的大小，以及"脚底中心"在这块画布里的位置
  // （上方留得多，是因为跳起来、戴帽子、冒爱心都需要地方）
  canvasW: 300,
  canvasH: 360,
  anchorX: 150,
  anchorY: 322,
  height: 118, // 站立时的大致身高（不含耳朵）
});

const LW = 2.6; // 轮廓线粗细

function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

/** 头的形状：像一块年糕，脸颊比头顶宽一点、下巴平一点 */
function headPath(ctx, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo(rx * 0.62, -ry, rx, -ry * 0.56, rx, ry * 0.08);
  ctx.bezierCurveTo(rx, ry * 0.72, rx * 0.6, ry, 0, ry);
  ctx.bezierCurveTo(-rx * 0.6, ry, -rx, ry * 0.72, -rx, ry * 0.08);
  ctx.bezierCurveTo(-rx, -ry * 0.56, -rx * 0.62, -ry, 0, -ry);
  ctx.closePath();
}

/** 身体的形状：上窄下宽的梨形 */
function torsoPath(ctx, cx, cy, rxTop, rxBot, ry) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + rxTop * 1.15, cy - ry, cx + rxBot, cy - ry * 0.25, cx + rxBot, cy + ry * 0.3);
  ctx.bezierCurveTo(cx + rxBot, cy + ry * 0.85, cx + rxBot * 0.6, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rxBot * 0.6, cy + ry, cx - rxBot, cy + ry * 0.85, cx - rxBot, cy + ry * 0.3);
  ctx.bezierCurveTo(cx - rxBot, cy - ry * 0.25, cx - rxTop * 1.15, cy - ry, cx, cy - ry);
  ctx.closePath();
}

/** 胶囊形（手臂）：从 (0,0) 向下到 (0,len) */
function capsulePath(ctx, len, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.lineTo(r, len);
  ctx.arc(0, len, r, 0, Math.PI);
  ctx.closePath();
}

/**
 * 根据姿势算出身体各部分的位置。画图和"鼠标有没有点到宠物"的判断都用它，
 * 这样两边永远一致。
 */
export function getGeometry(sp, P) {
  const facing = clamp(P.facing, -1, 1);
  const sit = clamp(P.crouch, 0, 1);
  const loaf = clamp(P.loaf, 0, 1);
  const low = Math.max(sit, loaf);
  const drop = low * 7;
  const torsoRy = 24 * (1 - loaf * 0.28);
  const torsoRxBot = 25.5 * (1 + sit * 0.1 + loaf * 0.24);
  const torsoRxTop = 20 * (1 + loaf * 0.22);
  const torsoBottom = -7 + drop;
  const torsoCy = torsoBottom - torsoRy;
  return {
    facing,
    sit,
    loaf,
    low,
    drop,
    torsoCx: facing * 1.5,
    torsoCy,
    torsoRy,
    torsoRxBot,
    torsoRxTop,
    torsoBottom,
    headCx: P.headX + facing * 2.5,
    headCy: -76 + Math.max(sit * 7, loaf * 22) + P.headY,
    head: sp.head,
    tailBaseY: -15 + drop * 0.8,
  };
}

function drawFeet(ctx, sp, P, g) {
  const pal = sp.palette;
  const { sit, loaf, low, facing } = g;
  const fx = 12.5 + sit * 7.5 - loaf * 3;
  const fy = -5.5 - sit * 1.2 + loaf * 2.2;
  const rx = 10.5 - sit * 1 - loaf * 3.6;
  const ry = 7 + sit * 1.6 - loaf * 2.4;
  for (const s of [-1, 1]) {
    const ox = s < 0 ? P.footLX : P.footRX;
    const oy = s < 0 ? P.footLY : P.footRY;
    const cx = s * fx + ox + facing * 3 * (1 - low);
    const cy = fy - oy;
    const rot = s * sit * 0.25;
    ellipse(ctx, cx, cy, rx, ry, rot);
    ctx.fillStyle = pal.foot;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = LW;
    ctx.stroke();
    // 坐下时能看到脚底的肉垫
    if (sit > 0.6 && loaf < 0.3) {
      ctx.save();
      ctx.globalAlpha = clamp((sit - 0.6) / 0.4, 0, 1);
      ctx.fillStyle = pal.pad;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ellipse(ctx, 0, 1.9, 3.5, 2.7);
      ctx.fill();
      for (const [bx, by] of [
        [-3.7, -2.4],
        [0, -3.9],
        [3.7, -2.4],
      ]) {
        ellipse(ctx, bx, by, 1.45, 1.45);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawArm(ctx, sp, P, g, s) {
  const pal = sp.palette;
  const a = s < 0 ? P.armL : P.armR;
  if (g.loaf > 0.9) return; // 趴着时手收在身体下面
  const len = 20 * (1 - g.loaf * 0.75);
  const r = 6.3;
  const px = s * (20.5 + g.loaf * 3 + g.sit * 1.5) + g.facing * 2.5;
  const py = g.torsoCy - g.torsoRy * 0.42;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-s * (0.24 + a));
  capsulePath(ctx, len, r);
  ctx.fillStyle = pal.limb;
  ctx.fill();
  if (pal.pawTip) {
    ctx.save();
    capsulePath(ctx, len, r);
    ctx.clip();
    ctx.fillStyle = pal.pawTip;
    ctx.fillRect(-r - 1, len - 3.5, r * 2 + 2, r + 6);
    ctx.restore();
  }
  capsulePath(ctx, len, r);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.restore();
}

function drawEye(ctx, sp, side, open, shape, narrow, lx, ly, time) {
  const pal = sp.palette;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = pal.eyeLine;
  ctx.fillStyle = pal.eye;

  if (shape === 'happy') {
    // ^ ^
    ctx.beginPath();
    ctx.moveTo(-5.8 * narrow, 2.4);
    ctx.quadraticCurveTo(0, -6, 5.8 * narrow, 2.4);
    ctx.stroke();
    return;
  }
  if (shape === 'sleep') {
    // ︶ ︶
    ctx.beginPath();
    ctx.moveTo(-5.8 * narrow, -0.8);
    ctx.quadraticCurveTo(0, 4.8, 5.8 * narrow, -0.8);
    ctx.stroke();
    return;
  }
  if (shape === 'squeeze') {
    // > <
    ctx.beginPath();
    ctx.moveTo(side * 4.2, -4.2);
    ctx.lineTo(-side * 3.2, 0);
    ctx.lineTo(side * 4.2, 4.2);
    ctx.stroke();
    return;
  }
  if (shape === 'dizzy') {
    // 转圈圈
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    const spin = time * 7 * side;
    for (let i = 0; i <= 26; i++) {
      const k = i / 26;
      const a = k * TAU * 2.1 + spin;
      const r = 0.6 + k * 5.6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }

  const wide = shape === 'wide';
  const o = clamp(open, 0, 1.1);
  if (o < 0.16) {
    // 眨眼：闭成一条线
    ctx.beginPath();
    ctx.moveTo(-5.4 * narrow, 0.4);
    ctx.quadraticCurveTo(0, 2.8, 5.4 * narrow, 0.4);
    ctx.stroke();
    return;
  }
  const rx = (wide ? 6 : 5.4) * narrow;
  const ryFull = wide ? 7.6 : 6.8;
  const ry = ryFull * o;

  if (shape === 'annoyed') {
    // 不高兴：上眼皮压成一条平线
    ctx.save();
    ctx.beginPath();
    ctx.rect(-9, -1.2, 18, 20);
    ctx.clip();
    ellipse(ctx, 0, 0, rx, ry);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = pal.eyeLine;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(side * 7, -3);
    ctx.lineTo(-side * 6.5, -0.6);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, -1.2, 1.6, 1.4, 1.4);
    ctx.fill();
    return;
  }

  ellipse(ctx, 0, 0, rx, ry);
  ctx.fill();
  if (pal.eyeRim) {
    ctx.strokeStyle = pal.eyeRim;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // 高光：一大一小两个白点，眼睛立刻就有神了
  ctx.fillStyle = '#ffffff';
  const hr = wide ? 2.5 : 2.1;
  const hx = -1.7 + lx * 1.0;
  const hy = -2.6 * o + ly * 0.8;
  ellipse(ctx, hx, hy, hr, hr * Math.min(1, o + 0.1));
  ctx.fill();
  ellipse(ctx, hx + 3.4, hy + 4.5 * o, 1, Math.min(1, o));
  ctx.fill();
}

function drawMouth(ctx, sp, P) {
  const pal = sp.palette;
  const m = P.mouth;
  const y0 = 2.5; // 鼻子下沿
  ctx.strokeStyle = pal.mouthLine;
  ctx.lineWidth = 1.9;

  const omega = () => {
    ctx.beginPath();
    ctx.moveTo(0, y0 - 0.4);
    ctx.lineTo(0, y0 + 2);
    ctx.moveTo(-6.2, y0 + 2.2);
    ctx.quadraticCurveTo(-3.2, y0 + 6.6, 0, y0 + 2.2);
    ctx.quadraticCurveTo(3.2, y0 + 6.6, 6.2, y0 + 2.2);
    ctx.stroke();
  };

  if (m === 'smile') {
    // 张嘴笑
    const k = 0.45 + 0.55 * clamp(P.mouthOpen, 0, 1);
    const top = y0 + 3.4;
    const bottom = top + 8.5 * k;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-5, top);
      ctx.quadraticCurveTo(0, top + 1.6, 5, top);
      ctx.quadraticCurveTo(4.6, bottom - 0.6, 0, bottom);
      ctx.quadraticCurveTo(-4.6, bottom - 0.6, -5, top);
      ctx.closePath();
    };
    shape();
    ctx.fillStyle = pal.mouthInside;
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    ctx.fillStyle = pal.tongue;
    ellipse(ctx, 0, bottom + 0.6, 3.6, 3.2);
    ctx.fill();
    ctx.restore();
    shape();
    ctx.stroke();
    omega();
    return;
  }
  if (m === 'o') {
    ellipse(ctx, 0, y0 + 5.2, 2.5, 3.1);
    ctx.fillStyle = pal.mouthInside;
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (m === 'yawn') {
    const k = clamp(P.mouthOpen, 0, 1);
    const cy = y0 + 3.2 + 5.2 * k;
    const rx = 3.8 + 2 * k;
    const ry = 1.4 + 6.6 * k;
    ellipse(ctx, 0, cy, rx, ry);
    ctx.fillStyle = pal.mouthInside;
    ctx.fill();
    ctx.save();
    ellipse(ctx, 0, cy, rx, ry);
    ctx.clip();
    ctx.fillStyle = pal.tongue;
    ellipse(ctx, 0, cy + ry * 0.85, rx * 0.8, ry * 0.6);
    ctx.fill();
    if (sp.id === 'cat' && k > 0.4) {
      // 小尖牙
      ctx.fillStyle = '#ffffff';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 1.1, cy - ry - 0.5);
        ctx.lineTo(s * 3.6, cy - ry - 0.5);
        ctx.lineTo(s * 2.5, cy - ry + 3.6);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ellipse(ctx, 0, cy, rx, ry);
    ctx.stroke();
    return;
  }
  if (m === 'flat') {
    ctx.beginPath();
    ctx.moveTo(-3.6, y0 + 4.2);
    ctx.lineTo(3.6, y0 + 4.2);
    ctx.stroke();
    return;
  }
  if (m === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(-6, y0 + 4.2);
    ctx.quadraticCurveTo(-4.5, y0 + 2, -3, y0 + 4.2);
    ctx.quadraticCurveTo(-1.5, y0 + 6.4, 0, y0 + 4.2);
    ctx.quadraticCurveTo(1.5, y0 + 2, 3, y0 + 4.2);
    ctx.quadraticCurveTo(4.5, y0 + 6.4, 6, y0 + 4.2);
    ctx.stroke();
    return;
  }
  if (m === 'pout') {
    ctx.beginPath();
    ctx.moveTo(-3.8, y0 + 5.6);
    ctx.quadraticCurveTo(0, y0 + 2.2, 3.8, y0 + 5.6);
    ctx.stroke();
    return;
  }
  omega(); // 默认：ω 形的小猫嘴
}

function drawFace(ctx, sp, P, lx, ly, time) {
  const pal = sp.palette;
  // 五官跟着视线在脸上滑动一点点，看起来就像头在转（简单的"伪 3D"）
  const eox = lx * 6;
  const eoy = ly * 3.5;

  if (P.blush > 0.02) {
    ctx.save();
    ctx.globalAlpha = clamp(P.blush, 0, 1) * 0.75;
    ctx.fillStyle = pal.blush;
    for (const s of [-1, 1]) {
      ellipse(ctx, s * 27.5 + lx * 5, 15 + ly * 3, 6.4 * (1 - 0.25 * Math.max(0, lx * s)), 3.7);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const s of [-1, 1]) {
    const open = s < 0 ? P.eyeL : P.eyeR;
    const narrow = 1 - 0.22 * Math.max(0, lx * s); // 转向那一侧的眼睛变窄一点
    ctx.save();
    ctx.translate(s * 15.5 + eox, 4.5 + eoy);
    if (sp.drawEyeBack) sp.drawEyeBack(ctx, s, narrow);
    drawEye(ctx, sp, s, open, P.eyes, narrow, lx, ly, time);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(lx * 8.5, 12 + ly * 4.5);
  sp.drawNose(ctx);
  drawMouth(ctx, sp, P);
  ctx.restore();

  if (sp.drawFaceExtras) sp.drawFaceExtras(ctx, lx, ly);
}

function drawHead(ctx, sp, P, g, time) {
  const pal = sp.palette;
  const { rx, ry } = sp.head;
  const lx = clamp(P.lookX + g.facing * 0.55, -1, 1);
  const ly = clamp(P.lookY, -1, 1);

  ctx.save();
  ctx.translate(g.headCx, g.headCy);
  ctx.rotate(P.headTilt);

  sp.drawEar(ctx, -1, P, lx, ly);
  sp.drawEar(ctx, 1, P, lx, ly);

  headPath(ctx, rx, ry);
  ctx.fillStyle = pal.fur;
  ctx.fill();

  ctx.save();
  headPath(ctx, rx, ry);
  ctx.clip();
  sp.drawHeadMarkings(ctx, P, lx, ly, sp.head);
  ctx.restore();

  headPath(ctx, rx, ry);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = LW;
  ctx.stroke();

  drawFace(ctx, sp, P, lx, ly, time);
  // （以后帽子画在这里）
  ctx.restore();
}

/** 一封信（信封）。原点在信封中心。信纸窗口、明信片里也会用到。 */
export function drawEnvelope(ctx, w = 30, h = 21) {
  const x = -w / 2;
  const y = -h / 2;
  const r = 3;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
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
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = '#5b3a24';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // 封口的 V 字
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 2);
  ctx.lineTo(0, y + h * 0.56);
  ctx.lineTo(x + w - 2, y + 2);
  ctx.lineWidth = 1.7;
  ctx.stroke();
  // 封口上的小红心
  const s = Math.min(w, h) * 0.17;
  ctx.translate(0, y + h * 0.6);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.3, s * 0.05, -s * 0.75, -s * 0.95, 0, -s * 0.3);
  ctx.bezierCurveTo(s * 0.75, -s * 0.95, s * 1.3, s * 0.05, 0, s * 0.9);
  ctx.closePath();
  ctx.fillStyle = '#ff6f8d';
  ctx.fill();
  ctx.restore();
}

/**
 * 画它手里拿着的信。
 * lift：0 = 抱在胸前，1 = 举过头顶（提醒你"有信"的时候）。趴下睡觉时，信放在身边的地上。
 */
function drawCarried(ctx, sp, P, g, lift) {
  let x;
  let y;
  let rot;
  if (g.loaf > 0.5) {
    x = g.torsoRxBot + 13;
    y = -9;
    rot = 0.3;
  } else {
    const chestY = g.torsoCy + 1;
    const topY = g.headCy - sp.head.ry - sp.earReach - 15;
    x = g.torsoCx + (g.headCx - g.torsoCx) * lift;
    y = chestY + (topY - chestY) * lift;
    rot = -0.1 + lift * 0.1;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  drawEnvelope(ctx);
  ctx.restore();
}

/**
 * 画出整只宠物。
 * @param ctx   画布
 * @param sp    动物（见 species/）
 * @param P     姿势（见 pose.js）
 * @param opts  { time: 当前时间（秒，转圈眼睛用）, shadow: 是否画影子,
 *               carry: 手里有没有信, carryLift: 信举多高（0 胸前 … 1 头顶） }
 */
export function drawPet(ctx, sp, P, opts = {}) {
  const pal = sp.palette;
  const g = getGeometry(sp, P);
  const time = opts.time || 0;
  const carryLift = opts.carry ? clamp(opts.carryLift || 0, 0, 1) : -1; // -1 = 手里没东西

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (opts.shadow !== false) {
    const k = clamp(1 - P.lift / 150, 0.3, 1);
    ctx.fillStyle = `rgba(40, 26, 12, ${(0.2 * k).toFixed(3)})`;
    ellipse(ctx, 0, 1.2, (31 + g.loaf * 9 + g.sit * 4) * k, 4.4 * k);
    ctx.fill();
  }

  ctx.translate(0, -P.lift);
  ctx.rotate(P.lean);
  ctx.scale(1 + P.squash * 0.55, 1 - P.squash);

  sp.drawTail(ctx, P, g);

  const feetInFront = g.low > 0.5;
  if (!feetInFront) drawFeet(ctx, sp, P, g);

  const torso = () => torsoPath(ctx, g.torsoCx, g.torsoCy, g.torsoRxTop, g.torsoRxBot, g.torsoRy);
  torso();
  ctx.fillStyle = pal.fur;
  ctx.fill();
  ctx.save();
  torso();
  ctx.clip();
  sp.drawTorsoMarkings(ctx, P, g);
  ctx.restore();
  torso();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = LW;
  ctx.stroke();
  // （以后下装、上衣画在这里）

  if (feetInFront) drawFeet(ctx, sp, P, g);

  // 手抬得高的时候画在头前面（挥手时才看得见），否则在头后面
  const frontL = Math.abs(P.armL) > 1.25;
  const frontR = Math.abs(P.armR) > 1.25;
  if (!frontL) drawArm(ctx, sp, P, g, -1);
  if (!frontR) drawArm(ctx, sp, P, g, 1);

  if (carryLift >= 0 && carryLift < 0.5) drawCarried(ctx, sp, P, g, carryLift); // 抱在胸前：在头的后面

  drawHead(ctx, sp, P, g, time);

  if (frontL) drawArm(ctx, sp, P, g, -1);
  if (frontR) drawArm(ctx, sp, P, g, 1);

  if (carryLift >= 0.5) drawCarried(ctx, sp, P, g, carryLift); // 举起来：在最前面

  ctx.restore();
}

/** 只画头（托盘图标用）。原点在头的中心。 */
export function drawHeadOnly(ctx, sp, P) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const g = getGeometry(sp, P);
  g.headCx = 0;
  g.headCy = 0;
  drawHead(ctx, sp, P, g, 0);
  ctx.restore();
}

/**
 * 判断一个点（宠物自己的坐标系里）有没有落在宠物身上。
 * 故意比实际轮廓大一圈，这样更容易点中、拖动。
 */
export function hitTest(sp, P, x, y) {
  const g = getGeometry(sp, P);
  y += P.lift;
  const pad = 5;
  const inEllipse = (cx, cy, rx, ry) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  // 头（连耳朵一起算）
  if (inEllipse(g.headCx, g.headCy - sp.earReach * 0.35, sp.head.rx + pad, sp.head.ry + pad + sp.earReach * 0.65)) return 'head';
  // 身体
  if (inEllipse(g.torsoCx, g.torsoCy, g.torsoRxBot + pad + 4, g.torsoRy + pad)) return 'body';
  // 脚
  if (y > g.torsoCy && y < 4 && Math.abs(x) < 26 + g.sit * 8) return 'body';
  return null;
}
