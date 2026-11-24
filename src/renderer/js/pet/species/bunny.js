// 兔子（奶油兔）：照着 img resource/可爱奶油兔角色设定贴纸表.png 用代码画（2026-11-23，用户用 ChatGPT 生成的贴纸表）。
// 奶油白的毛、暖棕色描边；又宽又圆的大脑袋，两颊毛茸茸，头顶一小撮卷毛；两只长长的竖耳朵，里面粉色；
// 右耳根上一个粉色蝴蝶结、结上一朵白色小花（它的招牌，一直戴着；戴帽子、节日头饰时收起来）；
// 豆豆眼长得比较低，小嘴，粉色腮红；脖子上粉色项圈、蝴蝶结和金铃铛（穿上衣时被盖住，和招财猫一样）；
// 圆滚滚的身子、短短的手；坐下时两只大脚掌朝前，露出粉色肉垫；屁股后面一团棉花糖似的圆尾巴。
// 骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用。走路是一蹦一蹦的（gait: 'hop'，见 activities.js 的 locomote）。
// 耳朵很长（longEars）：戴帽子时不收进帽子里，从帽子后面竖出来（见 draw.js 的 drawHead 和 outfits.js）。
// 头、耳朵、五官的数字是在设定图左边的大坐姿上描、量出来的（以头的中心为原点，头半宽 46、半高 30.4）。
import { clamp, lerp } from '../../util/math.js';

const INK = '#6e4a3a'; // 描边：设定图里暖暖的棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#fff5ec', furDark: '#f0dccb', light: '#fffaf5',
  limb: '#fff5ec', foot: '#fff5ec', pawTip: null, earInner: '#f6b3ab', nose: '#f19a98',
  eye: '#4b2c22', eyeLine: '#4b2c22', eyeRim: null,
  blush: '#f7a19e', blushLine: '#f29591', pad: '#f6a3a4',
  mouthLine: '#6b3f30', mouthInside: '#e27c76', tongue: '#f6a59e',
};
const PINK = '#f38f8b'; // 蝴蝶结、项圈
const PINK_DARK = '#d8625f';

/** 奶油白的毛：中间最亮，越往边上越暖一点（像设定图里柔柔的阴影） */
function creamFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#fffbf6');
  fill.addColorStop(0.6, '#fff3e8');
  fill.addColorStop(1, '#f5e0cf');
  return fill;
}
function headFill(ctx, rx, ry) {
  return creamFill(ctx, -rx * 0.12, -ry * 0.15, rx * 1.15);
}
function torsoFill(ctx, g) {
  return creamFill(ctx, g.torsoCx - 4, g.torsoCy - 6, 40);
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

/**
 * 头：照着设定图左边的大坐姿一点一点描下来的（2026-11-23 用户说脸颊太尖，改成直接描）：
 * 用脚本在原图上逐行、逐列找出轮廓线的中心，换算成头的坐标（头半宽 46、半高 30.4），这里是左半边从耳根外侧到下巴正中的点，
 * 右半边照镜子。脸颊外侧只有一团软软的绒毛（往外鼓一点点，不是尖的），下巴的两个角是圆的、底边几乎是平的。
 * 第一个点是耳朵外沿和脸的轮廓接上的地方（设定图里那儿有个小凹口）；头顶那一段藏在耳根和卷毛后面
 */
const HEAD_TOP = [0, -30.15];
const HEAD_SIDE = [
  [-22.8, -20.8], [-28, -17.7], [-31.4, -14.8], [-34.2, -12], [-36.4, -9.1], [-38.5, -6.2], [-40, -3.4],
  [-41.3, -0.5], [-42.3, 2.4], [-43.1, 5.3], [-43.8, 7.8], // 往外鼓着下来，越往下越竖
  [-45.1, 10.2], [-46, 12.4], [-46.1, 14.2], [-45.4, 15.7], // 脸颊外侧一团软软的绒毛
  [-44.4, 17.1], [-43.9, 19], [-43.1, 21.1], [-41.6, 22.9], [-38.8, 24.5], [-35.8, 26.2], // 圆圆地拐到下巴
  [-32, 27.9], [-28.2, 29.1], [-24.4, 29.8], [-18.5, 30.3], [-12.9, 30.6], [-6.4, 30.75], [0, 30.8], // 平平的下巴
];
// 左耳根 → 下巴 → 右耳根，一整圈（不含头顶）
const HEAD_RIM = [...HEAD_SIDE, ...HEAD_SIDE.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
const DOME_IN = [-17, -26.2]; // 头顶那一段（藏着）往耳根走的方向：让耳根这儿的轮廓顺着头顶接下来

function headPath(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 46, ry / 30.4);
  ctx.beginPath();
  ctx.moveTo(...HEAD_TOP);
  ctx.bezierCurveTo(-8, -30.15, -15.5, -27.5, ...HEAD_RIM[0]);
  smoothThrough(ctx, HEAD_RIM, DOME_IN, [-DOME_IN[0], DOME_IN[1]]);
  ctx.bezierCurveTo(15.5, -27.5, 8, -30.15, ...HEAD_TOP);
  ctx.closePath();
  ctx.restore();
}
/** 头的轮廓线只描两边和下巴：头顶那一段在耳根后面，设定图里耳朵和头是连成一片的，中间没有线 */
function headOutline(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 46, ry / 30.4);
  ctx.beginPath();
  ctx.moveTo(...HEAD_RIM[0]);
  smoothThrough(ctx, HEAD_RIM, DOME_IN, [-DOME_IN[0], DOME_IN[1]]);
  ctx.restore();
}

