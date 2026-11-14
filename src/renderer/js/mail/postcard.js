// 信里的"照片"，以及把整封信画成一张可以分享的明信片图片。

import { getSpecies } from '../pet/species/index.js';
import { drawPet } from '../pet/draw.js';
import { makePose } from '../pet/pose.js';
import { lookById } from '../pet/looks.js';
import { drawScene, scenePose, hashText, GROUND } from './scenes.js';

// 信的正文用带点手写感的字体：英文和数字用 Segoe Print，中文用楷体（都是 Windows 自带的）
export const LETTER_FONT = "'Segoe Print', 'KaiTi', 'STKaiti', 'Microsoft YaHei UI', cursive, sans-serif";
const UI_FONT = "'Segoe UI', 'Microsoft YaHei UI', sans-serif";
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const INK = '#4b2f1c';
const MUTED = '#9a7b5a';
const RARITY_COLOR = { common: '#b89b78', rare: '#3f8ae0', legendary: '#e09a00', festival: '#e8453c' };

export const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/**
 * 画"照片"：一幅风景，加上站在里面的它。铺满 (0,0)–(w,h)。
 * 同一封信每次画出来都一样（云的位置、它的姿势由信的日期决定）。
 */
export function drawPhoto(ctx, w, h, letter, speciesId, catCoat = 'tabby') {
  const seed = hashText(`${letter.id}|${letter.place}`);
  const report = letter.kind === 'monthly' || letter.kind === 'yearly';
  drawScene(ctx, w, h, { scene: letter.scene, place: letter.place, seed });
  const s = (h / 190) * 0.84; // 190 高的小图里，宠物比原始大小略小一点，多露出些风景
  ctx.save();
  ctx.translate(w * (0.3 + (seed % 5) * 0.06), h * GROUND);
  ctx.scale(s, s);
  // 一圈淡淡的白边，让它在深色的夜景里也看得清
  ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
  ctx.shadowBlur = 2.5 * s;
  // 节日信：照片里它也穿着那天的装扮，抱着节日的东西
  const look = lookById(letter.look);
  let pose = scenePose(report ? 4 : seed); // 月报、年度回顾：举手欢呼
  if (letter.kind === 'festival') {
    pose = look && look.held ? { armL: -0.75, armR: -0.75, eyes: 'happy', mouth: 'smile', mouthOpen: 0.4, blush: 0.8 } : scenePose(4);
  }
  drawPet(ctx, getSpecies(speciesId, catCoat), makePose(pose), { time: 0.3, look });
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const CJK = '\\u2E80-\\u9FFF\\uFF00-\\uFFEF\\u3000-\\u303F';
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+\\s*|\\s+`, 'g');
const NO_LINE_START = /^[，。！？、；：”’）》…—,.!?;:)]/; // 这些标点不能放在一行的开头

/** 把一段文字按宽度拆成几行：英文按单词断，中文按字断 */
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const token of String(text).match(TOKEN) || []) {
    if (line && ctx.measureText(line + token).width > maxWidth && !NO_LINE_START.test(token)) {
      lines.push(line.trimEnd());
      line = token.trimStart();
    } else {
      line += token;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/**
 * 把一封信画成明信片。
 * 普通的信是 1080×1440（3:4，适合小红书、朋友圈）；月报和年度回顾内容多，是 1080×1920（9:16，适合手机竖屏、发动态）。
 * @returns 一块画好的画布，调用 .toDataURL('image/png') 就能得到图片
 */
export function renderPostcard(letter, { species, footer, catCoat = 'tabby' }) {
  const stats = letter.stats && letter.stats.length ? letter.stats : null;
  const W = 1080;
  const H = stats ? 1920 : 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // 纸
  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(0, 0, W, H);

  // 照片
  const px = 60;
  const py = 60;
  const pw = 960;
  const ph = 600;
  ctx.save();
  roundedRect(ctx, px, py, pw, ph, 30);
  ctx.clip();
  ctx.translate(px, py);
  drawPhoto(ctx, pw, ph, letter, species, catCoat);
  ctx.restore();
  roundedRect(ctx, px, py, pw, ph, 30);
  ctx.strokeStyle = '#5b3a24';
  ctx.lineWidth = 6;
  ctx.stroke();

  // 地点和日期（月报、年度回顾的标题是金色的）
  ctx.fillStyle = stats ? '#b86b00' : INK;
  ctx.font = `700 58px ${UI_FONT}`;
  ctx.fillText(capitalize(letter.title), 70, 752);
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${UI_FONT}`;
  ctx.fillText(letter.dateText, W - 70, 748);
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#e3cfb2';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(70, 784);
  ctx.lineTo(W - 70, 784);
  ctx.stroke();
  ctx.setLineDash([]);

  // 月报、年度回顾：数据格子，一行 3 个
  let top = 846;
  if (stats) {
    const cols = 3;
    const gap = 22;
    const tileW = (W - 140 - gap * (cols - 1)) / cols;
    const tileH = 168;
    const y0 = 818;
    stats.forEach((s, i) => {
      const x = 70 + (i % cols) * (tileW + gap);
      const y = y0 + Math.floor(i / cols) * (tileH + gap);
      roundedRect(ctx, x, y, tileW, tileH, 24);
      ctx.fillStyle = '#fdefd6';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.font = `40px ${EMOJI_FONT}`;
      ctx.fillText(s.emoji, x + tileW / 2, y + 52);
      ctx.fillStyle = INK;
      ctx.font = `800 46px ${UI_FONT}`;
      ctx.fillText(s.value, x + tileW / 2, y + 108);
      ctx.fillStyle = MUTED;
      ctx.font = `400 25px ${UI_FONT}`;
      ctx.fillText(s.label, x + tileW / 2, y + 148);
      ctx.textAlign = 'left';
    });
    top = y0 + Math.ceil(stats.length / cols) * (tileH + gap) + 52;
  }

  // 正文：字号从大到小试，直到放得下
  const bottom = letter.gift ? H - 230 : H - 150;
  let size = 40;
  let lineHeight = 0;
  let paragraphs = [];
  for (const candidate of [40, 37, 34, 31, 28, 25, 22]) {
    size = candidate;
    lineHeight = size * 1.62;
    ctx.font = `${size}px ${LETTER_FONT}`;
    paragraphs = letter.lines.map((text) => wrapText(ctx, text, W - 150));
    const height = paragraphs.reduce((sum, p) => sum + p.length * lineHeight + size * 0.3, 0);
    if (top + height <= bottom) break;
  }
  ctx.fillStyle = INK;
  let y = top;
  for (const paragraph of paragraphs) {
    for (const line of paragraph) {
      ctx.fillText(line, 76, y);
      y += lineHeight;
    }
    y += size * 0.3;
  }

  // 礼物
  if (letter.gift) {
    const gy = H - 178;
    roundedRect(ctx, 70, gy - 58, W - 140, 86, 22);
    ctx.fillStyle = '#fdefd6';
    ctx.fill();
    ctx.font = `52px ${EMOJI_FONT}`;
    ctx.fillText(letter.gift.emoji, 92, gy);
    ctx.fillStyle = INK;
    ctx.font = `32px ${LETTER_FONT}`;
    let giftText = letter.gift.line;
    while (giftText.length > 4 && ctx.measureText(giftText).width > W - 430) giftText = `${giftText.slice(0, -2)}…`;
    ctx.fillText(giftText, 172, gy - 6);
    if (letter.gift.rarity !== 'common') {
      ctx.textAlign = 'right';
      ctx.fillStyle = RARITY_COLOR[letter.gift.rarity];
      ctx.font = `700 28px ${UI_FONT}`;
      ctx.fillText(`★ ${letter.gift.rarityLabel}`, W - 96, gy - 6);
      ctx.textAlign = 'left';
    }
  }

  // 落款
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `40px ${LETTER_FONT}`;
  ctx.fillText(letter.sign, W - 132, H - 90);
  ctx.font = `38px ${EMOJI_FONT}`;
  ctx.fillText('🐾', W - 74, H - 90);

  // 页脚
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b89b78';
  ctx.font = `400 24px ${UI_FONT}`;
  ctx.fillText(footer || 'Pawmail', W / 2, H - 32);
  ctx.textAlign = 'left';

  return canvas;
}
