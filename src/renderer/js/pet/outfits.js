// 换装：衣柜里的衣服怎么画。照着 img resource 里的设定图（01 帽子、02 眼镜、03 上衣、07 背包、08 手持道具）用代码画。
//
// 一件衣服只属于一个部位（slot）：
//   hat      帽子   画在头的坐标里：原点是头的中心，头顶在 y = -head.ry；hidesEars = 戴上后把它自己的耳朵收进帽子里
//   glasses  眼镜   也在头的坐标里，跟着眼睛一起转（看向哪边，镜片就往哪边挪一点）
//   top      上衣   body 画在身体上（裁剪在每种动物自己的身体轮廓里，所以熊猫胖一圈，上衣也宽一圈）；
//                   sleeve 画在手臂上（手臂自己的坐标：原点是肩膀，手臂往 +y 方向伸 len 那么长）
//   bag      背包   back 画在身体后面，front 画在身体前面（背带、挂在腰边的小包）
//   held     手持   抱在胸前（原点是胸口），和节日的灯笼、月饼一样
//
// 每个画法拿到的 info：{ sp 动物, P 姿势, g 身体各部分的位置（getGeometry）, lx/ly 视线, time, torso 描出身体轮廓的函数 }
// 衣服一律从 info 里读尺寸，不写死数字：这样所有动物都能穿（以后的卡皮巴拉也是）。
// 想加一件：在下面写好画法，登记到 OUTFITS，再到 src/shared/outfits/catalog.js 登记一行（编号、部位、在哪儿容易捡到），
// 在同一个文件夹的 zh.json / en.json 里写上名字，最后运行 npm run letters 核对。

const INK = '#5d4334'; // 衣服的轮廓线
const LW = 1.5;
const TAU = Math.PI * 2;

function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function roundRect(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

function fillStroke(ctx, fill, lw = LW, stroke = INK) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function starPath(ctx, cx, cy, r, inner = 0.5, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** 小爪印（帽子上的图案）：一个大肉垫 + 三个小脚趾 */
function pawPrint(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ellipse(ctx, x, y + 1.2 * s, 2.6 * s, 2.1 * s);
  ctx.fill();
  for (const [dx, dy] of [[-2.6, -1.6], [0, -2.8], [2.6, -1.6]]) {
    ellipse(ctx, x + dx * s, y + dy * s, 1.05 * s, 1.2 * s);
    ctx.fill();
  }
}

/** 从上到下的渐变（衣服的明暗：上面亮一点，下面暗一点） */
function shade(ctx, y0, y1, light, dark) {
  const grad = ctx.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  return grad;
}

// ================================================================ 帽子（头的坐标）

/**
 * 鸭舌帽（红色鸭舌帽、熊猫耳机帽共用一个形状）：帽身盖住头顶，帽檐朝前、往右偏一点。
 * C 是颜色：crown 帽身 [亮, 暗]、seam 缝线、button 顶上的扣子、brim 帽檐 [亮, 暗]；
 * badge(rx, band) 在帽身正面画图案（爪印、熊猫脸……）
 */
function ballCap(ctx, { sp, lx }, C, badge) {
  const { rx, ry } = sp.head;
  const band = -ry * 0.5;
  const top = -ry - 9;
  ctx.save();
  ctx.translate(lx * 4, 0);
  ctx.rotate(-0.07);
  ctx.beginPath(); // 帽身
  ctx.moveTo(-rx * 0.8, band);
  ctx.bezierCurveTo(-rx * 0.84, top + 1, rx * 0.84, top + 1, rx * 0.8, band);
  ctx.quadraticCurveTo(0, band + 3.5, -rx * 0.8, band);
  ctx.closePath();
  fillStroke(ctx, shade(ctx, top, band, C.crown[0], C.crown[1]));
  ctx.strokeStyle = C.seam; // 帽身的缝线
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 2);
  ctx.quadraticCurveTo(-2.5, band - 8, -1.5, band + 1.5);
  ctx.stroke();
  ellipse(ctx, 0, top + 2.2, 2.6, 1.7); // 顶上的小扣子
  fillStroke(ctx, C.button, 1);
  badge(rx, band);
  // 帽檐：朝前伸出来、往右偏一点，是一片扁扁的大月牙；底下露出一点深色的帽檐背面
  ctx.beginPath();
  ctx.moveTo(-rx * 0.62, band - 0.5);
  ctx.bezierCurveTo(-rx * 0.5, band + 10, rx * 0.65, band + 12.5, rx * 0.86, band + 1.5);
  ctx.bezierCurveTo(rx * 0.5, band + 5.5, -rx * 0.2, band + 4.5, -rx * 0.62, band - 0.5);
  ctx.closePath();
  fillStroke(ctx, shade(ctx, band, band + 12, C.brim[0], C.brim[1]));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; // 帽檐边上的一道亮线
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.45, band + 4.5);
  ctx.bezierCurveTo(-rx * 0.2, band + 9.5, rx * 0.5, band + 10.5, rx * 0.72, band + 4);
  ctx.stroke();
  ctx.restore();
}

/**
 * 毛茸茸的一圈（护耳帽的绒毛边）：一串挨得很紧、大小不一的小圆拼起来。先把每个圆都描一圈粗线，
 * 再把所有圆填上颜色，圆和圆重叠的地方的线就被盖住了，只剩最外面一圈蓬松的轮廓
 */
function fluff(ctx, puffs, fill) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = LW * 2;
  for (const [x, y, r] of puffs) {
    ellipse(ctx, x, y, r, r);
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  for (const [x, y, r] of puffs) {
    ellipse(ctx, x, y, r, r);
    ctx.fill();
  }
}