/**
 * 左耳的形状（头的坐标，也是在原图上描的；右耳左右翻过来画）：从耳根外侧（和脸的轮廓接上）往上，
 * 外沿往外鼓得很圆，绕过圆圆的耳尖，里沿几乎是直的，一直往下藏到卷毛和头后面。
 * 最后两个点是耳根往头里多铺的一块（头后画，平时看不见；耳朵抖、耷拉时补在缝里）
 */
const EAR_PIVOT = [-13.5, -22]; // 抖耳朵、耷拉都绕着耳根中间转
const EAR_RIM = [
  [-22.8, -20.8], [-26.5, -22.7], [-30, -25.2], [-32.8, -27.9], [-35, -30.8], [-36.6, -33.7], [-37.6, -36.7],
  [-38.3, -39.6], [-38.8, -42.6], [-38.6, -45.6], [-38.1, -48.7], [-37, -51.8], [-35.3, -54.8], [-32.9, -57.5],
  [-29.9, -59.6], [-26.3, -60.7], [-22.4, -60.8], [-18.7, -59.9], [-15.3, -58.3], [-12.4, -55.9], [-10.1, -52.9],
  [-8.2, -49.8], [-6.6, -46.4], [-6, -43], [-5.6, -39.6], [-5, -35.5], [-4.6, -31.5], [-4.4, -27],
];
function earPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(...EAR_RIM[0]);
  smoothThrough(ctx, EAR_RIM, [-20, -19.6], [-4.4, -22]);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-21, -8);
  ctx.closePath();
}

/**
 * 大耳朵：竖着、稍微往外歪（右耳多歪一点，耳根上有蝴蝶结），耳尖圆圆的，
 * 中间偏下一大块柔柔的粉色（边上淡淡化开，不描边）。先画耳朵、再画头，耳根藏在头后面。
 * 抖耳朵（earL / earR）、耷拉（earDroop）都绕耳根转；耷拉时往外倒、同时变短一点（耳朵往后贴到背上，从正面看就短了）
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  const droop = clamp(P.earDroop, 0, 1);
  // 洗耳朵时这只耳朵被拉下来（earPull 负数是左耳、正数是右耳）：先往外倒，过了一半就改画在脸前面（drawHeadFront）
  const pull = clamp((P.earPull || 0) * side, 0, 1);
  if (pull >= 0.5) return;
  ctx.save();
  ctx.translate(-lx * 2.5, 0);
  ctx.scale(-side, 1); // 形状是按左耳写的：右耳左右翻过来
  // 翻过来以后，同一个转角看起来是反着转的；这里换算成"看起来往外倒 = 正数"，和别的动物一样
  const outward = (side > 0 ? 0.07 : 0) + droop * 0.6 + side * twitch + pull * 1.9;
  ctx.translate(...EAR_PIVOT);
  ctx.rotate(-outward);
  ctx.scale(1, 1 - droop * 0.42);
  ctx.translate(-EAR_PIVOT[0], -EAR_PIVOT[1]);
  earPath(ctx);
  ctx.fillStyle = creamFill(ctx, -21, -42, 26);
  ctx.fill();
  ctx.save();
  earPath(ctx);
  ctx.clip();
  ctx.translate(-20, -37.3);
  ctx.rotate(-0.17);
  const pink = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
  pink.addColorStop(0, 'rgba(245, 160, 152, 0.95)');
  pink.addColorStop(0.62, 'rgba(247, 178, 170, 0.78)');
  pink.addColorStop(1, 'rgba(250, 200, 192, 0)');
  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 14, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  earPath(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.restore();
}

/**
 * 拉到脸前面的那只耳朵（洗耳朵，见 tricks.js 的 faceWash）：从头顶的耳根往外伸出去，再顺着脸的外侧弯下来，
 * 耳尖一直拉到下巴边、正好在两只前爪那儿。k = 0 刚换到前面（还是往外伸着的样子，和后面那只倒到一半时对得上），
 * 1 = 拉到底。耳根那头不描线，和脑袋连成一片
 */
