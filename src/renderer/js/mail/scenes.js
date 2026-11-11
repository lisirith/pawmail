// 信里的"照片"和明信片的背景：用代码画的几种简单风景。
// 每种风景都按画布的宽高比例来画，所以小图（信纸上）和大图（明信片）用的是同一份代码。
//
// 约定：地面在画布高度的 90% 处（GROUND），宠物就站在那条线上。
// 想加一种新风景：在 SCENES 里加一个函数，然后在 src/shared/letters/catalog.js 里给地点写上 scene 的名字。

import { TAU } from '../util/math.js';

export const GROUND = 0.9;

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- 画风景用的小零件

function sky(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function disc(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function sun(ctx, x, y, r, color, halo) {
  disc(ctx, x, y, r * 1.9, halo);
  disc(ctx, x, y, r, color);
}

function cloud(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  for (const [dx, dy, rx, ry] of [
    [0, 0, 1, 0.55],
    [-0.75, 0.15, 0.6, 0.4],
    [0.8, 0.12, 0.7, 0.42],
    [0.2, -0.3, 0.6, 0.45],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, TAU);
    ctx.fill();
  }
}

/** 一排起伏的山或小丘。baseY 是大致的高度，amp 是起伏的大小。 */
function ridge(ctx, w, h, baseY, amp, color, rng, bumps = 4) {
  const phase = rng() * TAU;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * w;
    const u = (i / 40) * bumps * Math.PI + phase;
    const y = baseY - (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + 1) * 0.4) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** 地面：一条微微鼓起的弧线以下全部填色 */
function ground(ctx, w, h, topY, color, bulge = 0.03) {
  ctx.beginPath();
  ctx.moveTo(0, topY + h * bulge);
  ctx.quadraticCurveTo(w / 2, topY - h * bulge, w, topY + h * bulge);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function pine(ctx, x, baseY, size, leaf, trunk, snow) {
  ctx.fillStyle = trunk;
  ctx.fillRect(x - size * 0.07, baseY - size * 0.25, size * 0.14, size * 0.25);
  for (let i = 0; i < 3; i++) {
    const top = baseY - size * (1 - i * 0.22);
    const bottom = baseY - size * (0.52 - i * 0.2);
    const half = size * (0.2 + i * 0.09);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x - half, bottom);
    ctx.closePath();
    ctx.fillStyle = leaf;
    ctx.fill();
    if (snow) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + half * 0.5, top + (bottom - top) * 0.5);
      ctx.lineTo(x - half * 0.5, top + (bottom - top) * 0.5);
      ctx.closePath();
      ctx.fillStyle = snow;
      ctx.fill();
    }
  }
}

function roundTree(ctx, x, baseY, size, leaf, trunk) {
  ctx.fillStyle = trunk;
  ctx.fillRect(x - size * 0.06, baseY - size * 0.45, size * 0.12, size * 0.45);
  disc(ctx, x, baseY - size * 0.62, size * 0.3, leaf);
  disc(ctx, x - size * 0.2, baseY - size * 0.5, size * 0.22, leaf);
  disc(ctx, x + size * 0.2, baseY - size * 0.5, size * 0.22, leaf);
}

function bamboo(ctx, x, baseY, height, width, color, dark) {
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2, baseY - height, width, height);
  ctx.fillStyle = dark;
  for (let y = baseY - height * 0.15; y > baseY - height; y -= height * 0.17) ctx.fillRect(x - width / 2, y, width, Math.max(1, width * 0.18));
}

