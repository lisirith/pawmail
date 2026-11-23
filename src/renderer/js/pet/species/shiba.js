// 柴犬（赤柴）：照着 img resource/ChatGPT 图像 2026年11月22日 13_18_18.png 用代码画
// （2026-11-22：用户把我们代码画的草图和以前的设定图交给 ChatGPT，请它照着画风改出来的设定图）。
// 浅浅的橘色毛，下半张脸、胸口、肚子、前腿和后脚是奶白色，眼睛上面两个奶白色的小圆点眉毛，
// 黑鼻头和一张弯得很深的 ω 嘴，三角形的大耳朵和脸连成一个轮廓（耳根没有线），身边一个卷成一圈的尾巴。
// 骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用。
// 下面的数字是从设定图最下面一排第一个正脸量出来的（以头的中心为原点，头半宽 45、半高 33）。
import { lerp, clamp } from '../../util/math.js';

const INK = '#7f4320'; // 描边：设定图里暖暖的深棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#feb773', furDark: '#f0a05a', light: '#fde8d3',
  limb: '#feb773', foot: '#fde8d3', pawTip: null, earInner: '#feecdb', nose: '#5e2f14',
  eye: '#5e2f14', eyeLine: '#5e2f14', eyeRim: null,
  blush: '#f8a585', blushLine: '#f3907a', pad: '#f3a291',
  mouthLine: '#6a3519', mouthInside: '#e27f69', tongue: '#f6a294',
};

/** 毛色：中间亮，越靠近轮廓越深一点（设定图里是很柔和的浅橘色） */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#ffc78f');
  fill.addColorStop(0.55, '#feb773');
  fill.addColorStop(1, '#f19d55');
  return fill;
}
/** 奶白色：中间最白，往外稍微暖一点 */
function creamFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#fff6ea');
  fill.addColorStop(0.6, '#fde9d4');
  fill.addColorStop(1, '#f9dabd');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, 0, ry * 0.1, rx * 1.2);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx, g.torsoCy - 6, 50);
}

/**
 * 头（不算耳朵）：额头平平的；两只耳朵下面那一段斜着往外走（被耳朵盖住，看不见）；
 * 从耳根下面的小凹口开始是鼓起来的脸颊，最宽的地方比中线低一点；下巴又宽又平。
 * 只写右半边，左半边照镜子画。每段是 [控制点1 x, y, 控制点2 x, y, 终点 x, y]（头半宽 45、半高 33 时的坐标）
 */
const HEAD_START = [0, -33.2];
const HEAD_RIGHT = [
  [3, -33.3, 6, -33.3, 9, -33.1], // 0 额头（两只耳朵中间）
  [11, -29, 30, -19.5, 39.4, -12], // 1 耳朵下面（被耳朵盖住）→ 耳根下面的小凹口
  [41.8, -8, 44.9, -3, 45, 5], // 2 脸颊鼓出来，到最宽处
  [45, 18, 34, 28, 21, 31.2], // 3 → 下巴两边
  [15, 33.1, 8, 33.2, 0, 33.2], // 4 平平的下巴中间
];
function headPath(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 33);
  ctx.beginPath();
  ctx.moveTo(...HEAD_START);
  for (const s of HEAD_RIGHT) ctx.bezierCurveTo(...s);
  // 左半边：同样几段倒着走一遍，x 取反
  const pts = [HEAD_START, ...HEAD_RIGHT.map((s) => [s[4], s[5]])];
  for (let i = HEAD_RIGHT.length - 1; i >= 0; i--) {
    const [a, b, c, d] = HEAD_RIGHT[i];
    const [ex, ey] = pts[i];
    ctx.bezierCurveTo(-c, d, -a, b, -ex, ey);
  }
  ctx.closePath();
  ctx.restore();
}
/**
 * 头的轮廓线只描看得见的几段：额头、两边的脸颊。
 * 耳朵下面不描（耳朵和脸连成一个轮廓）；下巴中间也不描：坐着、站着时下巴的白毛和胸口的白毛连在一起，设定图里就是这样
 */
function headOutline(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 33);
  ctx.beginPath();
  const [a0, b0, c0, d0, e0, f0] = HEAD_RIGHT[0];
  ctx.moveTo(-e0, f0);
  ctx.bezierCurveTo(-c0, d0, -a0, b0, ...HEAD_START);
  ctx.bezierCurveTo(a0, b0, c0, d0, e0, f0);
  const notch = HEAD_RIGHT[1];
  for (const s of [-1, 1]) {
    ctx.moveTo(s * notch[4], notch[5]);
    for (const i of [2, 3]) {
      const [a, b, c, d, e, f] = HEAD_RIGHT[i];
      ctx.bezierCurveTo(s * a, b, s * c, d, s * e, f);
    }
  }
  ctx.restore();
}