function drawHeadFront(ctx, P, lx) {
  const pull = clamp(Math.abs(P.earPull || 0), 0, 1);
  if (pull < 0.5) return;
  const side = Math.sign(P.earPull);
  const k = (pull - 0.5) * 2;
  // 中线（三次贝塞尔，按右耳写，左耳翻过来）：拉到一半时几乎是直直往外，拉到底时绕过脸的外侧弯到下巴
  const C = [
    [14, -24],
    [lerp(30, 43, k), lerp(-30, -28, k)],
    [lerp(45, 48, k), lerp(-33, 5, k)],
    [lerp(55, 17, k), lerp(-32, 21, k)],
  ];
  const N = 26;
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
    const tip = t > 0.84 ? Math.sqrt(Math.max(0, (1 - t) / 0.16)) : 1; // 耳尖收圆
    // 刚换到前面时和后面那只一样宽（正面看见整只耳朵），拉下来以后是侧着的，窄一点
    const w = (lerp(12.5, 9, k) + lerp(3.5, 2.5, k) * Math.sin(Math.PI * Math.min(1, t * 1.25))) * tip;
    left.push([px - (ty / len) * w, py + (tx / len) * w]);
    right.push([px + (ty / len) * w, py - (tx / len) * w]);
  }
  const band = (a, b) => {
    // 中线 a…b 这一截（0…1）两边的点围成的形状
    const i0 = Math.round(a * N);
    const i1 = Math.round(b * N);
    ctx.beginPath();
    ctx.moveTo(...left[i0]);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(...left[i]);
    for (let i = i1; i >= i0; i--) ctx.lineTo(...right[i]);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(-lx * 2.5, 0);
  ctx.scale(side, 1);
  band(0, 1);
  ctx.fillStyle = creamFill(ctx, C[2][0], C[2][1], 30);
  ctx.fill();
  // 里面的粉色：沿着中线一长条，两头淡淡化开
  ctx.save();
  band(0, 1);
  ctx.clip();
  ctx.globalAlpha *= 0.85;
  ctx.strokeStyle = '#f6aaa2';
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.beginPath();
  const mid = (t) => {
    const u = 1 - t;
    return [0, 1].map((a) => u * u * u * C[0][a] + 3 * u * u * t * C[1][a] + 3 * u * t * t * C[2][a] + t * t * t * C[3][a]);
  };
  ctx.moveTo(...mid(0.22));
  for (let i = 1; i <= 10; i++) ctx.lineTo(...mid(0.22 + (0.58 * i) / 10));
  ctx.stroke();
  ctx.restore();
  // 轮廓：只描两边和耳尖，耳根那头和脑袋连在一起，不描
  ctx.beginPath();
  ctx.moveTo(...left[2]);
  for (let i = 3; i <= N; i++) ctx.lineTo(...left[i]);
  for (let i = N; i >= 2; i--) ctx.lineTo(...right[i]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  drawFaceExtras(ctx, lx); // 头顶的卷毛再画一遍，压住左耳的耳根（右耳根有蝴蝶结压着）
}

/** 一团毛茸茸（头顶的卷毛、圆尾巴）：一圈挨得很紧的小圆，先全部描边、再全部填色，只剩外面一圈蓬松的轮廓 */
function fluffBall(ctx, puffs, fill) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW * 2;
  for (const [x, y, r] of puffs) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  for (const [x, y, r] of puffs) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, TAU);
    ctx.fill();
  }
}

