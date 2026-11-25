// 企鹅：照着 img resource/企鹅与水獭萌系角色设定表.png 用代码画（2026-11-24，用户用 ChatGPT 生成的设定表，上半张是企鹅）。
// 另一张"狐狸与企鹅"里戴护目镜的深蓝色企鹅不用（用户说的）。
// 暖暖的深灰色，头和身子圆滚滚地连成一团；两大块白脸在眼睛下面连成白下巴，中间一道深灰色的尖一直伸到小橘嘴；
// 黑豆眼、粉腮红，头顶一小撮往右卷的毛；白肚子，两只短短的扁翅膀，橘色的脚掌三个脚趾。从正面看不到尾巴。
// 骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用：翅膀就是它的手臂（袖子照样套在翅膀上）。
// 走路是左摇右摆的小碎步（gait: 'waddle'，见 activities.js 的 locomote）。
// 头、五官的数字是在设定表第三排第一个表情头像（平常的样子）上用脚本逐行、逐列量出来的：
// 以头的中心为原点，头半宽 45、半高 36。
import { clamp, lerp } from '../../util/math.js';

const INK = '#3e2b1f'; // 描边：设定图里很深的暖棕色
const ORANGE_INK = '#b8742f'; // 嘴和脚的描边：深一点的橘棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#756a62', furDark: '#665b54', light: '#fef2e4',
  limb: '#6e635b', foot: '#f8c364', pawTip: null, earInner: '#756a62', nose: '#f8c364',
  eye: '#33231a', eyeLine: '#33231a', eyeRim: null,
  blush: '#f6aba2', blushLine: '#f29a91', pad: '#f8c364',
  mouthLine: '#33231a', mouthInside: '#b9564d', tongue: '#e8837a',
};
const BEAK = '#fac77e';
const BEAK_DARK = '#eea457';
const FEET = '#f8c364';

/** 深灰色：上面、中间亮一点，越靠近轮廓越深 */
function grayFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#887c73');
  fill.addColorStop(0.55, '#756a62');
  fill.addColorStop(1, '#62574f');
  return fill;
}
/** 白毛：中间最白，往外稍微暖一点 */
function whiteFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#fff9f1');
  fill.addColorStop(0.65, '#fef1e3');
  fill.addColorStop(1, '#f5e1cd');
  return fill;
}
function headFill(ctx, rx, ry) {
  return grayFill(ctx, 0, -ry * 0.45, rx * 1.15);
}
function torsoFill(ctx, g) {
  return grayFill(ctx, g.torsoCx, g.torsoCy - 10, 52);
}

/**
 * 顺着一串点画一条圆滑的曲线（Catmull-Rom：每段的控制点由前后两个点决定，所以经过每个点、拐弯处都是圆的）。
 * 画笔要先在 pts[0]；prev / next 是曲线两头之外的点，决定两头的走向（不给就当成直直地开始、结束）
 */
function smoothThrough(ctx, pts, prev = null, next = null) {
  const P = [prev || pts[0], ...pts, next || pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
}
const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

/**
 * 头（左半边，从头顶正中到下巴正中；右半边照镜子）：像一个包子，最宽的地方在中线往下一点。
 * 下巴那一段藏在身子前面的白毛里：轮廓线只描到两边往里收之前（见 headOutline），头和身子看起来连成一团
 */
const HEAD_SIDE = [
  [0, -36.1], [-7.6, -35.9], [-11.1, -35.5], [-14.9, -34.6], [-18.5, -33.3], [-22.3, -31.8], [-25.9, -29.3],
  [-29.7, -26.4], [-33.3, -22.7], [-35.4, -20.3], [-37.1, -18.2], [-39, -14.8], [-40.8, -11], [-42.2, -7.4],
  [-43.1, -3.6], [-43.6, -0.6], [-44.4, 2], [-44.9, 5], [-45, 8.5], [-44.8, 12], [-44.2, 15], [-43.2, 17.6],
  [-41.7, 20.3], [-39.6, 23.4], [-37.4, 25.9], [-34.8, 28], [-31.1, 29.9], [-27, 31.6], [-20.6, 33.5],
  [-14, 34.8], [-8.1, 35.5], [0, 35.8],
];
const RIM = [...HEAD_SIDE, ...mirror(HEAD_SIDE).slice(1)]; // 头顶 → 左边 → 下巴 → 右边 → 头顶
const OUTLINE_END = 22; // 轮廓线描到第几个点（左边 [-41.7, 20.3]），再往下不描

function headPath(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 36);
  ctx.beginPath();
  ctx.moveTo(...RIM[0]);
  smoothThrough(ctx, RIM, [7.6, -35.9], [-7.6, -35.9]);
  ctx.closePath();
  ctx.restore();
}
function headOutline(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 36);
  const left = HEAD_SIDE.slice(0, OUTLINE_END + 1).reverse(); // 左边往里收之前 → 头顶
  const side = [...left, ...mirror(left).slice(1)];
  ctx.beginPath();
  ctx.moveTo(...side[0]);
  smoothThrough(ctx, side, HEAD_SIDE[OUTLINE_END + 1], [-HEAD_SIDE[OUTLINE_END + 1][0], HEAD_SIDE[OUTLINE_END + 1][1]]);
  ctx.restore();
}

