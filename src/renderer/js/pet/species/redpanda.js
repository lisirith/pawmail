// 小熊猫（红熊猫）：照着 img resource/ChatGPT 图像 2026年11月22日 13_18_51.png 用代码画
// （2026-11-22：用户把我们代码画的草图和以前的设定图交给 ChatGPT，请它照着画风改出来的设定图）。
// 红棕色的毛，白眉毛、两大块白脸蛋、白口鼻，白边的大耳朵（里面深红棕色），深棕色的手脚和肚子（像穿了条深色裤子），
// 坐下时两只手搭在肚子上、脚底朝前露出粉色肉垫，一条又粗又蓬松、深浅相间的条纹大尾巴。
// 设定图里没有初稿画的"泪痕"，这一版也去掉了。
// 骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用。
// 下面的数字是从设定图第三排第二个正脸量出来的（以头的中心为原点，头半宽 45、半高 33）。
import { clamp } from '../../util/math.js';

const INK = '#4a2212'; // 描边：设定图里偏红的深棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#e5733e', furDark: '#c95a2c', light: '#fdf4ec',
  limb: '#5a352b', foot: '#5a352b', pawTip: null, earInner: '#a54b29', nose: '#33170e',
  eye: '#33170e', eyeLine: '#33170e', eyeRim: null,
  blush: '#f7a6a0', blushLine: '#f29690', pad: '#f6968c',
  mouthLine: '#46200f', mouthInside: '#d9675a', tongue: '#f29a8e',
};
const WHITE = '#fdf4ec';

/** 红棕色的毛：中间亮一点，越靠近轮廓越深 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#ef8655');
  fill.addColorStop(0.55, '#e5733e');
  fill.addColorStop(1, '#d1602e');
  return fill;
}
/** 深棕色（手脚、肚子）：上面稍微亮一点 */
function darkFill(ctx, y0, y1) {
  const fill = ctx.createLinearGradient(0, y0, 0, y1);
  fill.addColorStop(0, '#653d31');
  fill.addColorStop(1, '#4c2b22');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, 0, -ry * 0.1, rx * 1.2);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx, g.torsoCy - 8, 48);
}

/**
 * 头：上面是圆圆的拱顶，越往下越宽，最宽的地方在中线往下一点（脸蛋那儿），下巴宽而平。
 * 只写右半边，左半边照镜子画。每段是 [控制点1 x, y, 控制点2 x, y, 终点 x, y]（头半宽 45、半高 33 时的坐标）
 */
const HEAD_START = [0, -32.8];
const HEAD_RIGHT = [
  [16, -32.8, 34, -22, 40.1, -6.9], // 拱顶 → 脸颊上面
  [42.5, -2, 45, 3, 45, 8], // → 最宽处
  [45, 20, 27, 32.8, 0, 32.8], // → 平平的下巴
];
function headPath(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 33);
  ctx.beginPath();
  ctx.moveTo(...HEAD_START);
  for (const s of HEAD_RIGHT) ctx.bezierCurveTo(...s);
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
 * 大耳朵：圆圆的三角形，耳尖往外歪，外圈一道很宽的白边，里面是深红棕色。
 * 下半截藏在头后面（先画耳朵、再画头，头的轮廓线从耳朵前面经过）。
 * 坐标按右耳写，左耳照镜子；抖耳朵、耷拉都绕着耳朵中间转
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(-lx * 2, 0);
  ctx.translate(side * 24, -24);
  ctx.rotate(side * P.earDroop * 0.6 + twitch);
  ctx.translate(-side * 24, 24);
  ctx.scale(side, 1);
  // 外圈（白色）
  ctx.beginPath();
  ctx.moveTo(6, -27);
  ctx.bezierCurveTo(9, -37, 20, -43, 26.5, -44.5); // 里侧的边 → 耳尖
  ctx.bezierCurveTo(30.5, -45.5, 34.5, -42.5, 36.4, -36.8); // 圆圆的耳尖
  ctx.bezierCurveTo(38.4, -31, 39.9, -22, 38.8, -12); // 外侧的边 → 藏到头后面
  ctx.lineTo(24, -8);
  ctx.closePath();
  const rim = ctx.createLinearGradient(0, -45, 0, -15);
  rim.addColorStop(0, '#fffaf6');
  rim.addColorStop(1, '#f6ebe2');
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 里面（深红棕色）：离外圈的边里侧约 3、顶上约 5、外侧约 4.5
  ctx.beginPath();
  ctx.moveTo(10, -24);
  ctx.bezierCurveTo(13, -31.5, 21, -37.5, 27, -38.8);
  ctx.bezierCurveTo(31, -39.4, 33.2, -35, 34.3, -29);
  ctx.bezierCurveTo(35, -24, 34.8, -18, 34, -12);
  ctx.lineTo(18, -12);
  ctx.closePath();
  const inner = ctx.createLinearGradient(0, -39, 0, -18);
  inner.addColorStop(0, '#8f3d24');
  inner.addColorStop(1, '#b4532c');
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.restore();
}

