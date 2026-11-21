// 开发用的"姿势图鉴"：把每种动物的每个姿势都画一遍。
// 运行 npm run preview 后打开 http://localhost:5177/gallery
//   ?looks=1        改成看节日装扮
//   ?bg=dark        只看深色背景
//   ?compare=1      和设定图（img resource 里的图）对照着看，改造型时用

import { SPECIES, getSpecies } from './pet/species/index.js';
import { makePose } from './pet/pose.js';
import { drawPet, getGeometry } from './pet/draw.js';
import { LOOKS } from './pet/looks.js';
import { drawFood, FOOD_TYPES } from './pet/food.js';
import { OUTFITS } from './pet/outfits.js';

const POSES = [
  ['站立', {}],
  ['看左下', { lookX: -1, lookY: 0.5 }],
  ['看右上', { lookX: 0.8, lookY: -0.9 }],
  ['走路 →', { facing: 1, lift: 2, lean: 0.05, footLY: 5, footLX: 4, footRX: -4, armL: -0.25, armR: 0.3, tailSide: -1 }],
  ['走路 ←', { facing: -1, lift: 1, lean: -0.05, footRY: 5, footRX: -4, footLX: 4, armL: 0.3, armR: -0.25, tailSide: 1 }],
  ['坐下', { crouch: 1, tailCurl: 0.35 }],
  ['睡觉', { loaf: 1, eyes: 'sleep', headTilt: 0.14, headY: 3, earDroop: 0.4, tailCurl: 0.2, blush: 0.6 }],
  ['开心', { eyes: 'happy', mouth: 'smile', mouthOpen: 0.7, blush: 0.9, armL: 0.5, armR: 0.5 }],
  ['挥手', { armR: 1.6, mouth: 'smile', mouthOpen: 0.3, headTilt: 0.08 }],
  ['挥手高', { armR: 1.9, mouth: 'smile', mouthOpen: 0.3, headTilt: 0.08 }],
  ['欢呼', { armL: 1.8, armR: 1.8, eyes: 'happy', mouth: 'smile', mouthOpen: 0.7, lift: 12 }],
  ['被拎起', { armL: -0.5, armR: -0.5, footLX: 5, footRX: -5, footLY: 0.5, footRY: 0.5, squash: -0.13, tailCurl: 1, tailHang: 1, eyeL: 0.75, eyeR: 0.75, earDroop: 0.4, lookY: 0.5, lean: 0.25, lift: 30 }],
  ['被拎起扭', { armL: -0.1, armR: -0.9, footLX: 5, footRX: -5, footLY: 3.7, footRY: -2.7, squash: -0.13, tailCurl: 1, tailHang: 1, eyes: 'annoyed', mouth: 'pout', lift: 30 }],
  // 爬墙（墙在右边）：靠墙的手在上 / 换手后另一只在上（离墙远的那只从身子后面伸过来，见 draw.js 的 wallArm）
  ['爬墙 →', { armR: 1.85, armL: 0.95, wallArm: 1, facing: 0.85, footLX: 9, footRX: 9, footLY: 6, lean: 0.03, tailHang: 1, tailSide: -1, lookX: 0.2, lookY: -0.7, lift: 20 }],
  ['爬墙 换手', { armR: 0.95, armL: 1.85, wallArm: 1, facing: 0.85, footLX: 9, footRX: 9, footRY: 6, lean: 0.03, tailHang: 1, tailSide: -1, lookX: 0.2, lookY: -0.7, lift: 20 }],
  ['下落', { armL: 1.65, armR: 1.65, eyes: 'wide', mouth: 'o', squash: -0.1, lift: 30 }],
  ['舔爪子', { crouch: 1, armR: -2.5, headTilt: 0.16, headY: 2, lookX: 0.35, lookY: 0.5, eyes: 'sleep' }],
  ['落地', { squash: 0.3, eyes: 'squeeze', mouth: 'wavy' }],
  ['晕', { eyes: 'dizzy', mouth: 'wavy', lean: 0.1, headTilt: 0.15 }],
  ['打哈欠', { eyes: 'sleep', mouth: 'yawn', mouthOpen: 1, headTilt: -0.1, armL: 1.7, armR: 1.7 }],
  ['生气', { eyes: 'annoyed', mouth: 'pout', earDroop: 0.5, blush: 0.15 }],
  ['眨眼', { eyeL: 0.05, eyeR: 0.05 }],
];

