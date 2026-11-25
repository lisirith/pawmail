// 狐狸：照着 img resource/狐狸与企鹅可爱角色设定表.png 用代码画（2026-11-24，用户用 ChatGPT 生成的设定表，上半张是狐狸）。
// 橘色的毛，下半张脸、胸口和肚子是白的；两只尖尖的大耳朵和脸连成一个轮廓，耳尖是棕色、耳朵里有一团白绒毛；
// 脸又宽又圆，两颊各有一撮往外翘的绒毛尖；豆豆眼正好长在橘色和白色的分界线上，小鼻头、ω 嘴、三道腮红；
// 脖子上一条铁锈红的围巾，右边垂下一截，上面一个白色的爪印（它的招牌，一直戴着；穿上衣、过节戴围巾时收起来）；
// 坐下时两只大脚掌朝前，浅棕色的脚底上是白色的肉垫；身后一条蓬松的大尾巴，尾巴尖是白的。
// 骨架、关节和其他动物完全一样，所以所有动作、衣服都能直接用。
// 头、耳朵、五官的数字是在设定表第二排第一个表情头像（平常的样子）上用脚本逐行、逐列量出来的：
// 以头的中心为原点，脸颊（不算绒毛尖）的半宽当成 45，下巴到额头半高约 33。
import { clamp, lerp } from '../../util/math.js';

const INK = '#683c21'; // 描边：设定图里暖暖的深棕色
const LW = 1.5;
const TAU = Math.PI * 2;
const palette = {
  outline: INK, fur: '#fdbc7a', furDark: '#f2a35e', light: '#fef2e4',
  limb: '#fdbc7a', foot: '#fdbc7a', pawTip: null, earInner: '#fef2e4', nose: '#4e2b15',
  eye: '#5c3319', eyeLine: '#5c3319', eyeRim: null,
  blush: '#f8a08e', blushLine: '#f3907e', pad: '#fef4e7',
  mouthLine: '#5c3319', mouthInside: '#f48c72', tongue: '#f7a48c',
};
const WHITE = '#fef2e4';
const EAR_TIP = '#b27a55'; // 耳尖的棕色
const SCARF = '#d56e48'; // 围巾：铁锈红
const SCARF_DARK = '#b85a39';
const SOLE = '#b8784f'; // 坐下时朝前的脚底：浅棕色

/** 橘色的毛：中间亮，越靠近轮廓越深一点 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#ffcb92');
  fill.addColorStop(0.55, '#fdbc7a');
  fill.addColorStop(1, '#f3a660');
  return fill;
}
/** 白毛：中间最白，往外稍微暖一点 */
function whiteFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  fill.addColorStop(0, '#fff8ef');
  fill.addColorStop(0.65, '#fef0e0');
  fill.addColorStop(1, '#fbe2cb');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, 0, -ry * 0.25, rx * 1.25);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx, g.torsoCy - 6, 50);
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
 * 头（左半边，右半边照镜子）：从耳朵外沿和脸颊接上的地方往下。脸颊先微微鼓出来，然后是一撮往外翘的绒毛：
 * 一个大尖、一个小尖（尖的地方是角，不圆），再圆圆地收到下巴，下巴底边平平的。
 * 三段之间是尖角，所以分成三段，每段自己连成圆滑的曲线
 */
const CHEEK = [[-41.5, -15.5], [-41.4, -11.5], [-43, -8.6], [-44.5, -5.4], [-45.6, -2.6], [-47.8, -0.4], [-50.3, 2], [-52.6, 6.8]];
const TUFT = [[-52.6, 6.8], [-51.2, 9.8], [-49.8, 12], [-50.8, 13.8]];
const JAW = [
  [-50.8, 13.8], [-50.2, 15.6], [-49, 17.6], [-47.4, 19.2], [-44.7, 20.7], [-42.4, 22.4], [-40.3, 24.3], [-37.4, 26.2],
  [-33.8, 28.2], [-29.6, 29.5], [-25.7, 30.4], [-20.6, 31.4], [-15.4, 32.2], [-10.3, 32.8], [-5, 32.95], [0, 32.95],
];
const FOREHEAD = [-7.6, -32]; // 额头（两只耳朵中间的那一小段）的左端，接着耳朵的里沿
const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

