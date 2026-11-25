// 水獭：照着 img resource/企鹅与水獭萌系角色设定表.png 用代码画（2026-11-24，用户用 ChatGPT 生成的设定表，下半张是水獭）。
// 暖暖的浅棕色，又宽又圆的大脑袋（上面窄、下面宽，像个包子），两边上方各一只小圆耳朵；
// 下半张脸是奶白色（中间往上拱到鼻子上面），豆豆眼正好长在分界线上，小黑鼻头、ω 嘴、粉腮红，两边各两根胡须伸到脸外面；
// 奶白色的肚子，粗粗的前腿垂在胸前，圆圆的后脚，身后一条又粗又长、往上翘的扁尾巴。
// 骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用。
// 头、耳朵、五官的数字是在设定表最下面一排第一个表情头像（平常的样子）上用脚本逐行、逐列量出来的：
// 以头的中心为原点，头半宽 45、半高 38（这个头像正好 1 像素 = 1 个单位）。
import { clamp, lerp } from '../../util/math.js';

const INK = '#6e4a30'; // 描边：设定图里暖暖的深棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#c59876', furDark: '#b5865f', light: '#feeed8',
  limb: '#c59876', foot: '#b98a66', pawTip: null, earInner: '#9c7355', nose: '#5a361f',
  eye: '#55361f', eyeLine: '#55361f', eyeRim: null,
  blush: '#f6a59a', blushLine: '#f0968b', pad: '#ecc9aa',
  mouthLine: '#55361f', mouthInside: '#d9675b', tongue: '#f49a8c',
};

/** 浅棕色的毛：中间亮一点，越靠近轮廓越深 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#d3a887');
  fill.addColorStop(0.55, '#c59876');
  fill.addColorStop(1, '#b3845f');
  return fill;
}
/** 奶白色：中间最白，往外稍微暖一点 */
function creamFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#fff6e8');
  fill.addColorStop(0.65, '#feeed8');
  fill.addColorStop(1, '#f6dec0');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, 0, -ry * 0.35, rx * 1.2);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx, g.torsoCy - 8, 50);
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

/** 头（左半边，从头顶正中到下巴正中；右半边照镜子）：上面窄、圆圆地鼓到脸颊最宽，下巴宽而平 */
const HEAD_SIDE = [
  [0, -38.4], [-8, -37.8], [-12, -37.4], [-16, -36.1], [-20, -34.6], [-24, -32.6], [-27.6, -30.1], [-30.6, -27.4],
  [-33.6, -24.6], [-36.6, -21.4], [-39.4, -17.6], [-41.6, -13.6], [-43, -9.6], [-43.8, -5.6], [-44.6, -1.6],
  [-45.2, 2.4], [-45.6, 6.4], [-45.8, 10.4], [-45.6, 14.4], [-44.8, 17.6], [-43.6, 20.8], [-42, 23.6], [-40, 26.4],
  [-37.4, 29], [-34.2, 31.4], [-30, 33.4], [-25, 35], [-19, 36.3], [-12, 37.2], [-6, 37.5], [0, 37.6],
];
const RIM = [...HEAD_SIDE, ...mirror(HEAD_SIDE).slice(1)];
function headPath(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 38);
  ctx.beginPath();
  ctx.moveTo(...RIM[0]);
  smoothThrough(ctx, RIM, [8, -37.8], [-8, -37.8]);
  ctx.closePath();
  ctx.restore();
}

/**
 * 小圆耳朵：长在头的左右上方，一大半露在外面，里面靠头那边一小块深棕色。先画耳朵、再画头，耳根藏在头后面。
 * 抖耳朵、耷拉都绕着耳根转（坐标按左耳写，右耳照镜子）
 */
const EAR = [-38.2, -19.2];
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(-lx * 1.5, 0);
  ctx.scale(-side, 1);
  ctx.translate(-34, -16); // 耳根
  ctx.rotate(-(clamp(P.earDroop, 0, 1) * 0.5 + side * twitch));
  ctx.translate(34, 16);
  ctx.beginPath();
  ctx.ellipse(EAR[0], EAR[1], 6.6, 6.2, 0, 0, TAU);
  ctx.fillStyle = furFill(ctx, EAR[0], EAR[1] - 2, 9);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(EAR[0] + 1.2, EAR[1] + 1, 3.6, 3.4, 0, 0, TAU);
  ctx.fillStyle = palette.earInner;
  ctx.fill();
  ctx.restore();
}

/**
 * 下半张脸的奶白色：上沿在两边差不多和眼睛中间一样高，往中间拱起来、一直到鼻子上面。
 * 只写左半边（从脸边到正中），右半边照镜子；跟着视线往那边滑（越靠外滑得越少）
 */
