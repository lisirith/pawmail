// 喂给它吃的"食物"：拖到它身上的文件，会被揉成一个皱巴巴的小纸团。不同的东西揉出来的纸团不一样：
//   doc     文档        白纸团，上面印着几行字
//   folder  文件夹      黄色的牛皮纸团，露出文件夹的小耳朵
//   image   图片        纸团上露出一角小照片
//   audio   音乐        粉紫色的纸团，印着 ♪
//   video   视频        灰蓝色的纸团，印着 ▶
//   archive 压缩包      牛皮纸色的纸团，一条拉链
//   app     程序        浅灰蓝的纸团，一个小齿轮
//   link    快捷方式    白纸团，一个弯弯的小箭头
//   unknown 不认识的    米色的纸团，一个问号
//
// 坐标和宠物一样（不用管屏幕缩放），原点在纸团中心，半径大约 12。
// 鼠标拖着文件时跟在鼠标旁边的那个纸团（app.js）、飞进嘴里和吐出来的纸团（fx.js）都用这里画。

const OUTLINE = '#6f5341';

const STYLE = {
  doc: { fill: '#fbf7ef', shade: '#e4d9c6', crease: '#a8957d' },
  folder: { fill: '#f6c968', shade: '#d9a43e', crease: '#a77a22' },
  image: { fill: '#f9f4ec', shade: '#e3d8c6', crease: '#a8957d' },
  audio: { fill: '#f3d2ea', shade: '#d9aecd', crease: '#9f7699' },
  video: { fill: '#c9d6ea', shade: '#a3b4d0', crease: '#6f7f9e' },
  archive: { fill: '#e2c9a0', shade: '#c7a777', crease: '#8f7350' },
  app: { fill: '#dfe7ee', shade: '#bac9d6', crease: '#7d8ea0' },
  link: { fill: '#f7f5f0', shade: '#dcd6ca', crease: '#a39a8a' },
  unknown: { fill: '#efe3cf', shade: '#d5c2a3', crease: '#9a8466' },
};

export const FOOD_TYPES = Object.freeze(Object.keys(STYLE));

// 按扩展名分类（松手的时候知道文件名）
const BY_EXT = {
  doc: 'txt md markdown rtf doc docx odt pdf wps wpt et ett xls xlsx csv ods ppt pptx odp dps key pages numbers log json xml html htm ini cfg conf yaml yml tex epub mobi',
  image: 'png jpg jpeg gif bmp webp heic heif tif tiff svg ico psd ai raw cr2 nef arw dng avif',
  audio: 'mp3 wav flac aac m4a ogg oga wma opus mid midi ape amr',
  video: 'mp4 mov avi mkv wmv flv webm m4v mpg mpeg 3gp ts rmvb',
  archive: 'zip rar 7z tar gz tgz bz2 xz zst iso cab',
  app: 'exe msi msix appx bat cmd ps1 com scr apk jar dll sys',
  link: 'lnk url',
};
const EXT_TYPE = new Map();
for (const [type, list] of Object.entries(BY_EXT)) for (const ext of list.split(' ')) EXT_TYPE.set(ext, type);

/** 松手时：按文件名（和是不是文件夹）决定揉成哪种纸团 */
export function foodOfName(name, isDirectory = false) {
  if (isDirectory) return 'folder';
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return (m && EXT_TYPE.get(m[1].toLowerCase())) || 'unknown';
}

/**
 * 拖着还没松手时：浏览器只告诉我们文件的类型（比如 image/png），不告诉文件名。
 * 文件夹和不认识的文件这时候都是空的类型，先当作"不认识的"；松手以后就知道是不是文件夹了。
 */
export function foodOfMime(mime) {
  const t = String(mime || '').toLowerCase();
  if (!t || t === 'application/octet-stream') return 'unknown';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('text/') || /pdf|msword|officedocument|ms-excel|ms-powerpoint|opendocument|rtf|json|xml|epub/.test(t)) return 'doc';
  if (/zip|rar|7z|tar|gzip|bzip|compressed|iso/.test(t)) return 'archive';
  if (/shortcut|internet-shortcut/.test(t)) return 'link';
  if (/msdownload|msi|ms-installer|executable|java-archive|android/.test(t)) return 'app';
  return 'unknown';
}