/** 左边脸颊到下巴（三段），画笔要先在 CHEEK[0] */
function leftSide(ctx) {
  smoothThrough(ctx, CHEEK, [-41, -20], TUFT[1]);
  smoothThrough(ctx, TUFT, CHEEK[CHEEK.length - 2], JAW[1]);
  smoothThrough(ctx, JAW, TUFT[2], [5, 32.95]);
}
/** 右边：从下巴往上到脸颊（左边倒着走一遍、x 取反） */
function rightSide(ctx) {
  const jaw = mirror(JAW);
  const tuft = mirror(TUFT);
  const cheek = mirror(CHEEK);
  smoothThrough(ctx, jaw, [-5, 32.95], [-TUFT[2][0], TUFT[2][1]]);
  smoothThrough(ctx, tuft, [-JAW[1][0], JAW[1][1]], [-CHEEK[CHEEK.length - 2][0], CHEEK[CHEEK.length - 2][1]]);
  smoothThrough(ctx, cheek, [-TUFT[1][0], TUFT[1][1]], [41, -20]);
}

function headPath(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 33);
  ctx.beginPath();
  ctx.moveTo(0, -31.9);
  ctx.quadraticCurveTo(-4, -31.9, ...FOREHEAD);
  // 耳朵后面（被耳朵盖住，看不见）：从额头斜着往下走到脸颊
  ctx.bezierCurveTo(-18, -30.5, -37.5, -24, ...CHEEK[0]);
  leftSide(ctx);
  rightSide(ctx);
  ctx.bezierCurveTo(37.5, -24, 18, -30.5, -FOREHEAD[0], FOREHEAD[1]);
  ctx.quadraticCurveTo(4, -31.9, 0, -31.9);
  ctx.closePath();
  ctx.restore();
}
/** 轮廓线只描看得见的：额头那一小段、两边的脸颊和下巴（耳朵下面那一段藏着，耳朵和脸连成一个轮廓） */
function headOutline(ctx, rx, ry) {
  ctx.save();
  ctx.scale(rx / 45, ry / 33);
  ctx.beginPath();
  ctx.moveTo(-8.4, -31.6);
  ctx.quadraticCurveTo(0, -32.2, 8.4, -31.6);
  ctx.moveTo(...CHEEK[0]);
  leftSide(ctx);
  rightSide(ctx);
  ctx.restore();
}

/**
 * 左耳（右耳照镜子）：外沿从和脸颊接上的地方几乎直直地往上，绕过圆圆的耳尖，里沿斜着往下接到额头。
 * 最后几个点是往头里多铺的一块（头后画，平时被盖住；抖耳朵、耷拉时补住和头之间的缝）
 */
const EAR_OUT = [
  [-41.5, -15.5], [-40.9, -19], [-40.3, -22.5], [-39.6, -25.8], [-38.9, -28.6], [-38.1, -31.2], [-37.1, -33.8],
  [-36, -36.2], [-34.7, -38.8], [-33.2, -41.2], [-31.3, -43.3], [-29, -44.65], [-26.8, -44.6], [-24.4, -43.2],
  [-21.6, -41.3], [-18.9, -40], [-16.4, -38.7], [-13.6, -36.6], [-10.9, -34.4], [-7.6, -32],
];
const EAR_PIVOT = [-27, -24]; // 抖耳朵、耷拉都绕着耳朵中间转
function earPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(...EAR_OUT[0]);
  smoothThrough(ctx, EAR_OUT, [-41.7, -12], [-5.5, -30]);
  ctx.lineTo(-6, -16);
  ctx.lineTo(-30, -8);
  ctx.closePath();
}
/** 看得见的边：外沿、耳尖、里沿（耳朵下面藏在头后面的那几个点不描） */
function earEdge(ctx) {
  ctx.beginPath();
  ctx.moveTo(...EAR_OUT[0]);
  smoothThrough(ctx, EAR_OUT, [-41.7, -12], [-5.5, -30]);
}
/** 耳朵里那团白绒毛：贴着外沿，里面那一边是几撮往里翘的毛尖 */
const EAR_FLUFF = [
  [-35.6, -35.5], [-37.2, -30.5], [-38.2, -25], [-39.3, -17.5], [-34.5, -16], [-32.2, -20.2], [-30.4, -22.2],
  [-31.6, -24.6], [-28.8, -28.2], [-30.6, -30.4], [-29.8, -34], [-32.4, -36.2],
];

