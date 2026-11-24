// 二维码：把一小段文字（比如 ntfy 的订阅链接）变成黑白方格，手机一扫就能读出来。
//
// 只做用得着的那部分：字节模式（任何文字都按 UTF-8 存），版本 1～10（边长 21～57 格，最多约 270 个字节）。
// 步骤照二维码的标准（ISO/IEC 18004）：
//   1. 文字 → 一串数据码字（模式、长度、内容、补齐）
//   2. 每块数据算出纠错码（Reed-Solomon），交错排好
//   3. 先画固定的图案（三个角的大方块、定位线、小方块），再把数据按之字形从右下角往上摆进剩下的格子
//   4. 8 种"掩码"（把某些格子黑白翻转）都试一遍，挑最不容易认错的那种，写上格式信息
// 思路参考 Project Nayuki 的二维码生成器（MIT 许可），这里是按同样的规则自己写的精简版。
// 检查办法：scratchpad 里的 qr-check.js（拿标准里的例子核对纠错码、格式信息，再把生成的码读回来对内容）。

const L = 0;
const M = 1;
const Q = 2;
const H = 3;
const FORMAT_ID = [1, 0, 3, 2]; // L、M、Q、H 在格式信息里写成几
// 版本 1～10 每一块的纠错码个数、一共分几块（按 L、M、Q、H）
const ECC_PER_BLOCK = [
  [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];
const BLOCKS = [
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];
const MAX_VERSION = 10;

/** 这个版本里能放数据的格子有多少（去掉固定图案、格式信息、版本信息） */
function rawModules(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

/** 这个版本、这个纠错等级能放几个数据码字 */
function dataCapacity(version, ecl) {
  return Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[ecl][version - 1] * BLOCKS[ecl][version - 1];
}

/** n 个字节放得下吗（4 位模式 + 长度 + 内容） */
function fits(n, version, ecl) {
  return 4 + (version < 10 ? 8 : 16) + 8 * n <= dataCapacity(version, ecl) * 8;
}

// ---------------------------------------------------------------- 纠错码（GF(256) 上的 Reed-Solomon）

/** 两个字节在 GF(256) 里相乘（本原多项式 0x11D） */
function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** 生成多项式 (x - 1)(x - 2)(x - 4)…(x - 2^(degree-1))，去掉最高次项，从高次到低次 */
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

/** 数据除以生成多项式的余数 = 纠错码 */
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
  }
  return result;
}

// ---------------------------------------------------------------- 格式信息、版本信息（带校验位）