/**
 * 白脸：两大块白（上沿差不多平的，在眼睛上面一点），在眼睛外侧往下绕到脸边，下面连成白下巴；
 * 中间一道深灰色的尖从额头一直伸到小橘嘴。脸边上留一窄条深灰色，往下到下巴就没了。
 * 只写左半边（从嘴往外绕到脸边），右半边照镜子；跟着视线往那边滑（越靠外滑得越少）
 */
const MASK = [
  [0, 3.2], [-2.3, 0.3], [-4.8, -4], [-7.5, -8.6], [-10.4, -11.7], [-13.6, -13.6], [-17.5, -14.5], [-21.3, -14.1],
  [-25, -12.6], [-28.6, -10], [-32, -6.6], [-35.2, -2.8], [-37.8, 1.6], [-39.6, 6.2], [-40.6, 11], [-41.1, 15.5],
  [-41.6, 19.5], [-46, 23],
];
function drawHeadMarkings(ctx, P, lx, ly) {
  const mx = lx * 6;
  const my = ly * 3;
  const at = ([x, y]) => [x + mx * clamp(1 - Math.abs(x) / 60, 0.15, 1), y + my * clamp(1 - y / 40, 0.2, 1)];
  const edge = [...mirror(MASK), ...MASK.slice(1)].map(at); // 右边脸边 → 嘴 → 左边脸边
  ctx.beginPath();
  ctx.moveTo(...edge[0]);
  smoothThrough(ctx, edge);
  ctx.lineTo(-60, 60);
  ctx.lineTo(60, 60);
  ctx.closePath();
  ctx.fillStyle = whiteFill(ctx, mx * 0.6, 14 + my, 46);
  ctx.fill();
}

/** 头顶的一小撮毛：从头顶正中往上翘、往右卷（帽子会把它盖住） */
function drawFaceExtras(ctx, lx) {
  ctx.save();
  ctx.translate(lx * 3, 0);
  ctx.beginPath();
  ctx.moveTo(-3.6, -35);
  ctx.bezierCurveTo(-3.6, -39, -1.8, -42.6, 2.4, -43.8);
  ctx.bezierCurveTo(5.6, -44.6, 9.2, -43.6, 10.4, -41.2);
  ctx.bezierCurveTo(10.9, -40.1, 10.2, -39.2, 9.1, -39.6);
  ctx.bezierCurveTo(7.4, -40.4, 5.2, -40.2, 4, -38.8);
  ctx.bezierCurveTo(3.1, -37.8, 3.3, -36.4, 3.6, -35);
  ctx.fillStyle = grayFill(ctx, 3, -40, 8);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.restore();
}

/** 小橘嘴的上半片：圆圆的倒三角（top 上沿，tip 嘴尖） */
function beakPath(ctx, top, tip, w) {
  ctx.beginPath();
  ctx.moveTo(-w, top + 0.9);
  ctx.quadraticCurveTo(-w, top - 0.3, -w + 1.6, top - 0.2);
  ctx.lineTo(w - 1.6, top - 0.2);
  ctx.quadraticCurveTo(w, top - 0.3, w, top + 0.9);
  ctx.quadraticCurveTo(w * 0.55, tip - 0.6, 0, tip);
  ctx.quadraticCurveTo(-w * 0.55, tip - 0.6, -w, top + 0.9);
  ctx.closePath();
}

/**
 * 嘴（代替别的动物的 ω 嘴，见 draw.js 的 drawFace）：平常是一个圆圆的橘色倒三角。
 * 张嘴（笑、打哈欠、"o"）时上半片往上缩一点，下面露出深粉色的嘴巴和一片小小的下嘴壳
 */