/** 头顶的一撮卷毛：在两只耳朵中间，从头顶往额头上搭下来一点，几个小圆拼成一朵云（帽子会把它盖住） */
function drawFaceExtras(ctx, lx) {
  ctx.save();
  ctx.translate(lx * 3 - 0.5, -22.5);
  ctx.scale(1.15, 1.15); // 原图里这撮毛差不多 19 × 17（头的坐标）
  fluffBall(ctx, [[-5.6, 1.8, 3.7], [-2.2, -2.6, 4.4], [2.8, -3.4, 4.1], [6.2, 0.6, 3.3], [3.6, 4.2, 3.3], [-1.8, 4.6, 3.6], [0.4, 0.4, 4.4]], creamFill(ctx, 0, 0, 10));
  ctx.strokeStyle = 'rgba(190, 150, 120, 0.5)'; // 卷毛的纹路
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-3.4, 1.4);
  ctx.quadraticCurveTo(-1.2, -1.4, 1.8, 0.2);
  ctx.moveTo(1.2, 3.6);
  ctx.quadraticCurveTo(3, 2.2, 4.6, 3.2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 右耳根上的蝴蝶结：两个粉色的圈、两条短飘带，结上一朵白色五瓣小花（黄色花心）。
 * 戴帽子、节日头饰时不画（draw.js 的 drawHead 里判断）
 */
function drawHeadAccessory(ctx, P, lx) {
  ctx.save();
  ctx.translate(30 + lx * 3, -20);
  ctx.rotate(0.62); // 设定图里蝴蝶结斜着：一个圈朝左上、一个圈朝右下
  ctx.save();
  ctx.scale(1.8, 1.8);
  for (const k of [-1, 1]) {
    ctx.beginPath(); // 飘带
    ctx.moveTo(k * 1.2, 1);
    ctx.lineTo(k * 4.6, 11.5);
    ctx.lineTo(k * 2.2, 10.2);
    ctx.lineTo(k * 0.4, 11.8);
    ctx.closePath();
    ctx.fillStyle = PINK_DARK;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  for (const k of [-1, 1]) {
    ctx.beginPath(); // 两个圈
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(k * 3.5, -8, k * 11.5, -7.5, k * 11, -0.5);
    ctx.bezierCurveTo(k * 10.5, 6, k * 4, 5, 0, 0);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, -7, 0, 6);
    fill.addColorStop(0, '#f8aaa5');
    fill.addColorStop(1, PINK);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath(); // 圈里的褶子
    ctx.moveTo(k * 2.5, -0.5);
    ctx.quadraticCurveTo(k * 6, -2.5, k * 8.5, -1);
    ctx.strokeStyle = 'rgba(190, 70, 70, 0.45)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();
  // 白色小花：五片圆花瓣 + 黄色花心（盖住蝴蝶结的结）
  ctx.scale(1.45, 1.45);
  ctx.fillStyle = '#fffdf8';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    ctx.moveTo(Math.cos(a) * 3.2 + 2.6, Math.sin(a) * 3.2);
    ctx.ellipse(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 2.6, 2.6, 0, 0, TAU);
  }
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 2.6, 2.6, 0, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.7, 1.7, 0, 0, TAU);
  ctx.fillStyle = '#f6cf5a';
  ctx.fill();
  ctx.restore();
}

/**
 * 项圈：脖子上一圈粉色的带子，正前方一个蝴蝶结，结下面挂一颗金铃铛。
 * 画在身体轮廓里面（draw.js 先把身体裁出来），穿上衣时被衣服盖住；过节戴围巾时不画
 */
