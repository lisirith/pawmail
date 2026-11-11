// 开发用的"姿势图鉴"：把每种动物的每个姿势都画一遍。
// 运行 npm run preview 后打开 http://localhost:5177/gallery

import { SPECIES } from './pet/species/index.js';
import { makePose } from './pet/pose.js';
import { drawPet } from './pet/draw.js';

const POSES = [
  ['站立', {}],
  ['看左下', { lookX: -1, lookY: 0.5 }],
  ['看右上', { lookX: 0.8, lookY: -0.9 }],
  ['走路 →', { facing: 1, lift: 2, lean: 0.05, footLY: 5, footLX: 4, footRX: -4, armL: -0.25, armR: 0.3, tailSide: -1 }],
  ['走路 ←', { facing: -1, lift: 1, lean: -0.05, footRY: 5, footRX: -4, footLX: 4, armL: 0.3, armR: -0.25, tailSide: 1 }],
  ['坐下', { crouch: 1, tailCurl: 0.35 }],
  ['睡觉', { loaf: 1, eyes: 'sleep', headTilt: 0.14, headY: 3, earDroop: 0.4, tailCurl: 0.2, blush: 0.6 }],
  ['开心', { eyes: 'happy', mouth: 'smile', mouthOpen: 0.7, blush: 0.9, armL: 0.5, armR: 0.5 }],
  ['挥手', { armR: 2.45, mouth: 'smile', mouthOpen: 0.3, headTilt: 0.08 }],
  ['被拎起', { armL: 1.0, armR: 1.0, squash: -0.08, tailCurl: 0, eyes: 'wide', mouth: 'o', lean: 0.25, lift: 30 }],
  ['下落', { armL: 2.5, armR: 2.5, eyes: 'wide', mouth: 'o', squash: -0.1, lift: 30 }],
  ['落地', { squash: 0.3, eyes: 'squeeze', mouth: 'wavy' }],
  ['晕', { eyes: 'dizzy', mouth: 'wavy', lean: 0.1, headTilt: 0.15 }],
  ['打哈欠', { eyes: 'sleep', mouth: 'yawn', mouthOpen: 1, headTilt: -0.1, armL: 2.3, armR: 2.3 }],
  ['生气', { eyes: 'annoyed', mouth: 'pout', earDroop: 0.5, blush: 0.15 }],
  ['眨眼', { eyeL: 0.05, eyeR: 0.05 }],
];

const params = new URLSearchParams(location.search);
const backgrounds = (params.get('bg') || 'light,dark,photo').split(',');
const only = params.get('species');

const grid = document.getElementById('grid');
const dpr = window.devicePixelRatio || 1;
const W = 150;
const H = 160;

for (const bg of backgrounds) {
  for (const sp of Object.values(SPECIES)) {
    if (only && sp.id !== only) continue;
    const row = document.createElement('div');
    row.className = `row bg-${bg}`;
    for (const [name, overrides] of POSES) {
      const cell = document.createElement('figure');
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.translate(W / 2, H - 12);
      drawPet(ctx, sp, makePose(overrides), { time: 0.3 });
      const caption = document.createElement('figcaption');
      caption.textContent = name;
      cell.append(canvas, caption);
      row.append(cell);
    }
    grid.append(row);
  }
}