/** 小船锚（水手帽正面的图案）：上面一个圆环，一根竖杆，一道横杆，底下两条弯弯的锚爪 */
function anchor(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.arc(0, -6.2, 1.9, 0, TAU);
  ctx.moveTo(0, -4.3);
  ctx.lineTo(0, 5.6);
  ctx.moveTo(-3.6, -2);
  ctx.lineTo(3.6, -2);
  ctx.moveTo(-5.6, 1.2);
  ctx.quadraticCurveTo(-5.2, 6, 0, 6);
  ctx.quadraticCurveTo(5.2, 6, 5.6, 1.2);
  ctx.stroke();
  for (const s2 of [-1, 1]) {
    ctx.beginPath(); // 锚爪尖上的小三角
    ctx.moveTo(s2 * 5.6, -0.4);
    ctx.lineTo(s2 * 7.4, 2.6);
    ctx.lineTo(s2 * 3.9, 2.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const HATS = {
  /** 01 红色鸭舌帽：帽身盖住头顶，帽檐朝前，上面一个白色小爪印 */
  capRed: {
    slot: 'hat',
    hat(ctx, info) {
      ballCap(ctx, info, {
        crown: ['#ec6158', '#c8423b'],
        seam: 'rgba(120, 30, 25, 0.45)',
        button: '#b8362f',
        brim: ['#d94a42', '#a8322c'],
      }, (rx, band) => pawPrint(ctx, rx * 0.34, band - 9, 1.15, '#ffffff'));
    },
  },

  /** 02 渔夫帽：圆筒形的帽身 + 一圈往下垂的软帽檐，帽身上一个粉色爪印 */
  bucketHat: {
    slot: 'hat',
    hat(ctx, { sp, lx }) {
      const { rx, ry } = sp.head;
      const base = -ry * 0.52;
      const top = -ry - 11;
      ctx.save();
      ctx.translate(lx * 4, 0);
      ctx.beginPath(); // 帽檐（先画，帽身压在上面）
      ctx.moveTo(-rx * 1.02, base + 6.5);
      ctx.quadraticCurveTo(-rx * 0.9, base - 4, -rx * 0.6, base - 2.5);
      ctx.lineTo(rx * 0.6, base - 2.5);
      ctx.quadraticCurveTo(rx * 0.9, base - 4, rx * 1.02, base + 6.5);
      ctx.quadraticCurveTo(0, base + 10, -rx * 1.02, base + 6.5);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, base - 4, base + 9, '#e6c48c', '#cfa767'));
      ctx.beginPath(); // 帽身
      ctx.moveTo(-rx * 0.62, base);
      ctx.bezierCurveTo(-rx * 0.6, top + 2, rx * 0.6, top + 2, rx * 0.62, base);
      ctx.quadraticCurveTo(0, base + 2.5, -rx * 0.62, base);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, top, base, '#f1d6a5', '#ddb87d'));
      ctx.strokeStyle = 'rgba(140, 100, 50, 0.4)'; // 帽身和帽檐之间的一圈缝线
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(-rx * 0.58, base - 1.5);
      ctx.quadraticCurveTo(0, base + 1, rx * 0.58, base - 1.5);
      ctx.stroke();
      ctx.setLineDash([]);
      pawPrint(ctx, 0, (top + base) / 2 + 1, 1.3, '#f1a39a');
      ctx.restore();
    },
  },

  /** 03 针织毛线帽：灰黑色，罗纹翻边上一个小黄标，顶上两只织出来的猫耳朵（它自己的耳朵收进帽子里） */
  knitBeanie: {
    slot: 'hat',
    hidesEars: true,
    hat(ctx, { sp, lx }) {
      const { rx, ry } = sp.head;
      const cuffTop = -ry * 0.64;
      const cuffBot = -ry * 0.3;
      const top = -ry - 12;
      const knit = '#50505b';
      ctx.save();
      ctx.translate(lx * 3, 0);
      // 织出来的猫耳朵。兔子的长耳朵收不进帽子、从帽子后面竖出来，再织两只就成了四只耳朵：不画
      for (const s of sp.longEars ? [] : [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * rx * 0.24, top + 6);
        ctx.quadraticCurveTo(s * rx * 0.5, top - 9, s * rx * 0.72, top - 8);
        ctx.quadraticCurveTo(s * rx * 0.78, top + 1, s * rx * 0.74, top + 12);
        ctx.closePath();
        fillStroke(ctx, knit);
        ctx.beginPath();
        ctx.moveTo(s * rx * 0.38, top + 5);
        ctx.quadraticCurveTo(s * rx * 0.55, top - 4, s * rx * 0.66, top - 3.5);
        ctx.lineTo(s * rx * 0.66, top + 7);
        ctx.closePath();
        ctx.fillStyle = '#3d3d47';
        ctx.fill();
      }
      ctx.beginPath(); // 帽身
      ctx.moveTo(-rx * 0.88, cuffTop + 2);
      ctx.bezierCurveTo(-rx * 0.92, top - 1, rx * 0.92, top - 1, rx * 0.88, cuffTop + 2);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, top, cuffTop, '#5d5d69', '#45454f'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; // 毛线的竖纹
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -rx * 0.7; x <= rx * 0.7; x += 6) {
        ctx.moveTo(x, cuffTop);
        ctx.quadraticCurveTo(x * 0.92, (top + cuffTop) / 2, x * 0.6, top + 6);
      }
      ctx.stroke();
      roundRect(ctx, -rx * 0.94, cuffTop, rx * 1.88, cuffBot - cuffTop, 5); // 罗纹翻边
      fillStroke(ctx, '#41414b');
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -rx * 0.86; x <= rx * 0.86; x += 3.2) {
        ctx.moveTo(x, cuffTop + 2);
        ctx.lineTo(x, cuffBot - 2);
      }
      ctx.stroke();
      roundRect(ctx, -6, (cuffTop + cuffBot) / 2 - 3, 12, 6, 1.5); // 小黄标
      fillStroke(ctx, '#f2c45a', 1);
      ctx.restore();
    },
  },

  /** 08 星空魔法帽：深蓝色的尖帽子，帽尖往一边耷拉，上面撒着小星星，帽尖挂一颗星 */
  wizardHat: {
    slot: 'hat',
    hat(ctx, { sp, lx, time = 0 }) {
      const { rx, ry } = sp.head;
      const base = -ry * 0.58;
      const sway = Math.sin(time * 1.6) * 0.04;
      ctx.save();
      ctx.translate(lx * 4, 0);
      ellipse(ctx, 0, base + 1, rx * 1.02, 7.5); // 帽檐
      fillStroke(ctx, '#3b4688');
      ctx.save(); // 帽身：尖尖的，往右耷拉
      ctx.rotate(sway);
      ctx.beginPath();
      ctx.moveTo(-rx * 0.55, base);
      ctx.bezierCurveTo(-rx * 0.42, base - 26, -rx * 0.1, base - 50, rx * 0.3, base - 54);
      ctx.quadraticCurveTo(rx * 0.56, base - 52, rx * 0.66, base - 40);
      ctx.quadraticCurveTo(rx * 0.44, base - 44, rx * 0.3, base - 40);
      ctx.bezierCurveTo(rx * 0.32, base - 24, rx * 0.46, base - 10, rx * 0.55, base);
      ctx.quadraticCurveTo(0, base + 3, -rx * 0.55, base);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, base - 54, base, '#5664b3', '#39448a'));
      ctx.strokeStyle = '#f2c45a'; // 黄色的帽带
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.5, base - 5);
      ctx.quadraticCurveTo(0, base - 1.5, rx * 0.5, base - 5);
      ctx.stroke();
      for (const [x, y, r] of [[-rx * 0.22, base - 16, 3.6], [rx * 0.14, base - 30, 2.8], [rx * 0.26, base - 13, 2.4]]) {
        starPath(ctx, x, y, r, 0.45, 0.2);
        ctx.fillStyle = '#ffd65c';
        ctx.fill();
      }
      starPath(ctx, rx * 0.68, base - 38, 4.6, 0.45, 0.3); // 帽尖的星星
      fillStroke(ctx, '#ffd65c', 1.2, '#b98a22');
      ctx.restore();
      ctx.restore();
    },
  },

  /** 04 飞行护目帽：棕色皮帽子，两边的护耳垂下来，额头上架着一副蓝镜片的护目镜（它自己的耳朵收进帽子里） */
  aviatorCap: {
    slot: 'hat',
    hidesEars: true,
    hat(ctx, { sp, lx }) {
      const { rx, ry } = sp.head;
      const top = -ry - 7;
      const brow = -ry * 0.44; // 露脸的拱形最高处（额头中间）：再低就挡住眼睛了
      const flap = ry * 0.3; // 护耳的下沿
      const arch = () => {
        // 露脸的拱形：从右边护耳的里侧往上，绕过额头，再下到左边护耳的里侧
        ctx.bezierCurveTo(rx * 0.7, -ry * 0.2, rx * 0.5, brow, 0, brow);
        ctx.bezierCurveTo(-rx * 0.5, brow, -rx * 0.7, -ry * 0.2, -rx * 0.75, flap - 4);
      };
      const cap = () => {
        // 帽子 = 外面一圈（头顶 + 两边圆头的护耳），中间挖掉一个露脸的拱形
        ctx.beginPath();
        ctx.moveTo(-rx * 0.75, flap - 4);
        ctx.bezierCurveTo(-rx * 0.76, flap + 3, -rx * 1.03, flap + 3, -rx * 1.07, flap - 7);
        ctx.bezierCurveTo(-rx * 1.14, -ry * 0.55, -rx * 0.96, top, 0, top);
        ctx.bezierCurveTo(rx * 0.96, top, rx * 1.14, -ry * 0.55, rx * 1.07, flap - 7);
        ctx.bezierCurveTo(rx * 1.03, flap + 3, rx * 0.76, flap + 3, rx * 0.75, flap - 4);
        arch();
        ctx.closePath();
      };
      const opening = () => {
        // 露脸的那条拱形边（帽子里面翻出来一圈米色的羊毛）
        ctx.beginPath();
        ctx.moveTo(rx * 0.75, flap - 4);
        arch();
      };
      ctx.save();
      ctx.translate(lx * 3, 0);
      cap();
      ctx.fillStyle = shade(ctx, top, flap, '#b47c51', '#8a5634');
      ctx.fill();
      ctx.save();
      cap();
      ctx.clip();
      opening();
      ctx.strokeStyle = '#f0dcbc';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90, 55, 30, 0.45)'; // 皮帽子的缝线：中间一道，两边各一道
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, top + 2);
      ctx.lineTo(0, brow - 4);
      for (const s of [-1, 1]) {
        ctx.moveTo(s * rx * 0.5, top + 5);
        ctx.quadraticCurveTo(s * rx * 0.86, -ry * 0.55, s * rx * 0.9, flap - 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      cap();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW;
      ctx.stroke();
      // 护目镜：两边的松紧带绕到脑后，中间一道鼻梁，两个圆镜片
      const gy = brow - 10;
      const gx = rx * 0.31;
      const r = 8.4;
      ctx.lineCap = 'butt';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * (gx + r - 1), gy);
        ctx.quadraticCurveTo(s * rx * 0.88, gy + 0.5, s * rx * 1.09, gy + 4.5);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5.6;
        ctx.stroke();
        ctx.strokeStyle = '#5b3c28';
        ctx.lineWidth = 3.4;
        ctx.stroke();
      }
      ctx.lineCap = 'round';
      roundRect(ctx, -gx + r - 2, gy - 2.6, (gx - r + 2) * 2, 4.4, 2); // 鼻梁
      fillStroke(ctx, '#6e4a32', 1.1);
      for (const s of [-1, 1]) {
        const x = s * gx;
        ellipse(ctx, x, gy, r, r); // 镜框
        fillStroke(ctx, shade(ctx, gy - r, gy + r, '#8a6143', '#5e3f2a'));
        ellipse(ctx, x, gy, r - 2.5, r - 2.5); // 镜片
        const glass = ctx.createLinearGradient(x - r, gy - r, x + r, gy + r);
        glass.addColorStop(0, '#d6f0ff');
        glass.addColorStop(1, '#7fb6e0');
        fillStroke(ctx, glass, 1, '#3f2a1d');
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // 反光
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, gy, r - 4.6, -2.7, -1.7);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  /** 05 蝴蝶结遮阳帽：草编的宽檐帽，帽身一圈红丝带，右边一个大蝴蝶结 */
  sunHat: {
    slot: 'hat',
    hat(ctx, { sp, lx, time = 0 }) {
      const { rx, ry } = sp.head;
      const base = -ry * 0.58; // 帽身和帽檐接上的地方
      const top = -ry - 12;
      const brim = () => {
        // 帽檐：比渔夫帽宽，两边往下耷拉；前沿中间最低也停在眼睛上面
        ctx.beginPath();
        ctx.moveTo(-rx * 1.22, base + 5);
        ctx.bezierCurveTo(-rx * 1.2, base - 6, -rx * 0.8, base - 7.5, -rx * 0.5, base - 6);
        ctx.lineTo(rx * 0.5, base - 6);
        ctx.bezierCurveTo(rx * 0.8, base - 7.5, rx * 1.2, base - 6, rx * 1.22, base + 5);
        ctx.bezierCurveTo(rx * 0.9, base + 11, rx * 0.3, base + 9.5, 0, base + 9);
        ctx.bezierCurveTo(-rx * 0.3, base + 9.5, -rx * 0.9, base + 11, -rx * 1.22, base + 5);
        ctx.closePath();
      };
      ctx.save();
      ctx.translate(lx * 4, 0);
      ctx.rotate(0.04);
      brim();
      fillStroke(ctx, shade(ctx, base - 8, base + 11, '#fae7ae', '#e0b866'));
      ctx.save(); // 草编的纹路：沿着帽檐边的几道细线
      brim();
      ctx.clip();
      ctx.strokeStyle = 'rgba(170, 120, 40, 0.35)';
      ctx.lineWidth = 0.9;
      for (const k of [0.82, 0.66]) {
        ctx.beginPath();
        ctx.moveTo(-rx * 1.22 * k, base + 5 * k - 1);
        ctx.bezierCurveTo(-rx * 0.9 * k, base + 11 * k - 1, -rx * 0.3 * k, base + 9.5 * k - 1, 0, base + 9 * k - 1);
        ctx.bezierCurveTo(rx * 0.3 * k, base + 9.5 * k - 1, rx * 0.9 * k, base + 11 * k - 1, rx * 1.22 * k, base + 5 * k - 1);
        ctx.stroke();
      }
      ctx.restore();
      const crown = () => {
        ctx.beginPath();
        ctx.moveTo(-rx * 0.6, base - 2);
        ctx.bezierCurveTo(-rx * 0.64, top + 2, rx * 0.64, top + 2, rx * 0.6, base - 2);
        ctx.quadraticCurveTo(0, base + 2, -rx * 0.6, base - 2);
        ctx.closePath();
      };
      crown();
      fillStroke(ctx, shade(ctx, top, base, '#fcecbb', '#e8c67c'));
      ctx.save();
      crown();
      ctx.clip();
      ctx.beginPath(); // 红丝带：帽身下半截绕一圈
      ctx.moveTo(-rx, base - 9);
      ctx.quadraticCurveTo(0, base - 5.5, rx, base - 9);
      ctx.lineTo(rx, base + 4);
      ctx.lineTo(-rx, base + 4);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, base - 9, base, '#ea6a5c', '#cc4a3f'), 1.2);
      ctx.strokeStyle = 'rgba(170, 120, 40, 0.3)'; // 帽身上的草编纹
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const y of [top + 7, top + 12]) {
        ctx.moveTo(-rx, y);
        ctx.quadraticCurveTo(0, y + 3, rx, y);
      }
      ctx.stroke();
      ctx.restore();
      crown();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW;
      ctx.stroke();
      // 蝴蝶结：在右边，两条飘带垂到帽檐上
      ctx.save();
      ctx.translate(rx * 0.5, base - 4.5);
      ctx.rotate(0.12 + Math.sin(time * 1.7) * 0.03);
      ctx.scale(1.3, 1.3);
      for (const [x1, y1, x2, y2] of [[-1, 9, 2.4, 11.5], [6.5, 9, 9.5, 7]]) {
        ctx.beginPath(); // 飘带
        ctx.moveTo(-1, 0.5);
        ctx.quadraticCurveTo(x1 - 1.5, y1 * 0.5, x1, y1);
        ctx.lineTo(x2, y2);
        ctx.quadraticCurveTo(x2 - 2, y2 * 0.45, 1.5, 0);
        ctx.closePath();
        fillStroke(ctx, '#d9564a', 1.1);
      }
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 5.6, -1.2, 5.6, 3.6, s * 0.42); // 两个圈
        fillStroke(ctx, shade(ctx, -5, 3, '#f07668', '#d24c40'), 1.2);
        ellipse(ctx, s * 5.2, -1.1, 2.4, 1.2, s * 0.42);
        ctx.fillStyle = 'rgba(120, 25, 20, 0.35)';
        ctx.fill();
      }
      ellipse(ctx, 0, -0.6, 2.6, 3); // 中间的结
      fillStroke(ctx, '#e0584b', 1.2);
      ctx.restore();
      ctx.restore();
    },
  },

  /** 06 格纹贝雷帽：蓝色格子，鼓鼓的、往右歪戴在头顶，顶上一个小揪揪 */
  beret: {
    slot: 'hat',
    hat(ctx, { sp, lx }) {
      const { rx, ry } = sp.head;
      const band = -ry * 0.52; // 帽口（贴着头的那一圈）的下沿
      const bot = band - 3; // 帽身下沿的正中间：压在帽口上，只露出帽口下面一截
      const top = -ry - 19; // 帽身最高处：鼓鼓的，别画成一张扁饼
      const cx = rx * 0.12; // 往右歪一点
      const L = cx - rx * 0.94;
      const R = cx + rx * 0.98;
      const mid = bot - (bot - top) * 0.36; // 帽身左右两头最宽的地方
      const body = () => {
        // 帽身：上面是一大片圆拱，下沿比较平，像一个压扁的软枕头
        ctx.beginPath();
        ctx.moveTo(L, mid + 2);
        ctx.bezierCurveTo(L - 1, top - 3, R + 1, top - 3, R, mid);
        ctx.bezierCurveTo(R - 3, bot + 4, L + 3, bot + 5, L, mid + 2);
        ctx.closePath();
      };
      ctx.save();
      ctx.translate(lx * 4, 0);
      ctx.rotate(0.13);
      ctx.beginPath(); // 帽口：深一点的蓝，露在帽身下面
      ctx.moveTo(-rx * 0.64, band - 5);
      ctx.quadraticCurveTo(0, band - 2, rx * 0.64, band - 5);
      ctx.lineTo(rx * 0.62, band);
      ctx.quadraticCurveTo(0, band + 3, -rx * 0.62, band);
      ctx.closePath();
      fillStroke(ctx, '#4a6db0', 1.3);
      ellipse(ctx, cx + 2, top + 0.5, 2.6, 2.3); // 顶上的小揪揪（先画，帽身压住它的下半截）
      fillStroke(ctx, '#5f86c9', 1.2);
      body();
      ctx.fillStyle = shade(ctx, top, bot + 4, '#89b0e8', '#5b82c5');
      ctx.fill();
      ctx.save(); // 格子：顺着帽身鼓起来的样子弯一点
      body();
      ctx.clip();
      const lines = (color, width, offset) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = -3; i <= 3; i++) {
          const x = cx + (i + offset) * rx * 0.34;
          ctx.moveTo(cx + (x - cx) * 0.7, top - 3);
          ctx.quadraticCurveTo(cx + (x - cx) * 1.2, mid, x, bot + 6);
        }
        for (const j of [-1, 0, 1]) {
          const y = mid + (j + offset) * (bot - top) * 0.3;
          ctx.moveTo(L, y);
          ctx.quadraticCurveTo(cx, y + 5, R, y - 1);
        }
        ctx.stroke();
      };
      lines('rgba(255, 255, 255, 0.45)', 2.8, 0);
      lines('rgba(40, 70, 140, 0.35)', 1, 0.5);
      ellipse(ctx, cx - rx * 0.36, top + 9, rx * 0.34, 5.5, -0.2); // 一点高光
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.restore();
      body(); // 帽身的轮廓最后描（格子盖住了半根线）
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW;
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 07 水手帽：白色的大圆顶、深蓝色的帽墙和小帽檐，正面一个船锚 */
  sailorCap: {
    slot: 'hat',
    hat(ctx, { sp, lx }) {
      const { rx, ry } = sp.head;
      const base = -ry * 0.56; // 帽墙的下沿
      const wall = base - 7; // 帽墙的上沿
      const top = -ry - 10;
      ctx.save();
      ctx.translate(lx * 4, 0);
      ctx.rotate(-0.04);
      ctx.beginPath(); // 白色的圆顶：比帽墙宽一圈，像个扁扁的大馒头
      ctx.moveTo(-rx * 0.6, wall + 1);
      ctx.bezierCurveTo(-rx * 1.0, wall - 1, -rx * 1.02, top + 4, -rx * 0.5, top + 1);
      ctx.quadraticCurveTo(0, top - 3, rx * 0.5, top + 1);
      ctx.bezierCurveTo(rx * 1.02, top + 4, rx * 1.0, wall - 1, rx * 0.6, wall + 1);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, top, wall, '#ffffff', '#dfe5ee'));
      ctx.beginPath(); // 帽墙
      ctx.moveTo(-rx * 0.62, wall);
      ctx.quadraticCurveTo(0, wall + 3, rx * 0.62, wall);
      ctx.lineTo(rx * 0.6, base);
      ctx.quadraticCurveTo(0, base + 3, -rx * 0.6, base);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, wall, base, '#5571b2', '#3d5594'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; // 帽墙上一道白线
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.6, wall + 2.6);
      ctx.quadraticCurveTo(0, wall + 5.6, rx * 0.6, wall + 2.6);
      ctx.stroke();
      ctx.beginPath(); // 小帽檐
      ctx.moveTo(-rx * 0.5, base + 0.5);
      ctx.bezierCurveTo(-rx * 0.4, base + 7.5, rx * 0.4, base + 7.5, rx * 0.5, base + 0.5);
      ctx.quadraticCurveTo(0, base + 3.5, -rx * 0.5, base + 0.5);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, base, base + 6, '#34477c', '#25345e'));
      anchor(ctx, 0, (top + wall) / 2 + 1.5, 0.85, '#3d5594');
      ctx.restore();
    },
  },

  /** 09 毛绒护耳帽：棕色的帽顶上两只小耳朵，一圈奶白色的绒毛边，两边垂着毛茸茸的护耳（它自己的耳朵收进帽子里） */
  trapperHat: {
    slot: 'hat',
    hidesEars: true,
    hat(ctx, { sp, lx }) {
      const { rx, ry } = sp.head;
      const top = -ry - 6;
      const brow = -ry * 0.52; // 额头那圈绒毛的中线
      ctx.save();
      ctx.translate(lx * 3, 0);
      // 帽子上的小耳朵（先画，帽顶压在上面）。兔子自己的长耳朵会从帽子后面竖出来，就不画这两只了
      for (const s of sp.longEars ? [] : [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * rx * 0.28, top + 7);
        ctx.quadraticCurveTo(s * rx * 0.4, top - 10, s * rx * 0.64, top - 10);
        ctx.quadraticCurveTo(s * rx * 0.76, top - 1, s * rx * 0.8, top + 11);
        ctx.closePath();
        fillStroke(ctx, '#9b6a46');
        ctx.beginPath();
        ctx.moveTo(s * rx * 0.4, top + 5);
        ctx.quadraticCurveTo(s * rx * 0.48, top - 4.5, s * rx * 0.62, top - 5);
        ctx.quadraticCurveTo(s * rx * 0.68, top + 1, s * rx * 0.7, top + 8);
        ctx.closePath();
        ctx.fillStyle = '#74492e';
        ctx.fill();
      }
      ctx.beginPath(); // 帽顶
      ctx.moveTo(-rx * 0.94, brow + 2);
      ctx.bezierCurveTo(-rx * 1.0, top, rx * 1.0, top, rx * 0.94, brow + 2);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, top, brow, '#ab7a53', '#87593a'));
      // 绒毛边：额头一圈 + 两边垂下来的护耳。小圆挨得很紧、大小有一点不一样，轮廓才是蓬松的（太整齐像一串珍珠）
      const puffs = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        puffs.push([-rx * 0.86 + t * rx * 1.72, brow - Math.sin(t * Math.PI) * 1.5, 5.6 + 0.7 * Math.sin(i * 2.4)]);
      }
      const flapBot = ry * 0.2;
      for (const s of [-1, 1]) {
        const m = 5;
        for (let i = 1; i <= m; i++) {
          const t = i / m;
          puffs.push([s * rx * (0.9 + 0.03 * t), brow + t * (flapBot - brow), 5.8 + 0.6 * Math.sin(i * 1.9 + s) + t * 0.9]);
        }
      }
      fluff(ctx, puffs, shade(ctx, brow - 6, flapBot + 6, '#fffaf2', '#ead8bc'));
      ctx.strokeStyle = 'rgba(185, 150, 105, 0.55)'; // 绒毛的纹理：几笔短短的弯线
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 1; i < n; i += 2) {
        const x = -rx * 0.86 + (i / n) * rx * 1.72;
        const y = brow - Math.sin((i / n) * Math.PI) * 1.5 + 1.5;
        ctx.moveTo(x - 1.6, y - 0.6);
        ctx.quadraticCurveTo(x, y + 1.2, x + 1.6, y - 0.6);
      }
      for (const s of [-1, 1]) {
        for (const t of [0.35, 0.7]) {
          const x = s * rx * 0.92;
          const y = brow + t * (flapBot - brow) + 1.5;
          ctx.moveTo(x - 1.6, y - 0.6);
          ctx.quadraticCurveTo(x, y + 1.2, x + 1.6, y - 0.6);
        }
      }
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 10 熊猫耳机帽：黑色鸭舌帽，正面一个小熊猫脸，一副白色大耳机从帽顶上跨过去 */
  headphoneCap: {
    slot: 'hat',
    hat(ctx, info) {
      const { rx, ry } = info.sp.head;
      ballCap(ctx, info, {
        crown: ['#4a4850', '#2d2b31'],
        seam: 'rgba(0, 0, 0, 0.45)',
        button: '#232127',
        brim: ['#3c3a41', '#222025'],
      }, (w, band) => {
        // 熊猫脸：两只黑耳朵 + 白脸 + 黑眼圈 + 小鼻子
        const x = w * 0.32;
        const y = band - 9.5;
        ctx.fillStyle = '#1d1c20';
        for (const s of [-1, 1]) {
          ellipse(ctx, x + s * 3.9, y - 3.9, 2.1, 2.1);
          ctx.fill();
        }
        ellipse(ctx, x, y, 5.4, 4.7);
        fillStroke(ctx, '#ffffff', 1, '#1d1c20');
        ctx.fillStyle = '#1d1c20';
        for (const s of [-1, 1]) {
          ellipse(ctx, x + s * 2.1, y - 0.2, 1.3, 1.8, s * -0.5);
          ctx.fill();
        }
        ellipse(ctx, x, y + 2, 0.9, 0.6);
        ctx.fill();
      });
      // 耳机：头带贴着帽顶跨过去，两个耳罩搭在头的两边（在眼睛外面、比眼睛高）
      const { lx } = info;
      const cy = -ry * 0.3;
      ctx.save();
      ctx.translate(lx * 2, 0);
      ctx.beginPath();
      ctx.ellipse(0, cy, rx * 0.97, ry * 0.8 + 8, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6.4;
      ctx.stroke();
      ctx.strokeStyle = '#f3f3f6';
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150, 150, 165, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (const s of [-1, 1]) {
        const x = s * rx * 0.97;
        roundRect(ctx, x - 6, cy - 9.5, 12, 19, 6); // 耳罩
        fillStroke(ctx, shade(ctx, cy - 9.5, cy + 9.5, '#ffffff', '#d5d7df'));
        roundRect(ctx, x - 2.8, cy - 6, 5.6, 12, 2.8);
        fillStroke(ctx, '#c4c7d2', 1);
      }
      ctx.restore();
    },
  },
};

