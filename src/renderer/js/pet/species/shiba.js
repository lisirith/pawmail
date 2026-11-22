// 柴犬（赤柴）：橘红色的毛，脸颊、口鼻、胸口、肚子和脚尖是奶白色（叫"里白"），
// 眼睛上面两个奶白色小圆点眉毛，黑鼻头，竖起来的三角形耳朵，卷成一圈翘在背上的尾巴。
// 这是初稿（2026-11-21，设定图还没到）：先照着柴犬的特点画出来，好让菜单、来信、衣服这些先能用；
// 设定图到了以后照着重画。骨架、关节和猫、熊猫、卡皮巴拉完全一样，所以所有动作、衣服都能直接用。
import { clamp } from '../../util/math.js';

const INK = '#7a4527'; // 描边：暖一点的深棕
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#f0a253', furDark: '#d9853c', light: '#fff3e2',
  limb: '#f0a253', foot: '#fff3e2', pawTip: null, earInner: '#fff0dc', nose: '#3b2620',
  eye: '#3d2419', eyeLine: '#3d2419', eyeRim: null,
  blush: '#f6a98e', blushLine: '#ee9a80', pad: '#eea594',
  mouthLine: '#5a3424', mouthInside: '#e3846c', tongue: '#f59b8c',
};

/** 毛色：左上亮、右下暗的橘红色 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.06, x + radius * 0.2, y + radius * 0.25, radius);
  fill.addColorStop(0, '#f9c084');
  fill.addColorStop(0.55, '#f0a253');
  fill.addColorStop(1, '#e08b40');
  return fill;
}
/** 奶白色（里白）：上面白一点，下面稍微暖一点 */
function creamFill(ctx, top, bottom) {
  const fill = ctx.createLinearGradient(0, top, 0, bottom);
  fill.addColorStop(0, '#fff8ee');
  fill.addColorStop(1, '#fbe7cf');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, -rx * 0.3, -ry * 0.4, rx * 1.35);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx - 12, g.torsoCy - 16, 56);
}

/**
 * 头：圆圆的，脸颊两边的毛蓬起来（最宽的地方在中线往下一点），下巴圆。
 * 只写右半边的几段曲线，左半边照着镜子画过去，两边一定对称。
 * 每段是 [控制点1 x, y, 控制点2 x, y, 终点 x, y]，单位是头的半宽 / 半高
 */
const HEAD_RIGHT = [
  [0.5, -1.0, 0.82, -0.85, 0.92, -0.45],
  [0.98, -0.2, 1.04, 0.15, 1.0, 0.42],
  [0.95, 0.8, 0.55, 1.0, 0, 1.0],
];
function headPath(ctx, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  for (const [a, b, c, d, e, f] of HEAD_RIGHT) ctx.bezierCurveTo(a * rx, b * ry, c * rx, d * ry, e * rx, f * ry);
  const pts = [[0, -1], ...HEAD_RIGHT.map((s) => [s[4], s[5]])];
  for (let i = HEAD_RIGHT.length - 1; i >= 0; i--) {
    const [a, b, c, d] = HEAD_RIGHT[i];
    const [ex, ey] = pts[i];
    ctx.bezierCurveTo(-c * rx, d * ry, -a * rx, b * ry, -ex * rx, ey * ry);
  }
  ctx.closePath();
}

/**
 * 三角形的耳朵：竖着，长在头顶两个角上，稍微往外歪；耳朵里面是奶白色。
 * 下半截藏在头后面（先画耳朵、再画头）。抖耳朵、耷拉都绕着耳根转
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(side * 24 - lx * 2.5, -26);
  ctx.rotate(twitch + side * (0.3 + P.earDroop * 0.8));
  // 两条边稍微往外鼓，耳尖圆一点
  const ear = () => {
    ctx.beginPath();
    ctx.moveTo(-11, 5);
    ctx.bezierCurveTo(-10, -6, -4, -17, -1.2, -20.5);
    ctx.quadraticCurveTo(0, -22, 1.2, -20.5);
    ctx.bezierCurveTo(4, -17, 10, -6, 11, 5);
    ctx.closePath();
  };
  ear();
  const fill = ctx.createLinearGradient(0, -22, 0, 5);
  fill.addColorStop(0, '#f4ad62');
  fill.addColorStop(1, '#e3924a');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 耳朵里面：小一圈的奶白色三角
  ctx.beginPath();
  ctx.moveTo(-6.2, 3);
  ctx.bezierCurveTo(-5.5, -4, -2.5, -11.5, 0, -14);
  ctx.bezierCurveTo(2.5, -11.5, 5.5, -4, 6.2, 3);
  ctx.closePath();
  ctx.fillStyle = palette.earInner;
  ctx.fill();
  ctx.restore();
}

/**
 * 脸上的花纹：下半张脸是奶白色（两颊、口鼻、下巴），鼻梁中间留一道橘色一直到鼻头；
 * 眼睛上面两个奶白色的小圆点眉毛。跟着视线往那边滑一点
 */
