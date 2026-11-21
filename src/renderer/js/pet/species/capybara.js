// 卡皮巴拉：照着 img resource/暖萌水豚桌宠素材表.png（2026-11-20 用户用 ChatGPT 生成）用代码画。
// 浅浅的暖橘色、下面鼓鼓的大脑袋、脸中间一块颜色深一点的圆口鼻（上面两个小鼻孔）、
// 头顶两角的小圆耳朵、梨形的胖身子、四只脚的脚尖是深一点的棕色，尾巴几乎看不见。
// 骨架、关节和猫、熊猫完全一样，所以所有动作、衣服都能直接用。
// 下面的数字是从设定图里量出来的（以头的中心为原点，头半宽 45、半高 35）。
import { lerp, clamp } from '../../util/math.js';

const INK = '#7e4a2c'; // 描边：设定图里的深棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#fbc28e', furDark: '#e3a173', light: '#fdd6a8',
  limb: '#f8bd88', foot: '#d8966a', pawTip: null, earInner: '#c98660', nose: '#6f452d',
  eye: '#5a3321', eyeLine: '#5a3321', eyeRim: null,
  blush: '#f6a072', blushLine: '#e98a5c', pad: '#eea27f',
  mouthLine: '#6f452d', mouthInside: '#e07f69', tongue: '#f5a592',
};

/** 毛色：左上亮、右下暗，和设定图一样柔和的明暗 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.06, x + radius * 0.2, y + radius * 0.25, radius);
  fill.addColorStop(0, '#fed3a2');
  fill.addColorStop(0.55, '#fbc28e');
  fill.addColorStop(1, '#efab77');
  return fill;
}
/** 脚尖、耳朵的深色：比毛色深一截的棕色（设定图里是 #d8966a 左右） */
function tanFill(ctx, y0, y1) {
  const fill = ctx.createLinearGradient(0, y0, 0, y1);
  fill.addColorStop(0, '#dfa073');
  fill.addColorStop(1, '#cc875b');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, -rx * 0.3, -ry * 0.4, rx * 1.35);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx - 12, g.torsoCy - 16, 58);
}

/**
 * 大脑袋：头顶是圆圆的拱形，越往下越宽，最宽的地方在脸颊（比中线低一点），下巴平平的。
 * 只写右半边的几段曲线，左半边照着镜子画过去，两边一定对称。
 * 每段是 [控制点1 x, y, 控制点2 x, y, 终点 x, y]，单位是头的半宽 / 半高
 */
const HEAD_RIGHT = [
  [0.45, -1.0, 0.7, -0.82, 0.78, -0.55], // 头顶 → 耳朵外侧（这一段大部分被耳朵挡住）
  [0.84, -0.35, 1.0, -0.12, 1.0, 0.2], // → 脸颊最宽处
  [1.02, 0.7, 0.82, 1.0, 0, 1.0], // → 平平的下巴
];
function headPath(ctx, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  for (const [a, b, c, d, e, f] of HEAD_RIGHT) ctx.bezierCurveTo(a * rx, b * ry, c * rx, d * ry, e * rx, f * ry);
  // 左半边：同样几段倒着走一遍，x 取反
  const pts = [[0, -1], ...HEAD_RIGHT.map((s) => [s[4], s[5]])];
  for (let i = HEAD_RIGHT.length - 1; i >= 0; i--) {
    const [a, b, c, d] = HEAD_RIGHT[i];
    const [ex, ey] = pts[i];
    ctx.bezierCurveTo(-c * rx, d * ry, -a * rx, b * ry, -ex * rx, ey * ry);
  }
  ctx.closePath();
}

/**
 * 小圆耳朵：长在头顶的两个角上，稍微往外歪，下半截藏在头后面（所以先画耳朵、再画头）。
 * 外圈是深一点的棕色，里面再深一点。抖耳朵、耷拉都绕着耳根转
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(side * 19.5 - lx * 2.5, -29.5);
  ctx.rotate(twitch + side * (0.32 + P.earDroop * 0.6));
  ctx.beginPath();
  ctx.ellipse(0, -3, 10.2, 9.8, 0, 0, TAU);
  ctx.fillStyle = tanFill(ctx, -13, 4);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 耳朵里面深一点
  ctx.beginPath();
  ctx.ellipse(side * 0.6, -1.6, 5.8, 5.6, 0, 0, TAU);
  ctx.fillStyle = palette.earInner;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.restore();
}

/**
 * 口鼻：脸中间一块颜色深一点的圆（不描边，设定图里就是一块颜色），上面的两个小鼻孔在 drawNose 里画。
 * 转头的时候跟着五官往那边滑，靠外的那一边窄一点，看起来像转过去了
 */
