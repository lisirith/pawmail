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
  const lang = query.get('lang') === 'en' ? 'en' : 'zh';
  const species = query.get('species') === 'panda' ? 'panda' : 'cat';
  const name = query.get('name') || null;
  const unread = Math.max(0, Number(query.get('unread') || 1));
  const ui = require(`../src/shared/locales/${lang}.json`).mail;

  const start = Date.now() - 10 * 86400000;
  const history = [L.welcomeLetter({ day: L.logicalDay(start), now: start })];
  const owned = {};
  const usage = {};
  let lastDay = history[0].day;
  for (let i = 1; i <= 10; i++) {
    const now = start + i * 86400000;
    const day = L.logicalDay(now);
    const late = new Date(now);
    late.setHours(1, 40, 0, 0);
    usage[lastDay] = { first: now - 86400000, last: i % 3 === 0 ? late.getTime() : now - 30000000, activeMin: 200 + i * 40, pets: i * 2, pokes: i, throws: i % 4 === 0 ? 5 : 0, dizzies: 0 };
    history.push(L.generateLetter({ day, now, installId: 'preview', history, owned, usage, lastDay, streak: i + 1 }));
    lastDay = day;
  }
  history.forEach((letter, index) => {
    letter.opened = index < history.length - unread;
    if (letter.opened && letter.gift) owned[letter.gift] = { count: (owned[letter.gift] ? owned[letter.gift].count : 0) + 1 };
  });
  const letters = [...history].reverse().map((letter) => {
    const rendered = L.renderLetter(letter, lang, { name, species });
    if (rendered.gift) rendered.gift.isNew = !letter.opened && !owned[rendered.gift.id];
    return rendered;
  });
  return { lang, ui, name, species, letters, album: L.album(owned, lang), nav: null };
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
