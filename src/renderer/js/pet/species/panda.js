// 熊猫。和猫共用同一套身体骨架，只有配色、耳朵、黑眼圈、尾巴不同。

const DARK = '#2f2c36';

const palette = {
  outline: DARK,
  fur: '#fcfbf7',
  furDark: DARK,
  light: '#fcfbf7',
  limb: DARK, // 黑手
  foot: DARK, // 黑脚
  pawTip: null,
  earInner: null,
  nose: '#1f1d24',
  eye: '#0e0d12',
  eyeLine: '#f1eff5', // 黑眼圈里的闭眼、笑眼要用浅色线才看得见
  eyeRim: '#66626f', // 眼珠外面一圈淡淡的边，让眼珠和黑眼圈分得开
  blush: '#ffb1b4',
  pad: '#77727f',
  mouthLine: DARK,
  mouthInside: '#8d3f3b',
  tongue: '#ff9aa4',
};

function drawEar(ctx, side, P, lx) {
  const twitch = side < 0 ? P.earL : P.earR;
  ctx.save();
  ctx.translate(side * 29.5 - lx * 2.5 + twitch * 5 * side, -27.5 + P.earDroop * 5 - Math.abs(twitch) * 2.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 12.2 * (1 - P.earDroop * 0.18), side * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
}

/** 黑眼圈：画在眼睛下面一层。调用时原点已经在眼睛中心。 */
function drawEyeBack(ctx, side, narrow) {
  ctx.beginPath();
  // 上端靠近鼻子、下端向外，这样才是熊猫那种"八字"眼圈
  ctx.ellipse(side * 1.6, 1.8, 10.2 * narrow, 13, -side * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
}

function drawHeadMarkings() {
  // 熊猫头上没有别的花纹
}

/** 肩膀上的黑带。调用时已经裁剪在身体轮廓之内。 */
function drawTorsoMarkings(ctx, P, g) {
  const y = g.torsoCy - g.torsoRy * 0.3;
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.moveTo(-60, -200);
  ctx.lineTo(60, -200);
  ctx.lineTo(60, y - 3);
  ctx.quadraticCurveTo(0, y + 7, -60, y - 3);
  ctx.closePath();
  ctx.fill();
}

function drawNose(ctx) {
  ctx.beginPath();
  ctx.moveTo(-4.3, -2);
  ctx.quadraticCurveTo(0, -3.2, 4.3, -2);
  ctx.quadraticCurveTo(3.6, 1.6, 0, 2.6);
  ctx.quadraticCurveTo(-3.6, 1.6, -4.3, -2);
  ctx.closePath();
  ctx.fillStyle = palette.nose;
  ctx.fill();
}

/** 小圆尾巴 */
function drawTail(ctx, P, g) {
  ctx.beginPath();
  ctx.ellipse(P.tailSide * 23 + P.tail * 2.5, g.tailBaseY + 1.5, 7.2, 6.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.fur;
  ctx.fill();
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2.6;
  ctx.stroke();
}

export const panda = {
  id: 'panda',
  palette,
  head: { rx: 41, ry: 34 },
  earReach: 8,
  // 熊猫笨一点，掉下来不太会翻正
  righting: 0.35,
  drawEar,
  drawEyeBack,
  drawHeadMarkings,
  drawTorsoMarkings,
  drawNose,
  drawFaceExtras: null,
  drawTail,
};
