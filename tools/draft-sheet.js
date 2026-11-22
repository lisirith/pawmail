// 给 ChatGPT 的"设定草图"：把一种动物现在用代码画出来的样子，排成一张贴纸表（照卡皮巴拉设定图的排版）：
// 左边一只正面坐着的大图、下面一排拆开的部件（耳朵、手、脚、尾巴），右边两排动作、一排正脸表情。
// 用户拿它和以前的设定图（猫和熊猫、卡皮巴拉）一起交给 ChatGPT，请它照着那几张的画风改这只。
// 图上不写字（免得 ChatGPT 把字也画进去）。
//
// 用法（要开着预览服务器 npm run preview；sheet= 后面写动物编号）：
//   $env:SNAP_EVAL = [IO.File]::ReadAllText("tools\draft-sheet.js")
//   npm run snap -- "/src/renderer/gallery.html?species=none&sheet=shiba" "img resource/柴犬_代码画的草图.png" 1536 1200
//   $env:SNAP_EVAL = $null
const id = new URLSearchParams(location.search).get('sheet') || 'shiba';
const { getSpecies } = await import('/src/renderer/js/pet/species/index.js');
const { makePose } = await import('/src/renderer/js/pet/pose.js');
const { drawPet, drawHeadOnly, getGeometry } = await import('/src/renderer/js/pet/draw.js');
const sp = getSpecies(id);
const W = 1536;
const H = 1200;
const sheet = document.createElement('canvas');
sheet.width = W;
sheet.height = H;
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#f3ede3'; // 和 ChatGPT 贴纸表一样的浅暖色底
ctx.fillRect(0, 0, W, H);

/** 在 (x, 地面 y) 画一整只，scale 倍大 */
function pet(x, y, scale, pose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawPet(ctx, sp, makePose(pose), { time: 0.3 });
  ctx.restore();
}
/** 只画头（正脸表情），(x, y) 是头的中心 */
function head(x, y, scale, pose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawHeadOnly(ctx, sp, makePose(pose));
  ctx.restore();
}
/** 单独画一个部件：先画在一块空画布上，找出画了东西的范围，再缩放到高 h、中心放在 (x, y) */
function part(draw, x, y, h) {
  const t = document.createElement('canvas');
  t.width = 600;
  t.height = 600;
  const c = t.getContext('2d');
  c.translate(300, 300);
  c.scale(4, 4);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  const { data } = c.getImageData(0, 0, 600, 600);
  let x0 = 600, y0 = 600, x1 = -1, y1 = -1;
  for (let py = 0; py < 600; py++) {
    for (let px = 0; px < 600; px++) {
      if (data[(py * 600 + px) * 4 + 3] > 10) {
        x0 = Math.min(x0, px); x1 = Math.max(x1, px);
        y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
    }
  }
  if (x1 < 0) return;
  const k = h / (y1 - y0 + 1);
  const w = (x1 - x0 + 1) * k;
  ctx.drawImage(t, x0, y0, x1 - x0 + 1, y1 - y0 + 1, x - w / 2, y - h / 2, w, h);
}

// 招牌动作（和 activities.js 里那个动作最"到位"的一瞬间一样）
const SIGNATURE = {
  shiba: { loaf: 1, headY: 4, lookX: 0.75, lookY: 0.2, headTilt: 0.08, earDroop: 0.55, eyes: 'annoyed', mouth: 'pout', tailCurl: 0.3 },
  redpanda: { armL: 2.0, armR: 2.0, squash: -0.07, lift: 3, earDroop: -0.3, eyes: 'wide', mouth: 'o', tailCurl: 1 },
  capybara: { crouch: 1, prop: 1, eyeL: 0.45, eyeR: 0.45, blush: 0.6, tailCurl: 0.4 },
};

// 左边：正面坐着的大图
pet(285, 1000, 5.6, { crouch: 1, tailCurl: 0.4, mouth: 'smile', mouthOpen: 0.6, blush: 0.6, lookX: 0.12 });

// 左下：拆开的部件（耳朵两只、手、脚、尾巴）
const P0 = makePose({ tailSide: 1, tailCurl: 1 });
const g0 = getGeometry(sp, P0);
const b = { arm: 1, armLen: 1, foot: 1, ...sp.build };
part((c) => sp.drawEar(c, -1, P0, 0, 0), 70, 1110, 90);
part((c) => sp.drawEar(c, 1, P0, 0, 0), 165, 1110, 90);
if (sp.drawArmShape) part((c) => sp.drawArmShape(c, P0, g0, { side: 1, len: 20 * b.armLen, r: 6.3 * b.arm, legs: 0 }), 255, 1110, 110);
if (sp.drawFoot) part((c) => sp.drawFoot(c, P0, g0, { side: 1, rx: 10.5 * b.foot, ry: 7 * b.foot }), 345, 1125, 55);
part((c) => sp.drawTail(c, P0, g0), 470, 1105, 140);

// 右边两排动作
const poses = [
  {}, // 站着
  { facing: 1, lift: 2, lean: 0.05, footLY: 5, armL: -0.25, armR: 0.3, lookX: 0.6 }, // 走路
  { loaf: 1, eyes: 'sleep', headTilt: 0.13, headY: 3, earDroop: 0.35, tailCurl: 0.15, blush: 0.55 }, // 睡觉
  SIGNATURE[id] || { armR: 1.6, mouth: 'smile', mouthOpen: 0.6 }, // 招牌动作
  { armR: 1.6, mouth: 'smile', mouthOpen: 0.7, eyes: 'happy', blush: 0.8 }, // 挥手
  { armL: -0.5, armR: -0.5, squash: -0.08, footLX: 3, footRX: -3, footLY: 4, footRY: 4, tailHang: 1, lift: 18, eyes: 'wide', lookY: 0.4 }, // 被拎起来
  { crouch: 1, facing: -0.8, lookX: -0.7, tailCurl: 0.4, tailSide: -1 }, // 坐着、侧一点
  { armL: 1.8, armR: 1.8, lift: 12, eyes: 'happy', mouth: 'smile', mouthOpen: 0.9, blush: 0.8 }, // 欢呼
];
poses.forEach((pose, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  pet(726 + col * 220, 330 + row * 345, 2.3, pose);
});

// 右下：一排正脸表情（平常、开心、眯眼笑、惊讶、委屈、生气）
const faces = [
  {},
  { eyes: 'happy', mouth: 'smile', mouthOpen: 0.8, blush: 0.6 },
  { eyes: 'happy', blush: 1 },
  { eyes: 'wide', mouth: 'o', earDroop: -0.2 },
  { eyes: 'squeeze', mouth: 'wavy', earDroop: 0.5 },
  { eyes: 'annoyed', mouth: 'flat', earDroop: 0.3 },
];
faces.forEach((pose, i) => head(724 + i * 146, 900, 1.55, pose)); // 从 724 开始：别碰到左边大图的尾巴

return sheet.toDataURL();