function drawHeadMarkings(ctx, P, lx, ly, head) {
  const { rx, ry } = head;
  const mx = lx * 6;
  const my = ly * 3;
  ctx.beginPath();
  ctx.moveTo(-rx - 5, -7);
  ctx.bezierCurveTo(-36 + mx, -2 + my, -27 + mx, 4.5 + my, -17 + mx, 4.5 + my); // 左眼下面
  ctx.bezierCurveTo(-10 + mx, 4.5 + my, -6.5 + mx, 3 + my, -5 + mx, 6.5 + my); // 往鼻梁收
  ctx.bezierCurveTo(-3.5 + mx, 9 + my, 3.5 + mx, 9 + my, 5 + mx, 6.5 + my); // 绕过鼻头上面
  ctx.bezierCurveTo(6.5 + mx, 3 + my, 10 + mx, 4.5 + my, 17 + mx, 4.5 + my);
  ctx.bezierCurveTo(27 + mx, 4.5 + my, 36 + mx, -2 + my, rx + 5, -7);
  ctx.lineTo(rx + 5, ry + 5);
  ctx.lineTo(-rx - 5, ry + 5);
  ctx.closePath();
  ctx.fillStyle = creamFill(ctx, 0, ry);
  ctx.fill();
  // 麻吕眉：眼睛上面两个奶白色的小圆点
  ctx.fillStyle = '#fff4e4';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 15.5 + mx, -12 + my * 0.7, 3.4, 2.5, s * 0.25, 0, TAU);
    ctx.fill();
  }
}

/** 黑鼻头：圆圆的倒三角，上面一点高光；鼻子下面一道短线连到嘴（狗的"人"字嘴） */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-4.6, -2.2);
  ctx.bezierCurveTo(-4.2, -3.9, 4.2, -3.9, 4.6, -2.2);
  ctx.bezierCurveTo(5, -0.3, 1.8, 1.9, 0, 1.9);
  ctx.bezierCurveTo(-1.8, 1.9, -5, -0.3, -4.6, -2.2);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1.4, -2.3, 1.6, 0.75, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 1.9);
  ctx.lineTo(0, 5.8); // 正好接到 ω 嘴中间的小尖（mouthDy 3.6 + 2.2）
  ctx.strokeStyle = palette.mouthLine;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** 胸口和肚子：一大块奶白色，从脖子一直到肚子 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 3;
  const top = g.torsoCy - g.torsoRy - 4;
  const bottom = g.torsoCy + g.torsoRy + 4;
  const w = g.torsoRxBot * 0.62;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.55, top);
  ctx.bezierCurveTo(x - w * 0.75, g.torsoCy - g.torsoRy * 0.3, x - w * 1.05, g.torsoCy + g.torsoRy * 0.3, x - w, bottom);
  ctx.lineTo(x + w, bottom);
  ctx.bezierCurveTo(x + w * 1.05, g.torsoCy + g.torsoRy * 0.3, x + w * 0.75, g.torsoCy - g.torsoRy * 0.3, x + w * 0.55, top);
  ctx.closePath();
  ctx.fillStyle = creamFill(ctx, top, bottom);
  ctx.fill();
}

/** 胶囊形：从 (0,0) 往下到 (0,len) */
function capsulePath(ctx, len, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.lineTo(r, len);
  ctx.arc(0, len, r, 0, Math.PI);
  ctx.closePath();
}

/**
 * 手臂 / 前腿：橘色的胶囊，爪尖一截是奶白色（像穿了白袜子）。
 * 坐下变成前腿时，上面那一截不描边（看起来是从胸口长出来的），白袜子占下面四成多
 */
