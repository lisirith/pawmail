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