function drawHeadMarkings(ctx, P, lx, ly, head) {
  const cx = lx * 7.5;
  const cy = 9 + ly * 3;
  const w = 16 * (1 - 0.1 * Math.abs(lx));
  const h = 14;
  const fill = ctx.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, w * 1.15);
  fill.addColorStop(0, '#eab07f');
  fill.addColorStop(0.6, '#e3a375');
  fill.addColorStop(1, '#da986a');
  ctx.fillStyle = fill;
  // 比椭圆方一点点的圆（k 大于 0.552 就往方里鼓）
  const k = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.bezierCurveTo(cx + w * k, cy - h, cx + w, cy - h * k, cx + w, cy);
  ctx.bezierCurveTo(cx + w, cy + h * k, cx + w * k, cy + h, cx, cy + h);
  ctx.bezierCurveTo(cx - w * k, cy + h, cx - w, cy + h * k, cx - w, cy);
  ctx.bezierCurveTo(cx - w, cy - h * k, cx - w * k, cy - h, cx, cy - h);
  ctx.closePath();
  ctx.fill();

  // 额头上几根短短的毛（设定图里毛茸茸的感觉），跟着头稍微转一点
  ctx.save();
  ctx.strokeStyle = 'rgba(214, 138, 88, 0.5)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[-15, -27, 3.2, -1.4], [-9, -29.5, 3, -0.9], [11, -28.5, 3, 1]]) {
    const ox = x + lx * 3;
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + dx, y + dy);
  }
  ctx.stroke();
  ctx.restore();
}

/** 鼻子：口鼻上面两个小小的深色鼻孔，上端往外歪（像"\ /"） */
function drawNose(ctx) {
  ctx.fillStyle = palette.nose;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 4.8, 0, 1.05, 1.85, -s * 0.6, 0, TAU);
    ctx.fill();
  }
}

/**
 * 身子：上窄下宽的胖梨形，坐下时屁股往两边摊开（设定图里坐着的时候身子比头还宽）。
 * 只改轮廓，关节位置（手臂、脚从哪儿长出来）和大家一样
 */
function torsoPath(ctx, g) {
  const x = g.torsoCx, y = g.torsoCy, r = g.torsoRy, w = g.torsoRxBot;
  const sit = g.sit * (1 - g.loaf);
  const hip = lerp(1.06, 1.3, sit); // 最宽的地方（在偏下面）
  const top = lerp(0.6, 0.66, sit); // 肩膀窄
  // 右半边从头顶往下走到底，左半边从底往上走回来
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.02);
  ctx.bezierCurveTo(x + w * top, y - r * 1.04, x + w * hip * 0.93, y - r * 0.5, x + w * hip, y + r * 0.32);
  ctx.bezierCurveTo(x + w * hip * 1.03, y + r * 0.82, x + w * hip * 0.7, y + r * 1.03, x, y + r * 1.02);
  ctx.bezierCurveTo(x - w * hip * 0.7, y + r * 1.03, x - w * hip * 1.03, y + r * 0.82, x - w * hip, y + r * 0.32);
  ctx.bezierCurveTo(x - w * hip * 0.93, y - r * 0.5, x - w * top, y - r * 1.04, x, y - r * 1.02);
  ctx.closePath();
}

/** 肚子：下面中间一块浅浅的奶油色，慢慢过渡到毛色 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 3;
  const y = g.torsoCy + g.torsoRy * 0.38;
  const rx = g.torsoRxBot * 0.78;
  const belly = ctx.createRadialGradient(x, y, 2, x, y, rx);
  belly.addColorStop(0, 'rgba(254, 222, 186, 0.95)');
  belly.addColorStop(0.65, 'rgba(253, 214, 172, 0.6)');
  belly.addColorStop(1, 'rgba(253, 214, 172, 0)');
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, g.torsoRy * 0.85, 0, 0, TAU);
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
 * 手臂 / 前腿：毛色的胶囊，爪尖一截是深一点的棕色（设定图里四只脚都是这样）。
 * 坐下变成前腿时，上面那一截不描边（看起来是从胸口长出来的），深色占下面三成多，再画两道脚趾缝
 */