// ================================================================ 眼镜（头的坐标，跟着眼睛走）

/** 镜片中心：熊猫的眼睛在黑眼圈靠里的一侧，镜片要往外挪一点才罩得住黑眼圈 */
function lensCenters({ sp, lx, ly }) {
  const F = sp.face || { eyeX: 15.5, eyeY: 4.5 };
  const x = F.glassesX ?? (sp.drawEyeBack ? F.eyeX + 3.5 : F.eyeX);
  const y = F.glassesY ?? F.eyeY - 0.5;
  return [-1, 1].map((s) => ({ s, x: s * x + lx * 6, y: y + ly * 3.5 }));
}

const GLASSES = {
  /** 01 圆框眼镜 */
  roundGlasses: {
    slot: 'glasses',
    glasses(ctx, info) {
      const lenses = lensCenters(info);
      const r = 7.6;
      const rx = info.sp.head.rx;
      ctx.save();
      ctx.strokeStyle = '#3f3029';
      ctx.lineWidth = 1.6;
      for (const { s, x, y } of lenses) {
        ellipse(ctx, x, y, r, r);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath(); // 镜腿：伸到脸颊边
        ctx.moveTo(x + s * r, y - 1);
        ctx.lineTo(s * (rx - 3), y - 3);
        ctx.stroke();
        ctx.save(); // 镜片上的反光
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, r - 2.4, -2.6, -1.9);
        ctx.stroke();
        ctx.restore();
      }
      const [a, b] = lenses;
      ctx.beginPath(); // 鼻梁
      ctx.moveTo(a.x + r, a.y - 0.5);
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 3.5, b.x - r, b.y - 0.5);
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 04 像素墨镜：一格一格的黑色"马赛克"墨镜 */
  pixelShades: {
    slot: 'glasses',
    glasses(ctx, info) {
      const lenses = lensCenters(info);
      const p = 2.5; // 一格的大小
      const rows = [[-4, 3], [-4, 3], [-3, 2], [-2, 1]]; // 每一行从第几格到第几格（下面越来越窄）
      ctx.save();
      ctx.fillStyle = '#17171c';
      const [a, b] = lenses;
      const y0 = a.y - 2.5 * p;
      for (let x = a.x; x <= b.x; x += p) ctx.fillRect(Math.round(x / p) * p - p / 2, y0, p + 0.3, p + 0.3); // 横梁
      for (const { x, y } of lenses) {
        rows.forEach(([from, to], row) => {
          for (let i = from; i <= to; i++) ctx.fillRect(x + i * p - p / 2, y0 + (row + 1) * p, p + 0.3, p + 0.3);
        });
      }
      ctx.fillStyle = '#ffffff'; // 白色的小方块反光
      for (const { x } of lenses) {
        ctx.fillRect(x - 3 * p - p / 2, y0 + p, p, p);
        ctx.fillRect(x - 2 * p - p / 2, y0 + 2 * p, p, p);
        ctx.fillRect(x - p / 2, y0 + p, p, p);
      }
      ctx.restore();
    },
  },

  /** 10 星形眼镜：两颗黄色的星星 */
  starGlasses: {
    slot: 'glasses',
    glasses(ctx, info) {
      const lenses = lensCenters(info);
      const rx = info.sp.head.rx;
      ctx.save();
      const [a, b] = lenses;
      ctx.strokeStyle = '#b98322';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); // 鼻梁和镜腿
      ctx.moveTo(a.x + 6, a.y - 1);
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 4, b.x - 6, b.y - 1);
      for (const { s, x, y } of lenses) {
        ctx.moveTo(x + s * 8.5, y - 1);
        ctx.lineTo(s * (rx - 3), y - 3);
      }
      ctx.stroke();
      for (const { s, x, y } of lenses) {
        starPath(ctx, x, y, 10, 0.52, s * 0.08);
        fillStroke(ctx, '#ffd04f', 1.5, '#b98322');
        starPath(ctx, x, y, 6.2, 0.52, s * 0.08);
        ctx.fillStyle = 'rgba(255, 246, 200, 0.85)';
        ctx.fill();
      }
      ctx.restore();
    },
  },

  /** 02 方框眼镜：黑色的圆角方框 */
  squareGlasses: {
    slot: 'glasses',
    glasses(ctx, info) {
      const lenses = lensCenters(info);
      const rx = info.sp.head.rx;
      const w = 16.5;
      const h = 13;
      ctx.save();
      ctx.strokeStyle = '#2f2622';
      ctx.lineWidth = 2.3;
      for (const { s, x, y } of lenses) {
        roundRect(ctx, x - w / 2, y - h / 2, w, h, 3.6);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath(); // 镜腿：伸到脸颊边
        ctx.moveTo(x + (s * w) / 2, y - h / 2 + 2.5);
        ctx.lineTo(s * (rx - 3), y - 3.5);
        ctx.stroke();
        ctx.save(); // 镜片上的反光：两道短斜线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 1);
        ctx.lineTo(x - 2.2, y - 3.8);
        ctx.moveTo(x - 4.6, y + 2.2);
        ctx.lineTo(x - 3.4, y + 1);
        ctx.stroke();
        ctx.restore();
      }
      const [a, b] = lenses;
      ctx.beginPath(); // 鼻梁
      ctx.moveTo(a.x + w / 2, a.y - 2);
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 4.5, b.x - w / 2, b.y - 2);
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 03 复古墨镜：金色细框、茶色的水滴形镜片，上面多一道横梁（飞行员墨镜） */
  retroShades: {
    slot: 'glasses',
    glasses(ctx, info) {
      const lenses = lensCenters(info);
      const rx = info.sp.head.rx;
      const gold = '#a8752a';
      const lens = () => {
        // 右边那片（左边那片左右翻过来画）：上沿几乎是平的，下面圆圆地往下坠
        ctx.beginPath();
        ctx.moveTo(-8, -5.5);
        ctx.lineTo(7, -6);
        ctx.bezierCurveTo(10.5, -5.6, 10.2, 2, 6.5, 5.8);
        ctx.bezierCurveTo(3.5, 9, -3.5, 9.2, -6.5, 5);
        ctx.bezierCurveTo(-8.6, 2, -9, -3, -8, -5.5);
        ctx.closePath();
      };
      const [a, b] = lenses;
      ctx.save();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); // 两道鼻梁：上面一道直的横梁，下面一道弯的；再加两条镜腿
      ctx.moveTo(a.x + 6.5, a.y - 6.4);
      ctx.lineTo(b.x - 6.5, b.y - 6.4);
      ctx.moveTo(a.x + 8.2, a.y - 3);
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 5.5, b.x - 8.2, b.y - 3);
      for (const { s, x, y } of lenses) {
        ctx.moveTo(x + s * 9.6, y - 5);
        ctx.lineTo(s * (rx - 3), y - 4);
      }
      ctx.stroke();
      for (const { s, x, y } of lenses) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, 1);
        lens();
        const tint = ctx.createLinearGradient(0, -6, 0, 9);
        tint.addColorStop(0, 'rgba(92, 60, 36, 0.92)');
        tint.addColorStop(1, 'rgba(165, 116, 72, 0.86)');
        fillStroke(ctx, tint, 1.8, gold);
        ctx.strokeStyle = 'rgba(255, 240, 215, 0.6)'; // 反光
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-5, -3);
        ctx.quadraticCurveTo(-1.5, -4.3, 2.5, -3.7);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  },

  /** 05 护目镜：绿色的软胶框、一整片透明镜片，中间给鼻子留个缺口，两边一根松紧带 */
  safetyGoggles: {
    slot: 'glasses',
    glasses(ctx, info) {
      const [a, b] = lensCenters(info);
      const rx = info.sp.head.rx;
      const cx = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const half = (b.x - a.x) / 2 + 11.5;
      const outline = (k) => {
        // k = 0 外框，k = 1 镜片（往里缩一圈）。只加路径，不开新路径：外框减镜片 = 一圈胶框
        const w = half - k * 3.2;
        const t = y - 9 + k * 3.2;
        const bo = y + 8 - k * 3.2;
        const notch = y + 1.5 - k * 0.4;
        ctx.moveTo(cx - w + 5, t);
        ctx.lineTo(cx + w - 5, t);
        ctx.quadraticCurveTo(cx + w, t, cx + w, t + 5);
        ctx.lineTo(cx + w, bo - 5);
        ctx.quadraticCurveTo(cx + w, bo, cx + w - 6, bo);
        ctx.bezierCurveTo(cx + 7, bo, cx + 6, notch, cx, notch);
        ctx.bezierCurveTo(cx - 6, notch, cx - 7, bo, cx - w + 6, bo);
        ctx.quadraticCurveTo(cx - w, bo, cx - w, bo - 5);
        ctx.lineTo(cx - w, t + 5);
        ctx.quadraticCurveTo(cx - w, t, cx - w + 5, t);
        ctx.closePath();
      };
      ctx.save();
      for (const s of [-1, 1]) {
        ctx.beginPath(); // 松紧带
        ctx.moveTo(cx + s * (half - 1), y - 1);
        ctx.lineTo(s * (rx + 0.5), y - 3);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5.4;
        ctx.stroke();
        ctx.strokeStyle = '#6aa257';
        ctx.lineWidth = 3.4;
        ctx.stroke();
      }
      ctx.beginPath(); // 镜片：淡淡的一层，看得见后面的眼睛
      outline(1);
      ctx.fillStyle = 'rgba(232, 250, 240, 0.4)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; // 镜片上的斜反光
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const x of [a.x - 4, b.x - 4]) {
        ctx.moveTo(x - 2, y + 2);
        ctx.lineTo(x + 3, y - 5);
      }
      ctx.stroke();
      ctx.restore();
      ctx.beginPath(); // 胶框
      outline(0);
      outline(1);
      ctx.fillStyle = shade(ctx, y - 9, y + 8, '#a8d690', '#76ad60');
      ctx.fill('evenodd');
      ctx.strokeStyle = '#3f6b34';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#4f8740'; // 框上的透气小孔
      for (const s of [-1, 1]) {
        for (const dx of [5, 8.5]) {
          ellipse(ctx, cx + s * (half - dx), y - 7.4, 0.9, 0.9);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  },

  /** 06 单片眼镜：右眼一个金色的圆框，下面垂着一小串金链子 */
  monocle: {
    slot: 'glasses',
    glasses(ctx, info) {
      const { x, y } = lensCenters(info)[1];
      const r = 8;
      ctx.save();
      ctx.strokeStyle = '#b8892f'; // 链子
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x + 2.5, y + r - 0.5);
      ctx.quadraticCurveTo(x + 4.2, y + r + 6, x + 2, y + r + 11.5);
      ctx.stroke();
      for (const [dx, dy, rr] of [[3.7, r + 4, 1.2], [3.6, r + 8, 1.4], [2, r + 12.2, 1.9]]) {
        ellipse(ctx, x + dx, y + dy, rr, rr);
        fillStroke(ctx, '#e8b955', 0.9, '#8f6420');
      }
      ellipse(ctx, x, y, r, r);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#7a5418'; // 金框：先描一道深色的边，再描金色
      ctx.lineWidth = 3.8;
      ctx.stroke();
      ctx.strokeStyle = '#e8b955';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // 反光
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r - 2.6, -2.6, -1.8);
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 07 旋涡眼镜：黑色的粗圆框，白镜片上一圈圈蓝色的旋涡（看起来晕乎乎的） */
  swirlGlasses: {
    slot: 'glasses',
    glasses(ctx, info) {
      const lenses = lensCenters(info);
      const rx = info.sp.head.rx;
      const r = 8.6;
      const frame = '#2a2328';
      const [a, b] = lenses;
      ctx.save();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); // 鼻梁 + 镜腿
      ctx.moveTo(a.x + r, a.y - 0.5);
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 3.5, b.x - r, b.y - 0.5);
      for (const { s, x, y } of lenses) {
        ctx.moveTo(x + s * r, y - 1);
        ctx.lineTo(s * (rx - 3), y - 3);
      }
      ctx.stroke();
      for (const { s, x, y } of lenses) {
        ellipse(ctx, x, y, r, r);
        ctx.fillStyle = shade(ctx, y - r, y + r, '#ffffff', '#e3e8f5');
        ctx.fill();
        ctx.strokeStyle = '#8c9fd6'; // 旋涡：从中心一圈圈转出来，左右两片转的方向相反
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const t = i / 64;
          const ang = s * t * 3 * TAU;
          const rr = t * (r - 2);
          const px = x + Math.cos(ang) * rr;
          const py = y + Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ellipse(ctx, x, y, r, r);
        ctx.strokeStyle = frame;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  /** 08 赛博朋克护目镜：一整片弯弯的彩色镜片（蓝、紫、粉的反光），深色细框 */
  cyberVisor: {
    slot: 'glasses',
    glasses(ctx, info) {
      const [a, b] = lensCenters(info);
      const rx = info.sp.head.rx;
      const cx = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const half = (b.x - a.x) / 2 + 12;
      const frame = '#3a3550';
      const visor = () => {
        ctx.beginPath();
        ctx.moveTo(cx - half, y - 6.5);
        ctx.quadraticCurveTo(cx, y - 9.5, cx + half, y - 6.5); // 上沿微微拱起
        ctx.bezierCurveTo(cx + half + 1.5, y - 1, cx + half, y + 6.5, cx + half - 7, y + 7);
        ctx.bezierCurveTo(cx + 10, y + 7.5, cx + 6.5, y + 2, cx, y + 2); // 下沿，中间给鼻子留个缺口
        ctx.bezierCurveTo(cx - 6.5, y + 2, cx - 10, y + 7.5, cx - half + 7, y + 7);
        ctx.bezierCurveTo(cx - half, y + 6.5, cx - half - 1.5, y - 1, cx - half, y - 6.5);
        ctx.closePath();
      };
      ctx.save();
      ctx.strokeStyle = frame; // 镜腿
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(cx + s * half, y - 4);
        ctx.lineTo(s * (rx - 2), y - 4.5);
      }
      ctx.stroke();
      visor();
      const glow = ctx.createLinearGradient(cx - half, y - 8, cx + half, y + 6);
      glow.addColorStop(0, 'rgba(150, 192, 255, 0.9)');
      glow.addColorStop(0.45, 'rgba(214, 172, 255, 0.9)');
      glow.addColorStop(1, 'rgba(255, 180, 216, 0.9)');
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.save(); // 反光：几道斜斜的白条
      visor();
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      for (const [x0, w] of [[cx - half * 0.55, 5], [cx - half * 0.3, 2.4], [cx + half * 0.45, 3.5]]) {
        ctx.beginPath();
        ctx.moveTo(x0, y - 10);
        ctx.lineTo(x0 + w, y - 10);
        ctx.lineTo(x0 + w - 7, y + 9);
        ctx.lineTo(x0 - 7, y + 9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      visor();
      ctx.strokeStyle = frame;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 09 科技电子镜：深灰色的一整片镜片，右边亮着一块青色的小屏幕（一颗小爱心、两格信号），左边几个小亮点 */
  techVisor: {
    slot: 'glasses',
    glasses(ctx, info) {
      const [a, b] = lensCenters(info);
      const rx = info.sp.head.rx;
      const cx = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const half = (b.x - a.x) / 2 + 11.5;
      const cyan = '#4fe3d4';
      const visor = () => {
        ctx.beginPath();
        ctx.moveTo(cx - half + 4, y - 8);
        ctx.lineTo(cx + half - 4, y - 8);
        ctx.quadraticCurveTo(cx + half + 0.5, y - 8, cx + half + 0.5, y - 3.5);
        ctx.lineTo(cx + half, y + 3);
        ctx.quadraticCurveTo(cx + half - 0.5, y + 7.5, cx + half - 6, y + 7.5);
        ctx.bezierCurveTo(cx + 9, y + 7.5, cx + 6, y + 2.5, cx, y + 2.5); // 鼻子的缺口
        ctx.bezierCurveTo(cx - 6, y + 2.5, cx - 9, y + 7.5, cx - half + 6, y + 7.5);
        ctx.quadraticCurveTo(cx - half + 0.5, y + 7.5, cx - half, y + 3);
        ctx.lineTo(cx - half - 0.5, y - 3.5);
        ctx.quadraticCurveTo(cx - half - 0.5, y - 8, cx - half + 4, y - 8);
        ctx.closePath();
      };
      ctx.save();
      ctx.strokeStyle = '#2a2d33'; // 镜腿
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(cx + s * half, y - 4);
        ctx.lineTo(s * (rx - 2), y - 4.5);
      }
      ctx.stroke();
      visor();
      fillStroke(ctx, shade(ctx, y - 8, y + 8, '#4a4f5a', '#2c2f36'), 1.6, '#24262b');
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'; // 上沿一道亮边
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - half + 4, y - 6.4);
      ctx.lineTo(cx + half - 4, y - 6.4);
      ctx.stroke();
      // 右边的小屏幕
      const sx = b.x;
      const sy = b.y - 0.5;
      roundRect(ctx, sx - 7.5, sy - 5, 15, 10, 2.4);
      ctx.fillStyle = 'rgba(79, 227, 212, 0.16)';
      ctx.fill();
      ctx.strokeStyle = cyan;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = cyan;
      ctx.beginPath(); // 小爱心
      const hx = sx - 3;
      const hy = sy - 0.6;
      ctx.moveTo(hx, hy + 2.4);
      ctx.bezierCurveTo(hx - 3.4, hy, hx - 2, hy - 2.6, hx, hy - 1);
      ctx.bezierCurveTo(hx + 2, hy - 2.6, hx + 3.4, hy, hx, hy + 2.4);
      ctx.fill();
      ctx.fillRect(sx + 1.6, sy + 0.2, 1.4, 2.2); // 两格信号
      ctx.fillRect(sx + 3.8, sy - 1.8, 1.4, 4.2);
      // 左边几个小亮点（像电路板上的灯）
      ctx.fillStyle = 'rgba(170, 215, 235, 0.75)';
      for (const [dx, dy, rr] of [[-4.5, -2, 1.1], [-0.5, 1.8, 0.8], [3.5, -1.2, 1.2], [5.2, 2.6, 0.7]]) {
        ellipse(ctx, a.x + dx, a.y + dy, rr, rr);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(170, 215, 235, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a.x - 4.5, a.y - 2);
      ctx.lineTo(a.x - 0.5, a.y + 1.8);
      ctx.lineTo(a.x + 3.5, a.y - 1.2);
      ctx.stroke();
      ctx.restore();
    },
  },
};

// ================================================================ 上衣（身体的坐标 + 手臂）

/**
 * 上衣的身子：裁剪在动物自己的身体轮廓里，从脖子一直盖到肚子下面一点（下摆露出一点点毛），
 * 再把身体的轮廓线描一遍（衣服把原来的轮廓线盖住了一半）。details 在衣服上画花样。
 */
function shirt(ctx, info, fill, details, { hemLine = true } = {}) {
  const { g, torso, sp } = info;
  const top = g.torsoCy - g.torsoRy - 30;
  const hem = g.torsoBottom - 2.5 - g.loaf * 1.5;
  ctx.save();
  torso();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-90, top);
  ctx.lineTo(90, top);
  ctx.lineTo(90, hem - 3);
  ctx.quadraticCurveTo(0, hem + 3, -90, hem - 3);
  ctx.closePath();
  ctx.fillStyle = fill(top, hem);
  ctx.fill();
  if (details) details(hem);
  if (hemLine) {
    // 下摆（毛绒外套的下摆是一圈绒毛，自己画，不要这条线）
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-90, hem - 3);
    ctx.quadraticCurveTo(0, hem + 3, 90, hem - 3);
    ctx.stroke();
  }
  ctx.restore();
  torso(); // 身体的轮廓线再描一遍
  ctx.strokeStyle = sp.palette.outline;
  ctx.lineWidth = 1.45;
  ctx.stroke();
}

/** 下巴在哪（身体的坐标）：衣领、领结要画在下巴下面才看得见 */
const chinY = (info) => info.g.headCy + info.sp.head.ry;

/** 下摆那条弧线上的一点（和 shirt 画的下摆是同一条曲线）：x 处的 y */
const hemAt = (hem, x) => hem - 3 + 6 * (1 - (x / 90) ** 2) / 2;

/**
 * 袖子：套在手臂靠肩膀的那一截。long = 长袖（盖到手腕），cuff = 袖口的颜色，
 * wide = 袖口比肩膀宽多少（和服那种喇叭袖），seams = 在袖子的哪几处（0…1）画一道横线（面包服一节一节的），
 * stripe = 袖口上一道细条纹的颜色，fur = 袖口改成一圈绒毛（绒毛的颜色）
 */
function sleeve(ctx, { len, r }, fill, { long = false, cuff = null, wide = 0, seams = null, stripe = null, fur = null } = {}) {
  const end = long ? len * 0.78 : len * 0.42;
  const w = r + 1.1;
  const we = w + 0.6 + wide; // 袖口的半宽
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-w, -1);
  ctx.arc(0, -1, w, Math.PI, 0);
  ctx.lineTo(we, end);
  ctx.quadraticCurveTo(0, end + 2.2, -we, end);
  ctx.closePath();
  fillStroke(ctx, fill, 1.3);
  if (seams) {
    ctx.strokeStyle = 'rgba(120, 70, 20, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of seams) {
      const y = end * f;
      const k = w + (we - w) * f;
      ctx.moveTo(-k + 0.5, y);
      ctx.quadraticCurveTo(0, y + 2, k - 0.5, y);
    }
    ctx.stroke();
  }
  if (cuff) {
    ctx.beginPath();
    ctx.moveTo(-we, end - 3.2);
    ctx.quadraticCurveTo(0, end - 1, we, end - 3.2);
    ctx.lineTo(we, end);
    ctx.quadraticCurveTo(0, end + 2.2, -we, end);
    ctx.closePath();
    fillStroke(ctx, cuff, 1.1);
    if (stripe) {
      ctx.strokeStyle = stripe;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-we + 0.8, end - 1.7);
      ctx.quadraticCurveTo(0, end + 0.4, we - 0.8, end - 1.7);
      ctx.stroke();
    }
  }
  if (fur) {
    const puffs = []; // 挨得紧一点，不然像一串珠子
    for (let i = 0; i <= 6; i++) {
      const x = -we + (i / 6) * we * 2;
      puffs.push([x * 0.92, end - 1 + (1 - (x / we) ** 2) * 1, 2.7 + 0.4 * Math.sin(i * 2.1)]);
    }
    fluff(ctx, puffs, fur);
  }
  ctx.restore();
}

