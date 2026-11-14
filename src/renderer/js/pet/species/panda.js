// 熊猫：以 ba8d7185-40d5-456b-ab17-12ce9a388f21.png 的透明底原型为准。
// 轮廓由独立曲线构成，部件围绕原关节活动，保持动作与换装兼容。
const DARK = '#574945';
const INK = '#574036';
const LINE = 1.45;
const palette = {
  outline: INK, fur: '#fff7ed', furDark: DARK, light: '#fff7ed',
  limb: DARK, foot: DARK, pawTip: null, earInner: null, nose: INK,
  eye: '#fff9f0', eyeLine: '#fff6eb', eyeRim: null,
  blush: '#f2b2a1', blushLine: '#eeaa98', pad: '#e8a28f',
  mouthLine: INK, mouthInside: '#e89b89', tongue: '#f3b5a4',
};

function darkFill(ctx, x0, y0, x1, y1) {
  const fill = ctx.createLinearGradient(x0, y0, x1, y1);
  fill.addColorStop(0, '#655550');
  fill.addColorStop(0.45, DARK);
  fill.addColorStop(1, '#4e403c');
  return fill;
}
function headFill(ctx, rx, ry) {
  const fill = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, ry * 0.05, 0, 0, rx * 1.24);
  fill.addColorStop(0, '#fffaf3');
  fill.addColorStop(0.65, '#fff6ed');
  fill.addColorStop(1, '#f1dfce');
  return fill;
}

/** 宽半圆耳：耳根贴在额头两侧，宽拱顶低于旧版的直立圆耳。 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  // 轮廓由蓝笔标注反算到头部坐标，转动仍绕原耳根。
  ctx.translate(-lx * 2.5 + 0.875, P.earDroop * 4.5);
  ctx.translate(side * 28.5, -19.5);
  ctx.rotate(twitch + side * P.earDroop * 0.18);
  ctx.scale(1, 1 - P.earDroop * 0.12);
  ctx.translate(-side * 28.5, 19.5);
  if (side > 0) {
    // 以左耳为原型镜像，右耳略压低，消除靠头顶一侧过高的平台。
    ctx.translate(0, -9.53);
    ctx.scale(-1, 0.86);
    ctx.translate(0, 9.53);
  }
  ctx.beginPath();
  const rootX = side > 0 ? -35.3 : -37.25;
  const rootY = side > 0 ? -3.8 : -9.53;
  ctx.moveTo(rootX, rootY);
  if (side > 0) {
    // 右耳外下缘顺着原画落入脸侧，避免镜像后在耳根突然向内折回。
    ctx.bezierCurveTo(-40.4, -7.5, -42, -15.8, -38.8, -26);
  } else {
    ctx.bezierCurveTo(-44.8, -12.2, -44.5, -19.5, -40.47, -27.23);
  }
  ctx.bezierCurveTo(-36.8, -35.1, -30.32, -39.22, -24.32, -38.5);
  ctx.bezierCurveTo(-18.32, -37.78, -14.4, -35.4, -11.8, -30.07);
  ctx.bezierCurveTo(-18, -21, -28, -13, rootX, rootY);
  ctx.closePath();
  ctx.fillStyle = darkFill(ctx, -25, -39, -34, -7);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(side > 0 ? -36.8 : -39.3, -24);
  ctx.bezierCurveTo(-34, -36.6, -23, -39, -16, -32.5);
  ctx.strokeStyle = '#7b6760';
  ctx.lineWidth = 0.85;
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.restore();
}

/** 浅圆冠向上收窄、面颊向下展开，构成软三角形；保留圆下巴和少量毛簇。 */
function fluffyHeadPath(ctx, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(-0.11 * rx, -0.9 * ry);
  ctx.bezierCurveTo(-0.01 * rx, -0.92 * ry, 0.13 * rx, -0.94 * ry, 0.25 * rx, -0.88 * ry);
  ctx.bezierCurveTo(0.50 * rx, -0.83 * ry, 0.627 * rx, -0.505 * ry, 0.7924 * rx, -0.18736 * ry);
  // 原图与头部对齐后描出右颊：外侧缓慢转弯，下半颊再接向下巴，避免过早收窄。
  ctx.bezierCurveTo(0.87311 * rx, -0.03315 * ry, 0.97568 * rx, 0.18336 * ry, 0.95796 * rx, 0.38067 * ry);
  ctx.bezierCurveTo(0.93241 * rx, 0.66532 * ry, 0.78196 * rx, 0.87819 * ry, 0.60027 * rx, 0.99924 * ry);
  ctx.bezierCurveTo(0.5 * rx, 1.066 * ry, 0.19 * rx, 1.005 * ry, 0.015 * rx, 0.98 * ry);
  ctx.quadraticCurveTo(-0.08 * rx, 1.025 * ry, -0.18 * rx, 0.975 * ry);
  ctx.bezierCurveTo(-0.41 * rx, 1.01 * ry, -0.7 * rx, 0.94 * ry, -0.86 * rx, 0.78 * ry);
  // 此处从下往上走：先经过毛根凹口，再反向绕过朝下的小毛尖。
  ctx.bezierCurveTo(-0.94 * rx, 0.69 * ry, -0.98 * rx, 0.52 * ry, -0.95 * rx, 0.39 * ry);
  ctx.quadraticCurveTo(-0.99 * rx, 0.41 * ry, -0.98 * rx, 0.47 * ry);
  ctx.bezierCurveTo(-1.02 * rx, 0.37 * ry, -1.005 * rx, 0.3 * ry, -0.98 * rx, 0.25 * ry);
  ctx.bezierCurveTo(-1.005 * rx, 0.1 * ry, -0.91 * rx, -0.15 * ry, -0.74 * rx, -0.39 * ry);
  ctx.bezierCurveTo(-0.59 * rx, -0.69 * ry, -0.42 * rx, -0.87 * ry, -0.24 * rx, -0.89 * ry);
  ctx.lineTo(-0.15 * rx, -0.945 * ry);
  ctx.quadraticCurveTo(-0.13 * rx, -0.9 * ry, -0.11 * rx, -0.9 * ry);
  ctx.closePath();
}