/**
 * 脸：两大块白脸蛋（外侧被头的轮廓切掉）、中间一块白口鼻、眼睛上面两个白眉毛。
 * 脸蛋和口鼻之间留一道红棕色；眼睛正好长在脸蛋的里上角外面。跟着视线往那边滑一点
 */
function drawHeadMarkings(ctx, P, lx, ly) {
  const white = (x, y, rx, ry, rot = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fill();
  };
  ctx.fillStyle = WHITE;
  for (const s of [-1, 1]) {
    white(s * 29.8 + lx * 5, 11.9 + ly * 3, 14.5, 11.4, s * 0.15); // 脸蛋
    white(s * 14.3 + lx * 6, -11.4 + ly * 2.5, 5.5, 4.4, s * 0.15); // 眉毛
  }
  white(lx * 8, 10.8 + ly * 4, 11.9, 9.7); // 口鼻（跟着鼻子走）
}

/** 鼻子：口鼻上沿一个小小的深色鼻头，一点高光 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-2.9, -0.7);
  ctx.bezierCurveTo(-2.8, -1.8, 2.8, -1.8, 2.9, -0.7);
  ctx.bezierCurveTo(3, 0.6, 1.3, 1.6, 0, 1.6);
  ctx.bezierCurveTo(-1.3, 1.6, -3, 0.6, -2.9, -0.7);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.9, -0.9, 1, 0.45, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
}

/**
 * 肚子：胸口下面一大块深棕色（真的小熊猫肚子是黑的），和深色的腿连在一起，像穿了条深色的裤子；
 * 两边和胸口留着红棕色。坐下时这块更宽、更高一点（设定图里坐着时整个下半身都是深色）
 */