function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  const droop = clamp(P.earDroop, 0, 1);
  ctx.save();
  ctx.translate(-lx * 1.8, 0);
  ctx.scale(-side, 1); // 形状是按左耳写的：右耳左右翻过来
  // 翻过来以后，同一个转角看起来是反着转的；这里换算成"看起来往外倒 = 正数"，和别的动物一样
  ctx.translate(...EAR_PIVOT);
  ctx.rotate(-(droop * 0.55 + side * twitch));
  ctx.translate(-EAR_PIVOT[0], -EAR_PIVOT[1]);
  earPath(ctx);
  ctx.fillStyle = furFill(ctx, -25, -26, 30);
  ctx.fill();
  ctx.save();
  earPath(ctx);
  ctx.clip();
  // 耳尖的棕色：从耳尖往下到斜斜的一条线（外侧低、里侧高），边上柔和
  const tip = ctx.createLinearGradient(-27, -47, -31, -31);
  tip.addColorStop(0, EAR_TIP);
  tip.addColorStop(0.72, EAR_TIP);
  tip.addColorStop(1, 'rgba(178, 122, 85, 0)');
  ctx.fillStyle = tip;
  ctx.beginPath();
  ctx.moveTo(-44, -29);
  ctx.lineTo(-16, -40.5);
  ctx.lineTo(-20, -55);
  ctx.lineTo(-44, -55);
  ctx.closePath();
  ctx.fill();
  // 白绒毛
  ctx.beginPath();
  ctx.moveTo(...EAR_FLUFF[0]);
  for (const p of EAR_FLUFF.slice(1)) ctx.lineTo(...p);
  ctx.closePath();
  ctx.fillStyle = whiteFill(ctx, -36, -24, 14);
  ctx.fill();
  ctx.restore();
  earEdge(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  ctx.restore();
}

/**
 * 脸：下半张脸是白的，上沿差不多和眼睛中间一样高（两边低一点、两眼中间往上拱一点）；
 * 额头正中几道浅浅的深橘色毛纹。跟着视线往那边滑（越靠外滑得越少）
 */
const WHITE_EDGE = [[-60, 3.6], [-40, 3.4], [-24, 3.8], [-14, 2.8], [-7, 0.4], [0, -1]];
function drawHeadMarkings(ctx, P, lx, ly) {
  const mx = lx * 6;
  const my = ly * 3;
  const at = ([x, y], dy = 0) => [x + mx * clamp(1 - Math.abs(x) / 70, 0.2, 1), y + my + dy];
  const region = (dy) => {
    ctx.beginPath();
    const edge = [...WHITE_EDGE, ...mirror(WHITE_EDGE).slice(1)].map((p) => at(p, dy));
    ctx.moveTo(...edge[0]);
    smoothThrough(ctx, edge);
    ctx.lineTo(62, 45);
    ctx.lineTo(-62, 45);
    ctx.closePath();
  };
  ctx.fillStyle = whiteFill(ctx, mx * 0.8, 14 + my, 46);
  ctx.save();
  ctx.globalAlpha *= 0.45; // 分界线是柔和的：先往上挪一点画一层半透明的
  region(-1.6);
  ctx.fill();
  ctx.restore();
  region(0);
  ctx.fill();
  // 额头的毛纹：三道短短的、往下收的深橘色
  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.strokeStyle = '#ec9a55';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const [x, len] of [[-3.6, 6], [0, 8.5], [3.6, 6]]) {
    ctx.moveTo(x * 1.15 + mx * 0.9, -31.5 + my);
    ctx.lineTo(x * 0.75 + mx * 0.9, -31.5 + len + my);
  }
  ctx.stroke();
  ctx.restore();
}

/** 小鼻头：ω 嘴正上方一个小小的深棕色圆点 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.ellipse(0, 0.2, 1.9, 1.4, 0, 0, TAU);
  ctx.fillStyle = palette.nose;
  ctx.fill();
}

/** 身子：和柴犬一样，坐下时屁股（后腿）往两边鼓一点 */
function torsoPath(ctx, g) {
  const x = g.torsoCx, y = g.torsoCy, r = g.torsoRy;
  const sit = g.sit * (1 - g.loaf);
  const w = g.torsoRxBot * lerp(1, 1.13, sit);
  const top = g.torsoRxTop * 1.15;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.bezierCurveTo(x + top, y - r, x + w, y - r * 0.25, x + w, y + r * 0.3);
  ctx.bezierCurveTo(x + w, y + r * 0.85, x + w * 0.6, y + r, x, y + r);
  ctx.bezierCurveTo(x - w * 0.6, y + r, x - w, y + r * 0.85, x - w, y + r * 0.3);
  ctx.bezierCurveTo(x - w, y - r * 0.25, x - top, y - r, x, y - r);
  ctx.closePath();
}

