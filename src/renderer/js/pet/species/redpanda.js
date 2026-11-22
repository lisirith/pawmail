// 小熊猫（红熊猫）：红棕色的毛，白脸蛋、白口鼻、白眉毛，眼睛下面两道深色"泪痕"一直连到嘴角，
// 白边的大耳朵，深棕黑色的手脚和肚子，一条又大又蓬松、有深浅环纹的尾巴。
// 这是初稿（2026-11-21，设定图还没到）：先照着小熊猫的特点画出来，用户会拿这版的样子请 ChatGPT 照着画风改，
// 改好的设定图到了以后再照着重画。骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用。
import { clamp } from '../../util/math.js';

const INK = '#5a2e1c'; // 描边：偏红的深棕
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#d2602f', furDark: '#a94420', light: '#fff8f0',
  limb: '#3f2520', foot: '#3f2520', pawTip: null, earInner: '#8f3c1e', nose: '#2e1c18',
  eye: '#2a1712', eyeLine: '#2a1712', eyeRim: null,
  blush: '#f4a2a0', blushLine: '#ec8f8c', pad: '#d9907f',
  mouthLine: '#4a2618', mouthInside: '#d9705e', tongue: '#f09a8c',
};

/** 红棕色的毛：左上亮、右下暗 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.06, x + radius * 0.2, y + radius * 0.25, radius);
  fill.addColorStop(0, '#e88050');
  fill.addColorStop(0.55, '#d2602f');
  fill.addColorStop(1, '#b44a22');
  return fill;
}
/** 深棕黑色（手脚、肚子） */
function darkFill(ctx, y0, y1) {
  const fill = ctx.createLinearGradient(0, y0, 0, y1);
  fill.addColorStop(0, '#53322a');
  fill.addColorStop(1, '#36201b');
  return fill;
}
const WHITE = '#fff8f0';
function headFill(ctx, rx, ry) {
  return furFill(ctx, -rx * 0.3, -ry * 0.4, rx * 1.35);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx - 12, g.torsoCy - 16, 56);
}

/**
 * 头：圆圆的，两颊的毛蓬起来，下巴圆。只写右半边，左半边照着镜子画。
 * 每段是 [控制点1 x, y, 控制点2 x, y, 终点 x, y]，单位是头的半宽 / 半高
 */
const HEAD_RIGHT = [
  [0.5, -1.0, 0.82, -0.86, 0.92, -0.46],
  [0.99, -0.18, 1.06, 0.18, 1.0, 0.44],
  [0.94, 0.82, 0.55, 1.0, 0, 1.0],
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
 * 大耳朵：圆圆的三角形，长在头顶两个角上、往外歪得比较多；外圈一道白边，里面是深红棕色。
 * 下半截藏在头后面（先画耳朵、再画头）。抖耳朵、耷拉都绕着耳根转
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(side * 25 - lx * 2.5, -25);
  ctx.rotate(twitch + side * (0.42 + P.earDroop * 0.7));
  ctx.beginPath();
  ctx.moveTo(-13, 6);
  ctx.bezierCurveTo(-13, -6, -6, -19, 0, -22);
  ctx.bezierCurveTo(6, -19, 13, -6, 13, 6);
  ctx.closePath();
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 里面：深红棕色，留出一圈白边
  ctx.beginPath();
  ctx.moveTo(-9, 5);
  ctx.bezierCurveTo(-9, -4, -4.5, -14, 0, -16.5);
  ctx.bezierCurveTo(4.5, -14, 9, -4, 9, 5);
  ctx.closePath();
  ctx.fillStyle = palette.earInner;
  ctx.fill();
  ctx.restore();
}

/**
 * 脸：白色的口鼻、两大块白脸蛋、眼睛上面的白眉毛；脸蛋和口鼻之间是两道深色的"泪痕"，
 * 从眼睛下面一直连到嘴角。跟着视线往那边滑一点
 */