/** 每种纸团的皱褶形状是固定的（这样同一种东西每次看起来一样），但不同种类各不相同 */
function seeded(type) {
  let h = 2166136261;
  for (const ch of type) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const SHAPES = new Map();
/**
 * 皱巴巴的样子：
 *   points  轮廓：一圈高高低低、有几个小凹口的点（纸被捏出来的疙瘩）
 *   patches 纸面上几块被捏出来的小斜面：有的亮一点，有的暗一点
 *   creases 几道东一道西一道的短折痕
 */
function shapeOf(type) {
  if (SHAPES.has(type)) return SHAPES.get(type);
  const rnd = seeded(type);
  const n = 19;
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.22;
    let r = 0.95 + (rnd() - 0.5) * 0.16;
    if (rnd() < 0.22) r -= 0.1; // 小凹口
    points.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const inside = () => {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.62;
    return [Math.cos(a) * d, Math.sin(a) * d];
  };
  const patches = [];
  for (let i = 0; i < 6; i++) {
    const [cx, cy] = inside();
    const corners = [];
    const m = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < m; k++) {
      const a = (k / m) * Math.PI * 2 + rnd() * 0.8;
      const d = 0.18 + rnd() * 0.24;
      corners.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
    }
    patches.push({ corners, light: i % 2 === 0 });
  }
  const creases = [];
  for (let i = 0; i < 7; i++) {
    let [x, y] = inside();
    let a = rnd() * Math.PI * 2;
    const line = [[x, y]];
    const segs = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < segs; k++) {
      a += (rnd() - 0.5) * 1.8; // 折痕拐个弯
      const len = 0.14 + rnd() * 0.18;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      line.push([x, y]);
    }
    creases.push(line);
  }
  const shape = { points, patches, creases };
  SHAPES.set(type, shape);
  return shape;
}

function outlinePath(ctx, points, r) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * r, y * r) : ctx.lineTo(x * r, y * r)));
  ctx.closePath();
}