/** 小花（和风外套上的花纹）：五片圆花瓣 + 花心 */
function blossom(ctx, x, y, r, petal, center) {
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    ellipse(ctx, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, r * 0.48);
    ctx.fill();
  }
  ctx.fillStyle = center;
  ellipse(ctx, x, y, r * 0.3, r * 0.3);
  ctx.fill();
}

/** 蝴蝶结（毛绒外套领口）：两个圈 + 中间的结 + 两条短飘带 */
function bow(ctx, x, y, s, fill, dark) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  for (const k of [-1, 1]) {
    ctx.beginPath(); // 飘带
    ctx.moveTo(k * 0.8, 0.5);
    ctx.lineTo(k * 3.4, 8.5);
    ctx.lineTo(k * 1.4, 7.4);
    ctx.lineTo(k * 0.2, 8.6);
    ctx.closePath();
    fillStroke(ctx, dark, 1.1);
  }
  for (const k of [-1, 1]) {
    ctx.beginPath(); // 圈
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(k * 3, -6, k * 9, -5, k * 8.4, -0.2);
    ctx.bezierCurveTo(k * 8, 4.6, k * 3, 4, 0, 0);
    ctx.closePath();
    fillStroke(ctx, fill, 1.2);
    ellipse(ctx, k * 4.6, -0.4, 1.8, 1.1);
    ctx.fillStyle = dark;
    ctx.fill();
  }
  ellipse(ctx, 0, 0, 2.3, 2.6); // 结
  fillStroke(ctx, fill, 1.2);
  ctx.restore();
}

