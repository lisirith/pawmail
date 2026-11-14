'use strict';
// 美术回归检查：只开隐藏的预览窗口，不启动桌宠后台，也不读写用户存档。
// 先运行 npm run preview，再运行 electron tools/check-art.js [输出目录] [蓝笔标注.png]。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(process.argv[2] || 'tools/shots/art-review');

async function inspectArt(poses, guideUrl) {
  const { SPECIES, getSpecies } = await import('/src/renderer/js/pet/species/index.js');
  const luckyCat = getSpecies('cat', 'lucky');
  const { makePose } = await import('/src/renderer/js/pet/pose.js');
  const { drawPet, drawHeadOnly, getGeometry, RIG } = await import('/src/renderer/js/pet/draw.js');
  const { LOOKS } = await import('/src/renderer/js/pet/looks.js');
  const cases = poses.map(([name, pose]) => ({ name, pose, opts: {} }));
  for (let step = 0; step <= 10; step++) {
    const t = step / 10;
    for (const facing of [-1, -0.5, 0, 0.5, 1]) {
      cases.push({ name: `sit-${t}-${facing}`, pose: { crouch: t, facing, tailSide: facing }, opts: {} });
      cases.push({ name: `loaf-${t}-${facing}`, pose: { loaf: t, facing, eyes: 'sleep', tailSide: facing }, opts: {} });
    }
    cases.push({ name: `carry-${t}`, pose: { armL: -0.75 + 2.5 * t, armR: -0.75 + 2.5 * t }, opts: { carry: true, carryLift: t } });
  }
  // 衣柜里的衣服：每件单独穿，在站、坐、趴、走、举手、被拎起、扒墙歪着这些姿势下都画一遍；再加两套全身搭配
  const { OUTFITS } = await import('/src/renderer/js/pet/outfits.js');
  const outfitPoses = [
    ['stand', {}],
    ['sit', { crouch: 1, tailCurl: 0.35 }],
    ['loaf', { loaf: 1, eyes: 'sleep' }],
    ['walk', { facing: 1, lift: 2, lean: 0.05, footLY: 5, armL: -0.25, armR: 0.3 }],
    ['cheer', { armL: 1.8, armR: 1.8, lift: 12 }],
    ['held', { armL: 1.0, armR: 1.0, squash: -0.08, lean: 0.25, lift: 30 }],
    ['side', { facing: -1, headTilt: 0.15, armL: 2.0, armR: -0.5 }],
    ['lick', { crouch: 1, armR: -2.5, headTilt: 0.16 }],
  ];
  const outfitSets = Object.entries(OUTFITS).map(([id, art]) => [id, { [art.slot]: id }]);
  outfitSets.push(['setA', { hat: 'capRed', glasses: 'roundGlasses', top: 'sailorTop', bag: 'backpack', held: 'bobaTea' }]);
  outfitSets.push(['setB', { hat: 'wizardHat', glasses: 'starGlasses', top: 'tangJacket', bag: 'catBag', held: 'bamboo' }]);
  for (const [id, outfit] of outfitSets) {
    for (const [poseName, pose] of outfitPoses) {
      const holding = outfit.held && !pose.loaf && pose.armL === undefined ? { armL: -0.75, armR: -0.75 } : {};
      cases.push({ name: `outfit-${id}-${poseName}`, pose: { ...pose, ...holding }, opts: { outfit } });
    }
    cases.push({ name: `outfit-${id}-birthday`, pose: { armL: -0.75, armR: -0.75 }, opts: { outfit, look: LOOKS.birthday } }); // 过节时节日装扮盖住帽子和手里的东西
  }
  for (const [name, look] of Object.entries(LOOKS)) {
    for (const crouch of [0, 1]) {
      for (const sheetLift of look.cover ? [0, 0.5, 1] : [0]) {
        cases.push({ name: `look-${name}-${crouch}-${sheetLift}`, pose: { crouch, armL: look.held ? -0.75 : 0, armR: look.held ? -0.75 : 0 }, opts: { look, sheetLift } });
      }
    }
  }
  const failures = [];
  const stats = {};
  const canvas = document.createElement('canvas');
  canvas.width = RIG.canvasW;
  canvas.height = RIG.canvasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let depth = 0;
  // Canvas 会悄悄忽略 NaN 坐标；这里将它变成明确错误。
  const checked = new Proxy(ctx, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== 'function') return value;
      return (...args) => {
        for (const arg of args) if (typeof arg === 'number' && !Number.isFinite(arg)) throw new Error(`${String(key)} 含无效数字`);
        if (key === 'save') depth++;
        if (key === 'restore' && --depth < 0) throw new Error('多余的 restore');
        return value.apply(target, args);
      };
    },
    set(target, key, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${String(key)} 含无效数字`);
      target[key] = value;
      return true;
    },
  });
  for (const sp of [...Object.values(SPECIES), luckyCat]) {
    const variantId = sp.coatId === 'lucky' ? 'cat-lucky' : sp.id;
    let minPixels = Infinity;
    let minMargin = Infinity;
    for (const sample of cases) {
      try {
        ctx.reset();
        ctx.translate(RIG.anchorX, RIG.anchorY);
        depth = 0;
        drawPet(checked, sp, makePose(sample.pose), { ...sample.opts, time: 0.3, shadow: false });
        if (depth !== 0) throw new Error(`save/restore 不平衡：${depth}`);
        const transform = ctx.getTransform();
        if (transform.a !== 1 || transform.d !== 1 || transform.b !== 0 || transform.c !== 0 || transform.e !== RIG.anchorX || transform.f !== RIG.anchorY) throw new Error('绘制后坐标变换未还原');
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let pixels = 0, margin = Infinity;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] > 8) {
            pixels++;
            margin = Math.min(margin, x, y, canvas.width - x - 1, canvas.height - y - 1);
          }
        }
        if (pixels < 800) throw new Error(`角色几乎没有画出来：${pixels} 像素`);
        if (margin < 2) throw new Error(`角色碰到画布边缘：${margin}px`);
        if (pixels > canvas.width * canvas.height * 0.7) throw new Error('透明背景疑似被实色覆盖');
        minPixels = Math.min(minPixels, pixels);
        minMargin = Math.min(minMargin, margin);
      } catch (error) {
        failures.push(`${variantId}/${sample.name}: ${error.message}`);
      }
    }
    // 单独测绘制调用，不把读取像素或检查代理的开销混进来。
    const bench = document.createElement('canvas');
    bench.width = RIG.canvasW; bench.height = RIG.canvasH;
    const b = bench.getContext('2d');
    const start = performance.now();
    for (let n = 0; n < 240; n++) {
      b.reset(); b.translate(RIG.anchorX, RIG.anchorY);
      drawPet(b, sp, makePose(poses[n % poses.length][1]), { time: n / 30 });
    }
    stats[variantId] = { cases: cases.length, minPixels, minMargin, averageDrawMs: +( (performance.now() - start) / 240).toFixed(3) };
  }
  const sheet = document.createElement('canvas');
  sheet.width = 1680; sheet.height = 1225;
  const s = sheet.getContext('2d');
  s.fillStyle = '#f7f0e5'; s.fillRect(0, 0, sheet.width, sheet.height);
  s.fillStyle = '#614839'; s.font = '600 30px "Microsoft YaHei", sans-serif';
  s.fillText('Pawmail · 熊猫、橘猫与招财猫 / 动作预览', 36, 50);
  s.font = '17px "Microsoft YaHei", sans-serif'; s.fillStyle = '#856e5e';
  s.fillText('游戏实际绘制 · 放大检查轮廓、表情与部件衔接', 36, 82);
  const featured = [poses[0], poses[5], poses[3], poses[6], poses[7], ['抱信', { armL: -0.75, armR: -0.75 }], poses[8]];
  for (const [row, sp] of [SPECIES.panda, SPECIES.cat, luckyCat].entries()) {
    const top = 110 + row * 365;
    s.fillStyle = row ? '#e9e0d2' : '#fffaf3'; s.fillRect(20, top, sheet.width - 40, 348);
    for (const [col, [name, pose]] of featured.entries()) {
      s.save(); s.translate(135 + col * 235, top + 290); s.scale(1.8, 1.8);
      drawPet(s, sp, makePose(pose), { time: 0.3, carry: name === '抱信' }); s.restore();
      s.fillStyle = '#715949'; s.font = '17px "Microsoft YaHei", sans-serif'; s.textAlign = 'center';
      s.fillText(name, 135 + col * 235, top + 326); s.textAlign = 'left';
    }
  }
  const dark = document.createElement('canvas'); dark.width = 960; dark.height = 430;
  const d = dark.getContext('2d'); d.fillStyle = '#252a34'; d.fillRect(0, 0, 960, 430);
  for (const [i, id] of ['panda', 'cat'].entries()) {
    d.save(); d.translate(240 + i * 480, 365); d.scale(2.3, 2.3);
    drawPet(d, SPECIES[id], makePose({ crouch: 1 }), { time: 0.3 }); d.restore();
  }
  const images = { 'poses.png': sheet.toDataURL(), 'dark.png': dark.toDataURL() };
  const coats = document.createElement('canvas'); coats.width = 1280; coats.height = 580;
  const cc = coats.getContext('2d'); cc.fillStyle = '#f7f0e5'; cc.fillRect(0, 0, 1280, 580);
  for (const [i, [title, sp, pose]] of [
    ['原来的橘猫', SPECIES.cat, {}],
    ['招财猫 · 同一造型', luckyCat, {}],
    ['招财猫 · 坐姿', luckyCat, { crouch: 1, tailCurl: 0.75 }],
  ].entries()) {
    cc.fillStyle = '#614839'; cc.font = '600 23px "Microsoft YaHei", sans-serif'; cc.textAlign = 'center';
    cc.fillText(title, 180 + i * 420, 43);
    cc.save(); cc.translate(180 + i * 420, 510); cc.scale(3.05, 3.05);
    drawPet(cc, sp, makePose(pose), { time: 0.3, shadow: false }); cc.restore();
  }
  images['cat-coats.png'] = coats.toDataURL();
  // 放大站姿和坐姿，便于检查爪底过弯后内侧线条的粗细与透明度。
  const arms = document.createElement('canvas'); arms.width = 960; arms.height = 560;
  const a = arms.getContext('2d'); a.fillStyle = '#f7f0e5'; a.fillRect(0, 0, 960, 560);
  for (const [i, [title, pose]] of [['站姿 · 内侧逐渐变细、变淡', {}], ['坐姿 · 保留前腿分界', { crouch: 1, tailCurl: 0.35 }]].entries()) {
    a.fillStyle = '#614839'; a.font = '600 20px "Microsoft YaHei", sans-serif'; a.textAlign = 'center';
    a.fillText(title, 220 + i * 480, 42);
    a.save(); a.translate(220 + i * 480, 510); a.scale(3.2, 3.2);
    drawPet(a, SPECIES.cat, makePose(pose), { time: 0.3, shadow: false }); a.restore();
  }
  images['cat-arm-detail.png'] = arms.toDataURL();
  const head = document.createElement('canvas'); head.width = 720; head.height = 500;
  const h = head.getContext('2d'); h.fillStyle = '#f7f0e5'; h.fillRect(0, 0, 720, 500);
  h.fillStyle = '#614839'; h.font = '600 22px "Microsoft YaHei", sans-serif'; h.textAlign = 'center';
  h.fillText('猫 · 头部轮廓放大', 360, 42);
  h.save(); h.translate(360, 320); h.scale(5, 5);
  drawHeadOnly(h, SPECIES.cat, makePose({ headTilt: -0.06 })); h.restore();
  images['cat-head.png'] = head.toDataURL();
  const comparisonSamples = [];
  // 参考图属于本机资源，发布包里可以没有它；缺少时仍然完成动画回归检查。
  const refResponse = await fetch('/img resource/ba8d7185-40d5-456b-ab17-12ce9a388f21.png');
  if (refResponse.ok) {
    const reference = await createImageBitmap(await refResponse.blob());
    const compare = document.createElement('canvas'); compare.width = 1320; compare.height = 1000;
    const c = compare.getContext('2d');
    c.fillStyle = '#f7f0e5'; c.fillRect(0, 0, 1320, 1000);
    c.font = '600 23px "Microsoft YaHei", sans-serif'; c.fillStyle = '#614839'; c.textAlign = 'center';
    ['原始参考图', '游戏绘制 · 放大', '游戏绘制 · 原始尺寸'].forEach((title, i) => c.fillText(title, 220 + i * 440, 43));
    const refs = {
      panda: { head: [475, 340], rx: 300, pose: { crouch: 1, headTilt: -0.12, armL: -1, armR: -1, mouth: 'smile', mouthOpen: 0.9, lookX: 0.35, blush: 1 } },
      cat: { head: [1252, 370], rx: 282, pose: { crouch: 1, headTilt: -0.06, lookY: -0.15, tailCurl: 0.75, tailSide: 1 } },
    };
    for (const [row, id] of ['panda', 'cat'].entries()) {
      const ref = refs[id], sp = SPECIES[id], p = makePose(ref.pose);
      comparisonSamples.push({ id: `${id}-reference-sitting`, pose: ref.pose, nativeScale: 1, referenceHead: ref.head, referenceHalfWidth: ref.rx });
      const top = 60 + row * 465, headY = top + 205;
      c.save(); c.beginPath(); c.rect(0, top, 440, 460); c.clip();
      const scale = 288 / (ref.rx * 2);
      c.drawImage(reference, 220 - ref.head[0] * scale, headY - ref.head[1] * scale, reference.width * scale, reference.height * scale);
      c.restore();
      const g = getGeometry(sp, p), k = 288 / (sp.head.rx * 2);
      c.save(); c.translate(660 - g.headCx * k, headY - g.headCy * k); c.scale(k, k);
      drawPet(c, sp, p, { time: 0.3, shadow: false }); c.restore();
      c.save(); c.translate(1100, top + 310);
      drawPet(c, sp, p, { time: 0.3, shadow: false }); c.restore();
    }
    images['reference.png'] = compare.toDataURL();
    // 以同一头部中心和宽度叠原图，蓝线直接使用游戏的头部路径。
    const overlay = document.createElement('canvas'); overlay.width = 880; overlay.height = 520;
    const o = overlay.getContext('2d');
    o.fillStyle = '#f7f0e5'; o.fillRect(0, 0, overlay.width, overlay.height);
    o.drawImage(compare, 0, 60, 880, 460, 0, 60, 880, 460);
    o.fillStyle = '#614839'; o.font = '600 20px "Microsoft YaHei", sans-serif'; o.textAlign = 'center';
    o.fillText('原图＋游戏头部轮廓（蓝线）', 220, 39);
    o.fillText('游戏绘图', 660, 39);
    const pandaPose = makePose(refs.panda.pose), pandaScale = 288 / (SPECIES.panda.head.rx * 2);
    o.save(); o.translate(220, 265); o.scale(pandaScale, pandaScale); o.rotate(pandaPose.headTilt);
    SPECIES.panda.headPath(o, SPECIES.panda.head.rx, SPECIES.panda.head.ry);
    o.strokeStyle = '#1388c9'; o.lineWidth = 0.6; o.stroke(); o.restore();
    images['panda-overlay.png'] = overlay.toDataURL();
    if (guideUrl) {
      // 标注图与对照页同尺寸：只叠加蓝笔，原来的角色像素不混入新版。
      const guide = new Image(); guide.src = guideUrl; await guide.decode();
      const guideCanvas = document.createElement('canvas');
      guideCanvas.width = compare.width; guideCanvas.height = compare.height;
      const gc = guideCanvas.getContext('2d', { willReadFrequently: true });
      gc.drawImage(guide, 0, 0);
      const pixels = gc.getImageData(0, 0, compare.width, compare.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
        if (!(r < 80 && g > 70 && g < 200 && b > 150 && b > g * 1.2)) pixels.data[i + 3] = 0;
      }
      gc.putImageData(pixels, 0, 0);
      c.drawImage(guideCanvas, 0, 0);
      images['blue-guide-overlay.png'] = compare.toDataURL();
    }
    reference.close();
  }
  return { failures, stats, comparisonSamples, images };
}

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true } });
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 3) errors.push(event.message);
  });
  try {
    await win.loadURL(`http://localhost:${process.env.PORT || 5177}/src/renderer/gallery.html?bg=light`);
    // 直接读取图鉴的姿势清单，避免检查脚本与图鉴各自维护一份动作而遗漏。
    const gallery = fs.readFileSync(path.join(__dirname, '../src/renderer/js/gallery.js'), 'utf8');
    const poseText = gallery.match(/const POSES = (\[[\s\S]*?\n\]);/);
    if (!poseText) throw new Error('找不到图鉴姿势清单');
    const poses = require('node:vm').runInNewContext(`(${poseText[1]})`, {}, { timeout: 1000 });
    const guideUrl = process.argv[3] ? `data:image/png;base64,${fs.readFileSync(process.argv[3]).toString('base64')}` : null;
    const result = await win.webContents.executeJavaScript(`(${inspectArt.toString()})(${JSON.stringify(poses)},${JSON.stringify(guideUrl)})`);
    fs.mkdirSync(out, { recursive: true });
    for (const [name, data] of Object.entries(result.images)) fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
    delete result.images;
    result.pageErrors = errors;
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    console.log(`检查图片：${out}`);
    app.exit(result.failures.length || errors.length ? 1 : 0);
  } catch (error) {
    console.error(error.stack); app.exit(1);
  }
});