/** 胸口和肚子：中间一大块白毛，从下巴一直到地面，越往下越宽；边上是一圈软软的绒毛尖 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 3;
  const cy = g.torsoCy;
  const r = g.torsoRy;
  const top = cy - r - 4;
  const bottom = cy + r + 4;
  const bib = (w) => {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.46, top);
    ctx.bezierCurveTo(x - w * 0.56, cy - r * 0.35, x - w * 0.82, cy + r * 0.25, x - w * 0.76, bottom);
    ctx.lineTo(x + w * 0.76, bottom);
    ctx.bezierCurveTo(x + w * 0.82, cy + r * 0.25, x + w * 0.56, cy - r * 0.35, x + w * 0.46, top);
    ctx.closePath();
  };
  ctx.fillStyle = whiteFill(ctx, x, cy + r * 0.35, g.torsoRxBot * 1.25);
  ctx.save();
  ctx.globalAlpha *= 0.45;
  bib(g.torsoRxBot * 1.1);
  ctx.fill();
  ctx.restore();
  bib(g.torsoRxBot);
  ctx.fill();
}

/**
 * 围巾：脖子上一圈铁锈红的厚围巾，中间低一点、两头圆圆地绕到脖子后面；右边（看的人的右边）垂下一截，末端一个白色的爪印。
 * 在手臂上面、头下面画（draw.js 的 drawNeck），压住肩膀。穿上衣、过节戴别的围巾时 draw.js 不画它
 */
function drawNeck(ctx, P, g) {
  const chinY = g.headCy + Math.cos(P.headTilt) * g.head.ry;
  const x = g.torsoCx + g.facing * 2.4 - Math.sin(P.headTilt) * 20;
  const y = Math.max(chinY - 3, g.torsoCy - g.torsoRy * 1.05);
  const w = g.torsoRxTop * 1.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.tan(P.headTilt) * 0.5);
  // 垂下来的那一截（先画，压在围巾下面）：跟着身子歪往下垂；翻过身（扑雪时倒立）也是朝下垂
  ctx.save();
  ctx.translate(12.5, 5);
  ctx.rotate(-P.lean * 0.5 - 0.04 - (P.roll || 0) * 0.9);
  ctx.beginPath();
  ctx.moveTo(-6.2, 0);
  ctx.lineTo(6.4, 0);
  ctx.lineTo(7.4, 22.5);
  ctx.quadraticCurveTo(0.8, 24.6, -5.6, 23.2);
  ctx.closePath();
  const end = ctx.createLinearGradient(0, 0, 0, 24);
  end.addColorStop(0, SCARF_DARK);
  end.addColorStop(0.35, SCARF);
  ctx.fillStyle = end;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // 白色爪印：一个大肉垫、三个小脚趾
  ctx.fillStyle = '#fff7ee';
  ctx.beginPath();
  ctx.ellipse(0.9, 16.4, 3, 2.4, 0, 0, TAU);
  ctx.fill();
  for (const [bx, by] of [[-2.1, 12.6], [0.9, 11.4], [3.9, 12.6]]) {
    ctx.beginPath();
    ctx.ellipse(bx, by, 1.15, 1.3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // 绕在脖子上的那一圈：厚厚的，上沿、下沿都往下弯一点，两头圆圆的，下面一道深一点的褶子
  ctx.beginPath();
  ctx.moveTo(-w, -4.5);
  ctx.quadraticCurveTo(0, 1.5, w, -4.5);
  ctx.bezierCurveTo(w + 4.2, -3.6, w + 4.2, 4.4, w, 5.2);
  ctx.quadraticCurveTo(0, 12.2, -w, 5.2);
  ctx.bezierCurveTo(-w - 4.2, 4.4, -w - 4.2, -3.6, -w, -4.5);
  ctx.closePath();
  const band = ctx.createLinearGradient(0, -4, 0, 11);
  band.addColorStop(0, '#de7a53');
  band.addColorStop(1, SCARF_DARK);
  ctx.fillStyle = band;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w * 0.78, 2.6);
  ctx.quadraticCurveTo(0, 8, w * 0.78, 2.6);
  ctx.strokeStyle = 'rgba(150, 60, 30, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
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

/**
 * 手臂 / 前腿：橘色，手尖一小截白色；坐下变成前腿时，上面那一截不描边（看起来是从胸口长出来的）
 */
function drawArmShape(ctx, P, g, { len, r, legs = 0 }) {
  capsulePath(ctx, len, r);
  ctx.fillStyle = furFill(ctx, -r * 0.5, 0, len + r * 1.6);
  ctx.fill();
  const tip = r * 1.5 + 1.5;
  const y0 = len + r - tip;
  ctx.save();
  capsulePath(ctx, len, r);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-r - 1, y0 + 1.2);
  ctx.quadraticCurveTo(0, y0 - 1, r + 1, y0 + 1.2);
  ctx.lineTo(r + 1, len + r + 2);
  ctx.lineTo(-r - 1, len + r + 2);
  ctx.closePath();
  ctx.fillStyle = whiteFill(ctx, 0, len, r * 2.2);
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
}