const TOPS = {
  /** 01 水手服：白色上衣、蓝色大翻领（带白边）、红色领巾 */
  sailorTop: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      const tip = g.torsoCy + 3; // 翻领 V 字的尖
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#ffffff', '#e9edf3'), () => {
        const w = g.torsoRxTop * 1.05;
        ctx.beginPath(); // 蓝色翻领
        ctx.moveTo(-w, chin - 12);
        ctx.lineTo(-w * 0.98, chin + 6);
        ctx.lineTo(0, tip);
        ctx.lineTo(w * 0.98, chin + 6);
        ctx.lineTo(w, chin - 12);
        ctx.closePath();
        fillStroke(ctx, '#5f80c6', 1.3);
        ctx.strokeStyle = '#ffffff'; // 翻领的白边
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.86, chin + 4.5);
        ctx.lineTo(0, tip - 3.5);
        ctx.lineTo(w * 0.86, chin + 4.5);
        ctx.stroke();
        ctx.beginPath(); // 红色领巾：一个结 + 两条尾巴
        ctx.moveTo(-4, tip - 2);
        ctx.lineTo(-6.5, tip + 8);
        ctx.lineTo(-1.5, tip + 5);
        ctx.lineTo(0, tip + 1);
        ctx.lineTo(1.5, tip + 5);
        ctx.lineTo(6.5, tip + 8);
        ctx.lineTo(4, tip - 2);
        ctx.closePath();
        fillStroke(ctx, '#e0533f', 1.1);
        ellipse(ctx, 0, tip - 1.2, 3, 2.6);
        fillStroke(ctx, '#e8604b', 1.1);
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#fbfcfe', { cuff: '#5f80c6' });
    },
  },

  /** 02 连帽衫：奶油色，脖子后面一圈帽子，两根抽绳，肚子上一个大口袋 */
  hoodie: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#f6dcae', '#e6bf82'), (hem) => {
        ellipse(ctx, 0, chin - 4, g.torsoRxTop * 1.1, 8.5); // 帽子堆在脖子后面（中间被下巴挡住，两边露出来）
        fillStroke(ctx, '#edcf98', 1.3);
        ctx.strokeStyle = '#b89463'; // 抽绳
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const s of [-1, 1]) {
          ctx.moveTo(s * 4, chin + 1);
          ctx.lineTo(s * 4.6, chin + 10);
        }
        ctx.stroke();
        ctx.fillStyle = '#b89463';
        for (const s of [-1, 1]) {
          ellipse(ctx, s * 4.6, chin + 11, 1.3, 1.3);
          ctx.fill();
        }
        const pw = g.torsoRxBot * 0.62; // 袋鼠口袋
        const py = Math.max(chin + 13, hem - 15);
        ctx.beginPath();
        ctx.moveTo(-pw * 0.7, py);
        ctx.lineTo(pw * 0.7, py);
        ctx.quadraticCurveTo(pw, py + 1, pw, py + 6);
        ctx.lineTo(pw, hem - 3);
        ctx.lineTo(-pw, hem - 3);
        ctx.lineTo(-pw, py + 6);
        ctx.quadraticCurveTo(-pw, py + 1, -pw * 0.7, py);
        ctx.closePath();
        fillStroke(ctx, '#f0d3a0', 1.2);
        pawPrint(ctx, 0, py + 6, 0.9, 'rgba(196, 130, 80, 0.8)');
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#f3d6a6', { long: true, cuff: '#dfba7c' });
    },
  },

  /** 04 针织毛衣：暖黄色，胸前两道麻花纹，罗纹下摆 */
  knitSweater: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#f7dda9', '#e5be7c'), (hem) => {
        ctx.strokeStyle = 'rgba(165, 115, 50, 0.55)'; // 麻花纹：两道 S 形交错的线
        ctx.lineWidth = 1.1;
        for (const x of [-g.torsoRxTop * 0.42, g.torsoRxTop * 0.42]) {
          ctx.beginPath();
          for (let y = chin; y < hem - 5; y += 5) {
            ctx.moveTo(x - 2.2, y);
            ctx.quadraticCurveTo(x + 2.2, y + 2.5, x - 2.2, y + 5);
            ctx.moveTo(x + 2.2, y);
            ctx.quadraticCurveTo(x - 2.2, y + 2.5, x + 2.2, y + 5);
          }
          ctx.stroke();
        }
        ctx.beginPath(); // 罗纹下摆
        ctx.moveTo(-90, hem - 7);
        ctx.quadraticCurveTo(0, hem - 1, 90, hem - 7);
        ctx.lineTo(90, hem - 3);
        ctx.quadraticCurveTo(0, hem + 3, -90, hem - 3);
        ctx.closePath();
        ctx.fillStyle = '#dcb06b';
        ctx.fill();
        ctx.strokeStyle = 'rgba(140, 95, 35, 0.45)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let x = -40; x <= 40; x += 2.8) {
          ctx.moveTo(x, hem - 6.5 + Math.abs(x) * 0.03);
          ctx.lineTo(x, hem - 1 + Math.abs(x) * 0.02);
        }
        ctx.stroke();
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#f3d59c', { long: true, cuff: '#dcb06b' });
    },
  },

  /** 10 盘扣中国风上衣：红色，金色小花点，立领，前襟三对金色盘扣 */
  tangJacket: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#e65a4c', '#c63d33'), (hem) => {
        ctx.fillStyle = 'rgba(255, 210, 110, 0.55)'; // 金色小花点
        for (const [x, y] of [[-14, chin + 6], [12, chin + 12], [-8, chin + 20], [16, chin + 26], [-17, chin + 28]]) {
          if (y > hem - 4) continue;
          starPath(ctx, x * (g.torsoRxTop / 21), y, 2, 0.45);
          ctx.fill();
        }
        roundRect(ctx, -9, chin - 3.5, 18, 6, 2.5); // 立领
        fillStroke(ctx, '#f2c45a', 1.1);
        ctx.strokeStyle = INK; // 前襟
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, chin + 2.5);
        ctx.lineTo(0, hem - 2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          // 盘扣：一个小"8"字结
          const y = chin + 7 + i * 7;
          if (y > hem - 5) break;
          ctx.strokeStyle = '#f2c45a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(-3.2, y, 2.8, 1.5, 0, 0, TAU);
          ctx.moveTo(6, y);
          ctx.ellipse(3.2, y, 2.8, 1.5, 0, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#f2c45a';
          ellipse(ctx, 0, y, 1.4, 1.4);
          ctx.fill();
        }
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#df5246', { long: true, cuff: '#f2c45a' });
    },
  },

  /** 03 学院制服（棒球外套）：深蓝的身子、米白的袖子，条纹罗纹领口，前襟一排按扣，右胸一个大写的 P */
  varsityJacket: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      const navy = '#3d4766';
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#525e82', '#39425f'), (hem) => {
        const w = g.torsoRxTop;
        ctx.beginPath(); // 里面露出来的白 T 恤
        ctx.moveTo(-7.5, chin - 8);
        ctx.lineTo(7.5, chin - 8);
        ctx.lineTo(2.6, chin + 9.5);
        ctx.lineTo(-2.6, chin + 9.5);
        ctx.closePath();
        fillStroke(ctx, '#fbfaf6', 1.1);
        for (const s of [-1, 1]) {
          ctx.beginPath(); // 罗纹领口：米白色，中间一道深蓝条纹
          ctx.moveTo(s * 7.5, chin - 8);
          ctx.lineTo(s * 13, chin - 7);
          ctx.lineTo(s * 4.6, chin + 10.5);
          ctx.lineTo(s * 2.2, chin + 9.5);
          ctx.closePath();
          fillStroke(ctx, '#f3e9d6', 1.1);
          ctx.strokeStyle = navy;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s * 10.2, chin - 7.5);
          ctx.lineTo(s * 3.4, chin + 10);
          ctx.stroke();
        }
        ctx.strokeStyle = INK; // 前襟
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, chin + 10);
        ctx.lineTo(0, hem);
        ctx.stroke();
        for (let y = chin + 14; y < hem - 4; y += 7) {
          ellipse(ctx, -2.6, y, 1.2, 1.2); // 按扣
          fillStroke(ctx, '#e9e2d2', 0.8);
        }
        // 右胸的字母 P（毛巾布贴的那种：粗粗的金色，描一圈深色边）
        const px = w * 0.5;
        const py = chin + 13;
        ctx.beginPath();
        ctx.moveTo(px - 2, py + 5);
        ctx.lineTo(px - 2, py - 4.5);
        ctx.lineTo(px + 0.8, py - 4.5);
        ctx.quadraticCurveTo(px + 4.2, py - 4.5, px + 4.2, py - 1.6);
        ctx.quadraticCurveTo(px + 4.2, py + 1.2, px + 0.8, py + 1.2);
        ctx.lineTo(px - 2, py + 1.2);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.8;
        ctx.stroke();
        ctx.strokeStyle = '#f2c45a';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.beginPath(); // 罗纹下摆：深一点的蓝，一道米白条纹
        ctx.moveTo(-90, hem - 8);
        ctx.quadraticCurveTo(0, hem - 2, 90, hem - 8);
        ctx.lineTo(90, hem - 3);
        ctx.quadraticCurveTo(0, hem + 3, -90, hem - 3);
        ctx.closePath();
        ctx.fillStyle = '#2e3550';
        ctx.fill();
        ctx.strokeStyle = '#f3e9d6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-90, hem - 5.5);
        ctx.quadraticCurveTo(0, hem + 0.5, 90, hem - 5.5);
        ctx.stroke();
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#f4ecdc', { long: true, cuff: '#3a4262', stripe: '#f4ecdc' });
    },
  },

  /** 05 和风外套：粉红色、印着白色和金色的小花，交叉的白衣领（正面看是个"y"字），腰上一条深红的腰带，喇叭袖 */
  haori: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#f39187', '#de6c63'), (hem) => {
        const w = g.torsoRxTop;
        for (const [x, y, s, petal] of [[-0.55, 7, 1, '#fff6ea'], [0.6, 4, 0.8, '#ffd97a'], [0.4, 21, 0.9, '#fff6ea'], [-0.35, 28, 0.85, '#ffd97a'], [-0.85, 20, 0.7, '#fff6ea'], [0.85, 15, 0.7, '#ffd97a']]) {
          if (chin + y > hem - 3) continue;
          blossom(ctx, x * w, chin + y, 3 * s, petal, '#e9a23b');
        }
        const obi = Math.min(chin + 20, hem - 9); // 腰带的上沿
        const collar = (x0, y0, x1, y1) => {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 5.6;
          ctx.stroke();
          ctx.strokeStyle = '#fff7ef';
          ctx.lineWidth = 3.6;
          ctx.stroke();
        };
        ctx.lineCap = 'butt';
        // 盖在上面那片的领子是"y"的长笔：从右肩斜着下到左边的腰带
        const [x0, y0, x1, y1] = [10, chin - 6, -w * 0.7, obi + 1];
        // 底下那片的领子是"y"的短笔：正好停在长笔上，接头被长笔盖住（再长一点就成了"X"）
        const meet = 0.42;
        collar(-10, chin - 6, x0 + (x1 - x0) * meet, y0 + (y1 - y0) * meet);
        collar(x0, y0, x1, y1);
        ctx.lineCap = 'round';
        ctx.beginPath(); // 腰带
        ctx.moveTo(-90, obi);
        ctx.quadraticCurveTo(0, obi + 2.5, 90, obi);
        ctx.lineTo(90, obi + 6);
        ctx.quadraticCurveTo(0, obi + 8.5, -90, obi + 6);
        ctx.closePath();
        fillStroke(ctx, shade(ctx, obi, obi + 7, '#b84840', '#9b3732'), 1.2);
        ctx.strokeStyle = '#f2c45a'; // 腰带上一道金线
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-90, obi + 3);
        ctx.quadraticCurveTo(0, obi + 5.5, 90, obi + 3);
        ctx.stroke();
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#ee8379', { long: true, wide: 2.6, cuff: '#fff4ea' });
    },
  },

  /** 06 围裙背带衫：绿色长袖衫，外面一条米白色的背带围裙，背带上两颗橘色扣子，肚子上一个大口袋 */
  apronOveralls: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#a2d18f', '#7eb26b'), (hem) => {
        const w = g.torsoRxTop;
        const bibTop = chin + 4;
        const bibW = w * 0.55;
        const waist = Math.min(chin + 17, hem - 12);
        for (const s of [-1, 1]) {
          ctx.beginPath(); // 背带：从围兜两角往上，翻过肩膀（上面那截被下巴挡住）
          ctx.moveTo(s * (bibW - 3.5), bibTop + 1);
          ctx.lineTo(s * (bibW + 0.5), chin - 10);
          ctx.lineTo(s * (bibW + 5), chin - 10);
          ctx.lineTo(s * (bibW + 0.5), bibTop + 1);
          ctx.closePath();
          fillStroke(ctx, '#f6e6c2', 1.1);
        }
        ctx.beginPath(); // 围裙：上面一块围兜，腰以下往两边展开盖住肚子
        ctx.moveTo(-bibW, bibTop);
        ctx.lineTo(bibW, bibTop);
        ctx.lineTo(bibW, waist);
        ctx.quadraticCurveTo(w * 1.2, waist + 3, 90, waist + 12);
        ctx.lineTo(90, hem + 8);
        ctx.lineTo(-90, hem + 8);
        ctx.lineTo(-90, waist + 12);
        ctx.quadraticCurveTo(-w * 1.2, waist + 3, -bibW, waist);
        ctx.closePath();
        fillStroke(ctx, shade(ctx, bibTop, hem, '#fdf3dc', '#f1ddb4'), 1.3);
        ctx.strokeStyle = 'rgba(170, 120, 60, 0.45)'; // 围兜上一圈缝线
        ctx.lineWidth = 0.9;
        ctx.setLineDash([1.6, 1.6]);
        ctx.beginPath();
        ctx.moveTo(-bibW + 2, bibTop + 2);
        ctx.lineTo(bibW - 2, bibTop + 2);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const s of [-1, 1]) {
          ellipse(ctx, s * (bibW - 2.6), bibTop + 2.6, 1.7, 1.7); // 扣子
          fillStroke(ctx, '#f19d4c', 1);
        }
        const pw = w * 0.42; // 大口袋
        const py = waist + 3;
        const ph = Math.max(3, Math.min(8, hem - 4 - py));
        ctx.beginPath();
        ctx.moveTo(-pw, py);
        ctx.lineTo(pw, py);
        ctx.bezierCurveTo(pw, py + ph * 1.3, -pw, py + ph * 1.3, -pw, py);
        ctx.closePath();
        fillStroke(ctx, '#f5c58c', 1.2);
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#97ca84', { long: true, cuff: '#7eb26b' });
    },
  },

  /** 07 领带小西服：白衬衫、深灰色的小马甲（V 领），红领带，马甲上两颗扣子 */
  vestTie: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#ffffff', '#e9edf2'), (hem) => {
        const w = g.torsoRxTop;
        const vTip = Math.min(chin + 15, hem - 10); // V 领最低的地方
        ctx.beginPath(); // 红领带（下半截藏在马甲里）
        ctx.moveTo(-2.2, chin + 1);
        ctx.lineTo(2.2, chin + 1);
        ctx.lineTo(1.6, chin + 4);
        ctx.lineTo(3.4, vTip + 6);
        ctx.lineTo(0, vTip + 9);
        ctx.lineTo(-3.4, vTip + 6);
        ctx.lineTo(-1.6, chin + 4);
        ctx.closePath();
        fillStroke(ctx, shade(ctx, chin, vTip, '#e55a4e', '#c8433a'), 1.1);
        ctx.beginPath(); // 领带结
        ctx.moveTo(-2.8, chin - 0.5);
        ctx.lineTo(2.8, chin - 0.5);
        ctx.lineTo(1.8, chin + 3.8);
        ctx.lineTo(-1.8, chin + 3.8);
        ctx.closePath();
        fillStroke(ctx, '#d84c41', 1.1);
        for (const s of [-1, 1]) {
          ctx.beginPath(); // 衬衫的尖领子
          ctx.moveTo(s * 2.4, chin - 1);
          ctx.lineTo(s * 9, chin - 3);
          ctx.lineTo(s * 6, chin + 4.5);
          ctx.closePath();
          fillStroke(ctx, '#ffffff', 1.1);
        }
        ctx.beginPath(); // 马甲：除了 V 领那一块，整个盖住
        ctx.moveTo(-90, chin - 14);
        ctx.lineTo(-w * 0.95, chin - 14);
        ctx.lineTo(0, vTip);
        ctx.lineTo(w * 0.95, chin - 14);
        ctx.lineTo(90, chin - 14);
        ctx.lineTo(90, hem + 6);
        ctx.lineTo(-90, hem + 6);
        ctx.closePath();
        fillStroke(ctx, shade(ctx, chin, hem, '#555767', '#3b3c49'), 1.3);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; // 马甲前襟
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, vTip);
        ctx.lineTo(0.8, hem);
        ctx.stroke();
        for (const y of [vTip + 4.5, vTip + 10]) {
          if (y > hem - 4) break;
          ellipse(ctx, 2.6, y, 1.2, 1.2); // 扣子
          fillStroke(ctx, '#c9c2b4', 0.8, '#26262e');
        }
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#fbfcfe', { cuff: '#eef1f5' });
    },
  },

  /** 08 面包服：鼓鼓的黄色羽绒服，一道道横着的绗线，中间一条拉链，脖子后面一圈帽子 */
  pufferJacket: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#ffd98c', '#f0ad57'), (hem) => {
        ellipse(ctx, 0, chin - 4, g.torsoRxTop * 1.1, 8.5); // 帽子堆在脖子后面
        fillStroke(ctx, '#f7c873', 1.3);
        for (let y = chin + 6; y < hem - 4; y += 8) {
          ctx.beginPath(); // 一节一节鼓起来：绗线上面亮一点，下面暗一点
          ctx.moveTo(-90, y + 1);
          ctx.quadraticCurveTo(0, y + 4, 90, y + 1);
          ctx.strokeStyle = 'rgba(150, 85, 20, 0.45)';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-90, y - 2.6);
          ctx.quadraticCurveTo(0, y + 0.4, 90, y - 2.6);
          ctx.strokeStyle = 'rgba(255, 248, 220, 0.5)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.strokeStyle = INK; // 拉链
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, chin + 1);
        ctx.lineTo(0, hem);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(93, 67, 52, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let y = chin + 3; y < hem - 1; y += 2.2) {
          ctx.moveTo(-1.3, y);
          ctx.lineTo(1.3, y);
        }
        ctx.stroke();
        roundRect(ctx, -1.6, chin + 1.5, 3.2, 6, 1.2); // 拉链头
        fillStroke(ctx, '#d9d4c9', 0.9);
      });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#f8c46e', { long: true, wide: 1.2, cuff: '#e8a44f', seams: [0.36, 0.66] });
    },
  },

  /** 09 毛绒外套：深棕色的小斗篷，领口和下摆一圈白绒毛，领口系着红蝴蝶结 */
  furCoat: {
    slot: 'top',
    body(ctx, info) {
      const { g } = info;
      const chin = chinY(info);
      const fur = '#fbf3e6';
      shirt(ctx, info, (a, b) => shade(ctx, a, b, '#7c5648', '#5d3f35'), (hem) => {
        const w = g.torsoRxTop;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; // 斗篷的褶子
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const x of [-0.6, -0.2, 0.25, 0.65]) {
          ctx.moveTo(x * w * 0.7, chin + 6);
          ctx.quadraticCurveTo(x * w * 1.1, (chin + hem) / 2, x * w * 1.5, hem - 3);
        }
        ctx.stroke();
        const hemPuffs = []; // 下摆一圈绒毛
        for (let x = -w * 1.6; x <= w * 1.6; x += 4.2) hemPuffs.push([x, hemAt(hem, x) - 1.5, 3.7 + 0.5 * Math.sin(x * 1.7)]);
        fluff(ctx, hemPuffs, fur);
        // 领口一圈绒毛：大脑袋会挡住脖子，所以绒毛围得低一点，在下巴底下露出蓬蓬的一圈
        const collarPuffs = [];
        const n = 12;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = (t * 2 - 1) * w * 0.95;
          collarPuffs.push([x, chin + 1 + (1 - (t * 2 - 1) ** 2) * 5, 4.6 + 0.6 * Math.sin(i * 2.3)]);
        }
        fluff(ctx, collarPuffs, fur);
        bow(ctx, 0, chin + 7.5, 0.95, '#e0473e', '#b8332c');
      }, { hemLine: false });
    },
    sleeve(ctx, arm) {
      sleeve(ctx, arm, '#6e4c40', { long: true, wide: 1, fur: '#fbf3e6' });
    },
  },
};

