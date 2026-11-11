'use strict';
// 自检：自动把最关键的几件事检查一遍，不需要人动鼠标。
// 运行方式见 package.json 里的 "selftest"。结果写到 <输出文件夹>/result.json，截图写到 shot.png。
//
// 检查的内容：
//   画面有没有正常启动、有没有铺满窗口
//   鼠标不在宠物身上时，点击是不是真的"穿过"了我们的窗口（直接问 Windows：这个点最上面是谁的窗口）
//   鼠标移到宠物身上时，是不是"接住"了
//   鼠标离开后，是不是又放行了
//   画面如果卡死，后台会不会自动恢复穿透（否则会有一块看不见的玻璃挡住屏幕）
//   两种显示模式能不能切换
//   窗口背景是不是真的透明

const fs = require('node:fs');
const path = require('node:path');
const { screen } = require('electron');
const native = require('./native');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run({ overlay, mail, store, outDir, setSetting }) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = overlay.win.webContents;
  const js = (code) => wc.executeJavaScript(`(() => { ${code} })()`, true);
  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail });
    console.log(`[selftest] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + JSON.stringify(detail) : ''}`);
  };

  overlay.pollEnabled = false; // 不用真实鼠标，改用下面模拟的位置
  await wait(1500);

  // 1. 画面启动了吗？把时间快进到宠物跑进屏幕站好。
  const info = await js(`
    const P = window.__pawmail;
    if (!P) return null;
    P.pause();
    let n = 0;
    while (P.brain.name === 'arrive' && n++ < 1200) P.run(1 / 60);
    P.brain.queue.length = 0;
    P.brain.start('idle');
    P.setPointer(5, 5);
    P.run(0.5);
    return {
      w: P.world.width, h: P.world.height, x: P.pet.x, y: P.pet.y, scale: P.world.scale,
      dpr: window.devicePixelRatio, species: P.pet.sp.id, activity: P.brain.name, arriveFrames: n,
      hasBridge: typeof window.pawmail === 'object',
    };
  `);
  check('画面正常启动', !!info && info.hasBridge, info);
  if (!info) return finish();

  const bounds = overlay.win.getContentBounds();
  check('画面铺满整个窗口', Math.abs(info.w - bounds.width) <= 1 && Math.abs(info.h - bounds.height) <= 1, { bounds });
  check('宠物站在窗口底边（任务栏上沿）', Math.abs(info.y - (info.h - 3)) < 1 && info.x > 0 && info.x < info.w, { x: info.x, y: info.y });

  // 宠物身上的一个点（胸口），换算成屏幕物理像素
  const chest = { x: info.x, y: info.y - 50 * info.scale };
  const chestOnScreen = screen.dipToScreenPoint({ x: Math.round(bounds.x + chest.x), y: Math.round(bounds.y + chest.y) });
  const mine = native.handleOf(overlay.win);
  const topWindowAtPet = () => native.rootWindowAt(chestOnScreen.x, chestOnScreen.y);
  const canProbe = topWindowAtPet() !== null;

  // 2. 鼠标不在宠物身上：应该穿透
  await wait(200);
  check('鼠标不在宠物身上时，点击会穿过窗口', !overlay.capturing && (!canProbe || topWindowAtPet() !== mine), {
    capturing: overlay.capturing,
    probed: canProbe,
  });

  // 3. 鼠标移到宠物身上：应该接住
  await js(`const P = window.__pawmail; P.setPointer(${chest.x}, ${chest.y}); P.run(0.1); return true;`);
  await wait(200);
  check('鼠标在宠物身上时，窗口会接住点击', overlay.capturing && (!canProbe || topWindowAtPet() === mine), {
    capturing: overlay.capturing,
    probed: canProbe,
  });

  // 4. 鼠标离开：应该恢复穿透
  await js(`const P = window.__pawmail; P.setPointer(5, 5); P.run(0.1); return true;`);
  await wait(200);
  check('鼠标离开宠物后，恢复穿透', !overlay.capturing && (!canProbe || topWindowAtPet() !== mine), {
    capturing: overlay.capturing,
  });

  // 5. 画面"卡死"（这里是暂停状态，不会再发确认）：后台应该在 1 秒内自动恢复穿透
  await js(`const P = window.__pawmail; P.setPointer(${chest.x}, ${chest.y}); P.run(0.1); return true;`);
  await wait(100);
  const grabbed = overlay.capturing;
  await wait(1100);
  check('画面不再确认时，后台自动恢复穿透（保险）', grabbed && !overlay.capturing, { grabbed, after: overlay.capturing });
  await js(`const P = window.__pawmail; P.setPointer(5, 5); P.run(0.1); return true;`);

  // 6. 显示模式
  setSetting('displayMode', 'desktop');
  await wait(250);
  const desktopOk = !overlay.win.isAlwaysOnTop();
  setSetting('displayMode', 'top');
  await wait(250);
  check('可以在"最前面"和"只在桌面"之间切换', desktopOk && overlay.win.isAlwaysOnTop(), { nativeHelpers: native.available });

  // 7. 设置能传到画面
  setSetting('species', info.species === 'cat' ? 'panda' : 'cat');
  await wait(250);
  const swapped = await js(`return window.__pawmail.pet.sp.id;`);
  setSetting('species', info.species);
  await wait(250);
  check('从后台切换动物，画面会跟着变', swapped !== info.species, { swapped });

  // 8. 截一张图，并检查背景是不是真的透明
  await js(`const P = window.__pawmail; P.brain.start('greet', { line: 'hello' }); P.run(0.9); return true;`);
  await wait(600);
  const rect = {
    x: Math.max(0, Math.round(info.x - 220)),
    y: Math.max(0, Math.round(info.y - 330)),
    width: 440,
    height: 334,
  };
  const image = await wc.capturePage(rect);
  fs.writeFileSync(path.join(outDir, 'shot.png'), image.toPNG());
  const bitmap = image.toBitmap();
  const size = image.getSize();
  const cornerAlpha = bitmap[3]; // 左上角第一个像素的透明度
  let opaque = 0;
  for (let i = 3; i < bitmap.length; i += 4) if (bitmap[i] > 200) opaque += 1;
  check('窗口背景是透明的，而且画出了宠物', cornerAlpha === 0 && opaque > 2000, { cornerAlpha, opaquePixels: opaque, size });

  await testMail();
  await testReports();
  return finish();

  // ---------------------------------------------------------------- 月报、年度回顾、删信

  async function testReports() {
    const L = require('./letters');
    const DAY_MS = 86400000;
    const mailData = store.data.mail;
    const usage = store.data.usage;

    // 从上次见面的第二天开始，一天天往后模拟，直到跨过下一个元旦再多 3 天（中间一定会跨好几个月）
    let t = new Date(`${mailData.lastDay}T10:00:00`).getTime() + DAY_MS;
    const year = Number(L.logicalDay(t).slice(0, 4));
    const stop = new Date(`${year + 1}-01-04T10:00:00`).getTime();
    let simulated = 0;
    while (t <= stop) {
      const day = L.logicalDay(t);
      usage[day] = { first: t - 3600000, last: t + 12 * 3600000, activeMin: 240, pets: 3, pokes: 1, throws: simulated % 5 === 0 ? 1 : 0, dizzies: 0 };
      mail.check(t, true);
      for (const l of mailData.letters) if (!l.opened) mail.markOpened(l.id, { quiet: true }); // 假装每封都拆了
      t += DAY_MS;
      simulated += 1;
    }

    const monthly = mailData.letters.filter((l) => l.kind === 'monthly');
    const review = mailData.letters.find((l) => l.id === `y-${year}`);
    check('跨月时收到月报（这个月一起不少于 3 天）', monthly.length >= 1 && monthly.every((l) => /^m-\d{4}-\d{2}$/.test(l.id) && l.summary.days >= 3), {
      simulatedDays: simulated,
      reports: monthly.map((l) => l.id),
    });
    check('元旦收到年度回顾，代替 12 月的月报', !!review && review.summary.days >= 7 && !mailData.letters.some((l) => l.id === `m-${year}-12`), {
      review: review && { days: review.summary.days, places: Object.keys(review.summary.places).length },
    });
    check('每个月都存了一份小结（年度回顾要用）', Object.keys(mailData.monthly).filter((k) => k.startsWith(`${year}-`)).length >= 1, {
      months: Object.keys(mailData.monthly),
    });

    // 在信纸窗口里打开年度回顾：应该有数据格子；明信片是 1080×1920 的长图
    const win = mail.open({ view: 'letter', id: review.id });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(900);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const page = await mjs(
      `return { stats: document.querySelectorAll('.stats .stat').length, title: (document.querySelector('.letter-title') || {}).textContent, lines: document.querySelectorAll('.letter-body p').length };`
    );
    check('年度回顾页面有数据格子和正文', page.stats >= 4 && page.lines >= 5 && /\d{4}/.test(page.title || ''), page);
    fs.writeFileSync(path.join(outDir, 'report.png'), (await win.webContents.capturePage()).toPNG());
    const card = await mjs(`const url = __mail.postcard(); const img = new Image(); img.src = url; await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight };`);
    check('年度回顾能存成 1080×1920 的长图', card.w === 1080 && card.h === 1920, card);

    // 删一封：用窗口里的"删除"走一遍（和你点垃圾桶是同一条路）
    const giftsBefore = Object.keys(mailData.gifts).length;
    const victim = mailData.letters.find((l) => l.kind === 'daily');
    const one = await mjs(`return await window.pawmailMail.deleteLetters(['${victim.id}']);`);
    check('删一封信', one.ok && one.removed === 1 && !mailData.letters.some((l) => l.id === victim.id), one);

    // 删一个月：删掉最早那个月的全部信（见面信也在里面）
    const firstMonth = mailData.letters[0].day.slice(0, 7);
    const ids = mailData.letters.filter((l) => l.day.startsWith(firstMonth)).map((l) => l.id);
    const many = await mjs(`return await window.pawmailMail.deleteLetters(${JSON.stringify(ids)});`);
    check('删整个月的信', many.ok && many.removed === ids.length && !mailData.letters.some((l) => l.day.startsWith(firstMonth)), {
      month: firstMonth,
      removed: many.removed,
    });
    check('删信不会把礼物从图鉴里拿走', Object.keys(mailData.gifts).length === giftsBefore, { gifts: giftsBefore });

    const countBefore = mailData.letters.length;
    mail.check(t - DAY_MS + 60000, true);
    check('见面信删了以后，不会再寄一封', mailData.letters.length === countBefore && !mailData.letters.some((l) => l.kind === 'welcome'));

    const bad = await mjs(`return await window.pawmailMail.deleteLetters(['../../save.json']);`);
    check('删信时不认识的编号会被拒绝', bad && bad.ok === false, bad);

    await mjs(`__mail.go('box'); return true;`);
    await wait(400);
    const box = await mjs(`return { months: document.querySelectorAll('.box-month').length, rows: document.querySelectorAll('.box-row').length };`);
    check('信箱按月分组显示', box.months >= 2 && box.rows === mailData.letters.length, box);
    fs.writeFileSync(path.join(outDir, 'mailbox.png'), (await win.webContents.capturePage()).toPNG());

    store.saveNow();
    const reread = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    check('月报、年度回顾和小结都写进了存档', reread.mail.letters.some((l) => l.kind === 'yearly') && reread.mail.welcomed === true && Object.keys(reread.mail.monthly).length >= 1, {
      letters: reread.mail.letters.length,
      sizeKB: Math.round(fs.statSync(store.file).size / 1024),
    });

    mail.close();
    await wait(200);
  }

  // ---------------------------------------------------------------- 每日来信

  async function testMail() {
    const DAY_MS = 86400000;
    const now = Date.now();
    // 从一份干净的"邮局"开始，这样每次自检的结果都一样
    Object.assign(store.data.mail, { letters: [], gifts: {}, lastDay: null, streak: 0, bestStreak: 0, welcomed: false, monthly: {} });
    store.data.settings.petName = null;
    mail.test = { dir: outDir }; // 明信片存到自检的输出文件夹，不弹资源管理器、不动剪贴板

    mail.check(now, true);
    const first = store.data.mail.letters[0];
    check('第一次运行，马上收到一封见面信', mail.summary().unread === 1 && first && first.kind === 'welcome');
    mail.check(now + 60000, true);
    check('同一天不会来第二封', mail.summary().total === 1);
    mail.check(now + DAY_MS, false);
    check('新的一天，但你不在电脑前：先不来信', mail.summary().total === 1);
    mail.check(now + DAY_MS, true);
    const daily = store.data.mail.letters[1];
    check('新的一天，你回到电脑前：来一封新信', mail.summary().total === 2 && daily && daily.kind === 'daily' && !!daily.gift, {
      place: daily && daily.place,
      gift: daily && daily.gift,
    });

    await wait(300);
    const carrying = await js(`const P = window.__pawmail; P.run(0.3); return { carry: P.pet.carry, hasMail: P.brain.hasMail };`);
    check('有没拆的信时，宠物把信拿在手里', carrying.carry && carrying.hasMail, carrying);

    // 打开信纸窗口，像你一样：点信封 → 起名字 → 看信
    const win = mail.open();
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(900);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const before = await mjs(
      `return { ready: !!window.__mail, sealed: !!document.querySelector('.sealed-envelope'), letters: window.__mail ? __mail.state.data.letters.length : 0 };`
    );
    check('信纸窗口能打开，先看到一封没拆的信', before.ready && before.sealed && before.letters === 2, before);

    await mjs(`document.querySelector('.sealed-envelope').click(); return true;`);
    await wait(300);
    const askedName = await mjs(`return !document.getElementById('naming').hidden;`);
    await mjs(`document.querySelector('.naming-input').value = '年糕'; document.querySelector('.naming-card .btn').click(); return true;`);
    await wait(1300);
    const after = await mjs(
      `const l = __mail.state.data.letters[0]; return { id: l.id, opened: l.opened, name: __mail.state.data.name, sign: l.sign, paper: !!document.querySelector('.paper'), lines: l.lines.length };`
    );
    check('第一次拆信前先起名字，然后信被拆开、落款是这个名字', askedName && after.opened && after.paper && after.name === '年糕' && after.sign.includes('年糕'), after);
    check('后台记下了：名字、这封信已拆、礼物进了图鉴', store.data.settings.petName === '年糕' && mail.summary().unread === 1 && !!store.data.mail.gifts[daily.gift], {
      unread: mail.summary().unread,
      gifts: Object.keys(store.data.mail.gifts),
    });

    await wait(400);
    fs.writeFileSync(path.join(outDir, 'mail.png'), (await win.webContents.capturePage()).toPNG());

    const saved = await mjs(
      `const url = __mail.postcard(); const r = await window.pawmailMail.savePostcard(url, __mail.state.id); return { ok: !!(r && r.ok), kb: Math.round(url.length * 0.75 / 1024) };`
    );
    const postcard = path.join(outDir, `pawmail-${after.id}.png`);
    check('能把信存成明信片图片', saved.ok && fs.existsSync(postcard) && fs.statSync(postcard).size > 50000, saved);

    // 把剩下那封也拆掉：宠物手里就没有信了
    mail.markOpened(first.id);
    await wait(300);
    const empty = await js(`const P = window.__pawmail; P.run(0.3); return { carry: P.pet.carry, hasMail: P.brain.hasMail };`);
    check('信都拆完后，宠物手里不再拿着信', mail.summary().unread === 0 && !empty.carry && !empty.hasMail, empty);

    // 重启后还在吗？把存档写出去再读回来
    store.saveNow();
    const reread = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    check('信和礼物都写进了存档', reread.mail.letters.length === 2 && reread.mail.letters.every((l) => l.opened) && !!reread.mail.gifts.pawprint, {
      letters: reread.mail.letters.length,
    });

    mail.close();
    await wait(200);
  }

  function finish() {
    const passed = results.filter((r) => r.ok).length;
    console.log(`[selftest] ${passed}/${results.length} 项通过`);
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ passed, total: results.length, results }, null, 2));
  }
}

module.exports = { run };
