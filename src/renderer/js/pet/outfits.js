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
// 想加一件：在下面写好画法，登记到 OUTFITS，再到 src/shared/outfits/catalog.js 登记一行（编号、部位、稀有度）。

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

const HATS = {
  /** 01 红色鸭舌帽：帽身盖住头顶，帽檐朝前，上面一个白色小爪印 */
  capRed: {
    slot: 'hat',
    hat(ctx, { sp, lx }) {
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
      fillStroke(ctx, shade(ctx, top, band, '#ec6158', '#c8423b'));
      ctx.strokeStyle = 'rgba(120, 30, 25, 0.45)'; // 帽身的缝线
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, top + 2);
      ctx.quadraticCurveTo(-2.5, band - 8, -1.5, band + 1.5);
      ctx.stroke();
      ellipse(ctx, 0, top + 2.2, 2.6, 1.7); // 顶上的小扣子
      fillStroke(ctx, '#b8362f', 1);
      pawPrint(ctx, rx * 0.34, band - 9, 1.15, '#ffffff');
      // 帽檐：朝前伸出来、往右偏一点，是一片扁扁的大月牙；底下露出一点深色的帽檐背面
      ctx.beginPath();
      ctx.moveTo(-rx * 0.62, band - 0.5);
      ctx.bezierCurveTo(-rx * 0.5, band + 10, rx * 0.65, band + 12.5, rx * 0.86, band + 1.5);
      ctx.bezierCurveTo(rx * 0.5, band + 5.5, -rx * 0.2, band + 4.5, -rx * 0.62, band - 0.5);
      ctx.closePath();
      fillStroke(ctx, shade(ctx, band, band + 12, '#d94a42', '#a8322c'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; // 帽檐边上的一道亮线
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-rx * 0.45, band + 4.5);
      ctx.bezierCurveTo(-rx * 0.2, band + 9.5, rx * 0.5, band + 10.5, rx * 0.72, band + 4);
      ctx.stroke();
      ctx.restore();
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
      for (const s of [-1, 1]) {
        // 织出来的猫耳朵
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
};

// ================================================================ 上衣（身体的坐标 + 手臂）

/**
 * 上衣的身子：裁剪在动物自己的身体轮廓里，从脖子一直盖到肚子下面一点（下摆露出一点点毛），
 * 再把身体的轮廓线描一遍（衣服把原来的轮廓线盖住了一半）。details 在衣服上画花样。
 */
function shirt(ctx, info, fill, details) {
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
  ctx.strokeStyle = INK; // 下摆
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-90, hem - 3);
  ctx.quadraticCurveTo(0, hem + 3, 90, hem - 3);
  ctx.stroke();
  ctx.restore();
  torso(); // 身体的轮廓线再描一遍
  ctx.strokeStyle = sp.palette.outline;
  ctx.lineWidth = 1.45;
  ctx.stroke();
}

/** 下巴在哪（身体的坐标）：衣领、领结要画在下巴下面才看得见 */
const chinY = (info) => info.g.headCy + info.sp.head.ry;

/** 袖子：套在手臂靠肩膀的那一截。long = 长袖（盖到手腕），cuff = 袖口的颜色 */
function sleeve(ctx, { len, r }, fill, { long = false, cuff = null } = {}) {
  const end = long ? len * 0.78 : len * 0.42;
  const w = r + 1.1;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-w, -1);
  ctx.arc(0, -1, w, Math.PI, 0);
  ctx.lineTo(w + 0.6, end);
  ctx.quadraticCurveTo(0, end + 2.2, -w - 0.6, end);
  ctx.closePath();
  fillStroke(ctx, fill, 1.3);
  if (cuff) {
    ctx.beginPath();
    ctx.moveTo(-w - 0.6, end - 3.2);
    ctx.quadraticCurveTo(0, end - 1, w + 0.6, end - 3.2);
    ctx.lineTo(w + 0.6, end);
    ctx.quadraticCurveTo(0, end + 2.2, -w - 0.6, end);
    ctx.closePath();
    fillStroke(ctx, cuff, 1.1);
  }
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
};

// ================================================================ 背包（身体的坐标）

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
      const top = g.torsoCy - g.torsoRy;
      for (const s of [-1, 1]) {
        const x0 = s * g.torsoRxTop * 0.6;
        ctx.beginPath(); // 背带：从肩膀往下，钻到胳膊底下
        ctx.moveTo(x0 - 2.4, top + 2);
        ctx.lineTo(x0 + 2.4, top + 2);
        ctx.lineTo(x0 * 0.94 + 2.4, g.torsoCy + 8);
        ctx.lineTo(x0 * 0.94 - 2.4, g.torsoCy + 8);
        ctx.closePath();
        fillStroke(ctx, '#d2ad6e', 1.2);
        roundRect(ctx, x0 * 0.96 - 3, g.torsoCy - 4, 6, 3.2, 1); // 背带上的小扣子
        fillStroke(ctx, '#9b7a45', 0.9);
      }
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