// ================================================================ 背包（身体的坐标）

/**
 * 双肩包胸前的两条背带：从肩膀往下，钻到胳膊底下；chest = 登山包那种胸前再扣一根横带（横带的颜色）
 */
function packStraps(ctx, g, strap, buckle, chest = null) {
  const top = g.torsoCy - g.torsoRy;
  for (const s of [-1, 1]) {
    const x0 = s * g.torsoRxTop * 0.6;
    ctx.beginPath();
    ctx.moveTo(x0 - 2.4, top + 2);
    ctx.lineTo(x0 + 2.4, top + 2);
    ctx.lineTo(x0 * 0.94 + 2.4, g.torsoCy + 8);
    ctx.lineTo(x0 * 0.94 - 2.4, g.torsoCy + 8);
    ctx.closePath();
    fillStroke(ctx, strap, 1.2);
    roundRect(ctx, x0 * 0.96 - 3, g.torsoCy - 4, 6, 3.2, 1); // 背带上的小扣子
    fillStroke(ctx, buckle, 0.9);
  }
  if (chest) {
    const y = g.torsoCy - 10;
    const x = g.torsoRxTop * 0.6 * 0.97;
    roundRect(ctx, -x, y - 1.3, x * 2, 2.6, 1.2);
    fillStroke(ctx, chest, 0.9);
    roundRect(ctx, -3.2, y - 2.3, 6.4, 4.6, 1.3);
    fillStroke(ctx, buckle, 0.9);
  }
}

/** 斜挎的带子：从 (x0, y0) 到 (x1, y1)，先描一道深色的边再填颜色 */
function strapLine(ctx, x0, y0, x1, y1, color, width = 2.6) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 1.8;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** 小天使翅膀（翅膀小背包）：s = 哪一边，三片圆圆的羽毛 */
function wing(ctx, s, flap) {
  ctx.save();
  ctx.scale(s, 1);
  ctx.rotate(-0.22 - flap);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(7, -12, 19, -15, 25, -10);
  ctx.quadraticCurveTo(26, -3, 20, -3.2);
  ctx.quadraticCurveTo(21, 2.4, 14.5, 2);
  ctx.quadraticCurveTo(14.5, 7, 8.5, 5.8);
  ctx.quadraticCurveTo(4.5, 7.5, 0, 4);
  ctx.closePath();
  fillStroke(ctx, shade(ctx, -14, 7, '#ffffff', '#e8ecf4'), 1.3);
  ctx.strokeStyle = 'rgba(140, 150, 175, 0.55)'; // 羽毛的分界
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4, -1);
  ctx.quadraticCurveTo(12, -5, 19, -4);
  ctx.moveTo(4, 2);
  ctx.quadraticCurveTo(9, 0.5, 13.5, 1.2);
  ctx.stroke();
  ctx.restore();
}