/** 右耳看得见的那条边：额头的耳根 → 耳尖 → 外侧几乎竖直地往下 → 耳根下面的小凹口（接上脸颊的轮廓） */
function earEdge(ctx) {
  ctx.moveTo(9, -33.1);
  ctx.bezierCurveTo(11, -37, 15, -41.5, 21, -44);
  ctx.bezierCurveTo(23.5, -45.6, 27, -45.6, 29.6, -42.6);
  ctx.bezierCurveTo(34, -38, 38.6, -30, 38.5, -19);
  ctx.bezierCurveTo(38.5, -16, 38.7, -13.8, 39.4, -12);
}

/**
 * 三角形的大耳朵：和脸连成一个轮廓。耳朵先画、头后画，头把耳根盖住，所以耳根上没有线。
 * 耳朵里面是奶白色。抖耳朵、耷拉都绕着耳朵中间转（坐标按右耳写，左耳照镜子）
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  const place = () => {
    ctx.translate(-lx * 1.7, 0);
    ctx.translate(side * 26, -22);
    ctx.rotate(side * P.earDroop * 0.6 + twitch);
    ctx.translate(-side * 26, 22);
    ctx.scale(side, 1);
  };
  // 填色：看得见的边，再往头里面多铺一块（头后画，会盖住；耳朵耷拉、抖动时补住和头之间的缝）
  ctx.save();
  place();
  ctx.beginPath();
  earEdge(ctx);
  ctx.lineTo(34, 2);
  ctx.lineTo(4, -20);
  ctx.closePath();
  ctx.restore();
  ctx.fillStyle = headFill(ctx, 45, 33); // 路径已经带着耳朵的变换，填色用头的坐标：耳根没有渐变的接缝
  ctx.fill();
  // 耳朵里面的奶白色（下面一截被头盖住，露出来的是一个圆圆的三角）
  ctx.save();
  place();
  ctx.beginPath();
  ctx.moveTo(16.6, -27.5);
  ctx.bezierCurveTo(19, -31.5, 23.5, -37.6, 26.6, -38.6);
  ctx.bezierCurveTo(29.4, -38, 32.4, -27, 32.6, -19.2);
  ctx.bezierCurveTo(27, -21.5, 21, -25, 16.6, -27.5);
  ctx.closePath();
  ctx.restore();
  const inner = ctx.createLinearGradient(side * 27, -39, side * 24, -21);
  inner.addColorStop(0, '#fff3e6');
  inner.addColorStop(1, '#fde2c9');
  ctx.fillStyle = inner;
  ctx.fill();
  // 轮廓：只描看得见的那条边
  ctx.save();
  place();
  ctx.beginPath();
  earEdge(ctx);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
}

/**
 * 下半张脸的奶白色：上沿差不多和眼睛一样高，脸的两边和鼻梁上面高一点、眼睛外侧低一点（波浪形）。
 * 只写左半边（从脸的最左边到正中间），右半边照镜子；最后跟着视线往那边滑（越靠外滑得越少）
 */
const CREAM_START = [-58, 4];
const CREAM_EDGE = [
  [-44, -0.5, -35, -1.5, -27, -1],
  [-21, -0.5, -17, 0.5, -12, -0.8],
  [-8, -2, -4, -3.6, 0, -3.6],
];

function drawHeadMarkings(ctx, P, lx, ly) {
  const mx = lx * 6;
  const my = ly * 3;
  const at = (x, y, dy) => [x + mx * clamp(1 - Math.abs(x) / 70, 0.2, 1), y + my + dy];
  const region = (dy) => {
    ctx.beginPath();
    ctx.moveTo(...at(...CREAM_START, dy));
    for (const [a, b, c, d, e, f] of CREAM_EDGE) ctx.bezierCurveTo(...at(a, b, dy), ...at(c, d, dy), ...at(e, f, dy));
    const pts = [CREAM_START, ...CREAM_EDGE.map((s) => [s[4], s[5]])];
    for (let i = CREAM_EDGE.length - 1; i >= 0; i--) {
      const [a, b, c, d] = CREAM_EDGE[i];
      const [ex, ey] = pts[i];
      ctx.bezierCurveTo(...at(-c, d, dy), ...at(-a, b, dy), ...at(-ex, ey, dy));
    }
    ctx.lineTo(60, 45);
    ctx.lineTo(-60, 45);
    ctx.closePath();
  };
  ctx.fillStyle = creamFill(ctx, mx * 0.8, 8 + my, 42);
  // 分界线是柔和的：先往上挪一点画一层半透明的，再画一层不透明的
  ctx.save();
  ctx.globalAlpha *= 0.45;
  region(-1.6);
  ctx.fill();
  ctx.restore();
  region(0);
  ctx.fill();
  // 麻吕眉：眼睛上面两个奶白色的小椭圆
  ctx.fillStyle = '#fdebd8';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 12.7 + mx, -13.5 + my * 0.7, 4.5, 2.85, 0, 0, TAU);
    ctx.fill();
  }
}

