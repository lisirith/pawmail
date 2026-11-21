// 卡皮巴拉：方方的大脑袋、宽宽的鼻子、头顶两只小圆耳朵、短腿，尾巴几乎看不见。
// 这是初稿（2026-11-20，还没有设定图）：照着猫和熊猫的画风（深棕粗描边、柔和明暗）先画出来，
// 设定图到了以后再对照着改。骨架、关节和猫、熊猫完全一样，所以所有动作、衣服都能直接用。

const INK = '#6b4630'; // 描边
const LW = 1.45;
const palette = {
  outline: INK, fur: '#c99462', furDark: '#a8734a', light: '#e8c497',
  limb: '#c18b59', foot: '#a26e45', pawTip: null, earInner: '#8b5c3b', nose: '#4a3226',
  eye: '#3d2a20', eyeLine: '#3d2a20', eyeRim: null,
  blush: '#f0a58f', blushLine: '#e99a86', pad: '#e8a28f',
  mouthLine: INK, mouthInside: '#d98a73', tongue: '#f2ad98',
};

/** 毛色：左上亮、右下暗，和猫、熊猫一样的柔和明暗 */
function furFill(ctx, x, y, radius) {
  const fill = ctx.createRadialGradient(x, y, radius * 0.06, x + radius * 0.2, y + radius * 0.25, radius);
  fill.addColorStop(0, '#ddab74');
  fill.addColorStop(0.6, '#c99462');
  fill.addColorStop(1, '#b07b4c');
  return fill;
}
function headFill(ctx, rx, ry) {
  return furFill(ctx, -rx * 0.3, -ry * 0.35, rx * 1.3);
}
function torsoFill(ctx, g) {
  return furFill(ctx, g.torsoCx - 10, g.torsoCy - 14, 52);
}

/**
 * 大脑袋：像一个圆圆的枕头，头顶窄一点、比较平，下半张脸（口鼻那一块）往两边鼓出来。
 * 只写右半边的几段曲线，左半边照着镜子画过去，两边一定对称
 */
function headPath(ctx, rx, ry) {
  const right = [
    [0.5, -1.02, 0.8, -0.93, 0.88, -0.55],
    [0.97, -0.25, 1.03, 0.15, 0.98, 0.45],
    [0.93, 0.86, 0.5, 1.03, 0, 1.0],
  ];
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  for (const [a, b, c, d, e, f] of right) ctx.bezierCurveTo(a * rx, b * ry, c * rx, d * ry, e * rx, f * ry);
  // 左半边：同样几段倒着走一遍，x 取反
  const pts = [[0, -1], ...right.map((s) => [s[4], s[5]])];
  for (let i = right.length - 1; i >= 0; i--) {
    const [a, b, c, d] = right[i];
    const [ex, ey] = pts[i];
    ctx.bezierCurveTo(-c * rx, d * ry, -a * rx, b * ry, -ex * rx, ey * ry);
  }
  ctx.closePath();
}

/**
 * 小耳朵：卡皮巴拉的耳朵又小又圆，长在头顶靠外的地方、往两边斜着（太大太靠中间就成了小熊）。
 * 下半截藏在头后面；抖耳朵、耷拉都绕着耳根转
 */
