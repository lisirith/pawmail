'use strict';
// 生成说明页（README）和 itch.io 页面用的宣传图、动图，放到 docs/images/。
// 图都是用程序自己的画法现拍的，所以改了造型、衣服之后重新跑一遍就行。
//
// 运行：先开着预览服务器（npm run preview），再 npm run promo
//   npm run promo -- hero cover    只拍这几张（名字见下面的 SHOTS）
// 做动图要用到 ffmpeg（电脑上没有的话，只出静态图，动图跳过）。

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron'); // 在 Node 里 require('electron') 拿到的是 electron.exe 的路径

const root = path.resolve(__dirname, '..', '..');
const out = path.join(root, 'docs', 'images');
const tmp = path.join(root, 'tools', 'shots', 'promo'); // 动图的中间产物（拼好的大图），不进 Git
const lib = fs.readFileSync(path.join(__dirname, 'lib.js'), 'utf8');
const NAMES = { zh: '年糕', en: 'Mochi' };

/**
 * 每一张图：page 是预览服务器上的地址，w×h 是截图窗口的大小，script 是先在页面里执行的脚本（见 tools/snap.js）。
 * 动图（gif）：脚本返回一张"很多帧拼起来的大图"，一行 cols 帧，再用 ffmpeg 切开。
 */
const SHOTS = [];
for (const lang of ['zh', 'en']) {
  SHOTS.push(
    { name: `hero-${lang}`, page: `/src/renderer/index.html?preview=1&scale=1.3&mail=1&lang=${lang}&species=cat`, w: 720, h: 420, script: 'hero.js' },
    { name: `letter-${lang}`, page: `/src/renderer/mail.html?lang=${lang}&species=cat&unread=0&days=14&pick=outfit&tall=832&name=${encodeURIComponent(NAMES[lang])}`, w: 472, h: 860, script: 'letter.js' },
    { name: `wardrobe-${lang}`, page: `/src/renderer/mail.html?view=wardrobe&lang=${lang}&species=cat&unread=0&days=14&outfit=capRed,roundGlasses,knitSweater&name=${encodeURIComponent(NAMES[lang])}`, w: 472, h: 700, script: 'letter.js' },
    { name: `postcard-${lang}`, page: `/src/renderer/mail.html?lang=${lang}&species=cat&unread=0&days=14&name=${encodeURIComponent(NAMES[lang])}`, w: 472, h: 700, script: 'postcard.js' }
  );
}
SHOTS.push(
  { name: 'pickup', gif: { cols: 10, fps: 20 }, page: '/src/renderer/index.html?preview=1&box=480x300&species=cat&fps=20&cols=10', w: 480, h: 300, script: 'pickup.js' },
  { name: 'climb', gif: { cols: 12, fps: 15 }, page: '/src/renderer/index.html?preview=1&box=420x380&area=0,0,0.66,1&species=panda&fps=15&cols=12', w: 420, h: 380, script: 'climb.js' },
  { name: 'cover', page: '/src/renderer/gallery.html?bg=none', w: 640, h: 520, script: 'cover.js' }
);

function snap(shot, file) {
  const env = { ...process.env, PORT: process.env.PORT || '5177' };
  if (shot.script) env.SNAP_EVAL = `${lib}\n${fs.readFileSync(path.join(__dirname, shot.script), 'utf8')}`;
  else delete env.SNAP_EVAL;
  fs.rmSync(file, { force: true });
  const run = spawnSync(electron, [path.join(root, 'tools', 'snap.js'), shot.page, file, String(shot.w), String(shot.h), '1500'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 180000,
  });
  if (!fs.existsSync(file)) {
    console.log(`✗ ${shot.name} 没拍成：\n${run.stdout || ''}${run.stderr || ''}`);
    return false;
  }
  return true;
}

/** 把拼好的大图切成一帧一帧，做成循环播放的动图（先算一份 256 色的调色板，颜色才不会糊） */
function makeGif(sheet, file, { cols, fps }, w, h) {
  const { width, height } = pngSize(sheet);
  const rows = Math.round(height / h);
  const filter = `untile=${cols}x${rows},setpts=N/(${fps}*TB),split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sheet, '-filter_complex', filter, '-r', String(fps), '-loop', '0', file], { encoding: 'utf8' });
  if (run.error || run.status !== 0) {
    console.log(`✗ 动图 ${path.basename(file)} 没做成（电脑上有 ffmpeg 吗？）${run.error ? run.error.message : run.stderr}`);
    return false;
  }
  if (width !== cols * w) console.log(`  （注意：大图宽 ${width}，不是 ${cols} × ${w}）`);
  return true;
}

/** PNG 文件头里就写着宽和高 */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });
let failed = 0;
for (const shot of SHOTS) {
  if (only.length && !only.some((n) => shot.name.startsWith(n))) continue;
  if (shot.gif) {
    const sheet = path.join(tmp, `${shot.name}-sheet.png`);
    const gif = path.join(out, `${shot.name}.gif`);
    const ok = snap(shot, sheet) && makeGif(sheet, gif, shot.gif, shot.w, shot.h);
    if (ok) console.log(`✓ ${shot.name}.gif  ${(fs.statSync(gif).size / 1024).toFixed(0)} KB`);
    else failed += 1;
  } else {
    const file = path.join(out, `${shot.name}.png`);
    if (snap(shot, file)) console.log(`✓ ${shot.name}.png  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    else failed += 1;
  }
}
process.exitCode = failed ? 1 : 0;