const CREAM_EDGE = [[-56, 6], [-44, 5], [-38, 4.4], [-33, 3.3], [-28, 2.6], [-22, 2.8], [-16, 2.6], [-11, 1.2], [-7, -0.8], [-3.5, -2.1], [0, -2.5]];
function drawHeadMarkings(ctx, P, lx, ly) {
  const mx = lx * 6;
  const my = ly * 3;
  const at = ([x, y], dy = 0) => [x + mx * clamp(1 - Math.abs(x) / 70, 0.2, 1), y + my + dy];
  const region = (dy) => {
    const edge = [...CREAM_EDGE, ...mirror(CREAM_EDGE).slice(1)].map((p) => at(p, dy));
    ctx.beginPath();
    ctx.moveTo(...edge[0]);
    smoothThrough(ctx, edge);
    ctx.lineTo(60, 50);
    ctx.lineTo(-60, 50);
    ctx.closePath();
  };
  ctx.fillStyle = creamFill(ctx, mx * 0.8, 16 + my, 44);
  ctx.save();
  ctx.globalAlpha *= 0.45; // 分界线柔和一点：先往上挪一点画一层半透明的
  region(-1.6);
  ctx.fill();
  ctx.restore();
  region(0);
  ctx.fill();
}

/** 小黑鼻头：圆圆的倒三角，上面一点高光 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-3.6, -1.6);
  ctx.bezierCurveTo(-3.6, -2.7, 3.6, -2.7, 3.6, -1.6);
  ctx.bezierCurveTo(3.6, 0.4, 1.4, 2.2, 0, 2.3);
  ctx.bezierCurveTo(-1.4, 2.2, -3.6, 0.4, -3.6, -1.6);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1.1, -1.6, 1.2, 0.5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
}

/** 胡须：两边各两根，从脸颊里面伸到脸外面（跟着视线滑一点） */
function drawFaceExtras(ctx, lx, ly) {
  ctx.save();
  ctx.translate(lx * 4, ly * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 39.5, 9.2);
    ctx.quadraticCurveTo(s * 45, 8.2, s * 51, 8.8);
    ctx.moveTo(s * 39.5, 14.6);
    ctx.quadraticCurveTo(s * 45, 15.4, s * 50.2, 18.2);
  }
  ctx.stroke();
  ctx.restore();
}

/** 身子：梨形，坐下时屁股往两边鼓一点（设定图里圆滚滚的） */
function torsoPath(ctx, g) {
  const x = g.torsoCx, y = g.torsoCy, r = g.torsoRy;
  const sit = g.sit * (1 - g.loaf);
  const w = g.torsoRxBot * lerp(1, 1.12, sit);
  const top = g.torsoRxTop * 1.15;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.bezierCurveTo(x + top, y - r, x + w, y - r * 0.25, x + w, y + r * 0.3);
  ctx.bezierCurveTo(x + w, y + r * 0.85, x + w * 0.6, y + r, x, y + r);
  ctx.bezierCurveTo(x - w * 0.6, y + r, x - w, y + r * 0.85, x - w, y + r * 0.3);
  ctx.bezierCurveTo(x - w, y - r * 0.25, x - top, y - r, x, y - r);
  ctx.closePath();
}