/** 八字黑眼圈：内上角较窄，下半部是柔软的水滴形。 */
function drawEyeBack(ctx, side, narrow) {
  ctx.save();
  ctx.scale(side * narrow, 1);
  ctx.rotate(-0.2);
  ctx.beginPath();
  ctx.moveTo(-5.7, -9.6);
  ctx.bezierCurveTo(-3.1, -15.1, 3.7, -13.7, 8.8, -9.1);
  ctx.bezierCurveTo(13.8, -4.7, 17.1, 2.8, 13.6, 7.4);
  ctx.bezierCurveTo(10.8, 11.4, 2.5, 11.6, -2.2, 8.9);
  ctx.bezierCurveTo(-7.1, 6.1, -8.9, -2.9, -5.7, -9.6);
  ctx.closePath();
  ctx.fillStyle = darkFill(ctx, 0, -13, 9, 12);
  ctx.fill();
  ctx.restore();
}

function drawHeadMarkings(ctx, P, lx, ly, head) {
  const tint = ctx.createRadialGradient(lx * 4, head.ry * 0.7, 1, lx * 4, head.ry * 0.7, head.rx * 0.9);
  tint.addColorStop(0, 'rgba(240,203,179,0.12)');
  tint.addColorStop(1, 'rgba(240,203,179,0)');
  ctx.fillStyle = tint;
  ctx.fillRect(-head.rx - 2, -head.ry - 2, head.rx * 2 + 4, head.ry * 2 + 4);
}