/**
 * 后脚：站着时是橘色的脚、脚尖一点白；坐下时脚底朝前（脚变高一点，见 paw.sitHeight），
 * 外面一圈橘色、中间浅棕色的脚底，上面一个白色的大肉垫和三个小脚趾（设定图的大坐姿就是这样）
 */
function drawFoot(ctx, P, g, { rx, ry }) {
  const foot = () => {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.92, ry * 0.3);
    ctx.bezierCurveTo(-rx * 1.04, -ry * 0.5, -rx * 0.5, -ry * 1.05, 0, -ry * 1.02);
    ctx.bezierCurveTo(rx * 0.5, -ry * 1.05, rx * 1.04, -ry * 0.5, rx * 0.92, ry * 0.3);
    ctx.bezierCurveTo(rx * 0.86, ry * 0.92, rx * 0.5, ry * 1.0, 0, ry * 1.0);
    ctx.bezierCurveTo(-rx * 0.5, ry * 1.0, -rx * 0.86, ry * 0.92, -rx * 0.92, ry * 0.3);
    ctx.closePath();
  };
  foot();
  ctx.fillStyle = furFill(ctx, 0, -ry * 0.4, rx * 1.4);
  ctx.fill();
  const show = clamp((g.sit - 0.6) / 0.4, 0, 1) * clamp((0.3 - g.loaf) / 0.3, 0, 1);
  ctx.save();
  foot();
  ctx.clip();
  if (show < 0.99) {
    // 站着：脚尖一点白
    ctx.save();
    ctx.globalAlpha *= 1 - show;
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.95, rx * 0.95, ry * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (show > 0.01) {
    // 坐着：浅棕色的脚底 + 白肉垫
    ctx.globalAlpha *= show;
    ctx.fillStyle = SOLE;
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.08, rx * 0.8, ry * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = palette.pad;
    const k = rx / 10.5;
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.ellipse(0, 2.6, 4, 3.3, 0, 0, TAU);
    ctx.fill();
    for (const [bx, by] of [[-4.2, -2.3], [0, -4], [4.2, -2.3]]) {
      ctx.beginPath();
      ctx.ellipse(bx, by, 1.55, 1.7, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  foot();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
}

/**
 * 大尾巴：又粗又蓬松，从屁股一侧往外、往上翘；尾根到中间是橘色，尾巴尖一大截白色，
 * 中间的分界是几撮火苗似的毛尖（设定图里是这样）。
 * 和小熊猫的尾巴一样不压扁：放低（走路、坐着、睡觉，tailCurl 小）时是整条绕着尾根往下转；
 * 被拎起来（tailHang）再往下垂、短一点；低过地面就整条往上抬。换边时变窄，正好在身子后面时不画。
 * 盖着尾巴睡（tailWrap）：尾巴从身后绕到前面，横着搭在脚前，从另一边弯上来，白尾巴尖正好塞在鼻子底下。
 * draw.js 先把整条画在身子前面、头后面，头画完以后再用 part = 'tip' 把尾巴尖那一截画一遍（tailOverHead），压在脸的下半截上。
 * 绕在前面时细一点、尾巴尖收得慢一点（胖胖的一团盖住嘴），也免得低过地面整条被抬高、盖住眼睛
 */
function drawTail(ctx, P, g, part = 'all') {
  const side = clamp(P.tailSide, -1, 1);
  const k = Math.abs(side);
  if (k < 0.05) return;
  const s = Math.sign(side);
  const curl = clamp(P.tailCurl + g.sit * 0.2, 0, 1);
  const hang = clamp(P.tailHang || 0, 0, 1);
  const wrap = clamp(P.tailWrap || 0, 0, 1);
  const turn = ((1 - curl) * 1.0 + hang * 1.25) * (1 - wrap);
  const keep = 1 - 0.12 * hang;
  const sway = P.tail * (1 - 0.8 * wrap);
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  // 尾巴中线（尾根在 0,0；x 往外、y 往上是负数），三次贝塞尔。盖着尾巴睡时换成绕到前面的那条
  const C0 = [[0, 0], [17, 1 * keep], [36 * keep, -13 * keep], [33 * keep, -45 * keep]];
  // 绕到前面：先往外一点，再贴着脚前横过去，最后从另一边圆圆地弯上来，尾巴尖停在鼻子底下
  // （趴着时鼻子大约在尾根上面 33、往另一边 20 的地方）
  const WRAP = [[0, 0], [30, 6], [-82, 4], [-22, -32]];
  const C = C0.map(([x, y], i) => [x + (WRAP[i][0] - x) * wrap, y + (WRAP[i][1] - y) * wrap]);
  const N = 36;
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
    // 粗细：尾根 9，中间最粗 21（设定图里尾巴差不多有半个头那么胖），尾巴尖收成一个圆圆的小尖
    // 绕到前面时换一种粗细：贴着脚前的那段细细的（夹在地面和下巴之间），弯上来盖住嘴的尾巴尖蓬蓬的
    const tip = t > 0.86 ? Math.pow(Math.max(0, (1 - t) / 0.14), 0.75 - 0.35 * wrap) : 1;
    const fat = 9 + 12 * Math.sin(Math.PI * Math.min(1, t * 1.12));
    // （脚前拐上来的那个弯很急，那儿要细，不然弯里面的边会折过来）
    const v = clamp((t - 0.76) / 0.16, 0, 1);
    const w = lerp(fat, 7.5 + 4.5 * v * v * (3 - 2 * v), wrap) * tip;
    const nx = (-ty / len) * w;
    const ny = (tx / len) * w;
    const flex = t * t * sway * 5;
    left.push([px + nx + flex, py + ny]);
    right.push([px - nx + flex, py - ny]);
  }
  const root = [s * 19, g.tailBaseY - 3];
  const place = ([x, y]) => {
    const rx = x * cs - y * sn;
    const ry = x * sn + y * cs;
    return [root[0] + s * rx * (0.55 + 0.45 * k), root[1] + ry];
  };
  let L = left.map(place);
  let R = right.map(place);
  const lowest = Math.max(...L.map((p) => p[1]), ...R.map((p) => p[1]));
  // 低过地面就整条抬高。身子翻过来的时候（扑雪倒立，roll）不管：那时候身子自己的"下面"已经不是地面了
  const over = Math.abs(P.roll || 0) < 0.3 ? lowest - (P.lift - 1) : 0;
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
  if (part === 'tip') {
    // 只画尾巴尖那一截（中线 0.45 以后，从脚前面正中开始往上弯的那段）：照样整条画，但只留下这一截里面的部分。
    // 接缝在头的外面，那儿两遍画出来一模一样，所以看不出来；裁的范围往外放宽一点，把描边也包进来
    const i0 = Math.round(N * 0.45);
    const grow = (a, b, d = 1.6) => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const len = Math.hypot(dx, dy);
      return len > 0.01 ? [a[0] + (dx / len) * d, a[1] + (dy / len) * d] : a;
    };
    const end = [(L[N][0] + R[N][0]) / 2, (L[N][1] + R[N][1]) / 2];
    const before = [(L[N - 2][0] + R[N - 2][0]) / 2, (L[N - 2][1] + R[N - 2][1]) / 2];
    ctx.beginPath();
    ctx.moveTo(...grow(L[i0], R[i0]));
    for (let i = i0 + 1; i < N; i++) ctx.lineTo(...grow(L[i], R[i]));
    ctx.lineTo(...grow(end, before, 2.5)); // 尾巴尖再往前一点
    for (let i = N - 1; i >= i0; i--) ctx.lineTo(...grow(R[i], L[i]));
    ctx.closePath();
    ctx.clip();
  }
  outline();
  const mid = L[Math.round(N * 0.45)];
  ctx.fillStyle = furFill(ctx, mid[0], mid[1], 46);
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // 白尾巴尖：从中线 0.6 往后都是白的；分界线是几撮火苗似的毛尖，尖朝尾根。
  // 绕到前面时尾巴拉得长，白的从 0.75 开始（贴着脚前的那段还是橘色，弯上来的那段是白的）
  const T0 = 0.6 + 0.15 * wrap;
  const at = (t, f) => {
    // 中线 t 处、横着第 f 处（-1 左边沿 … 1 右边沿）
    const i = clamp(t, 0, 1) * N;
    const i0 = Math.floor(i);
    const i1 = Math.min(N, i0 + 1);
    const m = i - i0;
    const l = [lerp(L[i0][0], L[i1][0], m), lerp(L[i0][1], L[i1][1], m)];
    const r = [lerp(R[i0][0], R[i1][0], m), lerp(R[i0][1], R[i1][1], m)];
    const q = (f + 1) / 2;
    return [lerp(l[0], r[0], q), lerp(l[1], r[1], q)];
  };
  // 白色那块顺着尾巴的两条边走（尾巴弯得厉害时，直接连到尾巴尖会漏掉弯出去的那一块）
  const iT = Math.round(T0 * N);
  ctx.beginPath();
  ctx.moveTo(...at(1, -1.2));
  for (let i = N; i >= iT; i--) ctx.lineTo(...at(i / N, -1.3));
  const flames = 4;
  for (let j = 0; j < flames; j++) {
    const f0 = -1 + (2 * j) / flames;
    const f1 = -1 + (2 * (j + 1)) / flames;
    ctx.lineTo(...at(T0 - 0.13 - 0.04 * (j % 2), (f0 + f1) / 2)); // 毛尖往尾根伸
    ctx.lineTo(...at(T0 + 0.02, f1));
  }
  for (let i = iT; i <= N; i++) ctx.lineTo(...at(i / N, 1.3));
  ctx.closePath();
  ctx.fillStyle = whiteFill(ctx, ...at(0.85, 0), 22);
  ctx.fill();
  ctx.restore();
  outline();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

export const fox = {
  id: 'fox', palette,
  head: { rx: 45, ry: 33 }, headPath, headOutline, headFill, torsoFill, torsoPath, drawFoot, drawArmShape,
  earReach: 15, righting: 0.8, // 轻巧：在空中翻正、被拎着晃都接近猫
  // 圆滚滚的身子；坐下时两只手垂在肚子两边（手藏在大脚掌后面），两只大脚掌朝前露出脚底（设定图的大坐姿）
  // 坐着歇着时手缩短一截（restShorten，见 draw.js 的 drawArm），爪子停在脚掌上面、不盖住脚底
  // restInFront: false = 坐着时手照样画在头和围巾后面（不像熊猫那样压到下巴前面）
  build: { torso: 1.2, arm: 1.02, armLen: 0.95, foot: 1.22, sitSpread: 1.2, frontLegs: false, restArm: -0.12, restInFront: false, restShorten: 0.4, sitBodyWidth: 1.3, bodyHitWidth: 1.1 },
  // 豆豆眼长得比较开、正好在橘色和白色的分界线上；鼻头在 ω 嘴的正上方；三道腮红在两颊的绒毛里面
  face: { eyeX: 16.3, eyeY: 0.2, eyeRx: 3.7, eyeRy: 5.4, shine: false, noseY: 4.4, mouthDy: -0.6, mouthW: 6.2, mouthDepth: 1.1, blushX: 27.5, blushY: 8.6 },
  paw: { lines: 0, sitHeight: 4.6, sitLift: 3.5 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: null, drawNeck, drawTail,
  // 睡觉时都用大尾巴盖住鼻子（尾巴尖压在脸的下半截上，见 drawTail）
  tailWrap: true, tailOverHead: true,
  snack: 'grapes', // 爱吃的零食（和信里写的一样）：葡萄
  // 机灵好奇、爱蹦跳：多蹦、多追着鼠标玩，散步也多一点；不太爱坐着发呆
  likes: { hop: 1.6, chase: 1.25, walk: 1.15, run: 1.1, sit: 0.85 },
  tricks: ['pounce', 'buryGrapes', 'tailNap'],
};