/** 肚子：前面一大块奶白色，从下巴底下一直到地面 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 2.5;
  const cy = g.torsoCy + g.torsoRy * 0.15;
  const rx = g.torsoRxBot * 0.68;
  const ry = g.torsoRy * 1.05;
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, 0, TAU);
  ctx.fillStyle = creamFill(ctx, x, cy, rx * 1.2);
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

/** 前腿：粗粗的浅棕色，爪尖两道脚趾缝 */
function drawArmShape(ctx, P, g, { len, r }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = furFill(ctx, -r * 0.4, len * 0.3, len + r * 1.4);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const x of [-r * 0.33, r * 0.33]) {
    ctx.moveTo(x, len + r * 0.95);
    ctx.lineTo(x, len + r * 0.4);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 后脚：圆圆的，比身子深一点的棕色；坐下时脚底朝前（脚变高一点，见 paw.sitHeight），露出浅色的肉垫
 */
function drawFoot(ctx, P, g, { rx, ry }) {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.98, ry, 0, 0, TAU);
  const fill = ctx.createLinearGradient(0, -ry, 0, ry);
  fill.addColorStop(0, '#c49572');
  fill.addColorStop(1, '#a9795a');
  ctx.fillStyle = fill;
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
  ctx.ellipse(0, 2.3, 3.9, 3.1, 0, 0, TAU);
  ctx.fill();
  for (const [bx, by] of [[-4, -2.3], [0, -3.9], [4, -2.3]]) {
    ctx.beginPath();
    ctx.ellipse(bx, by, 1.5, 1.6, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 尾巴：又粗又长的扁尾巴，从屁股一侧往外、往上翘，越往后越粗一点，尾巴尖圆圆的（像个桨）。
 * 和别的大尾巴一样不压扁：放低（走路、坐着、睡觉，tailCurl 小）时整条绕着尾根往下转；
 * 被拎起来（tailHang）再往下垂、短一点；低过地面就整条往上抬。换边时变窄，正好在身子后面时不画
 */
function drawTail(ctx, P, g) {
  const side = clamp(P.tailSide, -1, 1);
  const k = Math.abs(side);
  if (k < 0.05) return;
  const s = Math.sign(side);
  const curl = clamp(P.tailCurl + g.sit * 0.2, 0, 1);
  const hang = clamp(P.tailHang || 0, 0, 1);
  const turn = (1 - curl) * 1.0 + hang * 1.25;
  const keep = 1 - 0.12 * hang;
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const C = [[0, 0], [17, 3 * keep], [30 * keep, -6 * keep], [32 * keep, -30 * keep]];
  const N = 30;
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
    // 粗细：尾根 7.5，越往后越粗一点（最粗 11），最后一段收成圆圆的尾巴尖
    const tip = t > 0.82 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.82) / 0.18, 2))) : 1;
    const w = (7.5 + 3.5 * Math.sin(Math.PI * Math.min(1, t * 0.9))) * tip;
    const nx = (-ty / len) * w;
    const ny = (tx / len) * w;
    const flex = t * t * P.tail * 4;
    left.push([px + nx + flex, py + ny]);
    right.push([px - nx + flex, py - ny]);
  }
  const root = [s * 18, g.tailBaseY - 2];
  const place = ([x, y]) => {
    const rx = x * cs - y * sn;
    const ry = x * sn + y * cs;
    return [root[0] + s * rx * (0.55 + 0.45 * k), root[1] + ry];
  };
  let L = left.map(place);
  let R = right.map(place);
  const lowest = Math.max(...L.map((p) => p[1]), ...R.map((p) => p[1]));
  // 低过地面就整条抬高；仰面躺着（roll）的时候身子自己的"下面"不是地面，不管
  const over = Math.abs(P.roll || 0) < 0.3 ? lowest - (P.lift - 1) : 0;
  if (over > 0) {
    L = L.map(([x, y]) => [x, y - over]);
    R = R.map(([x, y]) => [x, y - over]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...L[0]);
  for (const p of L.slice(1)) ctx.lineTo(...p);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(...R[i]);
  ctx.closePath();
  const mid = L[Math.round(N * 0.6)];
  ctx.fillStyle = furFill(ctx, mid[0], mid[1], 34);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export const otter = {
  id: 'otter', palette,
  head: { rx: 45, ry: 38 }, headPath, headFill, torsoFill, torsoPath, drawFoot, drawArmShape,
  earReach: 4, righting: 0.85,
  // 坐下时两只粗粗的前腿垂在胸前、往里收一点（画在头后面），两只后脚朝前
  // 脑袋往下坐一点（headDrop，脖子短，圆滚滚的，见 draw.js 的 getGeometry）
  build: { torso: 1.15, arm: 1.12, armLen: 1, foot: 1.12, sitSpread: 1.6, frontLegs: false, restArm: -0.28, foldInset: 3, restInFront: false, headDrop: 3, sitBodyWidth: 1.25, bodyHitWidth: 1.1 },
  // 豆豆眼正好在棕色和奶白色的分界线上，鼻子在奶白色的上沿，下面一张 ω 嘴；腮红在眼睛外下方
  face: { eyeX: 18, eyeY: 0.5, eyeRx: 4.25, eyeRy: 5.75, shine: false, noseY: 2.3, mouthDy: 1.6, mouthW: 6.2, mouthDepth: 1.15, blushX: 29, blushY: 9 },
  paw: { lines: 0, sitHeight: 3.2, sitLift: 2.5 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras, drawTail,
  snack: 'clam', // 爱吃的零食（和信里写的一样）：贝壳（仰面躺着在肚子上敲开吃）
  snackStyle: 'clam', // 见 tricks.js 的 clamSnack
  // 黏人、爱玩：常常跑来找你（隔得也短：别的动物 15 分钟，它 7 分钟），爱追鼠标、爱蹦，也爱整理自己的毛
  likes: { seekUser: 2, chase: 1.25, hop: 1.3, groom: 1.3 },
  cooldowns: { seekUser: 420 },
  tricks: ['juggle', 'pawRub', 'floatNap'],
};