function drawCollar(ctx, P, g, look) {
  if (look?.neck) return;
  const chinY = g.headCy + Math.cos(P.headTilt) * g.head.ry;
  const x = g.torsoCx + g.facing * 2.4 - Math.sin(P.headTilt) * 20;
  // 设定图里项圈在下巴下面一点、蝴蝶结和铃铛整个露在胸前（太靠上会被大脑袋挡住一半）
  const y = Math.max(chinY + 3.2, g.torsoCy - g.torsoRy * 0.9);
  const w = g.torsoRxBot * 1.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.tan(P.headTilt) * 0.5);
  ctx.beginPath(); // 带子
  ctx.moveTo(-w, -2.5);
  ctx.quadraticCurveTo(0, 2.5, w, -2.5);
  ctx.lineTo(w, 0.5);
  ctx.quadraticCurveTo(0, 5.5, -w, 0.5);
  ctx.closePath();
  ctx.fillStyle = PINK;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.translate(0, 1.8);
  // 设定图里项圈上的蝴蝶结很大（差不多有头宽的四成），铃铛也不小
  for (const k of [-1, 1]) {
    ctx.save();
    ctx.scale(1.95, 1.95);
    ctx.beginPath(); // 蝴蝶结的两个圈
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(k * 2.6, -5.2, k * 8.6, -5, k * 8.2, -0.4);
    ctx.bezierCurveTo(k * 7.8, 4, k * 3, 3.4, 0, 0);
    ctx.closePath();
    ctx.fillStyle = PINK;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }
  ctx.scale(1.45, 1.45);
  // 金铃铛：挂在结下面，身子歪的时候往下垂一点
  ctx.rotate(-P.lean * 0.6);
  const gold = ctx.createRadialGradient(-1.1, 2.6, 0.2, 0, 3.6, 4.2);
  gold.addColorStop(0, '#fff2ad');
  gold.addColorStop(0.55, '#f4cb64');
  gold.addColorStop(1, '#d69c3f');
  ctx.beginPath();
  ctx.ellipse(0, 3.8, 3.7, 3.5, 0, 0, TAU);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.strokeStyle = '#94693b';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3.1, 3.4);
  ctx.quadraticCurveTo(0, 2.4, 3.1, 3.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 4.7, 0.65, 0.65, 0, 0, TAU);
  ctx.fillStyle = '#80583a';
  ctx.fill();
  ctx.beginPath(); // 中间的结（压在铃铛上面）
  ctx.ellipse(0, 0, 2.1, 2.3, 0, 0, TAU);
  ctx.fillStyle = '#f5a39e';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** 肚子：前面一大块更白、更软的毛（设定图的正面站姿里看得出来），边上淡淡化开 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 2;
  const y = g.torsoCy + g.torsoRy * 0.22;
  const rx = g.torsoRxBot * 0.58;
  const ry = g.torsoRy * 0.66;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const belly = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  belly.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  belly.addColorStop(0.65, 'rgba(255, 253, 250, 0.55)');
  belly.addColorStop(1, 'rgba(255, 253, 250, 0)');
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 胶囊形：从 (0,0) 往下到 (0,len) */
function capsulePath(ctx, len, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.lineTo(r, len);
  ctx.arc(0, len, r, 0, Math.PI);
  ctx.closePath();
}

/** 手：短短圆圆的奶白色小手 */
function drawArmShape(ctx, P, g, { len, r }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = creamFill(ctx, 0, len * 0.4, len + r);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
}

/**
 * 后脚：圆圆的大脚丫，站着时脚尖上两道脚趾缝；坐下时脚底朝前（脚变高一点，见 paw.sitHeight），
 * 露出粉色肉垫：一个大肉垫和三个小脚趾（设定图里的样子）
 */