function drawHeadMarkings(ctx, P, lx, ly, head) {
  const mx = lx * 6;
  const my = ly * 3;
  const white = (x, y, rx, ry, rot = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fill();
  };
  ctx.fillStyle = WHITE;
  for (const s of [-1, 1]) {
    white(s * 28 + mx * 0.8, 9 + my, 14, 11.5, s * 0.15); // 脸蛋
    white(s * 15 + mx, -13 + my * 0.7, 5.6, 3.8, s * 0.3); // 眉毛
  }
  white(mx * 1.2, 13 + my, 12.5, 10); // 口鼻
  // 泪痕：从眼睛下面靠里的地方（不碰到眼睛），弯弯地连到嘴角
  ctx.strokeStyle = '#a3421d';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 14.5 + mx, 3 + my);
    ctx.quadraticCurveTo(s * 14.5 + mx * 1.1, 12 + my, s * 10.5 + mx * 1.2, 19.5 + my);
  }
  ctx.stroke();
}

/** 鼻子：小小的深色圆鼻头，一点高光 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-3.8, -1.8);
  ctx.bezierCurveTo(-3.4, -3.3, 3.4, -3.3, 3.8, -1.8);
  ctx.bezierCurveTo(4.1, 0, 1.6, 1.7, 0, 1.7);
  ctx.bezierCurveTo(-1.6, 1.7, -4.1, 0, -3.8, -1.8);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1.2, -1.9, 1.3, 0.6, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
}

/** 肚子：下半截是深棕黑色（真的小熊猫肚子是黑的），和深色的腿连在一起，像穿了条深色的裤子 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 2;
  const y = g.torsoCy + g.torsoRy * 0.55;
  ctx.beginPath();
  ctx.ellipse(x, y, g.torsoRxBot * 0.95, g.torsoRy * 0.82, 0, 0, TAU);
  ctx.fillStyle = darkFill(ctx, y - g.torsoRy * 0.8, y + g.torsoRy * 0.8);
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

/** 手臂 / 前腿：整条都是深棕黑色。坐下变成前腿时，上面那一截不描边（从胸口长出来） */
function drawArmShape(ctx, P, g, { len, r, legs = 0 }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = darkFill(ctx, -r, len + r);
  ctx.fill();
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
    // 撑在地上的前爪：两道浅一点的脚趾缝
    ctx.save();
    ctx.globalAlpha *= clamp((legs - 0.5) / 0.4, 0, 1) * 0.5;
    ctx.strokeStyle = '#8a6a5e';
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

/** 后脚：深棕黑色，底边比较平 */
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
}

/**
 * 大尾巴：又粗又蓬松，从屁股一侧往外、往上翘，红棕色上有几道浅色的环纹，尾巴尖颜色深一点。
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
  const C = [[0, 0], [15, -2 * keep], [28 * keep, -20 * keep], [27 * keep, -44 * keep]];
  const N = 28;
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
    // 粗细：尾根 6，中间最粗 12.5，最后一小段收成圆圆的尾尖
    const tip = t > 0.92 ? Math.sqrt(Math.max(0, (1 - t) / 0.08)) : 1;
    const w = (6 + 6.5 * Math.sin(Math.PI * Math.min(1, t * 1.05))) * tip;
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
  ctx.fillStyle = furFill(ctx, mid[0] - 6, mid[1] - 8, 40);
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // 浅色的环纹，尾巴尖深一点
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
  for (const c of [0.3, 0.52, 0.74]) band(c - 0.065, c + 0.065, '#f0b884');
  band(0.9, 1, '#8a3418');
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
  head: { rx: 45, ry: 34 }, headPath, headFill, torsoFill, drawFoot, drawArmShape,
  earReach: 12, righting: 0.7,
  build: { torso: 1.15, arm: 1.2, armLen: 0.92, foot: 1.15, sitSpread: 2.4, frontLegs: true, frontLegInset: 13, sitBodyWidth: 1.2, bodyHitWidth: 1.05 },
  // 豆豆眼长在白脸蛋上面一点，眼睛上面是白眉毛；腮红落在白脸蛋上
  face: { eyeX: 17, eyeY: -3, eyeRx: 3.2, eyeRy: 4.1, shine: false, noseY: 8, mouthDy: 2.8, mouthW: 4.6, blushX: 29, blushY: 12 },
  paw: { lines: 0 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawTail,
  // 性格：胆小又爱装凶，最爱爬高——爬墙、上窗口比别的动物勤，上去了待得久一点，追鼠标少一点（见 brain.js 的 scores）
  likes: { climb: 1.8, climbUp: 1.6, hopUp: 1.5, chase: 0.8, jumpDown: 0.6 },
  // 招牌小动作：受惊了站直、举起双手"吓唬"你（见 activities.js 的 bluff）
  quirk: 'bluff',
};