function drawMouth(ctx, P) {
  const w = 6.4;
  const m = P.mouth;
  const open = m === 'smile' || m === 'yawn' ? 0.45 + 0.55 * clamp(P.mouthOpen, 0, 1) : m === 'o' ? 0.6 : 0;
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = ORANGE_INK;
  if (open > 0.05) {
    // 下嘴壳和中间的嘴巴
    const low = 1.4 + open * 5.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.62, 0.6);
    ctx.quadraticCurveTo(0, 1.4, w * 0.62, 0.6);
    ctx.quadraticCurveTo(w * 0.5, low + 0.6, 0, low + 1.2);
    ctx.quadraticCurveTo(-w * 0.5, low + 0.6, -w * 0.62, 0.6);
    ctx.closePath();
    ctx.fillStyle = palette.mouthInside;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, low - 1);
    ctx.quadraticCurveTo(0, low - 2.4, w * 0.42, low - 1);
    ctx.quadraticCurveTo(w * 0.3, low + 1.4, 0, low + 1.6);
    ctx.quadraticCurveTo(-w * 0.3, low + 1.4, -w * 0.42, low - 1);
    ctx.closePath();
    ctx.fillStyle = BEAK_DARK;
    ctx.fill();
    ctx.stroke();
  }
  beakPath(ctx, -3.6, open > 0.05 ? 1.6 : 3.8, w);
  const fill = ctx.createLinearGradient(0, -3.6, 0, 3.8);
  fill.addColorStop(0, '#fcd598');
  fill.addColorStop(0.6, BEAK);
  fill.addColorStop(1, BEAK_DARK);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  // 嘴上一点高光
  ctx.beginPath();
  ctx.ellipse(-1.6, -1.9, 1.6, 0.7, -0.15, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fill();
}

/**
 * 身子：像一个宽宽的蛋，肩膀很宽、几乎和脑袋一样宽，下面圆圆的；顶上多出一截藏在脑袋下面，
 * 头和身子看起来连成一团（设定图的大坐姿就是这样）
 */
function torsoPath(ctx, g) {
  const x = g.torsoCx, cy = g.torsoCy, r = g.torsoRy;
  const sit = g.sit * (1 - g.loaf);
  const w = g.torsoRxBot * lerp(1, 1.04, sit);
  const top = cy - r - 8;
  const bottom = cy + r;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x + w * 0.92, top, x + w, cy - r * 0.55, x + w, cy + r * 0.1);
  ctx.bezierCurveTo(x + w, cy + r * 0.8, x + w * 0.62, bottom, x, bottom);
  ctx.bezierCurveTo(x - w * 0.62, bottom, x - w, cy + r * 0.8, x - w, cy + r * 0.1);
  ctx.bezierCurveTo(x - w, cy - r * 0.55, x - w * 0.92, top, x, top);
  ctx.closePath();
}

/**
 * 白肚子：前面一大块，上面接着白下巴，两边留一点深灰色。
 * 上面和白下巴一样白、越往下越暖一点，接缝的地方看不出来
 */
function drawTorsoMarkings(ctx, P, g) {
  // 白肚子往上一直铺到脑袋下面（脑袋的下沿压在这片白上，接缝那儿不能露出灰色）
  const x = g.torsoCx + g.facing * 2.5;
  const cy = g.torsoCy - g.torsoRy * 0.05;
  const rx = g.torsoRxBot * 0.8;
  const ry = g.torsoRy * 1.36;
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, 0, TAU);
  const fill = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  fill.addColorStop(0, '#fef5ea');
  fill.addColorStop(0.55, '#fef1e3');
  fill.addColorStop(1, '#f4dfca');
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * 翅膀（就是它的手臂）：扁扁的，靠肩膀那头圆、中间最宽、末端收成一个圆圆的尖；比身子深一点的灰色
 */
function drawArmShape(ctx, P, g, { len, r }) {
  const w = r * 1.12;
  ctx.beginPath();
  ctx.moveTo(-w * 0.9, 0);
  ctx.bezierCurveTo(-w * 1.3, len * 0.4, -w * 0.95, len * 0.82, 0.6, len + r * 0.95);
  ctx.bezierCurveTo(w * 1.05, len * 0.8, w * 1.15, len * 0.32, w * 0.9, 0);
  ctx.bezierCurveTo(w * 0.75, -w * 1.05, -w * 0.75, -w * 1.05, -w * 0.9, 0);
  ctx.closePath();
  const fill = ctx.createLinearGradient(-w, 0, w, len);
  fill.addColorStop(0, '#7a6e66');
  fill.addColorStop(1, '#5f544d');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
}

