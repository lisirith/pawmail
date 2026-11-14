// 橘猫与招财猫共用这一份轮廓和动作，花色只改变填色、花纹与项圈。
import { lerp, clamp } from '../../util/math.js';

const LW = 1.45;
function createCat(coatId = 'tabby') {
  const lucky = coatId === 'lucky';
  const palette = {
    outline: '#795137', fur: '#fac17f', furDark: '#d99552', light: '#fff3e5',
    limb: '#fac17f', foot: '#fff3e5', pawTip: '#fff3e5', earInner: '#f7c2ad',
    eye: '#70452f', eyeLine: '#70452f', eyeRim: null,
    blush: '#f4b19c', blushLine: '#f0ab99', pad: '#efa59c',
    mouthLine: '#795039', mouthInside: '#e59a7c', tongue: '#f8b598',
  };
  if (lucky) Object.assign(palette, {
    fur: '#fff6eb', light: '#fff6eb', limb: '#fff6eb', foot: '#fff6eb', pawTip: '#fff6eb',
    furDark: '#efb778', eye: '#685044', eyeLine: '#685044', mouthLine: '#795137',
  });

  function patchWash(ctx, dark = false) {
    const wash = ctx.createLinearGradient(-25, -42, 30, 12);
    wash.addColorStop(0, dark ? '#ae9a8c' : '#ffd094');
    wash.addColorStop(1, dark ? '#8d796c' : '#edaf6b');
    return wash;
  }

  function furWash(ctx, x, y, radius) {
    if (lucky) return creamWash(ctx, y - radius * 0.6, y + radius * 0.7);
    const wash = ctx.createRadialGradient(x, y, radius * 0.08, x + radius * 0.18, y + radius * 0.2, radius);
    wash.addColorStop(0, '#ffd39a');
    wash.addColorStop(0.58, '#fac17f');
    wash.addColorStop(1, '#efae6b');
    return wash;
  }
  function creamWash(ctx, top, bottom) {
    const wash = ctx.createLinearGradient(-12, top, 16, bottom);
    wash.addColorStop(0, '#fff8ee');
    wash.addColorStop(0.68, '#fff1e2');
    wash.addColorStop(1, '#f6e4d1');
    return wash;
  }
  function headFill(ctx, rx, ry) { return lucky ? null : furWash(ctx, -rx * 0.3, -ry * 0.28, rx * 1.25); }

  // 仅拆分原左颊曲线靠耳根的一小段，让接点上下都沿竖向相切。
  // 中下脸颊仍沿原曲线，避免顺耳根时顺带改变脸型。
  function leftCheekToEar(ctx, fillInset = 0) {
    ctx.bezierCurveTo(-47.348, 12.954, -46.4936, 5.6468, -44.07248, -1.42616);
    ctx.bezierCurveTo(-43.4672, -3.1944, -42.03 + fillInset, -4.948, -42.03 + fillInset, -6.66);
  }

  // 宽脸的体积在下半部：额头较窄，脸颊向外鼓，收进柔软的平下巴。
  function headPath(ctx, rx, ry) {
    ctx.save(); ctx.scale(rx / 44, ry / 31);
    ctx.beginPath();
    ctx.moveTo(0, -32.5);
    ctx.bezierCurveTo(15, -33, 35, -25, 42.03, -6.66);
    ctx.bezierCurveTo(45.7, 1.9, 48.6, 11.5, 42.34, 18.77);
    ctx.bezierCurveTo(35, 27, 16, 32, 0, 31);
    // 左颊沿用右颊的圆弧，去掉描蓝线时留下的平段和转折。
    ctx.bezierCurveTo(-16, 32, -35, 27, -42.34, 18.77);
    // 填色在接点处藏入描边内，避免盖掉半条耳线，留下粗细不一的小圆帽。
    leftCheekToEar(ctx, 0.65);
    ctx.bezierCurveTo(-40, -21, -18, -34, 0, -32.5);
    ctx.closePath();
    ctx.restore();
  }
  // 耳根没有横向接缝；额顶和脸颊的线分开画，耳朵与脸连成一个轮廓。
  function headOutline(ctx, rx, ry) {
    ctx.save(); ctx.scale(rx / 44, ry / 31);
    ctx.beginPath();
    ctx.moveTo(-13.8, -30.21);
    ctx.bezierCurveTo(-7, -33.5, 1.6, -33.8, 10.68, -29.97);
    ctx.moveTo(42.03, -6.66);
    ctx.bezierCurveTo(45.7, 1.9, 48.6, 11.5, 42.34, 18.77);
    ctx.bezierCurveTo(36, 26, 27, 29, 18.48, 30.38);
    ctx.moveTo(-18.48, 30.38);
    ctx.bezierCurveTo(-27, 29, -36, 26, -42.34, 18.77);
    leftCheekToEar(ctx);
    ctx.restore();
  }

  function drawEar(ctx, side, P, lx) {
    const twitch = side < 0 ? P.earL : P.earR;
    const short = side < 0 ? 2.8 : 0;
    const inEar = (makePath) => {
      ctx.save();
      ctx.translate(-lx * 1.7, 0);
      ctx.translate(side * 29, -17);
      ctx.rotate(side * P.earDroop * 0.6 + twitch);
      ctx.translate(-side * 29, 17);
      makePath();
      ctx.restore();
    };
    const edge = () => {
      ctx.beginPath();
      if (side < 0) {
        // 只把弯钩上方的耳朵下段往中线收 4%，顺接到已固定的耳根。
        const lowerWidth = 0.96;
        ctx.moveTo(-13.8, -30.21);
        ctx.bezierCurveTo(-22, -35.7, -30, -41, -36.01, -42.57);
        ctx.bezierCurveTo(-40, -43.2, -44.9 * lowerWidth, -25, -45.37 * lowerWidth, -19.26);
        ctx.bezierCurveTo(-46.5 * lowerWidth, -10.8, -42.03, -9.4, -42.03, -6.66);
      } else {
        ctx.moveTo(10.68, -29.97);
        ctx.bezierCurveTo(19, -37, 31, -45.6, 36.5, -44.5);
        ctx.bezierCurveTo(42.5, -44, 46.2, -22, 42.03, -6.66);
      }
    };
    inEar(() => {
      edge(); ctx.lineTo(side * 13, -29.6); ctx.closePath();
    });
    // 路径已经记住耳朵变换，填色回到头部坐标，耳根才没有渐变色接缝。
    ctx.fillStyle = lucky ? patchWash(ctx, side > 0) : headFill(ctx, 44, 31); ctx.fill();
    inEar(edge);
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = LW;
    ctx.stroke();
    // 耳内是有厚度的弧边耳瓣，不是缩小的三角形。
    inEar(() => {
      ctx.scale(side, 1);
      ctx.beginPath(); ctx.moveTo(24, -25.5);
      ctx.bezierCurveTo(27.5, -31.5, 32.8, -38.6 + short, 35.2, -38.8 + short);
      ctx.bezierCurveTo(38.1, -39.5 + short, 40.6, -27, 40.8, -16.4);
      ctx.bezierCurveTo(37, -20.5, 29.8, -24.4, 24, -25.5);
    });
    const pink = ctx.createLinearGradient(29, -38, 38, -16);
    pink.addColorStop(0, '#f9c9b7'); pink.addColorStop(1, '#ffdfc8');
    ctx.fillStyle = pink;
    ctx.fill();
  }

  function drawHeadMarkings(ctx, P, lx, ly, head) {
    const { rx, ry } = head;
    const mx = lx * 4.5, my = ly * 2;
    if (lucky) {
      // 对照多角度设定：左橘、右灰褐，中央留一条奶白色额头。
      ctx.save(); ctx.translate(mx * 0.35, my * 0.25);
      // 先铺与耳朵相连的两块色，再画中央白毛，避免耳根露出白底细缝。
      ctx.fillStyle = patchWash(ctx); ctx.fillRect(-55, -55, 55, 105);
      ctx.fillStyle = patchWash(ctx, true); ctx.fillRect(0, -55, 55, 105);
      ctx.beginPath(); ctx.moveTo(-55, -13);
      ctx.bezierCurveTo(-48, -8, -38, -10, -29, -13);
      ctx.bezierCurveTo(-12, -18, -3, -30, -4, -55); ctx.lineTo(9, -55);
      ctx.bezierCurveTo(9, -42, 9, -33, 12, -27);
      ctx.bezierCurveTo(18, -17, 35, -8, 54, -9);
      ctx.lineTo(55, 50); ctx.lineTo(-55, 50); ctx.closePath();
      ctx.fillStyle = creamWash(ctx, -38, 45); ctx.fill(); ctx.restore();
      return;
    }
    // 宽额纹有不同的长度、方向和尖端，顺着额头弯下来。
    ctx.fillStyle = palette.furDark;
    for (const [x, width, length, bend] of [[-9.3, 5.3, 13.7, 1.6], [0.4, 5.8, 14.9, -0.7], [10.3, 5.4, 12.7, -2.5]]) {
      const px = x + lx * 3.5;
      ctx.beginPath();
      ctx.moveTo(px - width * 0.58, -ry - 3);
      ctx.bezierCurveTo(px - width * 0.65, -ry + 3, px + bend - width * 0.4, -ry + length, px + bend, -ry + length);
      ctx.bezierCurveTo(px + bend + width * 0.55, -ry + length + 0.3, px + width * 0.48, -ry + 2.5, px + width * 0.68, -ry - 3);
      ctx.closePath(); ctx.fill();
    }
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(mx * 0.3, my); ctx.scale(side, 1);
      ctx.beginPath(); ctx.moveTo(rx + 3, 0);
      ctx.bezierCurveTo(rx - 7, -4, rx - 9, -0.3, rx - 4, 2.4);
      ctx.lineTo(rx + 3, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // 白色面罩与原图一样从眉间向两颊落下，没有硬边椭圆口鼻罩。
    ctx.beginPath();
    ctx.moveTo(-rx - 5, 17 + my);
    ctx.bezierCurveTo(-rx * 0.8 + mx, 9 + my, -19 + mx, 8 + my, -9 + mx, -0.7 + my);
    ctx.bezierCurveTo(-4.8 + mx, -4.1 + my, -1.6 + mx, -8.3 + my, mx, -8.5 + my);
    ctx.bezierCurveTo(2.3 + mx, -8.6 + my, 4.2 + mx, -4.4 + my, 9 + mx, -1.3 + my);
    ctx.bezierCurveTo(20 + mx, 6.7 + my, rx * 0.78 + mx, 9.3 + my, rx + 5, 17 + my);
    ctx.lineTo(rx + 5, ry + 5); ctx.lineTo(-rx - 5, ry + 5); ctx.closePath();
    ctx.fillStyle = creamWash(ctx, -8, ry + 10); ctx.fill();
  }

  function torsoPath(ctx, g) {
    const x = g.torsoCx, y = g.torsoCy, r = g.torsoRy, w = g.torsoRxBot;
    const sit = g.sit * (1 - g.loaf);
    // 坐姿由肩背的长弧过渡到外鼓的臀腿，最宽处在腰胯，不在脚底。
    const back = lerp(1, 1.29, sit);
    const chest = lerp(1, 1.18, sit);
    ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.bezierCurveTo(x + w * lerp(0.66, 0.76, sit), y - r * 1.12, x + w * back * 0.92, y - r * lerp(0.6, 0.5, sit), x + w * back, y + r * lerp(-0.02, 0.24, sit));
    ctx.bezierCurveTo(x + w * back * lerp(1.09, 1.02, sit), y + r * 0.5, x + w * back * lerp(0.94, 0.99, sit), y + r * 0.87, x + w * lerp(0.66, 0.88, sit), y + r * 0.97);
    ctx.bezierCurveTo(x + w * 0.36, y + r * 1.04, x + w * 0.16, y + r, x, y + r);
    ctx.bezierCurveTo(x - w * 0.36, y + r * 1.02, x - w * chest * 0.89, y + r * 1.03, x - w * chest, y + r * 0.57);
    ctx.bezierCurveTo(x - w * chest * 1.07, y + r * 0.25, x - w * chest * 0.98, y - r * 0.26, x - w * chest * 0.76, y - r * 0.56);
    ctx.bezierCurveTo(x - w * 0.56, y - r * 0.91, x - w * 0.32, y - r * 1.02, x, y - r); ctx.closePath();
  }

  function drawTorsoMarkings(ctx, P, g) {
    ctx.fillStyle = furWash(ctx, -8, g.torsoCy - 13, 48);
    ctx.fillRect(-60, g.torsoCy - g.torsoRy - 5, 120, g.torsoRy * 2 + 10);
    if (lucky) {
      // 三花斑只落在腰侧，腹部与四爪保持奶白色。
      const w = g.torsoRxBot, y = g.torsoCy;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(g.torsoCx, y); ctx.scale(side, 1);
        ctx.beginPath(); ctx.moveTo(w * 1.5, -5);
        ctx.bezierCurveTo(w * 0.8, -10, w * 0.67, -2, w * 0.83, 6);
        ctx.bezierCurveTo(w * 0.95, 12, w * 1.27, 12, w * 1.5, 9); ctx.closePath();
        ctx.fillStyle = patchWash(ctx, side > 0); ctx.fill(); ctx.restore();
      }
      return;
    }
    const x = g.torsoCx + g.facing * 3, y = g.torsoCy, r = g.torsoRy;
    ctx.fillStyle = palette.furDark;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, 1);
      for (const dy of [-10, 2]) {
        const edge = g.torsoRxBot * (1 + g.sit * (1 - g.loaf) * 0.31) + 4;
        ctx.beginPath(); ctx.moveTo(edge, dy - 8);
        ctx.bezierCurveTo(edge - 10, dy - 9, 11, dy - 1, 13, dy + 1.5);
        ctx.bezierCurveTo(16, dy + 5, edge - 5, dy - 1.5, edge, dy - 3.5);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(x - 9, y - r - 2);
    ctx.bezierCurveTo(x - 18, y - r * 0.55, x - 12, y - r * 0.25, x - 6.5, y + r * 0.11);
    ctx.bezierCurveTo(x - 5, y + r * 0.4, x - 11, y + r * 0.77, x - 13, y + r + 3);
    ctx.lineTo(x + 14, y + r + 3);
    ctx.bezierCurveTo(x + 10, y + r * 0.47, x + 6, y + r * 0.31, x + 8, y - r * 0.04);
    ctx.bezierCurveTo(x + 12, y - r * 0.45, x + 17, y - r * 0.67, x + 11, y - r - 2);
    ctx.closePath(); ctx.fillStyle = creamWash(ctx, y - r, y + r); ctx.fill();
  }

  function drawWhiskers(ctx, lx, ly) {
    ctx.save(); ctx.strokeStyle = palette.outline; ctx.lineWidth = 1.05;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(lx * 3, ly * 2); ctx.scale(s, 1);
      ctx.beginPath(); ctx.moveTo(28.2, 3.8);
      ctx.bezierCurveTo(32, 2, 36.1, 2, 38.3, 2.9);
      ctx.moveTo(29.1, 9.5); ctx.bezierCurveTo(33.1, 9.4, 36.4, 10.3, 38.7, 11.7);
      ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function drawFoot(ctx, P, g, { side, rx, ry }) {
    // 蓝线里的左后爪外侧更饱满；只在坐下时展开，不改变站立脚掌。
    const outer = side < 0 ? g.sit * (1 - g.loaf) : 0;
    const path = () => {
      ctx.beginPath(); ctx.moveTo(-rx * (0.75 + outer * 0.07), -ry * 0.45);
      ctx.bezierCurveTo(-rx * 0.6, -ry * 1.05, rx * 0.31, -ry * 1.12, rx * 0.75, -ry * 0.48);
      ctx.bezierCurveTo(rx * 1.1, -ry * 0.05, rx * 1.09, ry * 0.62, rx * 0.58, ry * 0.86);
      ctx.bezierCurveTo(rx * 0.13, ry * 1.06, -rx * 0.61, ry * 1.02, -rx * 0.87, ry * 0.65);
      ctx.bezierCurveTo(-rx * (1.04 + outer * 0.16), ry * 0.35, -rx * (1.01 + outer * 0.11), -ry * 0.02, -rx * (0.75 + outer * 0.07), -ry * 0.45); ctx.closePath();
    };
    path(); ctx.fillStyle = creamWash(ctx, -ry, ry); ctx.fill();
    ctx.strokeStyle = palette.outline; ctx.lineWidth = LW; ctx.stroke();
    ctx.strokeStyle = '#cda987'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (const dx of [-0.23, 0.2]) {
      ctx.moveTo(rx * dx, ry * 0.85);
      ctx.quadraticCurveTo(rx * (dx - side * 0.035), ry * 0.6, rx * (dx + side * 0.025), ry * 0.39);
    }
    ctx.stroke();
  }

  // 一整条填色带同时控制粗细和颜色，避免逐段描线在连接处叠出深色小疙瘩。
  function taperedArmEdge(ctx, curve, widths, alphas, startTangent = null, endTangent = null) {
    const left = [], right = [], steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const p = [0, 1].map(a => u * u * u * curve[0][a] + 3 * u * u * t * curve[1][a] + 3 * u * t * t * curve[2][a] + t * t * t * curve[3][a]);
      const tangent = (i === 0 && startTangent) || (i === steps && endTangent) || [0, 1].map(a => 3 * u * u * (curve[1][a] - curve[0][a]) + 6 * u * t * (curve[2][a] - curve[1][a]) + 3 * t * t * (curve[3][a] - curve[2][a]));
      const length = Math.max(0.001, Math.hypot(...tangent));
      const half = lerp(widths[0], widths[1], t * t * (3 - 2 * t)) * 0.5;
      const nx = -tangent[1] / length * half, ny = tangent[0] / length * half;
      left.push([p[0] + nx, p[1] + ny]); right.push([p[0] - nx, p[1] - ny]);
    }
    ctx.beginPath(); ctx.moveTo(...left[0]);
    for (const p of left.slice(1)) ctx.lineTo(...p);
    for (const p of right.reverse()) ctx.lineTo(...p);
    ctx.closePath();
    const ink = ctx.createLinearGradient(...curve[0], ...curve[3]);
    for (const [stop, amount] of [[0, 0], [0.25, 0.16], [0.65, 0.72], [1, 1]]) {
      const alpha = Math.round(lerp(alphas[0], alphas[1], amount) * 255).toString(16).padStart(2, '0');
      ink.addColorStop(stop, `${palette.outline}${alpha}`);
    }
    ctx.fillStyle = ink; ctx.fill();
  }

  function drawArmShape(ctx, P, g, { side, len, r, legs = 0 }) {
    r *= 1 + legs * 0.25;
    ctx.save();
    if (legs > 0) {
      const cut = -r - 3 + legs * (len * 0.28 + r + 3);
      // 前腿沿着胸前白毛两侧接入，而不是用一条水平裁剪线切断胸毛。
      ctx.beginPath();
      ctx.moveTo(side * r * 2, cut - legs * 10);
      ctx.bezierCurveTo(side * r * 0.5, cut - legs * 9, -side * r * 0.1, cut + legs * 5, -side * r * 2, cut + legs * 7);
      ctx.lineTo(-side * r * 2, len + r * 3);
      ctx.lineTo(side * r * 2, len + r * 3);
      ctx.closePath(); ctx.clip();
    }
    const path = () => {
      ctx.beginPath(); ctx.moveTo(-r * 0.75, 1);
      ctx.bezierCurveTo(-r * 0.85, -r * 0.75, r * 0.55, -r * 1.05, r * 0.9, -0.5);
      ctx.bezierCurveTo(r * 0.97, len * 0.28, r * 1.04, len * 0.66, r * 1.09, len - 1);
      ctx.bezierCurveTo(r * 1.18, len + r * 0.53, r * 0.66, len + r * 0.86, 0, len + r * 0.9);
      ctx.bezierCurveTo(-r * 0.75, len + r * 0.94, -r * 1.13, len + r * 0.45, -r * 1.02, len - 1);
      ctx.bezierCurveTo(-r * 1.06, len * 0.65, -r * 1.05, len * 0.29, -r * 0.75, 1); ctx.closePath();
    };
    path(); ctx.fillStyle = furWash(ctx, -r, 0, len * 1.8); ctx.fill();
    ctx.save(); path(); ctx.clip();
    // 袜口是不规则的毛色过渡，前腿仍保留上方的橘色，不再是一对白色胶囊。
    const top = len * (0.63 - legs * 0.14);
    ctx.beginPath(); ctx.moveTo(-r * 1.5, top + 1);
    ctx.bezierCurveTo(-r * 0.45, top - 4, r * 0.45, top - 2, r * 1.5, top + 2);
    ctx.lineTo(r * 1.5, len + r + 2); ctx.lineTo(-r * 1.5, len + r + 2); ctx.closePath();
    ctx.fillStyle = creamWash(ctx, top, len + r); ctx.fill();
    ctx.restore();
    ctx.save();
    if (legs > 0) {
      const cut = -r - 3 + legs * (len * 0.28 + r + 3);
      ctx.beginPath(); ctx.rect(-r * 2, cut, r * 4, len + r * 3); ctx.clip();
    }
    // 外侧和爪底 U 弯保持原描边，过弯后的内侧才逐渐变细、变淡。
    ctx.beginPath();
    if (side < 0) {
      ctx.moveTo(-r * 0.75, 1);
      ctx.bezierCurveTo(-r * 1.05, len * 0.29, -r * 1.06, len * 0.65, -r * 1.02, len - 1);
      ctx.bezierCurveTo(-r * 1.13, len + r * 0.45, -r * 0.75, len + r * 0.94, 0, len + r * 0.9);
      ctx.bezierCurveTo(r * 0.66, len + r * 0.86, r * 1.18, len + r * 0.53, r * 1.09, len - 1);
    } else {
      ctx.moveTo(r * 0.9, -0.5);
      ctx.bezierCurveTo(r * 0.97, len * 0.28, r * 1.04, len * 0.66, r * 1.09, len - 1);
      ctx.bezierCurveTo(r * 1.18, len + r * 0.53, r * 0.66, len + r * 0.86, 0, len + r * 0.9);
      ctx.bezierCurveTo(-r * 0.75, len + r * 0.94, -r * 1.13, len + r * 0.45, -r * 1.02, len - 1);
    }
    ctx.strokeStyle = palette.outline; ctx.lineWidth = LW; ctx.lineCap = 'round'; ctx.stroke();
    const inner = side < 0
      ? [[r * 1.09, len - 1], [r * 1.04, len * 0.66], [r * 0.97, len * 0.28], [r * 0.9, -0.5]]
      : [[-r * 1.02, len - 1], [-r * 1.06, len * 0.65], [-r * 1.05, len * 0.29], [-r * 0.75, 1]];
    const shoulder = side < 0
      ? [[r * 0.9, -0.5], [r * 0.55, -r * 1.05], [-r * 0.85, -r * 0.75], [-r * 0.75, 1]]
      : [[-r * 0.75, 1], [-r * 0.85, -r * 0.75], [r * 0.55, -r * 1.05], [r * 0.9, -0.5]];
    const unit = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.max(0.001, Math.hypot(dx, dy));
      return [dx / length, dy / length];
    };
    const incoming = unit(inner[2], inner[3]), outgoing = unit(shoulder[0], shoulder[1]);
    const join = [incoming[0] + outgoing[0], incoming[1] + outgoing[1]];
    const angle = side < 0 ? P.armL : P.armR;
    // 垂手时渐变最明显；坐下撑地、抬手时保留更清楚的内侧分界。
    const softness = (1 - 0.7 * clamp((Math.abs(angle) - 0.3) / 1.4, 0, 1)) * (1 - legs * 0.35);
    const innerWidth = LW * (1 - softness * 0.55), innerAlpha = 1 - softness * 0.52;
    taperedArmEdge(ctx, inner, [LW, innerWidth], [1, innerAlpha], null, join);
    taperedArmEdge(ctx, shoulder, [innerWidth, LW], [innerAlpha, 1], join);
    ctx.restore();
    ctx.strokeStyle = '#cda987'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (const dx of [-0.32, 0.26]) {
      ctx.moveTo(r * dx, len + r * 0.74);
      ctx.quadraticCurveTo(r * (dx - side * 0.06), len + r * 0.47, r * (dx + side * 0.02), len + r * 0.17);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 按蓝笔描合完整的花生形外缘；舒展、卷尾和摆动连续变形这条轮廓。
  function drawTail(ctx, P, g) {
    const s = P.tailSide, c = clamp(P.tailCurl + g.sit * 0.2, 0, 1), sway = P.tail, by = g.tailBaseY;
    const point = (x, y) => {
      const flex = Math.pow(clamp((x - 16) / 58, 0, 1), 2);
      return [s * (16 + (x - 16) * lerp(1.06, 0.997, c)) + sway * 6 * flex,
        by + (y + 9.4) * lerp(0.32, 1.036, c) + sway * 2 * flex];
    };
    const move = (x, y) => ctx.moveTo(...point(x, y));
    const curve = (x1, y1, x2, y2, x3, y3) => ctx.bezierCurveTo(...point(x1, y1), ...point(x2, y2), ...point(x3, y3));
    const shape = () => {
      ctx.beginPath();
      move(16, -9.4);
      curve(28, -7, 34, -13, 37.6, -24);
      curve(41, -32, 43.6, -39.8, 46.8, -47);
      curve(49.3, -53.3, 55.7, -55.5, 62.6, -54.6);
      curve(69.1, -53.7, 73.8, -45, 73, -37.4);
      curve(72.6, -32, 67.5, -28.7, 63.9, -26.5);
      curve(60.8, -23.7, 57.6, -19, 55.3, -16.4);
      curve(47, -6.4, 34.8, -2.8, 23, -4.8);
      curve(19, -5, 17, -7, 16, -9.4);
      ctx.closePath();
    };
    shape(); ctx.fillStyle = furWash(ctx, s * 50, by - 24, 58); ctx.fill();
    ctx.save(); shape(); ctx.clip();
    if (lucky) {
      ctx.beginPath(); move(43, -47); curve(52, -64, 77, -64, 84, -42);
      curve(79, -20, 56, -20, 43, -47); ctx.closePath();
      ctx.fillStyle = patchWash(ctx); ctx.fill();
    } else {
    ctx.strokeStyle = palette.furDark; ctx.lineWidth = 4.5;
    ctx.beginPath(); move(29, -23); curve(36, -21, 41, -14, 44, -3); ctx.stroke();
    ctx.beginPath(); move(37, -34); curve(45, -32, 53, -23, 58, -15); ctx.stroke();
    ctx.beginPath(); move(43, -46); curve(55, -43, 63, -35, 72, -30); ctx.stroke();
    }
    ctx.restore(); shape(); ctx.lineWidth = LW; ctx.strokeStyle = palette.outline; ctx.stroke();
  }

  function drawLuckyCollar(ctx, P, g, look) {
    if (look?.neck) return; // 季节围巾等颈饰盖住项圈，避免两件饰品挤在一起。
    // 用当前下巴定位，用实际躯干边界裁出两端；坐下和趴卧时肩颈自然展开。
    const chinX = g.headCx - Math.sin(P.headTilt) * 31;
    const chinY = g.headCy + Math.cos(P.headTilt) * 31;
    const frontX = lerp(g.torsoCx, chinX, 0.7) + g.facing * 2.4;
    const frontY = Math.max(chinY + 0.3, g.torsoCy - g.torsoRy * 0.91);
    const width = g.torsoRxBot * (0.76 + g.sit * 0.14 + g.loaf * 0.18);
    const sag = 1.5 + g.sit * 1.2 + g.loaf * 2;
    const slope = Math.tan(P.headTilt) + clamp((P.armL - P.armR) * 0.035, -0.08, 0.08);
    const thickness = 2.15 - g.loaf * 0.45;
    const bandY = x => slope * x - sag * (x / width) ** 2;
    const reach = g.torsoRxBot * 1.6 + Math.abs(frontX - g.torsoCx);
    const controlY = sag * (reach / width) ** 2;
    const leftY = bandY(-reach), rightY = bandY(reach);
    ctx.save(); ctx.translate(frontX, frontY);
    ctx.beginPath(); ctx.moveTo(-reach, leftY);
    ctx.quadraticCurveTo(0, controlY, reach, rightY);
    ctx.lineTo(reach, rightY + thickness);
    ctx.quadraticCurveTo(0, controlY + thickness, -reach, leftY + thickness);
    ctx.closePath();
    const red = ctx.createLinearGradient(0, -2, 0, thickness);
    red.addColorStop(0, '#e78b75'); red.addColorStop(1, '#bd5147');
    ctx.fillStyle = red; ctx.strokeStyle = palette.outline; ctx.lineWidth = 0.65; ctx.fill(); ctx.stroke();
    // 铃铛挂在带子的前侧，抬肩和侧身时跟随挂点，身体倾斜时略往下垂。
    ctx.translate(0, thickness); ctx.rotate(-P.lean * 0.65);
    ctx.strokeStyle = '#967044'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.ellipse(0, 0.9, 0.8, 1.15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.translate(0, -2);
    const gold = ctx.createRadialGradient(-1.2, 5.6, 0.1, 0, 7, 4.5);
    gold.addColorStop(0, '#fff0a8'); gold.addColorStop(0.55, '#f4cc6b'); gold.addColorStop(1, '#d8a247');
    ctx.beginPath(); ctx.ellipse(0, 7, 3.9, 3.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = gold; ctx.fill(); ctx.strokeStyle = '#967044'; ctx.lineWidth = 0.85; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3.2, 6.7); ctx.quadraticCurveTo(0, 5.7, 3.2, 6.7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 7.9, 0.65, 0.7, 0, 0, Math.PI * 2); ctx.fillStyle = '#846140'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 8.3); ctx.lineTo(0, 9.7); ctx.stroke(); ctx.restore();
  }

  return {
    id: 'cat', coatId, palette,
    head: { rx: 44, ry: 31 }, earReach: 15, righting: 1,
    build: { torso: 1.04, arm: 1.16, armLen: 0.98, foot: 1.04, sitSpread: 2, frontLegs: true, frontLegInset: 14.5, sitBodyWidth: 1.29 },
    face: { eyeX: 14.3, eyeY: 0.5, eyeRx: 3.05, eyeRy: 5.1, shine: false, noseY: 5.3, mouthDy: 0, mouthW: 5.9, blushX: 21, blushY: 12 },
    paw: { lines: 2 }, headFill, headPath, headOutline, torsoPath, drawFoot, drawArmShape,
    drawEar, drawEyeBack: null, drawHeadMarkings, drawTorsoMarkings,
    drawNose: null, drawFaceExtras: drawWhiskers, drawTail,
    drawCollar: lucky ? drawLuckyCollar : null,
  };
}

export const cat = createCat('tabby');
export const luckyCat = createCat('lucky');
