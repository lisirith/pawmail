'use strict';
// 一个极简的静态文件服务器，只用来在浏览器里预览宠物的画面（不用启动 Electron）。
// 运行：npm run preview，然后打开 http://localhost:5177/
// 只在本机可以访问，也只提供 src/ 里的文件。

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5177;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** 现编一份和后台发给信纸窗口一样格式的数据（见 src/main/mail.js 的 payload） */
function mockMail(query) {
  // 每次都重新读取，这样改了信的文字不用重启预览服务器
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];
  }
  const L = require('../src/main/letters');
  const F = require('../src/shared/festivals/catalog');
  const lang = query.get('lang') === 'en' ? 'en' : 'zh';
  const species = query.get('species') === 'panda' ? 'panda' : 'cat';
  const name = query.get('name') || null;
  const unread = Math.max(0, Number(query.get('unread') || 1));
  const ui = require(`../src/shared/locales/${lang}.json`).mail;

  // 用和真实程序一样的规则（advanceDay）模拟一段时间。默认是"到今天为止的 40 天"，一定会跨月，能看到月报。
  // 加 from=2026-11-20&days=50 可以指定起点（跨年就能看到年度回顾）
  const DAY_MS = 86400000;
  const days = Math.min(400, Number(query.get('days')) || 40);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.get('from') || '') ? new Date(`${query.get('from')}T10:00:00`).getTime() : Date.now() - days * DAY_MS;
  const mail = { installId: 'preview', letters: [], gifts: {}, lastDay: null, streak: 0, bestStreak: 0, welcomed: false, monthly: {} };
  const usage = {};
  // 你的生日和节日：&cultures=chinese,western&birthday=12-03；&ask=1 = 还没问过（会收到"一个小问题"）
  const profile = {
    birthday: /^\d{2}-\d{2}$/.test(query.get('birthday') || '') ? query.get('birthday') : null,
    cultures: F.sanitizeCultures((query.get('cultures') || 'chinese,western,us').split(',')),
    asked: query.get('ask') !== '1',
  };
  for (let i = 0; i <= days; i++) {
    if (i > 0 && i % 9 === 4) continue; // 偶尔有一天没开电脑
    const now = from + i * DAY_MS;
    const day = L.logicalDay(now);
    const late = new Date(now);
    late.setDate(late.getDate() + 1);
    late.setHours(1, 40, 0, 0);
    for (const letter of L.advanceDay(mail, { day, now, usage, profile })) {
      letter.opened = true; // 假装每天都拆了信：礼物进图鉴
      if (letter.gift && L.GIFTS[letter.gift]) {
        const have = mail.gifts[letter.gift];
        mail.gifts[letter.gift] = { count: (have ? have.count : 0) + 1, firstDay: have ? have.firstDay : letter.day };
      }
    }
    usage[day] = { first: now - 3600000, last: i % 3 === 0 ? late.getTime() : now + 40000000, activeMin: 200 + (i % 7) * 40, pets: i % 5, pokes: i % 3, throws: i % 6 === 0 ? 2 : 0, dizzies: 0 };
  }
  // 最后几封标成"还没拆"（注意 slice(-0) 会取到全部，所以 0 要单独处理）
  if (unread > 0) {
    mail.letters.slice(-unread).forEach((letter) => {
      letter.opened = false;
    });
  }
  const letters = [...mail.letters].reverse().map((letter) => {
    const rendered = L.renderLetter(letter, lang, { name, species });
    rendered.month = letter.day.slice(0, 7);
    if (rendered.gift) rendered.gift.isNew = !letter.opened && !mail.gifts[rendered.gift.id];
    return rendered;
  });
  const T = L.FESTIVAL_TEXT[lang];
  const next = F.nextFestival(L.logicalDay(Date.now()), { ...profile, metDay: mail.metDay });
  return {
    lang,
    ui,
    name,
    species,
    letters,
    album: L.album(mail.gifts, lang, F.activeFestivals(profile.cultures)),
    profile,
    groups: F.GROUPS.map((g) => ({ id: g.id, emoji: g.emoji, name: T.groups[g.id].name, examples: T.groups[g.id].examples })),
    next: next ? { name: T.festivals[next.id].name, day: next.day } : null,
    nav: null,
  };
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (pathname === '/') {
    res.writeHead(302, { Location: '/src/renderer/index.html?preview=1' });
    return res.end();
  }
  if (pathname === '/gallery') {
    res.writeHead(302, { Location: '/src/renderer/gallery.html' });
    return res.end();
  }
  if (pathname === '/mail') {
    res.writeHead(302, { Location: '/src/renderer/mail.html' });
    return res.end();
  }
  if (pathname === '/__mock/mail') {
    // 信纸窗口在浏览器里预览时用的示例数据：现编 10 天的信
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(mockMail(new URL(req.url, 'http://localhost').searchParams)));
  }

  const file = path.normalize(path.join(ROOT, pathname));
  const allowed = path.join(ROOT, 'src') + path.sep;
  if (!file.startsWith(allowed)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pawmail 预览已启动: http://localhost:${PORT}/  （姿势图鉴: http://localhost:${PORT}/gallery）`);
});