function torsoPath(ctx, g) {
  const x = g.torsoCx, y = g.torsoCy, w = g.torsoRxBot, h = g.torsoRy;
  // 保留之前腰下加宽的 10%，这次再让臀围渐增 5%；肩部和关节不跟着挪动。
  const bellyX = (nx, ny) => {
    const t = Math.max(0, Math.min(1, (ny + 0.1) / 0.35));
    const hip = Math.max(0, Math.min(1, (ny - 0.1) / 0.5));
    return x + w * nx * (1 + 0.1 * t * t * (3 - 2 * t)) * (1 + 0.05 * hip * hip * (3 - 2 * hip));
  };
  // 侧腰的弧线控制量增加 12.5%，把腰臀原来的回折连成一条饱满的曲线。
  const round = 1.125;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.48, y - h * 0.99);
  ctx.bezierCurveTo(x - w * 0.9 * round, y - h * 0.67, bellyX(-1.05 * round, 0.12), y + h * 0.12, bellyX(-0.96, 0.61), y + h * 0.61);
  ctx.bezierCurveTo(bellyX(-0.91, 0.91), y + h * 0.91, bellyX(-0.61, 1.05), y + h * 1.05, bellyX(-0.27, 1.01), y + h * 1.01);
  ctx.quadraticCurveTo(bellyX(-0.12, 1.035), y + h * 1.035, x, y + h * 1.015);
  ctx.bezierCurveTo(bellyX(0.49, 1.08), y + h * 1.08, bellyX(0.91, 0.97), y + h * 0.97, bellyX(0.98, 0.65), y + h * 0.65);
  ctx.bezierCurveTo(bellyX(1.09 * round, 0.08), y + h * 0.08, x + w * 0.86 * round, y - h * 0.75, x + w * 0.47, y - h);
  ctx.bezierCurveTo(x + w * 0.14, y - h * 1.12, x - w * 0.16, y - h * 1.11, x - w * 0.48, y - h * 0.99);
  ctx.closePath();
}

/** 黑肩带包住胸口，保留奶白肚皮。 */
function drawTorsoMarkings(ctx, P, g) {
  const fill = ctx.createRadialGradient(-8, g.torsoCy - 3, 2, 3, g.torsoCy, g.torsoRxBot * 1.45);
  fill.addColorStop(0, '#fff9f0');
  fill.addColorStop(0.7, '#fbf0e4');
  fill.addColorStop(1, '#e9d4c3');
  ctx.fillStyle = fill;
  ctx.fillRect(-65, -110, 130, 125);
  const y = g.torsoCy - g.torsoRy * 0.48;
  ctx.fillStyle = darkFill(ctx, -20, y - 12, 20, y + 10);
  ctx.beginPath();
  ctx.moveTo(-65, -150);
  ctx.lineTo(65, -150);
  ctx.lineTo(65, y - 2);
  ctx.bezierCurveTo(35, y - 3, 27, y + 4, 13, y + 5);
  ctx.bezierCurveTo(4, y + 7, -3, y + 5, -11, y + 6);
  ctx.bezierCurveTo(-27, y + 6, -36, y - 1, -65, y - 4);
  ctx.closePath();
  ctx.fill();
}

function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-2.1, -0.5);
  ctx.bezierCurveTo(-1.1, -1.5, 1.4, -1.5, 2.2, -0.4);
  ctx.bezierCurveTo(2.4, 0.6, 0.9, 1.3, -0.1, 1.3);
  ctx.bezierCurveTo(-1.1, 1.2, -2.8, 0.5, -2.1, -0.5);
  ctx.fillStyle = palette.nose;
  ctx.fill();
}

function drawTail(ctx, P, g) {
  ctx.save();
  ctx.translate(P.tailSide * 26 + P.tail * 2.5, g.tailBaseY + 1.5);
  ctx.rotate(P.tail * 0.12);
  ctx.beginPath();
  ctx.moveTo(-6.4, -3);
  ctx.bezierCurveTo(-3.7, -8.9, 3.6, -7.9, 6.3, -3.6);
  ctx.bezierCurveTo(10.1, 1.9, 5.9, 7.1, 0.7, 7.4);
  ctx.bezierCurveTo(-4.7, 8, -8.5, 2.4, -6.4, -3);
  ctx.closePath();
  ctx.fillStyle = headFill(ctx, 8, 8);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
  ctx.restore();
}