function stars(ctx, w, h, rng, count) {
  for (let i = 0; i < count; i++) {
    const r = (0.5 + rng() * 1.2) * (h / 190);
    ctx.globalAlpha = 0.5 + rng() * 0.5;
    disc(ctx, rng() * w, rng() * h * 0.7, r, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- 各种风景

const SCENES = {
  sea(ctx, w, h, rng) {
    sky(ctx, w, h, '#8fd3ff', '#eaf9ff');
    sun(ctx, w * (0.72 + rng() * 0.15), h * 0.22, h * 0.08, '#fff6c2', 'rgba(255, 246, 194, 0.35)');
    cloud(ctx, w * (0.15 + rng() * 0.2), h * 0.2, h * 0.11, 'rgba(255,255,255,0.9)');
    cloud(ctx, w * (0.5 + rng() * 0.15), h * 0.32, h * 0.07, 'rgba(255,255,255,0.8)');
    const g = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.82);
    g.addColorStop(0, '#4fb0e6');
    g.addColorStop(1, '#9be3f2');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.48, w, h * 0.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1.2, h * 0.012);
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x = rng() * w;
      const y = h * (0.54 + rng() * 0.2);
      const len = w * (0.04 + rng() * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y - h * 0.012, x + len, y);
      ctx.stroke();
    }
    ground(ctx, w, h, h * 0.78, '#f7e2b3');
    ground(ctx, w, h, h * 0.86, '#f1d59c', 0.015);
  },

  mountain(ctx, w, h, rng, place) {
    sky(ctx, w, h, '#bfe3ff', '#f6fbff');
    sun(ctx, w * (0.15 + rng() * 0.2), h * 0.2, h * 0.075, '#fff6c2', 'rgba(255, 246, 194, 0.4)');
    cloud(ctx, w * (0.6 + rng() * 0.2), h * 0.18, h * 0.1, 'rgba(255,255,255,0.9)');
    ridge(ctx, w, h, h * 0.55, h * 0.16, '#a9c0e0', rng, 3);
    ridge(ctx, w, h, h * 0.68, h * 0.1, '#8fc79a', rng, 4);
    ground(ctx, w, h, h * 0.8, '#a9dc8f');
    ground(ctx, w, h, h * 0.87, '#97cf80', 0.012);
    // 草地上的小花（花田里的花多得多）
    const flowers = place === 'flowerField' ? 60 : place === 'teaField' ? 0 : 14;
    const colors = ['#ffffff', '#ffe066', '#ff9ec4', '#ffb86b'];
    for (let i = 0; i < flowers; i++) {
      disc(ctx, rng() * w, h * (0.84 + rng() * 0.14), h * (place === 'flowerField' ? 0.016 : 0.01), colors[Math.floor(rng() * colors.length)]);
    }
    if (place === 'teaField') {
      ctx.strokeStyle = 'rgba(70, 140, 80, 0.55)';
      ctx.lineWidth = h * 0.012;
      for (let i = 0; i < 5; i++) {
        const y = h * (0.82 + i * 0.035);
        ctx.beginPath();
        ctx.moveTo(0, y + h * 0.02);
        ctx.quadraticCurveTo(w / 2, y - h * 0.02, w, y + h * 0.02);
        ctx.stroke();
      }
    }
  },

  forest(ctx, w, h, rng, place) {
    const autumn = place === 'mapleValley';
    const bambooGrove = place === 'bambooGrove';
    sky(ctx, w, h, autumn ? '#ffe2b8' : '#d9f0cf', autumn ? '#fff6e6' : '#f7fbe9');
    sun(ctx, w * (0.7 + rng() * 0.15), h * 0.2, h * 0.07, '#fffbe0', 'rgba(255, 251, 224, 0.4)');
    const back = autumn ? ['#f0a04b', '#e8794a', '#f2c14e'] : ['#8cc49a', '#7dba8c'];
    const front = autumn ? ['#e2622f', '#f08a3c', '#d94f2b', '#f4b63f'] : ['#4f9a62', '#5fa870', '#458a57'];
    if (bambooGrove) {
      for (let i = 0; i < 16; i++) bamboo(ctx, rng() * w, h * 0.86, h * (0.75 + rng() * 0.3), h * 0.028, '#9ed18f', '#7fba74');
      ground(ctx, w, h, h * 0.82, '#8fcf7c');
      for (let i = 0; i < 9; i++) bamboo(ctx, rng() * w, h * 0.93, h * (0.9 + rng() * 0.3), h * 0.045, '#6fbf6a', '#4f9e55');
    } else {
      for (let i = 0; i < 9; i++) {
        const x = (i + rng() * 0.8) * (w / 9);
        if (autumn) roundTree(ctx, x, h * 0.8, h * (0.5 + rng() * 0.2), back[i % back.length], '#9a7b5a');
        else pine(ctx, x, h * 0.8, h * (0.5 + rng() * 0.2), back[i % back.length], '#9a7b5a');
      }
      ground(ctx, w, h, h * 0.8, autumn ? '#e9c27a' : '#8fcf7c');
      for (let i = 0; i < 5; i++) {
        const x = (i < 2 ? i * 0.12 + 0.02 : 0.55 + (i - 2) * 0.16) * w + rng() * w * 0.04; // 中间留出空地给宠物
        if (autumn) roundTree(ctx, x, h * 0.9, h * (0.7 + rng() * 0.2), front[i % front.length], '#7b5a3c');
        else pine(ctx, x, h * 0.9, h * (0.75 + rng() * 0.2), front[i % front.length], '#7b5a3c');
      }
    }
    ground(ctx, w, h, h * 0.88, autumn ? '#deb066' : '#7dc06c', 0.012);
    if (autumn) {
      const leaves = ['#e2622f', '#f08a3c', '#f4b63f'];
      for (let i = 0; i < 26; i++) disc(ctx, rng() * w, h * (0.86 + rng() * 0.13), h * 0.012, leaves[i % 3]);
    }
  },

  city(ctx, w, h, rng) {
    sky(ctx, w, h, '#ffc98f', '#fff0de');
    sun(ctx, w * (0.2 + rng() * 0.5), h * 0.36, h * 0.09, '#fff3c4', 'rgba(255, 243, 196, 0.45)');
    cloud(ctx, w * (0.7 + rng() * 0.15), h * 0.16, h * 0.08, 'rgba(255,255,255,0.75)');
    const row = (baseY, minH, maxH, color, windowColor, count) => {
      let x = -w * 0.02;
      for (let i = 0; i < count && x < w; i++) {
        const bw = w * (0.07 + rng() * 0.07);
        const bh = h * (minH + rng() * (maxH - minH));
        ctx.fillStyle = color;
        ctx.fillRect(x, baseY - bh, bw, bh);
        ctx.fillStyle = windowColor;
        const cols = Math.max(2, Math.floor(bw / (h * 0.06)));
        const rows = Math.floor(bh / (h * 0.075));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (rng() < 0.55) ctx.fillRect(x + ((c + 0.3) * bw) / cols, baseY - bh + h * 0.03 + r * h * 0.075, bw / cols / 2.4, h * 0.035);
          }
        }
        x += bw + w * 0.008;
      }
    };
    row(h * 0.8, 0.25, 0.5, '#d2bde0', 'rgba(255, 244, 200, 0.75)', 14);
    row(h * 0.84, 0.15, 0.36, '#9a8cc0', 'rgba(255, 232, 150, 0.9)', 14);
    ground(ctx, w, h, h * 0.82, '#c6c0d2', 0.004);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = w * 0.04; x < w; x += w * 0.12) ctx.fillRect(x, h * 0.955, w * 0.06, h * 0.012);
  },

  snow(ctx, w, h, rng) {
    sky(ctx, w, h, '#cfe0f2', '#f7fbff');
    ridge(ctx, w, h, h * 0.6, h * 0.12, '#e6eef8', rng, 3);
    for (let i = 0; i < 6; i++) pine(ctx, (i + rng() * 0.7) * (w / 6), h * 0.8, h * (0.35 + rng() * 0.2), '#5d8f7a', '#8b7359', '#ffffff');
    ground(ctx, w, h, h * 0.78, '#ffffff');
    ground(ctx, w, h, h * 0.87, '#f0f5fb', 0.014);
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.6 + rng() * 0.4;
      disc(ctx, rng() * w, rng() * h * 0.85, h * (0.006 + rng() * 0.008), '#ffffff');
    }
    ctx.globalAlpha = 1;
  },

  night(ctx, w, h, rng, place) {
    sky(ctx, w, h, '#1a2150', '#454b8a');
    stars(ctx, w, h, rng, 46);
    // 月牙
    const mx = w * (0.72 + rng() * 0.15);
    const my = h * 0.22;
    disc(ctx, mx, my, h * 0.18, 'rgba(255, 244, 200, 0.12)');
    disc(ctx, mx, my, h * 0.085, '#fff4c8');
    disc(ctx, mx + h * 0.035, my - h * 0.02, h * 0.075, '#262d63');
    ridge(ctx, w, h, h * 0.74, h * 0.06, '#232a5c', rng, 5);
    if (place === 'nightMarket') {
      // 一串红灯笼
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.6)';
      ctx.lineWidth = h * 0.006;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.2);
      ctx.quadraticCurveTo(w / 2, h * 0.42, w, h * 0.2);
      ctx.stroke();
      for (let i = 1; i < 9; i++) {
        const u = i / 9;
        const x = u * w;
        const y = h * (0.2 + 0.44 * u * (1 - u)) + h * 0.03;
        disc(ctx, x, y, h * 0.05, 'rgba(255, 120, 80, 0.25)');
        disc(ctx, x, y, h * 0.028, '#ff6b4a');
      }
    }
    ground(ctx, w, h, h * 0.84, '#2c3470', 0.01);
    ground(ctx, w, h, h * 0.9, '#343d80', 0.006);
  },

  /** 第一封"见面信"：就在你家里 */
  home(ctx, w, h) {
    ctx.fillStyle = '#fbe6cb';
    ctx.fillRect(0, 0, w, h);
    // 窗户
    const wx = w * 0.58;
    const wy = h * 0.12;
    const ww = w * 0.3;
    const wh = h * 0.48;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wx - h * 0.02, wy - h * 0.02, ww + h * 0.04, wh + h * 0.04);
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#9bd6ff');
    g.addColorStop(1, '#e6f7ff');
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy, ww, wh);
    cloud(ctx, wx + ww * 0.4, wy + wh * 0.35, h * 0.06, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wx + ww / 2 - h * 0.008, wy, h * 0.016, wh);
    ctx.fillRect(wx, wy + wh / 2 - h * 0.008, ww, h * 0.016);
    // 地板和地毯
    ctx.fillStyle = '#e6bd8d';
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = '#d9ab78';
    ctx.fillRect(0, h * 0.78, w, h * 0.015);
    ctx.beginPath();
    ctx.ellipse(w * 0.34, h * 0.91, w * 0.24, h * 0.07, 0, 0, TAU);
    ctx.fillStyle = '#ffd9a0';
    ctx.fill();
    // 一盆小植物
    ctx.fillStyle = '#c98a5a';
    ctx.fillRect(w * 0.1, h * 0.66, w * 0.06, h * 0.12);
    disc(ctx, w * 0.13, h * 0.6, h * 0.08, '#7dc06c');
    disc(ctx, w * 0.1, h * 0.64, h * 0.055, '#8fcf7c');
    disc(ctx, w * 0.16, h * 0.64, h * 0.055, '#6fb85f');
  },
};