/** 一只橘色的脚掌：三个圆圆的脚趾朝着 toes 那一边（1 = 下面，-1 = 上面） */
function footShape(ctx, rx, ry, toes) {
  const t = toes;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.98, -t * ry * 0.35);
  ctx.bezierCurveTo(-rx * 1.02, -t * ry * 1.02, rx * 1.02, -t * ry * 1.02, rx * 0.98, -t * ry * 0.35);
  // 三个脚趾（从右往左），两道小缝
  ctx.quadraticCurveTo(rx * 1.02, t * ry * 0.92, rx * 0.66, t * ry * 0.9);
  ctx.quadraticCurveTo(rx * 0.44, t * ry * 0.88, rx * 0.3, t * ry * 0.6);
  ctx.quadraticCurveTo(rx * 0.16, t * ry * 1.05, 0, t * ry * 1.04);
  ctx.quadraticCurveTo(-rx * 0.16, t * ry * 1.05, -rx * 0.3, t * ry * 0.6);
  ctx.quadraticCurveTo(-rx * 0.44, t * ry * 0.88, -rx * 0.66, t * ry * 0.9);
  ctx.quadraticCurveTo(-rx * 1.02, t * ry * 0.92, -rx * 0.98, -t * ry * 0.35);
  ctx.closePath();
}

/**
 * 脚：扁扁的橘色脚掌。站着时脚趾朝前（从正面看在脚的下沿）；坐下时脚掌朝前竖起来，脚趾在上面（设定图的大坐姿）
 */
function drawFoot(ctx, P, g, { rx, ry }) {
  const up = g.sit > 0.55 && g.loaf < 0.5;
  footShape(ctx, rx * 1.05, ry, up ? -1 : 1);
  const fill = ctx.createLinearGradient(0, -ry, 0, ry);
  fill.addColorStop(0, '#fbd182');
  fill.addColorStop(1, '#f2b04d');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ORANGE_INK;
  ctx.lineWidth = LW;
  ctx.stroke();
}

export const penguin = {
  id: 'penguin', palette,
  head: { rx: 45, ry: 36 }, headPath, headOutline, headFill, torsoFill, torsoPath, drawFoot, drawArmShape, drawMouth,
  earReach: 8, righting: 1, // 圆滚滚、重心低：在空中翻正得快，被拎着晃得慢
  // 身子很宽（肩膀几乎和脑袋一样宽），脑袋往下坐一点（headDrop：脖子短，整只矮墩墩的，见 draw.js 的 getGeometry），
  // 翅膀垂在身子两边，脚掌小小的
  build: { torso: 1.55, arm: 1.1, armLen: 0.9, foot: 1.05, sitSpread: 1.2, frontLegs: false, headDrop: 5, sitBodyWidth: 1.55, bodyHitWidth: 1.4 },
  // 黑豆眼、小橘嘴（drawMouth 画在 noseY 那儿）、腮红在眼睛外下方
  face: { eyeX: 17, eyeY: 3, eyeRx: 4.2, eyeRy: 5.4, shine: false, noseY: 5.6, mouthDy: 0, mouthW: 5, blushX: 26.8, blushY: 10.7 },
  paw: { lines: 0, sitHeight: 3.2, sitLift: 1 },
  drawEar: () => {}, // 没有露出来的耳朵
  drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose: null, drawFaceExtras, drawTail: () => {}, // 从正面看不到尾巴
  gait: 'waddle', // 走路左摇右摆（见 activities.js 的 locomote）
  pace: 0.8, // 走得慢一点
  snack: 'bluefish', // 爱吃的零食（和信里写的一样）：一整条小蓝鱼
  snackStyle: 'gulp', // 不是抱着啃：往上一抛、仰头一口吞（见 tricks.js 的 gulpSnack）
  // 慢吞吞的：少跑、少追，不爬墙（翅膀扒不住），只跳得上矮矮的窗口（HOP_REACH 也小）
  calm: 0.35,
  likes: { climb: 0, climbUp: 0, hopUp: 0.6, run: 0.7, chase: 0.7 },
  tricks: ['bellySlide', 'flapHop', 'slipFall'],
};