function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(side * 33 - lx * 2, -22);
  ctx.rotate(twitch + side * (0.55 + P.earDroop * 0.55));
  ctx.beginPath();
  ctx.ellipse(0, -4.5, 5.6, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = furFill(ctx, -3, -8, 11);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW;
  ctx.stroke();
  // 耳朵里面深一点
  ctx.beginPath();
  ctx.ellipse(0, -3.8, 2.8, 2.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.earInner;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.restore();
}

/**
 * 脸上的花纹：卡皮巴拉最显眼的是那个又大又钝的口鼻。下半张脸画一块浅色的大口鼻，
 * 上沿是一道淡淡的弧线（看起来鼓出来），边上慢慢过渡到毛色
 */
function drawHeadMarkings(ctx, P, lx, ly, head) {
  const { rx, ry } = head;
  const mx = lx * 5;
  const my = ly * 2.5;
  const cy = ry * 0.56 + my;
  const w = rx * 0.6;
  const h = ry * 0.5;
  const muzzle = ctx.createRadialGradient(mx, cy - 2, 2, mx, cy, w * 1.05);
  muzzle.addColorStop(0, 'rgba(238, 206, 166, 1)');
  muzzle.addColorStop(0.72, 'rgba(232, 196, 152, 0.85)');
  muzzle.addColorStop(1, 'rgba(232, 196, 152, 0)');
  ctx.fillStyle = muzzle;
  ctx.beginPath();
  ctx.ellipse(mx, cy, w * 1.05, h * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // 口鼻上沿一道淡淡的弧线：鼻子那一块是鼓出来的
  ctx.beginPath();
  ctx.moveTo(mx - w * 0.82, cy - h * 0.28);
  ctx.bezierCurveTo(mx - w * 0.6, cy - h * 0.95, mx + w * 0.6, cy - h * 0.95, mx + w * 0.82, cy - h * 0.28);
  ctx.strokeStyle = 'rgba(107, 70, 48, 0.28)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** 宽宽的鼻子：一块圆角的深色，上面两道小鼻孔 */
function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-8.4, -2);
  ctx.bezierCurveTo(-8, -4.6, 8, -4.6, 8.4, -2);
  ctx.bezierCurveTo(9, 1.6, 4.4, 3.6, 0, 3.6);
  ctx.bezierCurveTo(-4.4, 3.6, -9, 1.6, -8.4, -2);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
  // 两道小鼻孔（浅色的弧线）和一点高光
  ctx.strokeStyle = 'rgba(255, 236, 214, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4.8, -1.8);
  ctx.quadraticCurveTo(-3.4, -0.2, -4.4, 1.3);
  ctx.moveTo(4.8, -1.8);
  ctx.quadraticCurveTo(3.4, -0.2, 4.4, 1.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-1.5, -2.6, 2, 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 240, 225, 0.35)';
  ctx.fill();
}

/** 口鼻两边几个小点（胡须根） */
function drawMuzzleDots(ctx, lx, ly) {
  ctx.save();
  ctx.fillStyle = 'rgba(107, 70, 48, 0.45)';
  for (const s of [-1, 1]) {
    for (const [x, y] of [[15, 13], [18, 16], [14.5, 18]]) {
      ctx.beginPath();
      ctx.arc(s * x + lx * 7, y + ly * 4, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 肚子：颜色浅一点，同样是慢慢过渡 */
function drawTorsoMarkings(ctx, P, g) {
  const x = g.torsoCx + g.facing * 3;
  const y = g.torsoCy + g.torsoRy * 0.2;
  const belly = ctx.createRadialGradient(x, y, 2, x, y, g.torsoRxBot * 0.75);
  belly.addColorStop(0, 'rgba(236, 202, 160, 0.9)');
  belly.addColorStop(0.7, 'rgba(230, 192, 148, 0.55)');
  belly.addColorStop(1, 'rgba(230, 192, 148, 0)');
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(x, y, g.torsoRxBot * 0.75, g.torsoRy * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 尾巴：卡皮巴拉的尾巴小到几乎看不见，所以不画。
 * 摇尾巴、尾巴垂下来这些姿势参数照样会变（大家共用一套），只是画出来没有尾巴，不会出怪样子
 */
function drawTail() {}

export const capybara = {
  id: 'capybara', palette,
  head: { rx: 45, ry: 33 }, headPath, headFill, torsoFill,
  earReach: 3, righting: 0.5, // 比猫沉、比熊猫轻：在空中翻正、被拎着晃都在两者之间
  build: { torso: 1.2, arm: 1.2, armLen: 0.86, foot: 1.18, sitSpread: 2.2, frontLegs: true, frontLegInset: 12, sitBodyWidth: 1.2, bodyHitWidth: 1.05 },
  // 眼睛又小又靠两边，口鼻占了下半张脸。眼睛别再往上放：再高的话鸭舌帽、渔夫帽的帽檐会把眼睛整个盖住
  face: { eyeX: 19, eyeY: -3.5, eyeRx: 2.4, eyeRy: 3.3, shine: false, noseY: 9, mouthDy: 3.2, mouthW: 4.6, blushX: 30, blushY: 7 },
  paw: { lines: 3 },
  drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
  drawNose, drawFaceExtras: drawMuzzleDots, drawTail,
  // 性格（见 brain.js 的 scores）：0 = 平常（猫、熊猫），1 = 佛系：少跑少追，多坐多打盹
  calm: 1,
  pace: 0.85, // 走路慢悠悠的（猫、熊猫是 1）
  // 招牌小动作：坐着发呆时，头顶偶尔落下一个橘子（见 activities.js 的 orangeNap、props.js）
  headProp: 'orange',
};
