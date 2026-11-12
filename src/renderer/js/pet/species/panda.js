// 熊猫。造型照着 img resource 里的设定图画：宽宽的大头、两颊毛茸茸，
// 八字形的大黑眼圈里是白色的小椭圆眼睛，小小的鼻子，身体圆滚滚、手脚粗粗的，脚底是粉色肉垫。
// 和猫共用同一套身体骨架，只是"胖一圈"（见 build）。

const DARK = '#4f4240'; // 黑色部分：带一点暖色的深灰，不是纯黑

const palette = {
  outline: '#47342d',
  fur: '#fdf4ea', // 奶白色
  furDark: DARK,
  light: '#fdf4ea',
  limb: DARK, // 黑手
  foot: DARK, // 黑脚
  pawTip: null,
  earInner: null,
  nose: '#43332d',
  eye: '#fdf7f0', // 眼睛是黑眼圈里的白色小椭圆
  eyeLine: '#f8efe6', // 黑眼圈里的闭眼、笑眼要用浅色线才看得见
  eyeRim: null,
  blush: '#f3a597',
  blushLine: '#ec9585',
  pad: '#e39c8e', // 粉色肉垫
  mouthLine: '#47342d',
  mouthInside: '#e48f7e',
  tongue: '#f4b3a5',
};

/** 圆耳朵：长在头的左上、右上，有一半藏在头后面 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(side * 29.5 - lx * 2.5 + twitch * 5 * side, -24.5 + P.earDroop * 5 - Math.abs(twitch) * 2.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, 13.6, 12.8 * (1 - P.earDroop * 0.18), side * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
}

/**
 * 头的轮廓：和默认的年糕形一样，只是两颊下半部分毛茸茸的（一小簇一小簇往外鼓）。
 * 做法：先把年糕形的轮廓拆成很多个点，到了脸颊那一段，每几个点连成一个往外鼓的小弧。
 */
function fluffyHeadPath(ctx, rx, ry) {
  const curves = [
    [[0, -ry], [0.62 * rx, -ry], [rx, -0.56 * ry], [rx, 0.08 * ry]],
    [[rx, 0.08 * ry], [rx, 0.72 * ry], [0.6 * rx, ry], [0, ry]],
    [[0, ry], [-0.6 * rx, ry], [-rx, 0.72 * ry], [-rx, 0.08 * ry]],
    [[-rx, 0.08 * ry], [-rx, -0.56 * ry], [-0.62 * rx, -ry], [0, -ry]],
  ];
  const pts = [];
  const N = 24;
  for (const [a, b, c, d] of curves) {
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const u = 1 - t;
      pts.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]);
    }
  }
  const fluffy = (p) => p[1] > 0.05 * ry && p[1] < 0.8 * ry && Math.abs(p[0]) > 0.55 * rx;
  const TUFT = 3; // 每一小簇跨几个点
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  let i = 0;
  while (i < pts.length) {
    const p = pts[i];
    const q = pts[Math.min(i + TUFT, pts.length) % pts.length];
    if (fluffy(p) && fluffy(q)) {
      // 往外鼓的小弧：控制点在两点中间，再沿着"离开头中心"的方向推出去一点
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      const len = Math.hypot(mx / rx, my / ry) || 1;
      const push = 2;
      ctx.quadraticCurveTo(mx + (mx / rx / len) * push, my + (my / ry / len) * push, q[0], q[1]);
      i += TUFT;
    } else {
      const next = pts[(i + 1) % pts.length];
      ctx.lineTo(next[0], next[1]);
      i += 1;
    }
  }
  ctx.closePath();
}

/**
 * 黑眼圈：横着的大椭圆，靠鼻子那头高、外侧低（八字形），眼睛在它靠里的一侧。
 * 画在眼睛下面一层。调用时原点已经在眼睛中心。
 */
function drawEyeBack(ctx, side, narrow) {
  ctx.beginPath();
  ctx.ellipse(side * 5 * narrow, -0.4, 12.4 * narrow, 9.4, side * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
}

function drawHeadMarkings() {
  // 熊猫头上没有别的花纹
}

/** 肩膀上的黑带。调用时已经裁剪在身体轮廓之内。 */
function drawTorsoMarkings(ctx, P, g) {
  const y = g.torsoCy - g.torsoRy * 0.28;
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.moveTo(-80, -200);
  ctx.lineTo(80, -200);
  ctx.lineTo(80, y - 3);
  ctx.quadraticCurveTo(0, y + 8, -80, y - 3);
  ctx.closePath();
  ctx.fill();
}

/** 小小的黑鼻子 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.ellipse(0, 0, 2.5, 1.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.nose;
  ctx.fill();
}

/** 小圆尾巴 */
function drawTail(ctx, P, g) {
  ctx.beginPath();
  ctx.ellipse(P.tailSide * 26 + P.tail * 2.5, g.tailBaseY + 1.5, 7.4, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.fur;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

export const panda = {
  id: 'panda',
  palette,
  head: { rx: 45, ry: 33.5 },
  headPath: fluffyHeadPath,
  earReach: 5,
  // 熊猫笨一点，掉下来不太会翻正
  righting: 0.35,
  // 身材：和猫同一副骨架，只是身体宽一圈、手脚粗一圈，手臂短短的
  build: { torso: 1.24, arm: 1.36, armLen: 0.82, foot: 1.32, sitSpread: 5, frontLegs: false },
  // 五官：眼睛（白色小椭圆）靠近鼻子，黑眼圈往外偏；鼻子小小的，嘴就在鼻子下面
  face: { eyeX: 11.5, eyeY: 4, eyeRx: 2.7, eyeRy: 4.3, shine: false, noseY: 6, mouthDy: 1, mouthW: 5.6, blushX: 26, blushY: 12.5 },
  paw: { pads: 4 }, // 坐下时露出粉色肉垫：一个大的、四个小脚趾
  drawEar,
  drawEyeBack,
  drawHeadMarkings,
  drawTorsoMarkings,
  drawNose,
  drawFaceExtras: null,
  drawTail,
};