function drawArmShape(ctx, P, g, { len, r, legs = 0 }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = furFill(ctx, -r * 0.6, 0, len + r * 1.6);
  ctx.fill();
  // 深色的爪尖：分界线是一道往上拱的弧
  const visible = len + r - legs * (len * 0.45); // 露在外面的那一截有多长
  const tip = lerp(r * 1.35, visible * 0.38, legs);
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
  ctx.fillStyle = tanFill(ctx, y0, len + r);
  ctx.fill();
  ctx.restore();
  // 轮廓线。当前腿时，上面那一截不描边
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
  // 前腿撑在地上时，脚尖上两道短短的脚趾缝
  if (legs > 0.5) {
    ctx.save();
    ctx.globalAlpha *= clamp((legs - 0.5) / 0.4, 0, 1) * 0.6;
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

/** 后脚：深一点的棕色，底边比较平，脚尖两道脚趾缝（趴下时收在身子下面，不画缝） */
function drawFoot(ctx, P, g, { rx, ry }) {
  ctx.beginPath();
  ctx.moveTo(-rx * 0.92, ry * 0.3);
  ctx.bezierCurveTo(-rx * 1.04, -ry * 0.5, -rx * 0.5, -ry * 1.05, 0, -ry * 1.02);
  ctx.bezierCurveTo(rx * 0.5, -ry * 1.05, rx * 1.04, -ry * 0.5, rx * 0.92, ry * 0.3);
  ctx.bezierCurveTo(rx * 0.86, ry * 0.92, rx * 0.5, ry * 1.0, 0, ry * 1.0);
  ctx.bezierCurveTo(-rx * 0.5, ry * 1.0, -rx * 0.86, ry * 0.92, -rx * 0.92, ry * 0.3);
  ctx.closePath();
  ctx.fillStyle = tanFill(ctx, -ry, ry);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  if (g.loaf >= 0.5) return;
  ctx.save();
  ctx.globalAlpha *= 0.55;
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
 * 尾巴：卡皮巴拉的尾巴小到几乎看不见（设定图里只有背影才露出一小团），宠物一直是正面画的，所以不画。
 * 摇尾巴、尾巴垂下来这些姿势参数照样会变（大家共用一套），只是画出来没有尾巴，不会出怪样子
 */
function drawTail() {}

export const capybara = {
  id: 'capybara', palette,
  head: { rx: 45, ry: 35 }, headPath, headFill, torsoFill, torsoPath, drawFoot, drawArmShape,
  earReach: 8, righting: 0.5, // 比猫沉、比熊猫轻：在空中翻正、被拎着晃都在两者之间
  build: { torso: 1.24, arm: 1.2, armLen: 0.86, foot: 1.18, sitSpread: 3, frontLegs: true, frontLegInset: 12.5, sitBodyWidth: 1.25, bodyHitWidth: 1.1 },
  // 眼睛是不大不小的豆豆眼，离得比较开，在口鼻的两个上角外面。
  // 眼睛别再往上放：再高的话鸭舌帽、渔夫帽的帽檐会把眼睛盖住
  face: { eyeX: 20, eyeY: -4.6, eyeRx: 3.2, eyeRy: 4, shine: false, noseY: 2, mouthDy: 3.4, mouthW: 4.8, blushX: 33.5, blushY: 4 },
  paw: { lines: 2 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawTail,
  // 性格（见 brain.js 的 scores）：0 = 平常（猫、熊猫），1 = 佛系：少跑少追，多坐多打盹
  calm: 1,
  pace: 0.85, // 走路慢悠悠的（猫、熊猫是 1）
  // 招牌小动作：坐着发呆时，头顶偶尔落下一个橘子（见 activities.js 的 orangeNap、props.js）
  headProp: 'orange',
};