const BAGS = {
  /** 01 米色双肩包：包背在身后、往右边歪出来一大截（从正面也看得见），胸前两条背带 */
  backpack: {
    slot: 'bag',
    back(ctx, { g }) {
      const w = 28;
      const h = 32;
      const x = g.torsoCx + g.torsoRxTop + 6;
      const y = g.torsoCy - 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.16);
      ctx.strokeStyle = INK; // 顶上的提手
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(-2, -h / 2, 4.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = '#d2ad6e';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      roundRect(ctx, -w / 2, -h / 2, w, h, 9);
      fillStroke(ctx, shade(ctx, -h / 2, h / 2, '#f4dfb4', '#dcbf86'));
      roundRect(ctx, -w / 2 + 3.5, 0, w - 7, h / 2 - 3.5, 5); // 前面的小口袋
      fillStroke(ctx, '#ecd19d', 1.2);
      ctx.strokeStyle = 'rgba(140, 100, 50, 0.6)'; // 拉链
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, -h / 2 + 7);
      ctx.quadraticCurveTo(0, -h / 2 + 4, w / 2 - 4, -h / 2 + 7);
      ctx.stroke();
      ctx.restore();
    },
    front(ctx, { g }) {
      packStraps(ctx, g, '#d2ad6e', '#9b7a45');
    },
  },

  /** 08 猫脸包：一根斜挎的带子，包挂在左边腰上，是一张三花猫的脸 */
  catBag: {
    slot: 'bag',
    front(ctx, { g }) {
      const top = g.torsoCy - g.torsoRy;
      const bx = -g.torsoRxBot * 0.82;
      const by = g.torsoCy + 9;
      ctx.strokeStyle = INK; // 斜挎带
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(g.torsoRxTop * 0.7, top + 3);
      ctx.lineTo(bx + 4, by - 6);
      ctx.stroke();
      ctx.strokeStyle = '#e7a35f';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.save(); // 包：一张猫脸
      ctx.translate(bx, by);
      ctx.rotate(-0.12);
      ctx.scale(1.2, 1.2);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -7);
        ctx.lineTo(s * 9.5, -13);
        ctx.lineTo(s * 10.5, -3);
        ctx.closePath();
        fillStroke(ctx, s < 0 ? '#f2a85c' : '#7a6a62', 1.2);
      }
      ellipse(ctx, 0, 0, 12, 9.5);
      fillStroke(ctx, '#fff8ee', 1.3);
      ctx.save();
      ellipse(ctx, 0, 0, 12, 9.5);
      ctx.clip();
      ellipse(ctx, -8, -6, 7, 5.5); // 三花斑
      ctx.fillStyle = '#f2a85c';
      ctx.fill();
      ellipse(ctx, 8.5, -7, 5.5, 4.5);
      ctx.fillStyle = '#7a6a62';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#4a3328'; // 眼睛、嘴、腮红
      ellipse(ctx, -4, -0.5, 1.2, 1.6);
      ctx.fill();
      ellipse(ctx, 4, -0.5, 1.2, 1.6);
      ctx.fill();
      ctx.strokeStyle = '#4a3328';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-2, 2.5);
      ctx.quadraticCurveTo(-1, 3.8, 0, 2.6);
      ctx.quadraticCurveTo(1, 3.8, 2, 2.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(245, 150, 140, 0.6)';
      ellipse(ctx, -7, 2.5, 2, 1.2);
      ctx.fill();
      ellipse(ctx, 7, 2.5, 2, 1.2);
      ctx.fill();
      ctx.restore();
    },
  },

  /** 02 棕色单肩包：深棕色的方包、金色的搭扣，带子直直地挂在左肩上 */
  shoulderBag: {
    slot: 'bag',
    front(ctx, { g }) {
      const top = g.torsoCy - g.torsoRy;
      const bx = -g.torsoRxBot * 0.5;
      const by = g.torsoCy + 9;
      strapLine(ctx, -g.torsoRxTop * 0.62, top + 2, bx + 6, by - 7, '#54433e');
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(0.08);
      roundRect(ctx, -11, -7.5, 22, 15, 4); // 包身
      fillStroke(ctx, shade(ctx, -7.5, 7.5, '#5e4c47', '#3f322e'));
      roundRect(ctx, -11.5, -8, 23, 9.5, 4); // 翻盖
      fillStroke(ctx, shade(ctx, -8, 1.5, '#6c5852', '#54443f'), 1.2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; // 翻盖边上的缝线
      ctx.lineWidth = 0.8;
      ctx.setLineDash([1.4, 1.4]);
      ctx.beginPath();
      ctx.moveTo(-9.5, -0.5);
      ctx.lineTo(9.5, -0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      roundRect(ctx, -2.6, -0.8, 5.2, 4.4, 1.2); // 金色搭扣
      fillStroke(ctx, '#f2c45a', 1);
      ctx.restore();
    },
  },

  /** 03 透明猫咪包：背在身后、往右边歪出来，圆顶上一个透明的大窗，里面坐着一只小猫玩偶 */
  bubbleBag: {
    slot: 'bag',
    back(ctx, { g }) {
      const w = 28;
      const h = 31;
      ctx.save();
      ctx.translate(g.torsoCx + g.torsoRxTop + 9, g.torsoCy - 5);
      ctx.rotate(0.14);
      ctx.beginPath(); // 包身：上面圆圆的
      ctx.moveTo(-w / 2, h / 2 - 4);
      ctx.lineTo(-w / 2, -h / 2 + w / 2);
      ctx.arc(0, -h / 2 + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(w / 2, h / 2 - 4);
      ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - 4, h / 2);
      ctx.lineTo(-w / 2 + 4, h / 2);
      ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - 4);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, -h / 2, h / 2, '#f1edf6', '#d6cfe2'));
      const wx = 3; // 窗户往外侧挪一点（靠里的一半被身子挡住）
      const wy = -2;
      const wr = 9.5;
      ellipse(ctx, wx, wy, wr, wr); // 透明的窗：里面是小猫玩偶
      ctx.fillStyle = '#fff7ec';
      ctx.fill();
      ctx.save();
      ellipse(ctx, wx, wy, wr, wr);
      ctx.clip();
      for (const s of [-1, 1]) {
        ctx.beginPath(); // 小猫的耳朵
        ctx.moveTo(wx + s * 2, wy - 1);
        ctx.lineTo(wx + s * 5.5, wy - 6);
        ctx.lineTo(wx + s * 6.5, wy);
        ctx.closePath();
        fillStroke(ctx, '#f4b46a', 1);
      }
      ellipse(ctx, wx, wy + 3, 7.5, 6); // 小猫的脸
      fillStroke(ctx, '#f8c27d', 1);
      ctx.fillStyle = '#5d4334';
      for (const s of [-1, 1]) {
        ellipse(ctx, wx + s * 2.6, wy + 2.4, 0.8, 1.1);
        ctx.fill();
      }
      ctx.strokeStyle = '#5d4334';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(wx - 1.3, wy + 4.6);
      ctx.quadraticCurveTo(wx - 0.6, wy + 5.6, wx, wy + 4.8);
      ctx.quadraticCurveTo(wx + 0.6, wy + 5.6, wx + 1.3, wy + 4.6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200, 225, 245, 0.35)'; // 玻璃的颜色
      ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
      ctx.restore();
      ellipse(ctx, wx, wy, wr, wr);
      ctx.strokeStyle = '#a99bbd';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // 玻璃上的反光
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(wx, wy, wr - 2.6, -2.7, -1.9);
      ctx.stroke();
      ctx.restore();
    },
    front(ctx, { g }) {
      packStraps(ctx, g, '#cfc5de', '#9c8fb3');
    },
  },

  /** 04 复古书包：浅棕色皮革，翻盖上两根皮带、一个金扣，从左肩斜挎下来，挂在右边肚子上 */
  satchel: {
    slot: 'bag',
    front(ctx, { g }) {
      const top = g.torsoCy - g.torsoRy;
      const bx = g.torsoRxBot * 0.48;
      const by = g.torsoCy + 10;
      strapLine(ctx, -g.torsoRxTop * 0.68, top + 3, bx - 6, by - 7, '#b3865a');
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-0.1);
      ctx.strokeStyle = INK; // 顶上的提手
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -8, 4.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = '#a77a4f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      roundRect(ctx, -12, -8, 24, 16.5, 3.5); // 包身
      fillStroke(ctx, shade(ctx, -8, 8.5, '#d4a675', '#b0814f'));
      ctx.beginPath(); // 翻盖：下沿圆圆的
      ctx.moveTo(-12.5, -8.5);
      ctx.lineTo(12.5, -8.5);
      ctx.lineTo(12.5, -1);
      ctx.quadraticCurveTo(12.5, 3.5, 8, 3.5);
      ctx.lineTo(-8, 3.5);
      ctx.quadraticCurveTo(-12.5, 3.5, -12.5, -1);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, -8.5, 3.5, '#c99a68', '#a8794a'), 1.2);
      for (const x of [-6, 6]) {
        roundRect(ctx, x - 1.4, -8.5, 2.8, 14, 1); // 两根皮带
        fillStroke(ctx, '#8c6238', 0.9);
      }
      roundRect(ctx, -2.8, 0, 5.6, 4.2, 1); // 金扣
      fillStroke(ctx, '#f2c45a', 1);
      ctx.restore();
    },
  },

  /** 05 绿色登山包：大大的绿色背包，背在身后、往左边歪出来，顶盖、前袋、两根米色扣带；胸前再扣一根横带 */
  hikingPack: {
    slot: 'bag',
    back(ctx, { g }) {
      const w = 31;
      const h = 40;
      ctx.save();
      ctx.translate(g.torsoCx - g.torsoRxTop - 8, g.torsoCy - 8);
      ctx.rotate(-0.17);
      roundRect(ctx, -w / 2, -h / 2, w, h, 9); // 包身
      fillStroke(ctx, shade(ctx, -h / 2, h / 2, '#8fbd70', '#62914b'));
      ctx.beginPath(); // 顶盖
      ctx.moveTo(-w / 2 - 1, -h / 2 + 11);
      ctx.bezierCurveTo(-w / 2 - 1, -h / 2 - 3, w / 2 + 1, -h / 2 - 3, w / 2 + 1, -h / 2 + 11);
      ctx.quadraticCurveTo(0, -h / 2 + 14, -w / 2 - 1, -h / 2 + 11);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, -h / 2, -h / 2 + 12, '#7aab5c', '#5a8744'), 1.3);
      roundRect(ctx, -w / 2 + 4, -1, w - 8, h / 2 - 3, 5); // 前袋
      fillStroke(ctx, '#78a95b', 1.2);
      for (const x of [-6, 6]) {
        roundRect(ctx, x - 1.5, -h / 2 + 8, 3, h / 2 + 2, 1.2); // 米色扣带
        fillStroke(ctx, '#e4c995', 0.9);
        roundRect(ctx, x - 2.4, 1.5, 4.8, 3.6, 1); // 扣子
        fillStroke(ctx, '#b8935a', 0.9);
      }
      ctx.restore();
    },
    front(ctx, { g }) {
      packStraps(ctx, g, '#5f8f4a', '#d9bd85', '#5f8f4a');
    },
  },

  /** 06 爪印抽绳包：粉色的小布袋，口上用绳子扎起来，挂在脖子上、垂在肚子前面，袋子上一个爪印 */
  pawPouch: {
    slot: 'bag',
    front(ctx, { g, sp }) {
      const chin = g.headCy + sp.head.ry;
      const px = -g.torsoRxTop * 0.12;
      const py = g.torsoCy + 6; // 袋口
      ctx.strokeStyle = '#d98b8f'; // 挂绳：从脖子两边垂下来（上面那截被下巴挡住）
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-g.torsoRxTop * 0.5, chin - 6);
      ctx.quadraticCurveTo(-g.torsoRxTop * 0.4, py - 4, px - 1.5, py - 1);
      ctx.moveTo(g.torsoRxTop * 0.5, chin - 6);
      ctx.quadraticCurveTo(g.torsoRxTop * 0.3, py - 4, px + 1.5, py - 1);
      ctx.stroke();
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath(); // 扎口上面的荷叶边
      ctx.moveTo(-3.5, 0.5);
      ctx.quadraticCurveTo(-6, -4, -3.5, -4.5);
      ctx.quadraticCurveTo(-1.5, -6, 0, -4.5);
      ctx.quadraticCurveTo(1.5, -6, 3.5, -4.5);
      ctx.quadraticCurveTo(6, -4, 3.5, 0.5);
      ctx.closePath();
      fillStroke(ctx, '#f8c6c4', 1.1);
      ctx.beginPath(); // 袋子：口小底大，圆鼓鼓的
      ctx.moveTo(-3.5, 0.5);
      ctx.bezierCurveTo(-11, 3, -11.5, 13.5, 0, 13.5);
      ctx.bezierCurveTo(11.5, 13.5, 11, 3, 3.5, 0.5);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, 0, 13.5, '#fbd3d0', '#f1aeac'), 1.3);
      roundRect(ctx, -4.4, -0.6, 8.8, 2.4, 1.1); // 扎口的绳子
      fillStroke(ctx, '#e0898e', 0.9);
      pawPrint(ctx, 0, 7.4, 0.95, '#e98a90');
      ctx.restore();
    },
  },

  /** 07 斜挎小包：浅棕色的半月形小包，挂在胸前右边，带子从右肩斜着绕到左边腰上 */
  slingBag: {
    slot: 'bag',
    front(ctx, { g }) {
      const top = g.torsoCy - g.torsoRy;
      const x0 = g.torsoRxTop * 0.72;
      const y0 = top + 2;
      const x1 = -g.torsoRxBot * 0.95;
      const y1 = g.torsoCy + 13;
      strapLine(ctx, x0, y0, x1, y1, '#9c7552', 2.2);
      const t = 0.56; // 小包在带子上的位置（从肩膀算起）：再高就藏到下巴后面了
      ctx.save();
      ctx.translate(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 3);
      ctx.rotate((Math.atan2(y1 - y0, x1 - x0) - Math.PI) * 0.7);
      ctx.scale(1.2, 1.2);
      ctx.beginPath(); // 包身：上面平、下面圆
      ctx.moveTo(-9.5, -3);
      ctx.lineTo(9.5, -3);
      ctx.bezierCurveTo(10, 6, -10, 6, -9.5, -3);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, -3, 5, '#e1b588', '#c4956a'), 1.3);
      ctx.beginPath(); // 翻盖
      ctx.moveTo(-9.8, -3.5);
      ctx.lineTo(9.8, -3.5);
      ctx.quadraticCurveTo(7, 2.5, 0, 2.6);
      ctx.quadraticCurveTo(-7, 2.5, -9.8, -3.5);
      ctx.closePath();
      fillStroke(ctx, '#d3a679', 1.1);
      ellipse(ctx, 0, 1.6, 1.5, 1.5); // 扣子
      fillStroke(ctx, '#8c6238', 0.9);
      ctx.restore();
    },
  },

  /** 09 露营卷毯包：身后背着一个大帆布包，包顶上横着捆一卷黄色的毯子（两头从身子两边露出来） */
  bedrollPack: {
    slot: 'bag',
    back(ctx, { g }) {
      const top = g.torsoCy - g.torsoRy;
      roundRect(ctx, -g.torsoRxBot - 4, top + 6, (g.torsoRxBot + 4) * 2, g.torsoRy * 1.5, 9); // 帆布包（大半被身子挡住）
      fillStroke(ctx, shade(ctx, top, g.torsoCy + 10, '#cfa87b', '#a98253'));
      const len = g.torsoRxTop + 27; // 毯子卷的半长：比大脑袋还宽一点，两头才露得出来
      const y = top + 5;
      const r = 7;
      ctx.beginPath(); // 毯子卷：横着的圆柱
      ctx.moveTo(-len, y - r);
      ctx.lineTo(len, y - r);
      ctx.lineTo(len, y + r);
      ctx.lineTo(-len, y + r);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, y - r, y + r, '#f6d27a', '#dfab45'));
      for (const x of [-len + 9, len - 9]) {
        roundRect(ctx, x - 1.8, y - r - 0.5, 3.6, r * 2 + 1, 1); // 两根捆带
        fillStroke(ctx, '#7c5a3a', 0.9);
      }
      for (const s of [-1, 1]) {
        ellipse(ctx, s * len, y, 3.4, r); // 两头：一圈圈卷起来的
        fillStroke(ctx, '#f0c460');
        ctx.strokeStyle = 'rgba(150, 100, 30, 0.6)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(s * len, y + 0.5, 1.9, 4, 0, 0, TAU);
        ctx.stroke();
      }
    },
    front(ctx, { g }) {
      packStraps(ctx, g, '#a98253', '#7c5a3a');
    },
  },

  /** 10 翅膀小背包：奶白色的小背包藏在身后，两边伸出一对白色的小翅膀，会轻轻扇 */
  wingBag: {
    slot: 'bag',
    back(ctx, { g, time = 0 }) {
      const flap = Math.sin(time * 2.6) * 0.06;
      const y = g.torsoCy - 5; // 翅膀根：太高会藏到大脑袋后面，太低会被胳膊挡住
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(g.torsoCx + s * (g.torsoRxTop - 3), y);
        ctx.scale(1.35, 1.35);
        wing(ctx, s, 0.18 + flap);
        ctx.restore();
      }
      roundRect(ctx, -g.torsoRxTop * 0.8, y - 12, g.torsoRxTop * 1.6, 24, 8); // 小背包（几乎全被身子挡住）
      fillStroke(ctx, '#fbf1e2');
    },
    front(ctx, { g }) {
      packStraps(ctx, g, '#f4dcc8', '#e2a7a0');
    },
  },
};

// ================================================================ 手持（原点是胸口）