/** 15 位格式信息：纠错等级 + 掩码编号，加 10 位 BCH 校验，再和 0x5412 异或 */
function formatBits(ecl, mask) {
  const data = (FORMAT_ID[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 位版本信息（版本 7 以上才有）：版本号 + 12 位 BCH 校验 */
function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** 掩码 0～7：这一格要不要翻转（x 是第几列，y 是第几行） */
function masked(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

// ---------------------------------------------------------------- 画格子

/**
 * 把文字做成二维码。返回 { size, version, ecl, mask, dark(x, y) }（dark：这一格是不是黑的）。
 * 纠错等级至少 M（能容忍约 15% 的格子认错），放得下的话自动提高。太长（超过版本 10）会报错
 */
export function makeQr(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let version = 0;
  for (let v = 1; v <= MAX_VERSION && !version; v++) if (fits(bytes.length, v, M)) version = v;
  if (!version) throw new Error('二维码放不下这么长的文字');
  let ecl = M;
  for (const e of [Q, H]) if (fits(bytes.length, version, e)) ecl = e;

  const size = version * 4 + 17;
  const modules = new Uint8Array(size * size); // 1 = 黑
  const fixed = new Uint8Array(size * size); // 1 = 固定图案（不放数据、不翻转）
  const setFixed = (x, y, dark) => {
    modules[y * size + x] = dark ? 1 : 0;
    fixed[y * size + x] = 1;
  };

  // 定位线（第 6 行、第 6 列黑白相间）
  for (let i = 0; i < size; i++) {
    setFixed(6, i, i % 2 === 0);
    setFixed(i, 6, i % 2 === 0);
  }
  // 三个角上的大方块（连同外面一圈白边）
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFixed(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // 小方块（版本 2 以上）
  const align = [];
  if (version > 1) {
    const n = Math.floor(version / 7) + 2;
    const step = Math.floor((version * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    align.push(6);
    for (let i = n - 1, pos = size - 7; i >= 1; i--, pos -= step) align.splice(1, 0, pos);
  }
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const last = align.length - 1;
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; // 和大方块重叠的三个角不画
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFixed(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // 格式信息（两份，先占位，挑好掩码后再写真的）
  const drawFormat = (mask) => {
    const bits = formatBits(ecl, mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setFixed(8, i, bit(i));
    setFixed(8, 7, bit(6));
    setFixed(8, 8, bit(7));
    setFixed(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFixed(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFixed(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFixed(8, size - 15 + i, bit(i));
    setFixed(8, size - 8, true); // 永远是黑的那一格
  };
  drawFormat(0);
  // 版本信息（版本 7 以上，右上角、左下角各一份）
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFixed(a, b, dark);
      setFixed(b, a, dark);
    }
  }

  // 数据码字：0100（字节模式）+ 长度 + 内容 + 结束符，补到整字节，再用 0xEC、0x11 轮流填满
  const capacity = dataCapacity(version, ecl);
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity * 8; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));

  // 分块、每块加纠错码，再一列一列交错排（短块少一个数据码字，那个位置跳过）
  const numBlocks = BLOCKS[ecl][version - 1];
  const eccLen = ECC_PER_BLOCK[ecl][version - 1];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) if (i !== shortLen - eccLen || j >= shortBlocks) codewords.push(blocks[j][i]);
  }

  // 之字形摆放：从右下角开始，两列一组，往上、往下交替；跳过第 6 列（竖的定位线）
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (fixed[y * size + x] || n >= codewords.length * 8) continue;
        modules[y * size + x] = (codewords[n >>> 3] >>> (7 - (n & 7))) & 1;
        n += 1;
      }
    }
  }

  // 8 种掩码都试一遍，挑扣分最少的
  const flip = (mask) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y * size + x] && masked(mask, x, y)) modules[y * size + x] ^= 1;
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    flip(mask);
    drawFormat(mask);
    const score = penalty(modules, size);
    if (score < bestScore) {
      best = mask;
      bestScore = score;
    }
    flip(mask); // 翻回来，试下一种
  }
  flip(best);
  drawFormat(best);
  return { size, version, ecl: 'LMQH'[ecl], mask: best, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && modules[y * size + x] === 1 };
}

/**
 * 扣分（越少越好认）：一行 / 一列连着 5 格以上同色、2×2 同色的小块、像角上大方块的 1:1:3:1:1 图案、黑白比例离一半太远
 */
function penalty(modules, size) {
  let score = 0;
  const at = (x, y) => modules[y * size + x];
  const FINDER_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < size; i++) {
      const line = [];
      for (let j = 0; j < size; j++) line.push(pass === 0 ? at(j, i) : at(i, j));
      // 连着同色
      let run = 1;
      for (let j = 1; j <= size; j++) {
        if (j < size && line[j] === line[j - 1]) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      // 像大方块的图案（两边各补 4 格白，和画出来时外面的白边一样）
      const padded = [0, 0, 0, 0, ...line, 0, 0, 0, 0];
      for (let j = 0; j + 11 <= padded.length; j++) {
        const hit = (pattern) => pattern.every((v, k) => padded[j + k] === v);
        if (hit(FINDER_A) || hit(FINDER_B)) score += 40;
      }
    }
  }
  // 2×2 同色
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  }
  // 黑白比例
  let darkCount = 0;
  for (let i = 0; i < modules.length; i++) darkCount += modules[i];
  score += Math.floor(Math.abs((darkCount * 100) / modules.length - 50) / 5) * 10;
  return score;
}

/**
 * 把二维码画在画布上：四周留 4 格白边（标准要求），每格 cell 个像素。
 * 颜色用深棕，和信纸的颜色搭；对比度够，手机照样认得
 */
export function drawQr(ctx, qr, cell, { dark = '#2b1a10', light = '#ffffff' } = {}) {
  const quiet = 4;
  const side = (qr.size + quiet * 2) * cell;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = dark;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.dark(x, y)) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
  }
  return side;
}

/** 测试用：内部的几个函数（scratchpad 的 qr-check.js 拿标准里的例子核对） */
export const _internal = { rsDivisor, rsRemainder, gfMultiply, formatBits, versionBits, masked, rawModules, dataCapacity, ECC_PER_BLOCK, BLOCKS };
