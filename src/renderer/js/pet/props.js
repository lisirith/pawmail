// 宠物身上偶尔出现的小东西（不是衣服，也不是节日装扮）。现在只有一个：卡皮巴拉头顶的橘子。
// 宠物身上（draw.js）和掉下来的那一下（fx.js 的 orange）用的是同一个画法。

const INK = '#7a4a2c';

/** 一个小橘子：原点在橘子中心，r 是半径。橘子蒂在上面，带一片小叶子 */
export function drawOrange(ctx, r = 10) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 橘子本身：稍微扁一点，左上亮、右下暗
  const fill = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
  fill.addColorStop(0, '#ffd27a');
  fill.addColorStop(0.55, '#f8a440');
  fill.addColorStop(1, '#e5852a');
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 橘子皮上的几个小点
  ctx.fillStyle = 'rgba(200, 105, 30, 0.35)';
  for (const [x, y] of [[0.35, 0.15], [-0.15, 0.4], [0.5, -0.25], [-0.45, 0.05]]) {
    ctx.beginPath();
    ctx.arc(x * r, y * r, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  // 高光
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.38, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 248, 225, 0.75)';
  ctx.fill();
  // 蒂和小叶子
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.92);
  ctx.lineTo(0.5, -r * 1.12);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.5, -r * 1.05);
  ctx.bezierCurveTo(r * 0.3, -r * 1.45, r * 0.85, -r * 1.35, r * 0.95, -r * 1.12);
  ctx.bezierCurveTo(r * 0.6, -r * 0.92, r * 0.25, -r * 0.92, 0.5, -r * 1.05);
  ctx.closePath();
  ctx.fillStyle = '#8cc46a';
  ctx.fill();
  ctx.strokeStyle = '#4f7a3a';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}