/**
 * 画一幅风景，铺满 (0,0)–(w,h)。
 * @param scene 风景的种类；place 是具体地点（同一种风景里会有一点点不同）；seed 让每封信的云、树的位置都不一样
 */
export function drawScene(ctx, w, h, { scene, place, seed = 1 }) {
  const draw = SCENES[scene] || SCENES.mountain;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  draw(ctx, w, h, makeRng(seed), place);
  ctx.restore();
}

/** 照片里它摆什么姿势（每封信不一样，但同一封信每次看都一样） */
export function scenePose(seed) {
  const poses = [
    { armR: 2.3, mouth: 'smile', mouthOpen: 0.4, headTilt: 0.08 }, // 挥手
    { eyes: 'happy', mouth: 'smile', mouthOpen: 0.6, armL: 0.5, armR: 0.5, blush: 0.8 }, // 开心
    { crouch: 1, tailCurl: 0.4, lookX: 0.4, lookY: -0.3 }, // 坐着看风景
    { lookX: -0.6, lookY: -0.4, headTilt: -0.06 }, // 抬头看
    { armL: 1.9, armR: 1.9, eyes: 'happy', mouth: 'smile', mouthOpen: 0.7, lift: 6 }, // 举手欢呼
    { facing: 0.6, lookX: 0.3 }, // 侧身
  ];
  return poses[seed % poses.length];
}
