'use strict';
// 日志文件：后台打印的消息（console.log / warn / error）同时写进存档文件夹里的 logs\pawmail.log。
//
// 为什么要有：打包好的正式版没有命令行窗口，打印出来的东西谁也看不到。别人遇到问题时，
// 可以从托盘菜单「帮助与反馈 → 打开日志文件夹」把 pawmail.log 发过来，我们才知道发生了什么。
//
// 隐私：日志只存在你自己的电脑上，程序不会把它发到任何地方。写进去之前，
// 先把你的用户文件夹（比如 C:\Users\你的名字）换成 ~，这样贴到网上时不会露出 Windows 用户名。
// 日志里本来就不记按键、不记你在用什么程序。
//
// 大小：超过 512 KB 就把它改名成 pawmail.old.log（只留一份旧的，更旧的丢掉），所以最多占 1 MB 左右。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');

const MAX_BYTES = 512 * 1024;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 返回一个函数：把文字里的用户文件夹换成 ~。几种写法都要换：
 *   C:\Users\名字          普通的写法
 *   C:\\Users\\名字        JSON 里的写法（诊断信息是 JSON，反斜杠会写成两个）
 *   C:/Users/名字          画面那边报错时给的位置（file:///C:/Users/...）
 *   C:/Users/%E5%90%8D...  同上，但名字里有空格、中文时网址会把它们编码
 */
function makeScrubber(home) {
  if (!home) return (s) => s;
  const slash = home.replace(/\\/g, '/');
  const forms = [...new Set([home.replace(/\\/g, '\\\\'), home, slash, encodeURI(slash)])]; // 长的写在前面，先换
  const re = new RegExp(forms.map(escapeRegExp).join('|'), 'gi');
  return (s) => s.replace(re, '~');
}

/** 2026-11-17 17:05:14 这样的本地时间 */
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 开始写日志。dir 是放日志的文件夹（不存在会自己建）。
 * 返回 { dir, file }。写不进去（比如硬盘满了、没权限）就悄悄算了：日志出问题不能连累宠物。
 */
function setupLog(dir) {
  const file = path.join(dir, 'pawmail.log');
  const old = path.join(dir, 'pawmail.old.log');
  const scrub = makeScrubber(os.homedir());
  let stream = null;
  let size = 0;

  function open() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > MAX_BYTES) {
        fs.renameSync(file, old); // 旧的 pawmail.old.log 会被盖掉
        size = 0;
      }
      const s = fs.createWriteStream(file, { flags: 'a' });
      s.on('error', () => {
        if (stream === s) stream = null;
      });
      stream = s;
    } catch {
      stream = null;
    }
  }

  /** 写满了：等文件真的关上（Windows 上开着的文件不能改名），再改名、重新开一个 */
  function rotate() {
    const s = stream;
    stream = null; // 换文件的这一小会儿里打印的消息就不记了
    s.once('close', open);
    s.end();
  }

  function write(level, args) {
    if (!stream) return;
    const line = `${stamp()} ${level} ${scrub(util.format(...args))}\n`;
    stream.write(line);
    size += Buffer.byteLength(line);
    if (size > MAX_BYTES) rotate();
  }

  open();
  // 包一层 console：照常打印到命令行（开发时看），同时写进文件
  for (const [method, level] of [
    ['log', 'INFO '],
    ['info', 'INFO '],
    ['warn', 'WARN '],
    ['error', 'ERROR'],
  ]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      write(level, args);
    };
  }
  return { dir, file };
}

module.exports = { setupLog, makeScrubber };