const params = new URLSearchParams(location.search);
const backgrounds = (params.get('bg') || 'light,dark,photo').split(',');
const only = params.get('species');
const appearances = Object.values(SPECIES).map(sp => getSpecies(sp.id, params.get('coat')));
const showLooks = params.get('looks') === '1';
const onlyLooks = params.get('only') ? params.get('only').split(',') : null; // 比如 &only=ghost,santa

const grid = document.getElementById('grid');
const dpr = window.devicePixelRatio || 1;
const W = 150;
const H = 175;

function cell(row, name, sp, pose, opts) {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(W / 2, H - 12);
  drawPet(ctx, sp, makePose(pose), { time: 0.3, ...opts });
  const caption = document.createElement('figcaption');
  caption.textContent = name;
  figure.append(canvas, caption);
  row.append(figure);
}

// ?compare=1：和设定图（img resource 里 ChatGPT 画的图）对照。每种动物一行：设定图 | 代码画的 | 两张叠在一起
// head：设定图里头的中心和半宽（原图像素），用来把两张图对齐到同样大小。
// 不在 ba8d7185 那张图里的动物（卡皮巴拉以后），在自己那一项里写 src；一种动物可以对照好几处（写成数组，每处一行）
const CAPY_SHEET = '/img resource/暖萌水豚桌宠素材表.png';
const REFERENCE = {
  src: '/img resource/ba8d7185-40d5-456b-ab17-12ce9a388f21.png',
  cat: { head: [1252, 370], rx: 282, pose: { crouch: 1, headTilt: -0.06, lookY: -0.15, tailCurl: 0.75, tailSide: 1 } },
  panda: { head: [475, 340], rx: 300, pose: { crouch: 1, headTilt: -0.12, armL: -1.0, armR: -1.0, mouth: 'smile', mouthOpen: 0.9, lookX: 0.35, blush: 1 } },
  capybara: [
    // 最下面一排第一个：正脸（只有头）
    { src: CAPY_SHEET, head: [118, 840], rx: 81.5, pose: { crouch: 1 } },
    // 左边的大图：坐着、脸朝右边、张嘴笑
    { src: CAPY_SHEET, head: [271, 292], rx: 190, pose: { crouch: 1, lookX: 0.7, mouth: 'smile', mouthOpen: 1, blush: 1 } },
  ],
};

