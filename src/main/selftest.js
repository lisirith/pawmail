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

  const previousCoat = store.data.settings.catCoat;
  setSetting('species', 'cat'); setSetting('catCoat', 'lucky');
  await wait(250);
  const coat = await js(`return [window.__pawmail.pet.sp.id, window.__pawmail.pet.sp.coatId];`);
  check('选择招财猫只换花色，桌宠与信箱共用同一设置', coat[0] === 'cat' && coat[1] === 'lucky' && mail.payload().catCoat === 'lucky', { coat });
  setSetting('catCoat', previousCoat); setSetting('species', info.species);
  await wait(150);

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

  await testArea();
  await testFeed();
  await testMail();
  await testReports();
  await testFestivals();
  return finish();

  // ---------------------------------------------------------------- 活动范围、爬墙

  async function testArea() {
    const bad = setSetting('area', { x: 0.6, y: 0, w: 0.6, h: 0.5 }); // 超出窗口右边
    const odd = setSetting('area', { x: 0.1, y: 0.1, w: 0.5, h: 0.5, extra: 1 }); // 多了不认识的东西
    check('不合法的活动范围会被拒绝', bad === false && odd === false && store.data.settings.area === null, { bad, odd });

    setSetting('area', { x: 0.25, y: 0.2, w: 0.5, h: 0.75 });
    await wait(300);
    const inside = await js(`
      const P = window.__pawmail;
      P.brain.start('idle');
      P.run(2);
      const A = P.world.area, c = P.world.clip, box = document.getElementById('arena').getBoundingClientRect();
      const result = {
        A, clip: c, x: P.pet.x, y: P.pet.y, ground: P.world.groundY,
        boxOk: Math.abs(box.left - c.left) < 1 && Math.abs(box.top - c.top) < 1 && Math.abs(box.right - c.right) < 1,
      };
      // 让它贴着左边站：脑袋有一小截伸到方框外面（看不见），那一截不该"点得到"，方框里面的部分照样点得到
      const S = P.world.scale;
      P.pet.x = A.left + 34 * S;
      P.run(0.05);
      result.hitOutside = !!P.pet.hit(c.left - 2, P.pet.y - 76 * S);
      result.hitInside = !!P.pet.hit(c.left + 8, P.pet.y - 76 * S);
      return result;
    `);
    const W = info.w;
    const H = info.h;
    check(
      '设置活动范围后，宠物待在方框里，方框底边就是地面',
      Math.abs(inside.A.left - 0.25 * W) < 1 && Math.abs(inside.A.bottom - 0.95 * H) < 1 && inside.x > inside.A.left && inside.x < inside.A.right && Math.abs(inside.y - inside.ground) < 0.5 && inside.boxOk && !inside.hitOutside && inside.hitInside,
      inside
    );

    setSetting('displayMode', 'desktop'); // "只在桌面"模式：画框时也要先提到最前面，不然会被别的窗口挡住
    await wait(250);
    const editing = await js(`const P = window.__pawmail; P.openAreaEditor(); P.run(0.1); return P.areaEditor.isOpen;`);
    await wait(200);
    const capturedWhileEditing = overlay.capturing;
    const onTopWhileEditing = overlay.win.isAlwaysOnTop();
    await js(`const P = window.__pawmail; P.areaEditor.cancel(); P.setPointer(5, 5); P.run(0.1); return true;`);
    await wait(200);
    const backToDesktop = !overlay.win.isAlwaysOnTop();
    setSetting('displayMode', 'top');
    await wait(250);
    check('画活动范围时窗口提到最前面并接住鼠标，取消后恢复原样', editing && capturedWhileEditing && onTopWhileEditing && backToDesktop && !overlay.capturing && !overlay.editing, {
      editing,
      capturedWhileEditing,
      onTopWhileEditing,
      backToDesktop,
      after: overlay.capturing,
    });

    const climb = await js(`
      const P = window.__pawmail;
      const S = P.world.scale;
      P.brain.start('climb', { side: 1, goal: 120 * S });
      const cur = P.brain.current;
      let i = 0;
      while (!(cur.phase === 'cling' && cur.pt > 0.5) && i++ < 2400) P.run(1 / 60);
      const onWall = { mode: P.pet.mode, gap: P.world.area.right - P.pet.x, height: P.world.groundY - P.pet.y };
      cur.letGo(P.brain);
      i = 0;
      while (P.pet.mode !== 'ground' && i++ < 600) P.run(1 / 60);
      P.run(1);
      return { onWall, landed: P.pet.mode, act: P.brain.name, inside: P.pet.x > P.world.area.left && P.pet.x < P.world.area.right };
    `);
    check(
      '爬墙：爬到活动范围右边的墙上挂着，点一下跳回地面，不会摔晕',
      climb.onWall.mode === 'wall' && climb.onWall.gap < 80 * info.scale && climb.onWall.height > 100 * info.scale && climb.landed === 'ground' && climb.act !== 'dizzy' && climb.inside,
      climb
    );

    setSetting('area', null);
    await wait(300);
    const back = await js(`const P = window.__pawmail; P.run(1); return { right: P.world.area.right, ground: P.world.groundY, y: P.pet.y };`);
    check('改回"整个屏幕"', Math.abs(back.right - W) < 1 && Math.abs(back.ground - (H - 3)) < 1 && Math.abs(back.y - back.ground) < 0.5, back);
  }

  // ---------------------------------------------------------------- 生日、节日、装扮

  async function testFestivals() {
    const L = require('./letters');
    const F = require('../shared/festivals/catalog');

    check('农历节日用官方表：2027 年春节是 2 月 6 日（电脑自带的农历会算成 7 日）', F.festivalOn('2027-02-06', { cultures: ['chinese'] }) === 'springFestival' && F.festivalOn('2027-02-07', { cultures: ['chinese'] }) === null);
    check('没选的节日组不过：只选了中华传统节日，万圣节不算', F.festivalOn('2026-10-31', { cultures: ['chinese'] }) === null && F.festivalOn('2026-10-31', { cultures: ['western'] }) === 'halloween');

    // 在信纸窗口里填表（和你在"一个小问题"那封信里点"就这样"是同一条路）
    const win = mail.open({ view: 'box' });
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    await wait(800);
    const mjs = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`, true);
    const bad = await mjs(`return await window.pawmailMail.setProfile({ birthday: '13-40', cultures: ['chinese'] });`);
    check('不合法的生日会被拒绝', bad && bad.ok === false && store.data.settings.birthday === null, bad);
    const good = await mjs(`return await window.pawmailMail.setProfile({ birthday: '12-03', cultures: ['chinese', 'western', 'nonsense'] });`);
    const s = store.data.settings;
    check('保存生日和节日（不认识的节日组会被去掉）', good.ok && s.birthday === '12-03' && JSON.stringify(s.cultures) === '["chinese","western"]' && s.profileAsked === true, {
      birthday: s.birthday,
      cultures: s.cultures,
    });
    const profile = { birthday: s.birthday, cultures: s.cultures, asked: s.profileAsked };
    const birthday = L.festivalToday('2026-12-03', mail.data, profile);
    const halloween = L.festivalToday('2026-10-31', mail.data, profile);
    check('12 月 3 日是你的生日，10 月 31 日是万圣节', birthday && birthday.id === 'birthday' && birthday.look === 'birthday' && halloween && halloween.id === 'halloween', {
      birthday,
      halloween,
    });

    // 图鉴里出现"节日限定"一栏
    await mjs(`__mail.go('album'); return true;`);
    await wait(300);
    const albumHeads = await mjs(`return document.querySelectorAll('.album-head').length;`);
    check('图鉴分成普通礼物和节日限定两栏', albumHeads === 2, { albumHeads });
    mail.close();
    await wait(200);

    // 让宠物过一次万圣节：换上白布，打招呼时把白布撩起来、喊 Boo
    overlay.send('festival', { id: 'halloween', day: 'selftest', look: 'ghost', greet: 'boo' });
    await wait(300);
    const ghost = await js(`
      const P = window.__pawmail;
      const dressed = !!(P.pet.look && P.pet.look.cover === 'sheet');
      const queued = P.brain.queue.some((q) => q[0] === 'festiveGreet');
      P.brain.queue.length = 0;
      P.brain.start('festiveGreet');
      P.run(1.0);
      return { dressed, queued, lift: +P.pet.sheetLift.toFixed(2), boo: P.pet.fx.items.some((i) => i.type === 'boo') };
    `);
    check('万圣节：宠物披上白布，打招呼时撩起白布喊 Boo', ghost.dressed && ghost.queued && ghost.lift > 0.8 && ghost.boo, ghost);
    // 白布放下来再截图（等一会儿，让窗口把新的一帧画出来）
    await js(`const P = window.__pawmail; P.brain.start('idle'); P.run(1.2); return true;`);
    await wait(500);
    const image = await overlay.win.webContents.capturePage({ x: Math.max(0, Math.round(info.x - 220)), y: Math.max(0, Math.round(info.y - 330)), width: 440, height: 334 });
    fs.writeFileSync(path.join(outDir, 'halloween.png'), image.toPNG());

    overlay.send('festival', null);
    await wait(300);
    const plain = await js(`const P = window.__pawmail; P.run(0.5); return { look: P.pet.look, lift: +P.pet.sheetLift.toFixed(2) };`);
    check('节日结束，脱下装扮', plain.look === null && plain.lift < 0.1, plain);
  }

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

    // 节日：还没告诉它过哪些节日，所以按语言猜；元旦是所有人都过的
    const festivalLetters = mailData.letters.filter((l) => l.kind === 'festival');
    const newYear = festivalLetters.find((l) => l.festival === 'newYear' && l.day === `${year + 1}-01-01`);
    check('元旦那天的信是节日信，附节日限定礼物', !!newYear && L.GIFTS[newYear.gift].rarity === 'festival' && !!mailData.gifts[newYear.gift], {
      festivals: festivalLetters.map((l) => `${l.festival}@${l.day}`),
    });
    check('拆完见面信后，收到"一个小问题"', mailData.letters.some((l) => l.kind === 'ask'));

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
    Object.assign(store.data.mail, { letters: [], gifts: {}, lastDay: null, streak: 0, bestStreak: 0, welcomed: false, metDay: null, askSent: false, monthly: {} });
    Object.assign(store.data.settings, { petName: null, birthday: null, cultures: null, profileAsked: false });
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

  // ---------------------------------------------------------------- 喂它吃文件

  async function testFeed() {
    const os = require('node:os');
    const { app } = require('electron');
    const { Feeder, buildRules } = require('./feed');
    const realRules = buildRules({
      getPath: (name) => app.getPath(name),
      appPath: app.getAppPath(),
      userData: app.getPath('userData'),
      exeDir: path.dirname(process.execPath),
    });

    // 1. 不该吃的东西：用一个"假的回收站"来测（只记下被要求扔什么，什么都不删），
    //    这样就算规则写错了，也不会真的把这些重要的文件夹扔掉
    const asked = [];
    const fakeTrash = async (p) => {
      asked.push(p);
    };
    const guarded = new Feeder({ trash: fakeTrash, native, rules: realRules });
    const home = os.homedir();
    const BS = '\\';
    const refuse = {
      disk: 'C:' + BS,
      windows: process.env.SystemRoot,
      home,
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      appData: app.getPath('appData'),
      self: app.getAppPath(),
      network: BS + BS + 'localhost' + BS + 'c$' + BS + 'Windows' + BS + 'win.ini',
      missing: path.join(home, 'pawmail-no-such-file-' + Date.now() + '.txt'),
    };
    const refusal = {};
    for (const [name, p] of Object.entries(refuse)) {
      const res = await guarded.feed([p]);
      refusal[name] = res.reason;
    }
    const expected = { disk: 'protected', windows: 'protected', home: 'protected', desktop: 'protected', documents: 'protected', appData: 'protected', self: 'home', network: 'notLocal', missing: 'missing' };
    check(
      '重要的地方不吃：整个磁盘、Windows、用户文件夹、桌面和文档文件夹本身、AppData、它自己的家、网络上的、不存在的',
      asked.length === 0 && Object.entries(expected).every(([k, v]) => refusal[k] === v),
      { refusal, trashCalls: asked.length }
    );

    // 2. 一次太多、太大：也不吃（同样用假的回收站）
    const base = path.join(app.getPath('userData'), `feed-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(base, { recursive: true });
    const testRules = buildRules({ getPath: (name) => app.getPath(name), userData: path.join(base, 'not-here') }); // 测试文件放在程序文件夹里，这里不把程序文件夹算作"家"
    const many = [];
    for (let i = 0; i < 21; i++) {
      const f = path.join(base, `crumb-${i}.txt`);
      fs.writeFileSync(f, 'pawmail selftest crumb');
      many.push(f);
    }
    const tooMany = await new Feeder({ trash: fakeTrash, native, rules: testRules }).feed(many);
    const tooBig = await new Feeder({ trash: fakeTrash, native, rules: testRules, limits: { maxItems: 20, maxBytes: 8, maxEntries: 5000 } }).feed([many[0]]);
    check('一次超过 20 样、或者太大：不吃', tooMany.reason === 'tooMany' && tooBig.reason === 'tooBig' && asked.length === 0, {
      tooMany: tooMany.reason,
      tooBig: tooBig.reason,
      trashCalls: asked.length,
    });

    // 3. 真的吃：自检自己造的两个测试文件和一个测试文件夹，真的放进回收站，确认回收站里找得到，再从回收站里清掉
    const token = `${process.pid}-${Date.now()}`;
    const snackFile = path.join(base, `pawmail-selftest-cookie-${token}.txt`);
    const snackDir = path.join(base, `pawmail-selftest-box-${token}`);
    fs.writeFileSync(snackFile, 'pawmail selftest: this file is safe to delete');
    fs.mkdirSync(snackDir);
    fs.writeFileSync(path.join(snackDir, 'candy.txt'), 'pawmail selftest: this file is safe to delete');
    const real = new Feeder({ trash: (p) => require('electron').shell.trashItem(p), native, rules: testRules });
    const eaten = await real.feed([snackFile, snackDir]);
    const gone = !fs.existsSync(snackFile) && !fs.existsSync(snackDir);
    const purged = purgeFromRecycleBin([snackFile, snackDir]);
    check('能吃的测试文件和文件夹真的进了回收站（之后已从回收站清掉）', eaten.eaten === 2 && gone && purged === 2, {
      result: eaten.items,
      gone,
      foundInRecycleBin: purged,
    });
    fs.rmSync(base, { recursive: true, force: true });

    // 4. 画面那边：张嘴等着、吃下去、吐出来
    const show = await js(`
      const P = window.__pawmail;
      const bubble = () => document.querySelector('.bubble-text').textContent;
      P.brain.start('idle');
      P.run(0.3);
      const out = {};
      P.brain.onFood(true); P.run(0.4);
      out.hungry = P.brain.name;
      P.brain.onFood(false); P.run(0.3);
      out.after = P.brain.name;
      let eat = P.brain.onFeed([{ kind: 'file' }, { kind: 'folder' }], { x: 0, y: -50 });
      P.run(0.6);
      out.chewing = eat.phase;
      eat.resolve({ items: [{ kind: 'file', ok: true }, { kind: 'folder', ok: true }], eaten: 2, reason: null, first: true });
      P.run(1.2);
      out.swallow = eat.phase;
      out.firstLine = bubble();
      P.run(3);
      out.done = P.brain.name;
      eat = P.brain.onFeed([{ kind: 'file' }], { x: 0, y: -50 });
      P.run(0.6);
      eat.resolve({ items: [{ kind: 'file', ok: false, reason: 'protected' }], eaten: 0, reason: 'protected' });
      P.run(1);
      out.spit = eat.phase;
      out.refuseLine = bubble();
      P.run(3);
      out.done2 = P.brain.name;
      return out;
    `);
    check(
      '画面：文件拖到身上时张嘴等着，吃下去会说"放进回收站了"，吃不下会吐出来说原因',
      show.hungry === 'hungry' && show.after !== 'hungry' && show.chewing === 'chew' && show.swallow === 'yum' && /回收站|Recycle/.test(show.firstLine) && show.spit === 'spit' && show.refuseLine.length > 0 && show.done !== 'eat' && show.done2 !== 'eat',
      show
    );

    // 5. 拖着文件停在它身上：鼠标旁边换成小纸团（代替 Windows 那个挡脸的大图标），它张大嘴等着；拖走后纸团消失
    const hover = await js(`
      const P = window.__pawmail;
      P.brain.start('idle');
      P.run(0.3);
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
      const x = P.pet.x;
      const y = P.pet.y - 60 * P.world.scale;
      for (const type of ['dragenter', 'dragover']) {
        window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      }
      P.run(0.3);
      const ball = document.getElementById('food-cursor');
      const during = { activity: P.brain.name, ball: !ball.hidden };
      window.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, clientX: -5, clientY: -5, bubbles: true }));
      P.run(0.3);
      return { during, after: { activity: P.brain.name, ball: !ball.hidden } };
    `);
    check(
      '文件停在它身上时：鼠标旁边换成小纸团、它张嘴等着；拖走后纸团消失',
      hover.during.activity === 'hungry' && hover.during.ball && !hover.after.ball && hover.after.activity !== 'hungry',
      hover
    );

    // 6. 画面拿到的只是"假文件"（没有真实路径）时：后台什么都不吃
    const empty = await js(`return window.pawmail.feed([new File(['x'], 'a.txt')]).then((r) => r);`);
    check('不是从电脑上拖来的文件：后台不吃', empty && empty.eaten === 0 && empty.items.length === 0, empty);
  }

  /**
   * 自检扔进回收站的测试文件：在回收站里找到它们，彻底删掉，免得弄脏你的回收站。
   * 回收站里每样东西有两个文件：$I 开头的记着原来的位置，$R 开头的是东西本身。只删原来位置完全对得上的。
   */
  function purgeFromRecycleBin(originals) {
    const wanted = new Set(originals.map((p) => path.resolve(p).toLowerCase()));
    const binRoot = path.join(path.parse(path.resolve(originals[0])).root, '$Recycle.Bin');
    let removed = 0;
    let folders = [];
    try {
      folders = fs.readdirSync(binRoot);
    } catch {
      return 0;
    }
    for (const sid of folders) {
      const dir = path.join(binRoot, sid);
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue; // 别的用户的回收站：打不开，也不该碰
      }
      for (const name of names) {
        if (!name.startsWith('$I')) continue;
        let buf;
        try {
          buf = fs.readFileSync(path.join(dir, name));
        } catch {
          continue;
        }
        // Windows 10 以后的格式：8 字节版本号(2)、8 字节大小、8 字节删除时间、4 字节路径长度，后面是 UTF-16 的原路径
        if (buf.length < 30 || buf.readUInt32LE(0) !== 2) continue;
        const chars = buf.readUInt32LE(24);
        const original = buf.toString('utf16le', 28, 28 + Math.max(0, chars - 1) * 2).toLowerCase();
        if (!wanted.has(original)) continue;
        fs.rmSync(path.join(dir, '$R' + name.slice(2)), { recursive: true, force: true });
        fs.rmSync(path.join(dir, name), { force: true });
        removed += 1;
      }
    }
    return removed;
  }

  function finish() {
    const passed = results.filter((r) => r.ok).length;
    console.log(`[selftest] ${passed}/${results.length} 项通过`);
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ passed, total: results.length, results }, null, 2));
  }
}

module.exports = { run };
