// 把宠物画出来。
//
// 坐标系：原点在两脚中间的地面上，x 向右，y 向下（所以头顶是负数）。
// 调用 drawPet 之前，外面已经把画布移到宠物站的位置、并按大小缩放好了。
//
// 画的顺序（从后到前）：影子 → 尾巴 → 脚 → 身体 → 手 → 头（耳朵 → 头 → 花纹 → 五官）。
// 以后的衣服就插在这些层之间：下装/上衣在"身体"之后，帽子在"头"之后。

import { TAU, clamp } from '../util/math.js';
import { drawLookHead, drawLookNeck, drawHeldItem, drawLookCover } from './looks.js';

export const RIG = Object.freeze({
  // 宠物所在的小画布的大小，以及"脚底中心"在这块画布里的位置
  // （上方留得多，是因为跳起来、戴帽子、冒爱心都需要地方）
  canvasW: 300,
  canvasH: 360,
  anchorX: 150,
  anchorY: 322,
  height: 118, // 站立时的大致身高（不含耳朵）
});

const LW = 1.45; // 按设定图的线宽比例描边，放大后仍保留轻柔的手绘轮廓

// 每种动物可以在骨架不变的前提下调"胖瘦"：身体宽一点、手脚粗一点（熊猫比猫圆滚滚）。
// 关节的位置都一样，所以动作、以后的衣服对所有动物照样通用。
//   torso 身体宽窄 · arm 手臂粗细 · armLen 手臂长短 · foot 脚的大小 · sitSpread 坐下时两只后脚往外分开多少
//   frontLegs 坐下时手变成"前腿"，直直地撑在两脚中间（猫是这样坐的）
//   frontLegInset 前腿收进胸前的距离；restArm / foldInset 是熊猫坐下抱爪时的角度和内收量
const DEFAULT_BUILD = Object.freeze({ torso: 1, arm: 1, armLen: 1, foot: 1, sitSpread: 0, frontLegs: false });

// 五官的位置和大小（头的坐标：原点在头的中心）。每种动物在自己的文件里覆盖需要改的几项。
//   eyeX/eyeY 眼睛中心 · eyeRx/eyeRy 睁眼时的大小 · shine 眼睛里要不要画白色高光
//   noseY 鼻子（没有鼻子的话就是嘴的上沿） · mouthDy 嘴离鼻子多远 · mouthW 嘴的半宽
//   blushX/blushY 腮红
const DEFAULT_FACE = Object.freeze({
  eyeX: 15.5,
  eyeY: 4.5,
  eyeRx: 5.4,
  eyeRy: 6.8,
  shine: true,
  noseY: 12,
  mouthDy: 2.5,
  mouthW: 6.2,
  blushX: 27.5,
  blushY: 15,
});

const faceOf = (sp) => sp.face || DEFAULT_FACE;

function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