async function drawCompare() {
  const images = new Map();
  const load = async (src) => {
    if (!images.has(src)) {
      const im = new Image();
      im.src = src;
      await im.decode();
      images.set(src, im);
    }
    return images.get(src);
  };
  const CW = 330;
  const CH = 380;
  const headAt = [CW / 2, CH * 0.4];
  const headW = 200; // 头在格子里画多宽（像素）
  const pairs = [];
  for (const sp of appearances) {
    if (only && sp.id !== only) continue;
    for (const ref of [].concat(REFERENCE[sp.id] || [])) pairs.push([sp, ref]);
  }
  for (const [sp, ref] of pairs) {
    const img = await load(ref.src || REFERENCE.src);
    const row = document.createElement('div');
    row.className = 'row bg-light';
    const P = makePose(ref.pose);
    const g = getGeometry(sp, P);
    const k = headW / (2 * sp.head.rx);
    const r = headW / (2 * ref.rx); // 设定图缩小多少
    const paint = (ctx, which) => {
      ctx.fillStyle = '#f0ece4';
      ctx.fillRect(0, 0, CW, CH);
      if (which !== 'ours') {
        ctx.save();
        ctx.globalAlpha = which === 'both' ? 0.45 : 1;
        ctx.drawImage(img, headAt[0] - ref.head[0] * r, headAt[1] - ref.head[1] * r, img.width * r, img.height * r);
        ctx.restore();
      }
      if (which !== 'ref') {
        ctx.save();
        ctx.globalAlpha = which === 'both' ? 0.7 : 1;
        ctx.translate(headAt[0] - g.headCx * k, headAt[1] - g.headCy * k);
        ctx.scale(k, k);
        drawPet(ctx, sp, P, { time: 0.3, shadow: false });
        ctx.restore();
      }
    };
    for (const [which, label] of [['ref', '设定图'], ['ours', '代码画的'], ['both', '叠在一起']]) {
      const figure = document.createElement('figure');
      const canvas = document.createElement('canvas');
      canvas.width = CW * dpr;
      canvas.height = CH * dpr;
      canvas.style.width = `${CW}px`;
      canvas.style.height = `${CH}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      paint(ctx, which);
      const caption = document.createElement('figcaption');
      caption.textContent = `${sp.id} · ${label}`;
      figure.append(canvas, caption);
      row.append(figure);
    }
    grid.append(row);
  }
}

if (params.get('compare') === '1') {
  drawCompare().catch((err) => console.error(err));
}

// ?outfits=1：衣柜里的每件衣服，穿在猫和熊猫身上、各种姿势下的样子（&only=capRed,hoodie 只看几件；&coat=lucky 招财猫）
const showOutfits = params.get('outfits') === '1';
if (showOutfits) {
  const OUTFIT_POSES = [
    ['站', {}],
    ['坐', { crouch: 1, tailCurl: 0.35 }],
    ['走', { facing: 1, lift: 2, lean: 0.05, footLY: 5, footLX: 4, footRX: -4, armL: -0.25, armR: 0.3 }],
    ['欢呼', { armL: 1.8, armR: 1.8, eyes: 'happy', mouth: 'smile', mouthOpen: 0.6 }],
    ['趴', { loaf: 1, eyes: 'sleep', headTilt: 0.14, headY: 3 }],
    ['爬墙', { armR: 1.85, armL: 0.95, wallArm: 1, facing: 0.85, footLX: 9, footRX: 9, footLY: 6, lean: 0.03, tailHang: 1, tailSide: -1, lookY: -0.7 }],
  ];
  const onlyOutfits = params.get('only') ? params.get('only').split(',') : null;
  const combos = [['全套 A', { hat: 'capRed', glasses: 'roundGlasses', top: 'sailorTop', bag: 'backpack', held: 'bobaTea' }], ['全套 B', { hat: 'wizardHat', glasses: 'starGlasses', top: 'tangJacket', bag: 'catBag', held: 'bamboo' }]];
  const rows = [...Object.entries(OUTFITS).map(([id, art]) => [id, { [art.slot]: id }]), ...combos];
  for (const [name, outfit] of rows) {
    if (onlyOutfits && !onlyOutfits.includes(name)) continue;
    const row = document.createElement('div');
    row.className = 'row bg-light';
    for (const sp of appearances) {
      if (only && sp.id !== only) continue; // &species=capybara 只看一种动物
      for (const [label, pose] of OUTFIT_POSES) {
        // 手里拿着东西时两只手抱在胸前；欢呼、爬墙时两只手都忙着，东西会收起来（见 draw.js 的 holdAmount）
        const busy = pose.loaf || pose.wallArm || pose.armL > 1;
        const holding = outfit.held && !busy ? { armL: -0.75, armR: -0.75 } : {};
        cell(row, `${name} · ${sp.id} ${label}`, sp, { ...pose, ...holding }, { outfit });
      }
    }
    grid.append(row);
  }
}

// ?food=1：喂给它的各种"纸团"（放大看一遍，再看看实际大小）
const showFood = params.get('food') === '1';
if (showFood) {
  for (const [bg, zoom] of [['light', 4], ['light', 1.3], ['dark', 1.3]]) {
    const row = document.createElement('div');
    row.className = `row bg-${bg}`;
    for (const type of FOOD_TYPES) {
      const figure = document.createElement('figure');
      const size = zoom * 34;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr * zoom, dpr * zoom);
      ctx.translate(17, 17);
      drawFood(ctx, type, { count: type === 'doc' && zoom > 2 ? 3 : 0 });
      const caption = document.createElement('figcaption');
      caption.textContent = type;
      figure.append(canvas, caption);
      row.append(figure);
    }
    grid.append(row);
  }
}

for (const bg of params.get('compare') === '1' || showFood || showOutfits ? [] : backgrounds) {
  for (const sp of appearances) {
    if (only && sp.id !== only) continue;
    const row = document.createElement('div');
    row.className = `row bg-${bg}`;
    if (showLooks) {
      for (const [id, look] of Object.entries(LOOKS)) {
        if (onlyLooks && !onlyLooks.includes(id)) continue;
        const holding = look.held ? { armL: -0.75, armR: -0.75 } : {};
        if (look.cover) {
          for (const lift of [0, 0.5, 1]) cell(row, `${id} ${lift}`, sp, { eyes: lift > 0.5 ? 'happy' : 'open', mouth: lift > 0.5 ? 'smile' : 'cat', mouthOpen: 0.5 }, { look, sheetLift: lift });
        } else {
          cell(row, id, sp, { ...holding, blush: 0.6 }, { look });
          cell(row, `${id} 坐`, sp, { ...holding, crouch: 1, tailCurl: 0.4 }, { look });
        }
      }
    } else {
      for (const [name, overrides] of POSES) cell(row, name, sp, overrides, {});
    }
    grid.append(row);
  }
}
