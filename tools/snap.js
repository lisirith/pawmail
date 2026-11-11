'use strict';
// 截图工具：用一个看不见的 Electron 窗口打开某个页面，截成 PNG。不依赖预览面板，窗口被挡住也能截。
//
// 用法（先 npm run preview 开着预览服务器）：
//   node node_modules/electron/cli.js tools/snap.js <预览服务器上的路径> <输出.png> [宽] [高] [等几毫秒]
// 例子：
//   node node_modules/electron/cli.js tools/snap.js "/src/renderer/gallery.html?looks=1" tools/shots/looks.png 800 1400
//
// 注意：只传路径，不要传 http://localhost:5177/... 这样的完整网址——实测在命令行参数里带完整网址，
// Electron 会一声不响地直接退出。网址前缀在下面补上。

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [target, out, width = '800', height = '1000', delay = '900'] = process.argv.slice(2);
if (!target || !out) {
  console.error('用法：electron tools/snap.js <路径> <输出.png> [宽] [高] [等几毫秒]');
  process.exit(1);
}
const url = `http://localhost:${process.env.PORT || 5177}${target.startsWith('/') ? '' : '/'}${target}`;

process.on('uncaughtException', (err) => {
  console.error('截图工具出错：', err && err.stack ? err.stack : err);
  app.exit(1);
});

app.whenReady().then(async () => {
  console.log(`正在打开 ${url}`);
  // offscreen：离屏渲染。普通的隐藏窗口在页面变化后不会重新绘制，截到的是旧画面；离屏渲染会一直画
  const win = new BrowserWindow({
    show: false,
    width: Number(width),
    height: Number(height),
    useContentSize: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true },
  });
  win.webContents.setFrameRate(30);
  win.webContents.on('console-message', (event) => {
    const level = event.level !== undefined ? event.level : event.params && event.params.level;
    const message = event.message !== undefined ? event.message : event.params && event.params.message;
    if (level === 'error' || level === 3) console.log(`[页面报错] ${message}`);
  });
  try {
    await win.loadURL(url);
    await new Promise((resolve) => setTimeout(resolve, Number(delay)));
    // 截图前先在页面里执行一段代码（放在环境变量 SNAP_EVAL 里），比如把宠物推进到某个动作。
    // 隐藏的窗口不会重新绘制，所以这段代码如果返回一张图片（data:image/png;base64,...），就直接保存那张图。
    if (process.env.SNAP_EVAL) {
      const result = await win.webContents.executeJavaScript(`(async () => { ${process.env.SNAP_EVAL} })()`, true);
      if (typeof result === 'string' && result.startsWith('data:image/png;base64,')) {
        fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
        fs.writeFileSync(out, Buffer.from(result.slice('data:image/png;base64,'.length), 'base64'));
        console.log(`已保存 ${out}（页面返回的图片）`);
        app.quit();
        return;
      }
      if (result !== undefined) console.log('执行结果：', JSON.stringify(result));
      win.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 400)); // 等页面按新的样子画完
    }
    const image = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, image.toPNG());
    console.log(`已保存 ${out}（${image.getSize().width}×${image.getSize().height}）`);
  } catch (err) {
    console.error('截图失败：', err.message);
    process.exitCode = 1;
  }
  app.quit();
});