const HELD = {
  /** 03 珍珠奶茶：透明杯子、奶茶、黑珍珠、圆顶盖、粉色吸管 */
  bobaTea: {
    slot: 'held',
    held(ctx) {
      ctx.save();
      ctx.translate(3, -3);
      ctx.save(); // 吸管（先画，杯盖压在上面）
      ctx.rotate(0.35);
      roundRect(ctx, -1.6, -26, 3.2, 16, 1.4);
      fillStroke(ctx, '#f28fb3', 1.1);
      ctx.restore();
      const cup = () => {
        ctx.beginPath();
        ctx.moveTo(-7.5, -9);
        ctx.lineTo(7.5, -9);
        ctx.lineTo(5.6, 10);
        ctx.quadraticCurveTo(0, 11.5, -5.6, 10);
        ctx.closePath();
      };
      cup();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();
      ctx.save();
      cup();
      ctx.clip();
      ctx.fillStyle = '#d8ad80'; // 奶茶
      ctx.fillRect(-9, -5, 18, 18);
      ctx.fillStyle = '#4b2f22'; // 珍珠
      for (const [x, y] of [[-3.8, 7.5], [-0.6, 8.2], [2.6, 7.6], [-2.2, 4.8], [1.2, 5], [4, 5.4]]) {
        ellipse(ctx, x, y, 1.45, 1.45);
        ctx.fill();
      }
      ctx.restore();
      cup();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW;
      ctx.stroke();
      ctx.beginPath(); // 圆顶盖
      ctx.moveTo(-8.5, -9);
      ctx.quadraticCurveTo(0, -17, 8.5, -9);
      ctx.closePath();
      fillStroke(ctx, 'rgba(255, 255, 255, 0.85)', 1.3);
      roundRect(ctx, -8.8, -10.2, 17.6, 2.6, 1.2);
      fillStroke(ctx, '#ffffff', 1.1);
      ctx.restore();
    },
  },

  /** 02 蓝色小鱼：抱在胸前，横着 */
  blueFish: {
    slot: 'held',
    held(ctx, { time = 0 } = {}) {
      ctx.save();
      ctx.translate(1, 1);
      ctx.rotate(-0.12 + Math.sin(time * 3) * 0.03);
      ctx.beginPath(); // 尾巴
      ctx.moveTo(10, 0);
      ctx.lineTo(19, -6.5);
      ctx.quadraticCurveTo(16.5, 0, 19, 6.5);
      ctx.closePath();
      fillStroke(ctx, '#6fa5df', 1.3);
      ellipse(ctx, 0, 0, 13, 7.5); // 身子
      fillStroke(ctx, (() => {
        const grad = ctx.createLinearGradient(0, -7.5, 0, 7.5);
        grad.addColorStop(0, '#6fa5df');
        grad.addColorStop(1, '#a9d1f5');
        return grad;
      })(), 1.4);
      ctx.beginPath(); // 背鳍
      ctx.moveTo(-3, -7);
      ctx.quadraticCurveTo(1, -11.5, 5, -6.5);
      ctx.closePath();
      fillStroke(ctx, '#5d93cf', 1.1);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; // 鳞片
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const x of [1, 4.5, 8]) {
        ctx.moveTo(x, -3.5);
        ctx.quadraticCurveTo(x - 2.4, 0, x, 3.5);
      }
      ctx.stroke();
      ellipse(ctx, -7.5, -1.5, 2.1, 2.1); // 眼睛
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ellipse(ctx, -7.9, -1.5, 1.1, 1.1);
      ctx.fillStyle = '#2b2b33';
      ctx.fill();
      ctx.restore();
    },
  },

  /** 01 竹子：一根带叶子的竹子，斜着抱在胸前，叶子从身体右边伸出去（熊猫最爱） */
  bamboo: {
    slot: 'held',
    held(ctx, { time = 0 } = {}) {
      ctx.save();
      ctx.translate(6, 0);
      ctx.rotate(-1.05);
      roundRect(ctx, -2.8, -24, 5.6, 46, 2.6); // 竹竿
      fillStroke(ctx, (() => {
        const grad = ctx.createLinearGradient(-2.8, 0, 2.8, 0);
        grad.addColorStop(0, '#9fd27a');
        grad.addColorStop(1, '#6faa48');
        return grad;
      })(), 1.3);
      ctx.strokeStyle = '#4f8a34'; // 竹节
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const y of [-12, 0, 12]) {
        ctx.moveTo(-2.8, y);
        ctx.quadraticCurveTo(0, y + 1.4, 2.8, y);
      }
      ctx.stroke();
      ctx.save(); // 顶上的叶子
      ctx.translate(0, -20);
      ctx.rotate(Math.sin(time * 2.2) * 0.06);
      for (const [rot, len] of [[-0.9, 14], [-0.35, 16], [0.5, 12]]) {
        ctx.save();
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(3.5, -len * 0.5, 0, -len);
        ctx.quadraticCurveTo(-3.5, -len * 0.5, 0, 0);
        ctx.closePath();
        fillStroke(ctx, '#7cbf55', 1.1);
        ctx.restore();
      }
      ctx.restore();
      ctx.restore();
    },
  },

  /** 04 掌机：奶白色的圆角游戏机，顶上两只小猫耳朵，左边十字键、右边两个圆按钮，屏幕上一颗像素小爱心 */
  handheld: {
    slot: 'held',
    held(ctx) {
      const w = 28;
      const h = 16;
      ctx.save();
      ctx.translate(0, -1);
      ctx.rotate(-0.06);
      for (const s of [-1, 1]) {
        ctx.beginPath(); // 猫耳朵
        ctx.moveTo(s * 5, -h / 2 + 1);
        ctx.lineTo(s * 8.5, -h / 2 - 4.5);
        ctx.lineTo(s * 11.5, -h / 2 + 1);
        ctx.closePath();
        fillStroke(ctx, '#f6e6c8', 1.2);
      }
      roundRect(ctx, -w / 2, -h / 2, w, h, 6); // 机身
      fillStroke(ctx, shade(ctx, -h / 2, h / 2, '#fdf6e6', '#efdcb9'));
      roundRect(ctx, -6.5, -5.5, 13, 10, 2.4); // 屏幕的边框
      fillStroke(ctx, '#7c8f8a', 1.1);
      roundRect(ctx, -5.2, -4.3, 10.4, 7.6, 1.4); // 屏幕
      ctx.fillStyle = '#c3ead0';
      ctx.fill();
      ctx.fillStyle = '#e9707a'; // 像素小爱心：一格一格拼出来
      const p = 1.1;
      ['.XX.XX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'].forEach((row, j) => {
        [...row].forEach((c, i) => {
          if (c === 'X') ctx.fillRect(-3.85 + i * p, -3.2 + j * p, p + 0.05, p + 0.05);
        });
      });
      ctx.fillStyle = '#7a5a46'; // 十字键
      ctx.fillRect(-12.3, -1.8, 4.8, 1.7);
      ctx.fillRect(-10.75, -3.35, 1.7, 4.8);
      ellipse(ctx, 9.6, -2.2, 1.5, 1.5); // 两个圆按钮
      fillStroke(ctx, '#f08a7e', 0.9);
      ellipse(ctx, 11.2, 1, 1.5, 1.5);
      fillStroke(ctx, '#f6c75a', 0.9);
      ctx.restore();
    },
  },

  /** 05 复古相机：银色的外壳、黑色的皮面，中间一个大镜头，上面取景器和快门，挂着一根皮带子 */
  camera: {
    slot: 'held',
    held(ctx) {
      ctx.save();
      ctx.rotate(0.05);
      ctx.beginPath(); // 带子（先画，相机压在上面）
      ctx.moveTo(-11, -2);
      ctx.quadraticCurveTo(-6, 16, 5, 13);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.strokeStyle = '#7a5440';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      roundRect(ctx, -5, -12, 10, 5.5, 1.5); // 取景器
      fillStroke(ctx, '#dde1e7', 1.2);
      roundRect(ctx, 6.5, -10.5, 3.6, 2.6, 0.8); // 快门
      fillStroke(ctx, '#c9ced6', 1);
      const body = () => roundRect(ctx, -13, -8, 26, 16, 3.5);
      body();
      ctx.fillStyle = shade(ctx, -8, 8, '#f1f3f6', '#cfd5dc');
      ctx.fill();
      ctx.save();
      body();
      ctx.clip();
      ctx.fillStyle = '#3d3738'; // 黑色的皮面
      ctx.fillRect(-14, -3.5, 28, 13);
      ctx.restore();
      body();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW;
      ctx.stroke();
      roundRect(ctx, -11, -6.6, 4.2, 2.5, 0.8); // 闪光灯的小窗
      fillStroke(ctx, '#fdf3cf', 0.9);
      ellipse(ctx, 0, 1, 7.2, 7.2); // 镜头：银圈、黑筒、蓝玻璃
      fillStroke(ctx, '#dde1e7', 1.3);
      ellipse(ctx, 0, 1, 5.1, 5.1);
      fillStroke(ctx, '#2c2a30', 1);
      ellipse(ctx, 0, 1, 2.7, 2.7);
      ctx.fillStyle = '#4d6383';
      ctx.fill();
      ellipse(ctx, -1.5, -0.5, 1.2, 0.8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.restore();
    },
  },

  /** 06 打开的书：两页翻开，左页一个小爪印，右页几行字，红色的书皮 */
  openBook: {
    slot: 'held',
    held(ctx) {
      ctx.save();
      ctx.translate(0, 1);
      ctx.rotate(-0.05);
      ctx.beginPath(); // 书皮（比书页大一圈，在后面）
      ctx.moveTo(-15.5, -7);
      ctx.quadraticCurveTo(-7, -10.5, 0, -7.5);
      ctx.quadraticCurveTo(7, -10.5, 15.5, -7);
      ctx.lineTo(16, 8.8);
      ctx.quadraticCurveTo(7, 6.6, 0, 9.8);
      ctx.quadraticCurveTo(-7, 6.6, -16, 8.8);
      ctx.closePath();
      fillStroke(ctx, '#d9574b', 1.3);
      for (const s of [-1, 1]) {
        ctx.beginPath(); // 书页：中间往下凹，外边翘起来一点
        ctx.moveTo(0, -7.6);
        ctx.quadraticCurveTo(s * 7, -11, s * 14.2, -8.6);
        ctx.lineTo(s * 14.2, 6.6);
        ctx.quadraticCurveTo(s * 7, 4.2, 0, 7.6);
        ctx.closePath();
        fillStroke(ctx, shade(ctx, -10, 8, '#fffaf0', '#f0e4cf'), 1.1);
      }
      pawPrint(ctx, -7, -1, 0.85, '#f08a90'); // 左页的小爪印
      ctx.strokeStyle = 'rgba(140, 110, 90, 0.5)'; // 右页的几行字
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const y of [-4.6, -2, 0.6, 3.2]) {
        ctx.moveTo(3, y + 0.4);
        ctx.quadraticCurveTo(7.5, y - 1, 11.8, y - 0.2);
      }
      ctx.stroke();
      ctx.restore();
    },
  },

  /** 07 猫脸小电脑：小小的笔记本电脑，屏幕上一张白色的猫脸 */
  catLaptop: {
    slot: 'held',
    held(ctx) {
      ctx.save();
      ctx.translate(0, -1);
      roundRect(ctx, -12.5, -11, 25, 16.5, 2.6); // 屏幕的壳
      fillStroke(ctx, shade(ctx, -11, 5, '#a2a8b2', '#80868f'));
      roundRect(ctx, -10.5, -9, 21, 12.4, 1.5); // 屏幕
      ctx.fillStyle = shade(ctx, -9, 3.4, '#d9ecf8', '#b9d6ec');
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath(); // 猫脸：耳朵
        ctx.moveTo(s * 1.6, -6.4);
        ctx.lineTo(s * 3.8, -8.6);
        ctx.lineTo(s * 4.7, -5);
        ctx.closePath();
        fillStroke(ctx, '#ffffff', 0.9);
      }
      ellipse(ctx, 0, -3, 5, 3.9); // 猫脸
      fillStroke(ctx, '#ffffff', 0.9);
      ctx.fillStyle = INK;
      for (const s of [-1, 1]) {
        ellipse(ctx, s * 1.9, -3.4, 0.6, 0.8);
        ctx.fill();
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-1, -1.9);
      ctx.quadraticCurveTo(-0.5, -1.2, 0, -1.8);
      ctx.quadraticCurveTo(0.5, -1.2, 1, -1.9);
      ctx.stroke();
      ctx.beginPath(); // 键盘那半截
      ctx.moveTo(-12.8, 5.2);
      ctx.lineTo(12.8, 5.2);
      ctx.lineTo(15.2, 10.8);
      ctx.lineTo(-15.2, 10.8);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, 5, 11, '#b9bec7', '#9aa0aa'), 1.3);
      ctx.fillStyle = 'rgba(60, 65, 75, 0.45)'; // 一排排小按键
      for (let j = 0; j < 2; j++) {
        for (let i = -4; i <= 4; i++) ctx.fillRect(i * 2.5 - 0.9 + j * 0.4, 6.3 + j * 1.8, 1.8, 1.1);
      }
      roundRect(ctx, -3, 9.3, 6, 1.1, 0.4); // 触控板
      ctx.fill();
      ctx.restore();
    },
  },

  /** 08 御守：黄色的小锦囊，红色的边线，中间一朵红花，顶上打着红色的绳结 */
  omamori: {
    slot: 'held',
    held(ctx, { time = 0 } = {}) {
      ctx.save();
      ctx.translate(2, 2);
      ctx.rotate(0.08 + Math.sin(time * 2) * 0.03);
      const bag = (k) => {
        // 锦囊：上面两个角斜切掉；k = 往里缩多少（画里面那圈红边线）
        ctx.beginPath();
        ctx.moveTo(-6 + k, -10 + k);
        ctx.lineTo(6 - k, -10 + k);
        ctx.lineTo(8.5 - k, -7.5 + k * 0.6);
        ctx.lineTo(8.5 - k, 11 - k);
        ctx.quadraticCurveTo(8.5 - k, 12.5 - k, 7 - k, 12.5 - k);
        ctx.lineTo(-7 + k, 12.5 - k);
        ctx.quadraticCurveTo(-8.5 + k, 12.5 - k, -8.5 + k, 11 - k);
        ctx.lineTo(-8.5 + k, -7.5 + k * 0.6);
        ctx.closePath();
      };
      bag(0);
      fillStroke(ctx, shade(ctx, -10, 12.5, '#fbe07a', '#efc24a'));
      bag(1.8);
      ctx.strokeStyle = '#e0574b';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      roundRect(ctx, -4.6, -5.5, 9.2, 13.5, 1.5); // 中间的白签
      fillStroke(ctx, '#fff8e8', 0.9, '#e0574b');
      blossom(ctx, 0, -1, 3.4, '#e0574b', '#f6c75a');
      ctx.strokeStyle = '#e0574b'; // 签上的两道小横
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-2, 4);
      ctx.lineTo(2, 4);
      ctx.moveTo(-2, 6);
      ctx.lineTo(2, 6);
      ctx.stroke();
      bow(ctx, 0, -10.5, 0.62, '#e0473e', '#b8332c'); // 顶上的绳结
      ctx.restore();
    },
  },

  /** 09 三色团子：一串粉、白、绿三个糯米团子，斜着拿在胸前 */
  dangoSkewer: {
    slot: 'held',
    held(ctx) {
      ctx.save();
      ctx.translate(2, 0);
      ctx.rotate(0.5);
      roundRect(ctx, -1.2, -16, 2.4, 34, 1.2); // 竹签
      fillStroke(ctx, '#dcb57c', 1.1);
      for (const [y, light, dark] of [[-10, '#ffc9d4', '#f3a2b4'], [-0.5, '#fffdf6', '#ece3d0'], [9, '#c2e5a3', '#93c573']]) {
        ellipse(ctx, 0, y, 5.6, 5.2);
        fillStroke(ctx, shade(ctx, y - 5, y + 5, light, dark), 1.3);
        ellipse(ctx, -2, y - 2.1, 1.5, 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fill();
      }
      ctx.restore();
    },
  },

  /** 10 折扇：打开的纸扇，米白色的扇面上几朵粉色的樱花，竹扇骨在下面收成一个扇钉 */
  fan: {
    slot: 'held',
    held(ctx, { time = 0 } = {}) {
      const R = 17; // 扇面外圈
      const r = 6.5; // 扇面里圈（再往里是露出来的扇骨）
      const a0 = -Math.PI / 2 - 1.05;
      const a1 = -Math.PI / 2 + 1.05;
      const n = 8;
      ctx.save();
      ctx.translate(1, 6);
      ctx.rotate(-0.08 + Math.sin(time * 1.8) * 0.04);
      ctx.beginPath(); // 扇骨
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * (r + 1), Math.sin(a) * (r + 1));
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.strokeStyle = '#c4935e';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const paper = () => {
        ctx.beginPath();
        ctx.arc(0, 0, R, a0, a1);
        ctx.arc(0, 0, r, a1, a0, true);
        ctx.closePath();
      };
      paper();
      ctx.fillStyle = '#fff6e8';
      ctx.fill();
      ctx.save(); // 一折一折的明暗
      paper();
      ctx.clip();
      ctx.fillStyle = 'rgba(205, 160, 115, 0.16)';
      for (let i = 0; i < n; i += 2) {
        const a = a0 + ((a1 - a0) * i) / n;
        const b = a0 + ((a1 - a0) * (i + 1)) / n;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R + 1, a, b);
        ctx.closePath();
        ctx.fill();
      }
      blossom(ctx, -6.5, -10.5, 2.8, '#f6a9b8', '#e0707f');
      blossom(ctx, 4.5, -13, 2.3, '#f6a9b8', '#e0707f');
      blossom(ctx, 9.5, -7.5, 1.9, '#f9c2cd', '#e0707f');
      ctx.restore();
      paper();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LW;
      ctx.stroke();
      ellipse(ctx, 0, 0, 1.8, 1.8); // 扇钉
      fillStroke(ctx, '#8c6238', 1);
      ctx.restore();
    },
  },
};

/** 全部衣服：编号 → 画法。编号要和 src/shared/outfits/catalog.js 里的一致（自检会核对） */
export const OUTFITS = Object.freeze({ ...HATS, ...GLASSES, ...TOPS, ...BAGS, ...HELD });

/** 部位的顺序（衣柜里也按这个顺序排） */
export const OUTFIT_SLOTS = Object.freeze(['hat', 'glasses', 'top', 'bag', 'held']);

/**
 * 这一刻真正要画的衣服：{ hat, glasses, top, bag, held }，每项是 OUTFITS 里的画法或 null。
 * 过节那天，节日装扮占了哪个部位，那个部位就听节日的（比如圣诞帽代替你选的帽子）；其他部位照穿。
 */
export function resolveOutfit(ids, look) {
  const out = { hat: null, glasses: null, top: null, bag: null, held: null };
  if (!ids) return out;
  for (const slot of OUTFIT_SLOTS) {
    const art = OUTFITS[ids[slot]];
    if (art && art.slot === slot) out[slot] = art;
  }
  if (look && look.head) out.hat = null;
  if (look && look.held) out.held = null;
  return out;
}