/** 头的形状：像一块年糕，脸颊比头顶宽一点、下巴平一点 */
export function headPath(ctx, rx, ry) {
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
  const build = { ...DEFAULT_BUILD, ...sp.build };
  const torsoRy = 24 * (1 - loaf * 0.28);
  const torsoRxBot = 25.5 * (1 + sit * 0.1 + loaf * 0.24) * build.torso;
  const torsoRxTop = 20 * (1 + loaf * 0.22) * build.torso;
  const torsoBottom = -7 + drop;
  const torsoCy = torsoBottom - torsoRy;
  return {
    facing,
    sit,
    loaf,
    low,
    drop,
    build,
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
  const { sit, loaf, low, facing, build } = g;
  const k = build.foot;
  const fx = (12.5 + sit * (7.5 + build.sitSpread) - loaf * 3) * (0.55 + 0.45 * build.torso);
  const fy = -5.5 * k - sit * 1.2 + loaf * 2.2;
  const rx = (10.5 - sit * 1 - loaf * 3.6) * k;
  const ry = (7 + sit * (sp.paw?.sitHeight ?? 1.6) - loaf * 2.4) * k;
  const paw = sp.paw || { pads: 3 };
  for (const s of [-1, 1]) {
    const ox = s < 0 ? P.footLX : P.footRX;
    const oy = s < 0 ? P.footLY : P.footRY;
    const cx = s * fx + ox + facing * 3 * (1 - low);
    const cy = fy - oy - sit * (sp.paw?.sitLift || 0);
    const rot = s * sit * 0.25;
    if (sp.drawFoot) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      sp.drawFoot(ctx, P, g, { side: s, rx, ry });
      ctx.restore();
      continue;
    }
    ellipse(ctx, cx, cy, rx, ry, rot);
    ctx.fillStyle = pal.foot;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = LW;
    ctx.stroke();
    if (paw.lines && loaf < 0.5) {
      // 脚趾缝：脚尖上几道短线（猫的画法）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < paw.lines; i++) {
        const x = (i - (paw.lines - 1) / 2) * rx * 0.36;
        ctx.moveTo(x, ry * 0.95);
        ctx.lineTo(x, ry * 0.45);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 坐下时能看到脚底的肉垫（一个大肉垫 + 几个小脚趾）
    if (paw.pads && sit > 0.6 && loaf < 0.3) {
      ctx.save();
      ctx.globalAlpha = clamp((sit - 0.6) / 0.4, 0, 1);
      ctx.fillStyle = pal.pad;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(k, k);
      ellipse(ctx, 0, 1.9, 3.6, 2.8);
      ctx.fill();
      const toes =
        paw.pads === 4
          ? [[-4.4, -1.7], [-1.6, -3.9], [1.6, -3.9], [4.4, -1.7]]
          : [[-3.7, -2.4], [0, -3.9], [3.7, -2.4]];
      for (const [bx, by] of toes) {
        ellipse(ctx, bx, by, 1.4, 1.5);
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
  const b = g.build;
  // 猫坐下时，自然垂着的手就是两条前腿：挪到肚子前面，伸直撑到地上
  const hang = 1 - clamp(Math.abs(a) / 0.9, 0, 1);
  const rest = (b.restArm || 0) * g.sit * (1 - g.loaf) * hang * hang;
  const fold = g.sit * (1 - g.loaf) * clamp(-(a + rest), 0, 1) * clamp((a + 1.8) / 0.55, 0, 1);
  const legs = b.frontLegs ? g.sit * (1 - g.loaf) * hang : 0;
  const len = 20 * (b.armLen || 1) * (1 - g.loaf * 0.75) + legs * 7;
  const r = 6.3 * b.arm;
  const px = s * ((20.5 + g.loaf * 3 + g.sit * 1.5) * b.torso - legs * (b.frontLegInset ?? 9.5) - fold * (b.foldInset || 0)) + g.facing * 2.5;
  const py = g.torsoCy - g.torsoRy * 0.42;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-s * (0.24 * (1 - legs) + a + rest));
  // 共用关节和动作，轮廓由每种动物独立绘制；不再把所有四肢都画成胶囊。
  if (sp.drawArmShape) {
    sp.drawArmShape(ctx, P, g, { side: s, len, r, legs });
    ctx.restore();
    return;
  }
  capsulePath(ctx, len, r);
  ctx.fillStyle = pal.limb;
  ctx.fill();
  if (pal.pawTip) {
    // 手尖（猫的"白手套"）；当前腿撑在地上时，整条前腿都是奶白色
    const tip = 3.5 + legs * (len - 3.5 + r);
    ctx.save();
    capsulePath(ctx, len, r);
    ctx.clip();
    ctx.fillStyle = pal.pawTip;
    ctx.fillRect(-r - 1, len - tip, r * 2 + 2, r + tip + 3);
    ctx.restore();
  }
  // 轮廓线。当前腿时，上面那一截不描边，看起来是从胸口长出来的，而不是两根柱子插在身上
  ctx.save();
  if (legs > 0) {
    const cut = -r - 3 + legs * (len * 0.45 + r + 3);
    ctx.beginPath();
    ctx.rect(-r - 4, cut, r * 2 + 8, len + r * 2 + 8);
    ctx.clip();
  }
  capsulePath(ctx, len, r);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawEye(ctx, sp, side, open, shape, narrow, lx, ly, time) {
  const pal = sp.palette;
  ctx.lineWidth = 1.65;
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
  const F = faceOf(sp);
  const rx = F.eyeRx * (wide ? 1.12 : 1) * narrow;
  const ryFull = F.eyeRy * (wide ? 1.12 : 1);
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
  if (!F.shine) return; // 现在的造型是"豆豆眼"，不画高光
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
  const F = faceOf(sp);
  const y0 = F.mouthDy; // 嘴的上沿离鼻子多远
  const w = F.mouthW;
  ctx.strokeStyle = pal.mouthLine;
  ctx.lineWidth = 1.55;

  // ω 形的小嘴（:3）：两道弧在中间碰出一个小尖
  const omega = () => {
    ctx.beginPath();
    ctx.moveTo(-w, y0 + 2.2);
    ctx.quadraticCurveTo(-w * 0.5, y0 + 6.2, 0, y0 + 2.2);
    ctx.quadraticCurveTo(w * 0.5, y0 + 6.2, w, y0 + 2.2);
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

/**
 * 腮红：淡淡的一团粉，上面三道小斜线（///）。
 * 斜线一直都在（这是它的样子），害羞、开心的时候那团粉会变深。
 */
function drawBlush(ctx, pal, P, x, y, squeeze) {
  const k = clamp(P.blush, 0, 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squeeze, 1);
  if (k > 0.02) {
    ctx.globalAlpha = k * 0.23;
    const blush = ctx.createRadialGradient(0, 0.4, 0, 0, 0.4, 7);
    blush.addColorStop(0, pal.blush);
    blush.addColorStop(1, `${pal.blush}00`);
    ctx.fillStyle = blush;
    ellipse(ctx, 0, 0.4, 6.6, 3.6);
    ctx.fill();
  }
  ctx.globalAlpha = 0.7 + 0.3 * k;
  ctx.strokeStyle = pal.blushLine || pal.blush;
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  for (const i of [-1, 0, 1]) {
    ctx.moveTo(i * 2.4 - 0.3, -1.65 + Math.abs(i) * 0.2);
    ctx.lineTo(i * 2.4 + 0.3, 1.55 - Math.abs(i) * 0.2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFace(ctx, sp, P, lx, ly, time) {
  const pal = sp.palette;
  const F = faceOf(sp);
  // 五官跟着视线在脸上滑动一点点，看起来就像头在转（简单的"伪 3D"）
  const eox = lx * 6;
  const eoy = ly * 3.5;

  for (const s of [-1, 1]) {
    drawBlush(ctx, pal, P, s * F.blushX + lx * 5, F.blushY + ly * 3, 1 - 0.25 * Math.max(0, lx * s));
  }

  for (const s of [-1, 1]) {
    const open = s < 0 ? P.eyeL : P.eyeR;
    const narrow = 1 - 0.22 * Math.max(0, lx * s); // 转向那一侧的眼睛变窄一点
    ctx.save();
    ctx.translate(s * F.eyeX + eox, F.eyeY + eoy);
    if (sp.drawEyeBack) sp.drawEyeBack(ctx, s, narrow);
    drawEye(ctx, sp, s, open, P.eyes, narrow, lx, ly, time);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(lx * 8.5, F.noseY + ly * 4.5);
  if (sp.drawNose) sp.drawNose(ctx);
  drawMouth(ctx, sp, P);
  ctx.restore();

  if (sp.drawFaceExtras) sp.drawFaceExtras(ctx, lx, ly);
}

function drawHead(ctx, sp, P, g, time, look) {
  const pal = sp.palette;
  const { rx, ry } = sp.head;
  const lx = clamp(P.lookX + g.facing * 0.55, -1, 1);
  const ly = clamp(P.lookY, -1, 1);

  ctx.save();
  ctx.translate(g.headCx, g.headCy);
  ctx.rotate(P.headTilt);

  sp.drawEar(ctx, -1, P, lx, ly);
  sp.drawEar(ctx, 1, P, lx, ly);

  // 头的轮廓：默认是年糕形；动物可以换成自己的（比如熊猫两颊毛茸茸的）
  const outline = () => (sp.headPath || headPath)(ctx, rx, ry);
  outline();
  ctx.fillStyle = sp.headFill ? sp.headFill(ctx, rx, ry) : pal.fur;
  ctx.fill();

  ctx.save();
  outline();
  ctx.clip();
  sp.drawHeadMarkings(ctx, P, lx, ly, sp.head);
  ctx.restore();

  (sp.headOutline || sp.headPath || headPath)(ctx, rx, ry);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = LW;
  ctx.stroke();

  drawFace(ctx, sp, P, lx, ly, time);
  drawLookHead(ctx, look, sp, P, lx, time); // 帽子、兔耳朵……（以后的换装也画在这里）
  ctx.restore();
}

/**
 * 一封信（信封）。原点在信封中心。信纸窗口、明信片里也会用到。
 * gold：金色信封（月报、年度回顾），封口是一颗星星
 */
export function drawEnvelope(ctx, w = 30, h = 21, { gold = false } = {}) {
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
  ctx.fillStyle = gold ? '#ffe28a' : '#fffaf0';
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
  const s = Math.min(w, h) * 0.17;
  ctx.translate(0, y + h * 0.6);
  ctx.beginPath();
  if (gold) {
    // 封口上的小星星
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const r = i % 2 === 0 ? s * 1.25 : s * 0.55;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#f08c00';
  } else {
    // 封口上的小红心
    ctx.moveTo(0, s * 0.9);
    ctx.bezierCurveTo(-s * 1.3, s * 0.05, -s * 0.75, -s * 0.95, 0, -s * 0.3);
    ctx.bezierCurveTo(s * 0.75, -s * 0.95, s * 1.3, s * 0.05, 0, s * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#ff6f8d';
  }
  ctx.fill();
  ctx.restore();
}

/**
 * 画它手里拿着的信。
 * lift：0 = 抱在胸前，1 = 举过头顶（提醒你"有信"的时候）。趴下睡觉时，信放在身边的地上。
 */
function drawCarried(ctx, sp, P, g, lift, gold) {
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
  drawEnvelope(ctx, 30, 21, { gold });
  ctx.restore();
}

/**
 * 画出整只宠物。
 * @param ctx   画布
 * @param sp    动物（见 species/）
 * @param P     姿势（见 pose.js）
 * @param opts  { time: 当前时间（秒，转圈眼睛用）, shadow: 是否画影子,
 *               carry: 手里有没有信, carryLift: 信举多高（0 胸前 … 1 头顶）, carryGold: 是不是金色信封,
 *               look: 节日装扮（见 looks.js）, sheetLift: 万圣节白布撩起来多少 }
 */
export function drawPet(ctx, sp, P, opts = {}) {
  const pal = sp.palette;
  const g = getGeometry(sp, P);
  const time = opts.time || 0;
  const look = opts.look || null;
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

  const torso = () => sp.torsoPath
    ? sp.torsoPath(ctx, g)
    : torsoPath(ctx, g.torsoCx, g.torsoCy, g.torsoRxTop, g.torsoRxBot, g.torsoRy);
  torso();
  ctx.fillStyle = sp.torsoFill ? sp.torsoFill(ctx, g) : pal.fur;
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

  // 手臂一律画在头的下面一层：举起来的时候，靠近肩膀那一截会被头挡住，不会盖住脸颊。
  // 往里收到嘴边的手（舔爪子）、熊猫坐下抱在胸前的手，画在脸前面。
  // 熊猫坐着把爪子抱在胸前时，爪子压住下巴边缘，才有原图中抱成一团的姿态。
  const smooth = (v) => { const k = clamp(v, 0, 1); return k * k * (3 - 2 * k); };
  // 坐下、站起和抬爪过程中逐渐露出下巴前的部分，避免切换图层时爪子突然跳出。
  const restingInFront = (a) => g.build.restArm
    ? smooth((g.sit - 0.25) / 0.5) * smooth((0.65 - g.loaf) / 0.35) * smooth((0.4 - a) / 0.35)
    : 0;
  const frontL = P.armL < -1.25 ? 1 : restingInFront(P.armL);
  const frontR = P.armR < -1.25 ? 1 : restingInFront(P.armR);
  if (frontL < 1) drawArm(ctx, sp, P, g, -1);
  if (frontR < 1) drawArm(ctx, sp, P, g, 1);

  if (carryLift >= 0 && carryLift < 0.5) {
    drawCarried(ctx, sp, P, g, carryLift, opts.carryGold); // 抱在胸前：在头的后面
  } else if (carryLift < 0 && look && look.held && g.loaf < 0.5) {
    // 手里没有信的时候，抱着节日的东西（灯笼、月饼……）
    ctx.save();
    ctx.translate(g.torsoCx, g.torsoCy + 1);
    drawHeldItem(ctx, look, time);
    ctx.restore();
  }

  drawHead(ctx, sp, P, g, time, look);
  drawLookNeck(ctx, look, g); // 围巾、香囊挂在下巴下面

  for (const [side, alpha] of [[-1, frontL], [1, frontR]]) {
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= alpha;
    drawArm(ctx, sp, P, g, side);
    ctx.restore();
  }

  if (carryLift >= 0.5) drawCarried(ctx, sp, P, g, carryLift, opts.carryGold); // 举起来：在最前面

  drawLookCover(ctx, look, sp, P, g, opts.sheetLift || 0, time); // 万圣节的白布：盖住全身

  ctx.restore();
}

/** 只画头（托盘图标用）。原点在头的中心。look：戴着节日的帽子 */
export function drawHeadOnly(ctx, sp, P, look = null) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const g = getGeometry(sp, P);
  g.headCx = 0;
  g.headCy = 0;
  drawHead(ctx, sp, P, g, 0, look);
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
  // 独立补足圆臀的点击范围，不通过放大骨架改变手脚位置。
  const bodyWidth = g.torsoRxBot * (g.build.bodyHitWidth || 1) * (1 + g.sit * (1 - g.loaf) * ((g.build.sitBodyWidth || 1) - 1));
  if (inEllipse(g.torsoCx, g.torsoCy, bodyWidth + pad + 4, g.torsoRy + pad)) return 'body';
  // 脚
  if (y > g.torsoCy && y < 4 && Math.abs(x) < 26 + g.sit * 8) return 'body';
  return null;
}