/** 黑鼻头：圆圆的、比较扁，上面一点高光 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-3.3, -0.8);
  ctx.bezierCurveTo(-3.2, -2.1, 3.2, -2.1, 3.3, -0.8);
  ctx.bezierCurveTo(3.4, 0.7, 1.5, 1.9, 0, 1.9);
  ctx.bezierCurveTo(-1.5, 1.9, -3.4, 0.7, -3.3, -0.8);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1, -1.05, 1.2, 0.5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
}

/**
 * 身子：和默认的梨形一样，只是坐下时屁股（后腿）往两边鼓一点（设定图里坐着时后腿圆滚滚的）。
 * 只改轮廓，关节位置（手臂、脚从哪儿长出来）和大家一样
 */
function torsoPath(ctx, g) {
  const x = g.torsoCx, y = g.torsoCy, r = g.torsoRy;
  const sit = g.sit * (1 - g.loaf);
  const w = g.torsoRxBot * lerp(1, 1.15, sit);
  const top = g.torsoRxTop * 1.15;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.bezierCurveTo(x + top, y - r, x + w, y - r * 0.25, x + w, y + r * 0.3);
  ctx.bezierCurveTo(x + w, y + r * 0.85, x + w * 0.6, y + r, x, y + r);
  ctx.bezierCurveTo(x - w * 0.6, y + r, x - w, y + r * 0.85, x - w, y + r * 0.3);
  ctx.bezierCurveTo(x - w, y - r * 0.25, x - top, y - r, x, y - r);
  ctx.closePath();
}

/** 胸口和肚子：中间一大块奶白色，从下巴一直到地面，越往下越宽；两边留下橘色（肩膀和后腿） */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 3;
  const cy = g.torsoCy;
  const r = g.torsoRy;
  const top = cy - r - 4;
  const bottom = cy + r + 4;
  const bib = (w) => {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, top);
    ctx.bezierCurveTo(x - w * 0.5, cy - r * 0.35, x - w * 0.8, cy + r * 0.25, x - w * 0.74, bottom);
    ctx.lineTo(x + w * 0.74, bottom);
    ctx.bezierCurveTo(x + w * 0.8, cy + r * 0.25, x + w * 0.5, cy - r * 0.35, x + w * 0.42, top);
    ctx.closePath();
  };
  // 渐变的中心放在肚子上：最上面（下巴底下）的颜色和下巴的白毛一样，两块白毛接在一起看不出缝
  ctx.fillStyle = creamFill(ctx, x, cy + r * 0.35, g.torsoRxBot * 1.25);
  ctx.save();
  ctx.globalAlpha *= 0.45; // 和脸上一样，边上柔和一点
  bib(g.torsoRxBot * 1.08);
  ctx.fill();
  ctx.restore();
  bib(g.torsoRxBot);
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
 * 手臂 / 前腿：站着时上面是橘色、下面一半多是奶白色（像穿了白袜子）；
 * 坐下变成前腿时整条都是奶白色（设定图里坐着的前腿是白的），上面那一截不描边（看起来是从胸口长出来的）
 */