function drawTorsoMarkings(ctx, P, g) {
  const sit = g.sit * (1 - g.loaf);
  const x = g.torsoCx + g.facing * 2;
  const y = g.torsoCy + g.torsoRy * (0.6 - 0.1 * sit);
  const rx = g.torsoRxBot * (0.76 + 0.16 * sit);
  const ry = g.torsoRy * (0.9 + 0.1 * sit);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = darkFill(ctx, y - ry, y + ry);
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

/** 手臂：整条都是深棕色，粗粗圆圆的 */
function drawArmShape(ctx, P, g, { len, r }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = darkFill(ctx, -r, len + r);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
}

/**
 * 后脚：深棕色，底边比较平。坐下时脚底朝前（脚变高一点，见 paw.sitHeight），露出粉色肉垫：
 * 一个大肉垫和四个小脚趾，和熊猫的画法一样
 */
function drawFoot(ctx, P, g, { rx, ry }) {
  ctx.beginPath();
  ctx.moveTo(-rx * 0.92, ry * 0.3);
  ctx.bezierCurveTo(-rx * 1.04, -ry * 0.5, -rx * 0.5, -ry * 1.05, 0, -ry * 1.02);
  ctx.bezierCurveTo(rx * 0.5, -ry * 1.05, rx * 1.04, -ry * 0.5, rx * 0.92, ry * 0.3);
  ctx.bezierCurveTo(rx * 0.86, ry * 0.92, rx * 0.5, ry * 1.0, 0, ry * 1.0);
  ctx.bezierCurveTo(-rx * 0.5, ry * 1.0, -rx * 0.86, ry * 0.92, -rx * 0.92, ry * 0.3);
  ctx.closePath();
  ctx.fillStyle = darkFill(ctx, -ry, ry);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  const show = clamp((g.sit - 0.6) / 0.4, 0, 1) * clamp((0.3 - g.loaf) / 0.3, 0, 1);
  if (show <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= show;
  ctx.fillStyle = palette.pad;
  const k = rx / 10.5;
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.ellipse(0, 2.2, 3.9, 3.1, 0, 0, TAU);
  ctx.fill();
  for (const [bx, by] of [[-4.6, -2.1], [-1.7, -4.4], [1.7, -4.4], [4.6, -2.1]]) {
    ctx.beginPath();
    ctx.ellipse(bx, by, 1.45, 1.6, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 大尾巴：又粗又蓬松，从屁股一侧往外、往上翘，红棕色和浅橘色一道一道相间，尾巴尖是深一点的红棕色。
 * 和猫尾巴一样**不压扁**：要放低（走路、坐着、睡觉，tailCurl 小）时是整条绕着尾根往下转；
 * 被拎起来（tailHang）再往下垂、短一点。转低以后要是低过了地面，就把整条往上抬，正好搁在地上。
 * 换边（tailSide 过 0）时变窄，像从身子后面绕过去；正好在身子后面时不画
 */
function drawTail(ctx, P, g) {
  const side = clamp(P.tailSide, -1, 1);
  const k = Math.abs(side);
  if (k < 0.05) return;
  const s = Math.sign(side);
  const curl = clamp(P.tailCurl + g.sit * 0.2, 0, 1);
  const hang = clamp(P.tailHang || 0, 0, 1);
  const turn = (1 - curl) * 1.0 + hang * 1.25; // 绕尾根往下转多少（弧度）
  const keep = 1 - 0.12 * hang; // 垂下来时短一点
  const sway = P.tail;
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  // 尾巴中线（尾根在 0,0；x 往外、y 往上是负数），三次贝塞尔
  const C = [[0, 0], [15, -2 * keep], [29 * keep, -20 * keep], [28 * keep, -46 * keep]];
  const N = 32;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    const px = u * u * u * C[0][0] + 3 * u * u * t * C[1][0] + 3 * u * t * t * C[2][0] + t * t * t * C[3][0];
    const py = u * u * u * C[0][1] + 3 * u * u * t * C[1][1] + 3 * u * t * t * C[2][1] + t * t * t * C[3][1];
    const tx = 3 * u * u * (C[1][0] - C[0][0]) + 6 * u * t * (C[2][0] - C[1][0]) + 3 * t * t * (C[3][0] - C[2][0]);
    const ty = 3 * u * u * (C[1][1] - C[0][1]) + 6 * u * t * (C[2][1] - C[1][1]) + 3 * t * t * (C[3][1] - C[2][1]);
    const len = Math.hypot(tx, ty) || 1;
    // 粗细：尾根 8，中间最粗 15，最后一小段收成圆圆的尾尖
    const tip = t > 0.9 ? Math.sqrt(Math.max(0, (1 - t) / 0.1)) : 1;
    const w = (8 + 7 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * tip;
    const nx = (-ty / len) * w;
    const ny = (tx / len) * w;
    const flex = t * t * sway * 5; // 摇尾巴：越往尾尖摆得越多
    left.push([px + nx + flex, py + ny]);
    right.push([px - nx + flex, py - ny]);
  }
  // 局部坐标 → 身子坐标：先绕尾根转，再按在哪一边左右翻、换边时变窄
  const root = [s * 19, g.tailBaseY - 3];
  const place = ([x, y]) => {
    const rx = x * cs - y * sn;
    const ry = x * sn + y * cs;
    return [root[0] + s * rx * (0.55 + 0.45 * k), root[1] + ry];
  };
  let L = left.map(place);
  let R = right.map(place);
  // 低过地面了：整条往上抬（地面在 y = P.lift，因为画身子之前整体往上挪了 lift）
  const lowest = Math.max(...L.map((p) => p[1]), ...R.map((p) => p[1]));
  const over = lowest - (P.lift - 1);
  if (over > 0) {
    L = L.map(([x, y]) => [x, y - over]);
    R = R.map(([x, y]) => [x, y - over]);
  }
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(...L[0]);
    for (const p of L.slice(1)) ctx.lineTo(...p);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(...R[i]);
    ctx.closePath();
  };
  ctx.save();
  outline();
  const mid = L[Math.round(N * 0.5)];
  ctx.fillStyle = furFill(ctx, mid[0], mid[1], 44);
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // 条纹：浅橘色和红棕色一道一道相间（设定图里有三道浅色），尾巴尖深一点
  const band = (t0, t1, color) => {
    const i0 = Math.round(t0 * N);
    const i1 = Math.round(t1 * N);
    ctx.beginPath();
    ctx.moveTo(...L[i0]);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(...L[i]);
    for (let i = i1; i >= i0; i--) ctx.lineTo(...R[i]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  for (const [t0, t1] of [[0.16, 0.3], [0.44, 0.58], [0.72, 0.85]]) band(t0, t1, '#fcb27c');
  band(0.9, 1, '#c8562a');
  ctx.restore();
  outline();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export const redpanda = {
  id: 'redpanda', palette,
  head: { rx: 45, ry: 33 }, headPath, headFill, torsoFill, drawFoot, drawArmShape,
  earReach: 12, righting: 0.7,
  // 坐下时两只手往里搭在肚子上（像熊猫，但手画在头后面，不压住下巴），脚底朝前
  build: { torso: 1.15, arm: 1.25, armLen: 0.92, foot: 1.15, sitSpread: 2.4, frontLegs: false, restArm: -0.85, foldInset: 8, restInFront: false, sitBodyWidth: 1.2, bodyHitWidth: 1.05 },
  // 豆豆眼比较大，长在白脸蛋的里上角外面；鼻子在白口鼻的上沿，下面一张浅浅的 ω 嘴；腮红落在白脸蛋中间
  face: { eyeX: 14.4, eyeY: 2, eyeRx: 4.1, eyeRy: 5.2, shine: false, noseY: 4.4, mouthDy: 2.3, mouthW: 5.4, mouthDepth: 1.25, blushX: 29, blushY: 11.5 },
  paw: { lines: 0, sitHeight: 3.4, sitLift: 3 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawTail,
  // 性格：胆小又爱装凶，最爱爬高——爬墙、上窗口比别的动物勤，上去了待得久一点，追鼠标少一点（见 brain.js 的 scores）
  likes: { climb: 1.8, climbUp: 1.6, hopUp: 1.5, chase: 0.8, jumpDown: 0.6 },
  // 招牌小动作：受惊了站直、举起双手"吓唬"你（见 activities.js 的 bluff）
  quirk: 'bluff',
};