/** 纸团上印的小图案（压在皱褶下面一点，所以先画） */
const MARKS = {
  doc(ctx) {
    ctx.strokeStyle = '#7d93b5';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [y, w] of [[-3.2, 8.5], [0, 6.5], [3.2, 7.5]]) {
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(0, y + 0.5);
      ctx.lineTo(w / 2, y - 0.2);
    }
    ctx.stroke();
  },
  folder(ctx) {
    ctx.strokeStyle = 'rgba(140, 95, 25, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -1);
    ctx.lineTo(8, 0.5);
    ctx.stroke();
  },
  image(ctx) {
    ctx.save();
    ctx.rotate(-0.22);
    ctx.beginPath();
    ctx.rect(-5.5, -4.5, 11, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.rect(-4.5, -3.5, 9, 7);
    ctx.fillStyle = '#9fd0f2';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4.5, 3.5);
    ctx.quadraticCurveTo(-1, -1.5, 4.5, 1.5);
    ctx.lineTo(4.5, 3.5);
    ctx.closePath();
    ctx.fillStyle = '#7cc576';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2.4, -1.6, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd25a';
    ctx.fill();
    ctx.restore();
  },
  audio(ctx) {
    ctx.save();
    ctx.rotate(-0.15);
    ctx.fillStyle = '#9b4fa8';
    ctx.strokeStyle = '#9b4fa8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(-1.6, 3, 2.3, 1.7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.5, 2.6);
    ctx.lineTo(0.5, -5);
    ctx.quadraticCurveTo(3.5, -4, 3.8, -1.2);
    ctx.stroke();
    ctx.restore();
  },
  video(ctx) {
    ctx.save();
    ctx.rotate(0.12);
    ctx.beginPath();
    ctx.rect(-5.5, -4, 11, 8);
    ctx.fillStyle = '#3d4f7a';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const x of [-4.2, -1.4, 1.4, 4.2]) {
      ctx.fillRect(x - 0.6, -3.4, 1.2, 1);
      ctx.fillRect(x - 0.6, 2.4, 1.2, 1);
    }
    ctx.beginPath();
    ctx.moveTo(-1.4, -1.9);
    ctx.lineTo(2.2, 0);
    ctx.lineTo(-1.4, 1.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  archive(ctx) {
    ctx.strokeStyle = '#7a5f3e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0.5, -9);
    ctx.lineTo(0, 3);
    for (let y = -7.5; y < 2.5; y += 2.2) {
      ctx.moveTo(-1.6, y);
      ctx.lineTo(1.8, y + 0.4);
    }
    ctx.stroke();
    ctx.beginPath(); // 拉链头
    ctx.rect(-1.6, 3, 3.2, 3.8);
    ctx.fillStyle = '#7a5f3e';
    ctx.fill();
  },
  app(ctx) {
    ctx.save();
    ctx.fillStyle = '#6a7d92';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 === 0 ? 5 : 3.8;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#dfe7ee';
    ctx.fill();
    ctx.restore();
  },
  link(ctx) {
    ctx.save();
    ctx.translate(1, 1);
    ctx.beginPath();
    ctx.rect(-4.5, -4.5, 9, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#3d7ae0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2.5, 2.5);
    ctx.quadraticCurveTo(-2.5, -1.5, 2, -1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.5, -3.4);
    ctx.lineTo(2.8, -1.5);
    ctx.lineTo(0.5, 0.4);
    ctx.stroke();
    ctx.restore();
  },
  unknown(ctx) {
    ctx.font = '900 11px "Segoe UI", "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9a7b55';
    ctx.fillText('?', 0.5, 0.5);
  },
};

/**
 * 画一个纸团。opts.size：大小（1 = 半径 12）；opts.count：一次拖了好几样时，右上角标个数字。
 */
export function drawFood(ctx, type, opts = {}) {
  const st = STYLE[type] || STYLE.unknown;
  const kind = STYLE[type] ? type : 'unknown';
  const size = opts.size ?? 1;
  const r = 12;
  const { points, patches, creases } = shapeOf(kind);
  ctx.save();
  ctx.scale(size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (kind === 'folder') {
    // 文件夹的小耳朵：从纸团左上角翘出来
    ctx.beginPath();
    ctx.moveTo(-10.5, -4);
    ctx.lineTo(-9.5, -13.5);
    ctx.lineTo(-2.2, -14.2);
    ctx.lineTo(-0.8, -9);
    ctx.closePath();
    ctx.fillStyle = st.fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  // 底色：纸是哑光的，只从左上方亮一点点
  outlinePath(ctx, points, r);
  const light = ctx.createLinearGradient(-r * 0.7, -r * 0.8, r * 0.7, r * 0.9);
  light.addColorStop(0, st.fill);
  light.addColorStop(0.55, st.fill);
  light.addColorStop(1, st.shade);
  ctx.fillStyle = light;
  ctx.fill();

  ctx.save();
  outlinePath(ctx, points, r);
  ctx.clip();
  // 被捏出来的小斜面：有的朝着光亮一点，有的背着光暗一点
  for (const { corners, light: bright } of patches) {
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * r, y * r) : ctx.lineTo(x * r, y * r)));
    ctx.closePath();
    ctx.fillStyle = bright ? 'rgba(255,255,255,0.32)' : 'rgba(70,45,20,0.08)';
    ctx.fill();
  }
  // 印在纸上的小图案
  (MARKS[kind] || MARKS.unknown)(ctx);
  // 折痕
  ctx.strokeStyle = st.crease;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.75;
  for (const line of creases) {
    ctx.beginPath();
    line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * r, y * r) : ctx.lineTo(x * r, y * r)));
    ctx.stroke();
  }
  ctx.restore();

  outlinePath(ctx, points, r);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.35;
  ctx.stroke();

  if (opts.count > 1) {
    // 好几样一起拖：右上角一个小圆牌写着个数
    const label = opts.count > 99 ? '99+' : String(opts.count);
    ctx.beginPath();
    ctx.arc(10, -10, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ff7a59';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = `800 ${label.length > 2 ? 5.5 : 7.5}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 10, -9.6);
  }
  ctx.restore();
}