function drawFoot(ctx, P, g, { rx, ry }) {
  // 朝前的脚掌下缘较平；站立时，同一条轮廓压成脚背。
  rx *= 1 + g.sit * 0.12;
  ry *= 1 - g.sit * 0.035;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.87, ry * 0.34);
  ctx.bezierCurveTo(-rx * 1.07, -ry * 0.17, -rx * 0.65, -ry * 0.96, -rx * 0.18, -ry * 1.04);
  ctx.bezierCurveTo(rx * 0.4, -ry * 1.18, rx * 0.94, -ry * 0.56, rx * 0.98, ry * 0.12);
  ctx.bezierCurveTo(rx * 1.13, ry * 0.76, rx * 0.68, ry * 0.98, rx * 0.04, ry * 0.99);
  ctx.bezierCurveTo(-rx * 0.64, ry * 1.04, -rx * 1.02, ry * 0.82, -rx * 0.87, ry * 0.34);
  ctx.closePath();
  ctx.fillStyle = darkFill(ctx, -rx, -ry, rx, ry);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
  if (g.sit <= 0.48 || g.loaf >= 0.5) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, (g.sit - 0.48) / 0.36) * Math.max(0, 1 - g.loaf * 2);
  ctx.scale(rx / 14, ry / 13);
  const pad = ctx.createLinearGradient(-3, -3, 3, 8);
  pad.addColorStop(0, '#efb3a0');
  pad.addColorStop(1, '#df9888');
  ctx.fillStyle = pad;
  ctx.beginPath();
  ctx.moveTo(-4.5, 2.2);
  ctx.bezierCurveTo(-4.9, -0.6, -1.9, -2.1, 0.2, -1.7);
  ctx.bezierCurveTo(2.9, -2.1, 5.4, 0.5, 4.6, 3.3);
  ctx.bezierCurveTo(4.5, 6.5, 1.1, 7.6, -1.7, 7.1);
  ctx.bezierCurveTo(-4.1, 6.8, -5.1, 4.4, -4.5, 2.2);
  ctx.fill();
  for (const [x, y, sx, sy, rot] of [[-6.6,-2.6,1.35,1.6,-0.35],[-4,-6.2,1.6,1.85,-0.2],[0.1,-7.9,1.6,1.85,0.05],[4.6,-5.9,1.45,1.75,0.3]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, sx, sy, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawArmShape(ctx, P, g, { side, len, r }) {
  const angle = side < 0 ? P.armL : P.armR;
  const resting = g.sit * (1 - g.loaf) * Math.max(0, 1 - Math.max(0, Math.abs(angle + 0.45) - 0.55) * 1.3);
  len *= 1 - resting * 0.58;
  r *= 1 + resting * 0.29;
  ctx.save();
  ctx.scale(side, 1);
  ctx.rotate(resting * 0.14);
  // 原画的抱爪是椭圆：四段弧线相切，消掉旧轮廓的尖肩和两侧凹凸。
  const cx = 0, cy = len * 0.42, rx = r * (1 + resting * 0.04), ry = len * 0.5 + r * 0.96;
  const k = 0.55228475;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry);
  ctx.closePath();
  ctx.fillStyle = darkFill(ctx, -r, -r, r, len + r);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
  ctx.restore();
}

export const panda = {
  id: 'panda', palette,
  head: { rx: 45, ry: 33.5 }, headPath: fluffyHeadPath, headFill,
  torsoPath, drawFoot, drawArmShape,
  earReach: 6, righting: 0.35,
  build: { torso: 1.24, arm: 1.4, armLen: 0.8, foot: 1.44, sitSpread: 2.8, frontLegs: false, restArm: -0.85, foldInset: 7, bodyHitWidth: 1.1 },
  face: { eyeX: 12.3, eyeY: 3, eyeRx: 1.75, eyeRy: 3, shine: false, noseY: 5.5, mouthDy: 1, mouthW: 5.6, blushX: 29, blushY: 13.5 },
  paw: { pads: 4, sitHeight: 3.4, sitLift: 3.5 },
  drawEar, drawEyeBack, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawTail,
};