function drawArmShape(ctx, P, g, { len, r, legs = 0 }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = furFill(ctx, -r * 0.5, 0, len + r * 1.6);
  ctx.fill();
  const tip = lerp(len * 0.42 + r, len + r * 2 + 2, legs);
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
  ctx.fillStyle = creamFill(ctx, 0, len * 0.5, len + r);
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
    // 前腿撑在地上时，脚尖上两道短短的脚趾缝
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
  ctx.fillStyle = creamFill(ctx, 0, -ry * 0.3, rx * 1.4);
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
 * 尾巴：卷成一圈的"肉桂卷"，在身子一侧露出来大半个。底色是奶白色（尾巴里侧的毛），
 * 上面一条橘色的带子从背后（被身子挡住的那一边）绕上来、一圈圈卷进中间，再沿着带子画一道螺旋线。
 * tailSide 决定在哪一边；tailCurl 小（睡觉）时卷卷放低，靠在身边；被拎起来（tailHang）时往下垂一点；
 * 摇尾巴（tail）时整个卷卷晃着转。换边时变窄，像从身子后面绕过去；正好在身子后面时不画
 */
function drawTail(ctx, P, g) {
  const side = clamp(P.tailSide, -1, 1);
  const k = Math.abs(side);
  if (k < 0.05) return;
  const s = Math.sign(side);
  const curl = clamp(P.tailCurl, 0, 1);
  const hang = clamp(P.tailHang || 0, 0, 1);
  const R = 15.5;
  const cx = s * (34 + 3 * k) + P.tail * 3 + s * hang * 4;
  // 坐着时卷卷搁在地上、靠着后腿（设定图里是这样）；低过地面就抬起来（地面在 y = P.lift，画身子前整体往上挪了 lift）
  const cy = Math.min(g.tailBaseY - 4 - 14 * curl + hang * 12, P.lift - 1 - R);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.55 + 0.45 * k, 1);
  ctx.rotate(P.tail * 0.25 + s * 0.15);
  ctx.scale(s, 1); // 按右边的尾巴写，左边照镜子
  const disc = () => {
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
  };
  disc();
  ctx.fillStyle = creamFill(ctx, R * 0.25, R * 0.3, R * 1.3);
  ctx.fill();
  // 橘色的带子：从左边（身子后面）开始，顺时针绕过头顶、一圈圈往里卷
  const N = 44;
  const turns = 1.15;
  const a0 = Math.PI * 0.95;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + t * turns * TAU;
    const ro = R * (1 - 0.62 * t);
    const ri = ro * (1 - 0.42 * (1 - 0.3 * t));
    outer.push([Math.cos(a) * ro, Math.sin(a) * ro]);
    inner.push([Math.cos(a) * ri, Math.sin(a) * ri]);
  }
  ctx.save();
  disc();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(...outer[0]);
  for (const p of outer.slice(1)) ctx.lineTo(...p);
  for (let i = N; i >= 0; i--) ctx.lineTo(...inner[i]);
  ctx.closePath();
  ctx.fillStyle = furFill(ctx, -R * 0.2, -R * 0.35, R * 1.35);
  ctx.fill();
  ctx.restore();
  disc();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 螺旋线：沿着带子里边，从背后一直卷到中间
  ctx.beginPath();
  ctx.moveTo(...inner[0]);
  for (const p of inner.slice(1)) ctx.lineTo(...p);
  ctx.globalAlpha *= 0.6;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
}

export const shiba = {
  id: 'shiba', palette,
  head: { rx: 45, ry: 33 }, headPath, headOutline, headFill, torsoFill, torsoPath, drawFoot, drawArmShape,
  earReach: 12, righting: 0.75, // 比猫稍微沉一点：在空中翻正、被拎着晃都接近猫
  build: { torso: 1.1, arm: 1.15, armLen: 0.95, foot: 1.1, sitSpread: 2, frontLegs: true, frontLegInset: 13, sitBodyWidth: 1.25, bodyHitWidth: 1.05 },
  // 豆豆眼正好长在橘色和奶白色的分界线上，眼睛上面是麻吕眉；鼻子和眼睛差不多一样高，下面是很深的 ω 嘴
  face: { eyeX: 14.4, eyeY: -1.75, eyeRx: 3.7, eyeRy: 4.5, shine: false, noseY: 1, mouthDy: 2.3, mouthW: 7, mouthDepth: 1.9, blushX: 28, blushY: 5.5 },
  paw: { lines: 2 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawTail,
  // 性格：有主见、不太黏人——来找你、追鼠标少一点，自己溜达多一点（见 brain.js 的 scores）
  likes: { seekUser: 0.5, chase: 0.75, walk: 1.3 },
  // 招牌小动作：走着走着突然趴下赖着不走（见 activities.js 的 stubborn）
  quirk: 'stubborn',
  // 三个招牌动作（见 tricks.js）：赖着不走、叼球给你（点一下球它就去追）、转圈追自己的尾巴
  tricks: ['stubborn', 'fetch', 'chaseTail'],
  snack: 'jerky', // 爱吃的零食（和信里写的一样）：肉干
};
