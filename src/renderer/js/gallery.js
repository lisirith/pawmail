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
const ZOOM = Math.max(0.5, Number(params.get('zoom')) || 1); // &zoom=2：每个格子放大看细节（看衣服时有用）

function cell(row, name, sp, pose, opts) {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * ZOOM * dpr);
  canvas.height = Math.round(H * ZOOM * dpr);
  canvas.style.height = `${H * ZOOM}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr * ZOOM, dpr * ZOOM);
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
// 柴犬、小熊猫：用户把我们代码画的草图交给 ChatGPT 改出来的设定图（2026-11-22）
const SHIBA_SHEET = '/img resource/ChatGPT 图像 2026年11月22日 13_18_18.png';
const REDPANDA_SHEET = '/img resource/ChatGPT 图像 2026年11月22日 13_18_51.png';
// 兔子：用户用 ChatGPT 生成的奶油兔贴纸表（2026-11-23）
const BUNNY_SHEET = '/img resource/可爱奶油兔角色设定贴纸表.png';
// 狐狸、企鹅、水獭：用户用 ChatGPT 生成的两张设定表（2026-11-24）。企鹅用"企鹅与水獭"那张（另一张里戴护目镜的不用）
const FOX_SHEET = '/img resource/狐狸与企鹅可爱角色设定表.png';
const PENGUIN_OTTER_SHEET = '/img resource/企鹅与水獭萌系角色设定表.png';
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
  shiba: [
    // 最下面一排第一个、第二个：正脸（只有头），平常 / 张嘴笑
    { src: SHIBA_SHEET, head: [134.25, 810], rx: 89.75, pose: {} },
    { src: SHIBA_SHEET, head: [320, 810.6], rx: 86.25, pose: { mouth: 'smile', mouthOpen: 1 } },
    // 第二排第四个：正面坐着、眯眼笑
    { src: SHIBA_SHEET, head: [1253, 488], rx: 79.25, pose: { crouch: 1, eyes: 'happy', mouth: 'smile', mouthOpen: 1, blush: 1 } },
    // 左边的大图：坐着、脸朝右边、张嘴笑，尾巴在左边
    { src: SHIBA_SHEET, head: [293.75, 316], rx: 219.25, pose: { crouch: 1, lookX: 0.75, mouth: 'smile', mouthOpen: 1, blush: 1, tailSide: -1, tailCurl: 0.35 } },
  ],
  redpanda: [
    // 第三排第二个：正脸（只有头）
    { src: REDPANDA_SHEET, head: [280.5, 732.5], rx: 81, pose: {} },
    // 第一排第一个：正面坐着、张嘴笑，尾巴在左边
    { src: REDPANDA_SHEET, head: [143.25, 147], rx: 101.75, pose: { crouch: 1, mouth: 'smile', mouthOpen: 1, blush: 1, tailSide: -1, tailCurl: 0.35 } },
    // 第一排第五个：站着举起双手（就是招牌的"吓唬人"）
    { src: REDPANDA_SHEET, head: [1088, 131], rx: 89.25, pose: { armL: 2.0, armR: 2.0, mouth: 'smile', mouthOpen: 1, blush: 1 } },
  ],
  bunny: [
    // 左边的大图：坐着、张嘴笑
    { src: BUNNY_SHEET, head: [293.75, 276], rx: 192.25, pose: { crouch: 1, headTilt: -0.07, lookX: 0.2, mouth: 'smile', mouthOpen: 0.85, blush: 1 } },
    // 最下面一排第一个：正面站着
    { src: BUNNY_SHEET, head: [110.5, 765], rx: 52.5, pose: {} },
  ],
  fox: [
    // 第二排第一个表情头像：平常的样子（只有头；头是在这个头像上量的）
    { src: FOX_SHEET, head: [870, 251.5], rx: 52.5, pose: {} },
    // 左边的大图：坐着、脸稍微朝右、张嘴笑，尾巴在左边
    { src: FOX_SHEET, head: [233, 163], rx: 132, pose: { crouch: 1, lookX: 0.5, mouth: 'smile', mouthOpen: 1, blush: 1, tailSide: -1, tailCurl: 0.35 } },
  ],
  penguin: [
    // 第三排第一个表情头像：平常的样子（只有头；头是在这个头像上量的）
    { src: PENGUIN_OTTER_SHEET, head: [83.1, 475.7], rx: 48.8, pose: {} },
    // 左上角的大图：坐着，脑袋往右歪一点
    { src: PENGUIN_OTTER_SHEET, head: [210, 190], rx: 157, pose: { crouch: 1, headTilt: -0.09, blush: 1 } },
  ],
  otter: [
    // 最下面一排第一个表情头像：平常的样子（只有头；头是在这个头像上量的）
    { src: PENGUIN_OTTER_SHEET, head: [79.4, 945], rx: 45, pose: { mouth: 'smile', mouthOpen: 0.8 } },
    // 左下角的大图：坐着、张嘴笑，脑袋往右歪，尾巴在右边
    { src: PENGUIN_OTTER_SHEET, head: [205, 688], rx: 144, pose: { crouch: 1, headTilt: -0.156, mouth: 'smile', mouthOpen: 1, blush: 1, tailSide: 1, tailCurl: 0.6 } },
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
  const pick = params.get('ref') ? params.get('ref').split(',').map(Number) : null; // &ref=0,2 只看第几处
  for (const sp of appearances) {
    if (only && sp.id !== only) continue;
    [].concat(REFERENCE[sp.id] || []).forEach((ref, i) => {
      if (!pick || pick.includes(i)) pairs.push([sp, ref]);
    });
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
  const onlyPoses = params.get('poses') ? params.get('poses').split(',') : null; // &poses=站,坐 只看几个姿势
  const combos = [
    ['全套 A', { hat: 'capRed', glasses: 'roundGlasses', top: 'sailorTop', bag: 'backpack', held: 'bobaTea' }],
    ['全套 B', { hat: 'wizardHat', glasses: 'starGlasses', top: 'tangJacket', bag: 'catBag', held: 'bamboo' }],
    ['全套 C', { hat: 'aviatorCap', glasses: 'techVisor', top: 'pufferJacket', bag: 'hikingPack', held: 'camera' }],
    ['全套 D', { hat: 'trapperHat', glasses: 'monocle', top: 'furCoat', bag: 'wingBag', held: 'fan' }],
  ];
  const rows = [...Object.entries(OUTFITS).map(([id, art]) => [id, { [art.slot]: id }]), ...combos];
  for (const [name, outfit] of rows) {
    if (onlyOutfits && !onlyOutfits.includes(name)) continue;
    const row = document.createElement('div');
    row.className = 'row bg-light';
    for (const sp of appearances) {
      if (only && sp.id !== only) continue; // &species=capybara 只看一种动物
      for (const [label, pose] of OUTFIT_POSES) {
        if (onlyPoses && !onlyPoses.includes(label)) continue;
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