function drawFoot(ctx, P, g, { rx, ry }) {
  // 坐下时脚掌朝前、变大（设定图里坐着时两只大脚掌差不多有头的三分之一宽）；变大以后往上挪，别钻到地下
  const big = 1 + 0.4 * clamp((g.sit - 0.3) / 0.7, 0, 1) * (1 - g.loaf);
  ctx.save();
  ctx.translate(0, -ry * (big - 1));
  rx *= big;
  ry *= big;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.98, ry, 0, 0, TAU);
  ctx.fillStyle = creamFill(ctx, 0, -ry * 0.3, ry * 1.6);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  const show = clamp((g.sit - 0.6) / 0.4, 0, 1) * clamp((0.3 - g.loaf) / 0.3, 0, 1);
  if (show < 0.99) {
    // 站着：脚尖上两道脚趾缝
    ctx.save();
    ctx.globalAlpha *= 1 - show;
    ctx.strokeStyle = '#d2b39c';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const dx of [-0.3, 0.3]) {
      ctx.moveTo(rx * dx, ry * 0.95);
      ctx.lineTo(rx * dx, ry * 0.45);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (show > 0.01) {
    // 坐着：粉色肉垫，一个大的、三个小脚趾
    ctx.globalAlpha *= show;
    ctx.fillStyle = palette.pad;
    const k = rx / 10.5;
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.ellipse(0, 2.4, 4.3, 3.6, 0, 0, TAU);
    ctx.fill();
    for (const [bx, by] of [[-3.9, -3.2], [0, -4.6], [3.9, -3.2]]) {
      ctx.beginPath();
      ctx.ellipse(bx, by, 1.7, 1.9, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * 圆尾巴：一团棉花糖似的小绒球，长在屁股一侧，从身子后面露出一半。
 * 尾巴的姿势参数照样用：翘不翘（tailCurl）只让它高一点低一点，摇尾巴（tail）左右晃一点，
 * 被拎起来（tailHang）往下坠一点；正好在身子后面（tailSide 接近 0）时整个被挡住，不画
 */
function drawTail(ctx, P, g) {
  const side = clamp(P.tailSide, -1, 1);
  const k = Math.abs(side);
  if (k < 0.05) return;
  const s = Math.sign(side);
  const curl = clamp(P.tailCurl + g.sit * 0.2, 0, 1);
  const hang = clamp(P.tailHang || 0, 0, 1);
  const r = 8.8;
  // 站着从正面几乎看不见尾巴（设定图的正面站姿就看不见），只露出一点点绒毛；坐下时搁在身子旁边，露出一大团
  const x = s * (g.torsoRxBot * (0.42 + 0.28 * k + 0.28 * g.sit * (1 - g.loaf)) + 2) + P.tail * 2.5;
  let y = g.tailBaseY + 2 - curl * 4 + hang * 7;
  y = Math.min(y, P.lift - r - 0.5); // 别钻到地面下面去
  const puffs = [[x, y, r * 0.72]];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    puffs.push([x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * (0.5 + 0.07 * Math.sin(i * 2.7))]);
  }
  fluffBall(ctx, puffs, creamFill(ctx, x - 2, y - 2, r * 1.3));
}

export const bunny = {
  id: 'bunny', palette,
  head: { rx: 46, ry: 30.4 }, headPath, headOutline, headFill, torsoFill, drawFoot, drawArmShape,
  earReach: 32, righting: 0.9, longEars: true,
  earSpring: true, // 长耳朵跟着身子晃一晃、弹一下（见 pet.js 的 #earBounce）
  // 坐下时两只手往里搭在肚子上（画在头后面），两只大脚掌朝前
  build: { torso: 1.12, arm: 1.08, armLen: 0.84, foot: 1.16, sitSpread: 2.4, frontLegs: false, restArm: -0.7, foldInset: 6, restInFront: false, restShorten: 0.45, sitBodyWidth: 1.2, bodyHitWidth: 1.05 },
  // 豆豆眼竖着、不大；嘴就在两眼中间、和眼睛下沿一样高（设定图里没有画鼻子）；腮红在眼睛外下方
  // （都是在原图上量的：两只眼睛的中心和大小、嘴的上沿和张开时的下沿、腮红的中心）
  face: { eyeX: 15.4, eyeY: 3.6, eyeRx: 3.4, eyeRy: 4.55, shine: false, noseY: 3.3, mouthDy: 0, mouthW: 6, blushX: 25, blushY: 10.9 },
  paw: { lines: 0, sitHeight: 4, sitLift: 3 },
  drawEar, drawEyeBack: null, drawHeadMarkings: () => {}, drawTorsoMarkings,
  drawNose: null, drawFaceExtras, drawHeadAccessory, drawHeadFront, drawCollar, drawTail,
  gait: 'hop', // 走路是一蹦一蹦的（见 activities.js 的 locomote）
  // 性格：爱蹦、爱跳上窗口，不太爱追鼠标（见 brain.js 的 scores）
  likes: { hopUp: 1.6, hop: 1.5, run: 1.2, chase: 0.75 },
  // 三个招牌动作（见 tricks.js）：开心扭跳、洗脸洗耳朵、摊成兔饼
  tricks: ['binky', 'faceWash', 'flop'],
  snack: 'carrot', // 爱吃的零食（和信里写的一样）：胡萝卜
};