function drawArmShape(ctx, P, g, { len, r, legs = 0 }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = furFill(ctx, -r * 0.6, 0, len + r * 1.6);
  ctx.fill();
  const visible = len + r - legs * (len * 0.45);
  const tip = r * 1.3 + (visible * 0.45 - r * 1.3) * legs;
  const y0 = len + r - tip;
  ctx.save();
  capsulePath(ctx, len, r);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-r - 1, y0 + 1.4);
  ctx.quadraticCurveTo(0, y0 - 1.2, r + 1, y0 + 1.4);
  ctx.lineTo(r + 1, len + r + 2);
  ctx.lineTo(-r - 1, len + r + 2);
  ctx.closePath();
  ctx.fillStyle = creamFill(ctx, y0, len + r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  if (legs > 0) {
    const cut = -r - 3 + legs * (len * 0.45 + r + 3);
    ctx.beginPath();
    ctx.rect(-r - 4, cut, r * 2 + 8, len + r * 2 + 8);
    ctx.clip();
  }
  capsulePath(ctx, len, r);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.restore();
  if (legs > 0.5) {
    ctx.save();
    ctx.globalAlpha *= clamp((legs - 0.5) / 0.4, 0, 1) * 0.55;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (const x of [-r * 0.33, r * 0.33]) {
      ctx.moveTo(x, len + r * 0.95);
      ctx.lineTo(x, len + r * 0.45);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** 后脚：奶白色，底边比较平，脚尖两道脚趾缝 */
function drawFoot(ctx, P, g, { rx, ry }) {
  ctx.beginPath();
  ctx.moveTo(-rx * 0.92, ry * 0.3);
  ctx.bezierCurveTo(-rx * 1.04, -ry * 0.5, -rx * 0.5, -ry * 1.05, 0, -ry * 1.02);
  ctx.bezierCurveTo(rx * 0.5, -ry * 1.05, rx * 1.04, -ry * 0.5, rx * 0.92, ry * 0.3);
  ctx.bezierCurveTo(rx * 0.86, ry * 0.92, rx * 0.5, ry * 1.0, 0, ry * 1.0);
  ctx.bezierCurveTo(-rx * 0.5, ry * 1.0, -rx * 0.86, ry * 0.92, -rx * 0.92, ry * 0.3);
  ctx.closePath();
  ctx.fillStyle = creamFill(ctx, -ry, ry);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  if (g.loaf >= 0.5) return;
  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const x of [-rx * 0.3, rx * 0.3]) {
    ctx.moveTo(x, ry * 0.95);
    ctx.lineTo(x, ry * 0.4);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 尾巴：卷成一圈、翘在背上。宠物是正面画的，所以只看得到身子一侧冒出来的一个"卷"（像肉桂卷），
 * 中间一圈奶白色，再画一道螺旋线。
 * tailSide 决定在哪一边；tailCurl 小（睡觉）时卷卷放低，靠在身边；被拎起来（tailHang）时往下垂一点；
 * 摇尾巴（tail）时整个卷卷左右晃
 */
function drawTail(ctx, P, g) {
  const side = clamp(P.tailSide, -1, 1);
  const k = Math.abs(side);
  if (k < 0.05) return; // 正好转到身子正后面：被身子挡住
  const curl = clamp(P.tailCurl, 0, 1);
  const hang = clamp(P.tailHang, 0, 1);
  const R = 11.5 * (0.55 + 0.45 * k); // 换边的时候变细，像从身子后面绕过去
  const cx = side * (25 + 3 * k) + P.tail * 3 + Math.sign(side) * hang * 4;
  const cy = g.tailBaseY - 6 - 15 * curl + hang * 12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(P.tail * 0.25 + side * 0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.95, 0, 0, TAU);
  ctx.fillStyle = furFill(ctx, -R * 0.4, -R * 0.5, R * 1.6);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 中间的奶白色和螺旋线
  ctx.beginPath();
  ctx.ellipse(side * 1.2, 0.8, R * 0.42, R * 0.4, 0, 0, TAU);
  ctx.fillStyle = '#fff1df';
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = Math.sign(side || 1) * (t * TAU * 1.15) + 0.6;
    const r = R * (0.12 + 0.6 * t);
    const x = side * 1.2 + Math.cos(a) * r;
    const y = 0.8 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

export const shiba = {
  id: 'shiba', palette,
  head: { rx: 45, ry: 34 }, headPath, headFill, torsoFill, drawFoot, drawArmShape,
  earReach: 12, righting: 0.75, // 比猫稍微沉一点：在空中翻正、被拎着晃都接近猫
  build: { torso: 1.1, arm: 1.15, armLen: 0.95, foot: 1.1, sitSpread: 2, frontLegs: true, frontLegInset: 13, sitBodyWidth: 1.2, bodyHitWidth: 1.05 },
  // 豆豆眼长在橘色和奶白色的分界线上面一点，眼睛上面是麻吕眉
  face: { eyeX: 18, eyeY: -2, eyeRx: 3, eyeRy: 3.8, shine: false, noseY: 6, mouthDy: 3.6, mouthW: 4.8, blushX: 31, blushY: 9 },
  paw: { lines: 2 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawTail,
  // 性格：有主见、不太黏人——来找你、追鼠标少一点，自己溜达多一点（见 brain.js 的 scores）
  likes: { seekUser: 0.5, chase: 0.75, walk: 1.3 },
  // 招牌小动作：走着走着突然趴下赖着不走（见 activities.js 的 stubborn）
  quirk: 'stubborn',
};
