'use strict';
// 把文件拖给它"吃"——后台这一半：检查拖进来的东西能不能吃，能吃的放进回收站。
//
// 吃 = 放进回收站，随时可以去回收站找回来，并不是真的删掉。
// 原则是"宁可不吃，也不能让文件真的丢"，所以吃之前要过好几关：
//   1. 只吃本机硬盘上的东西。U 盘、网络盘、光盘、subst 虚拟出来的盘上没有回收站，删了就找不回来。
//   2. 不吃重要的地方：整个磁盘、Windows 和程序文件夹、AppData、你的用户文件夹和"桌面""文档"这些文件夹本身
//      （里面的东西可以吃）、别的用户的文件夹，还有它自己的家（程序和存档所在的文件夹）。
//   3. 一次最多 20 样，加起来不超过 500 MB（回收站有容量上限）；文件夹里的东西太多（数不过来）也不吃。
//   4. 真正放进回收站用的是 Electron 的 shell.trashItem。它有一道保险：Windows 说"这个放不进回收站"时，
//      它会直接放弃，而不是改成永久删除（Electron 源码 platform_util_win.cc 的 DeleteFileProgressSink）。
//
// 这里只记"吃了几样"，不记文件名，也不把文件路径告诉画面。

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LIMITS = Object.freeze({
  maxItems: 20, // 一次最多吃几样
  maxBytes: 500 * 1024 * 1024, // 加起来最多多大
  maxEntries: 5000, // 一个文件夹里最多数多少个东西；数不过来说明太大了
});

// 吃不下的原因（画面那边按这个说话，见语言文件里的 say.feed.reasons）：
//   missing 找不到了 · notLocal 不在本机硬盘上 · protected 重要的地方 · home 它自己的家
//   tooBig 太大 · tooMany 一次太多 · noBin 放不进回收站 · busy 正被别的程序用着 · failed 其他原因
// 有好几样吃不下时，挑最该让你知道的那个原因说（越靠前越重要）
const REASON_ORDER = ['home', 'protected', 'notLocal', 'noBin', 'tooBig', 'tooMany', 'busy', 'missing', 'failed'];

/** 统一成小写、去掉末尾的斜杠，方便比较（Windows 的路径不分大小写） */
function norm(p) {
  return path.win32.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
}

/** child 是不是 parent 本身，或者在 parent 里面 */
function inside(child, parent) {
  return child === parent || child.startsWith(parent + '\\');
}

/**
 * 整理出"不能吃的地方"。
 * getPath：Electron 的 app.getPath；appPath：程序所在的文件夹；userData：存档所在的文件夹；exeDir：electron.exe 所在的文件夹
 */
function buildRules({ getPath = () => null, appPath = null, userData = null, exeDir = null, env = process.env, home = os.homedir() } = {}) {
  const safe = (name) => {
    try {
      return getPath(name);
    } catch {
      return null;
    }
  };
  const clean = (list) => [...new Set(list.filter((p) => typeof p === 'string' && /^[a-z]:[\\/]/i.test(p)).map(norm))];
  return {
    // 这些文件夹本身不能吃，里面的东西可以（桌面上的文件、下载的东西……）
    keep: clean([home, env.USERPROFILE, safe('home'), safe('desktop'), safe('documents'), safe('downloads'), safe('music'), safe('pictures'), safe('videos'), env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial, env.PUBLIC]),
    // 这些文件夹连同里面的东西都不能吃：系统、程序、各个软件自己的数据
    forbidden: clean([env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.ProgramData, home && path.join(home, 'AppData'), env.APPDATA, env.LOCALAPPDATA, safe('appData')]),
    // 它自己的家：程序、存档（连它们的上一级文件夹也不能吃，不然就把自己吃掉了）
    homes: clean([appPath, userData, exeDir]),
    // C:\Users：除了你自己的用户文件夹，别的用户的东西不能吃
    usersDir: home ? norm(path.dirname(home)) : null,
    home: home ? norm(home) : null,
  };
}

/** 这个地方能不能吃？不能的话返回原因 */
function protectedReason(p, rules) {
  const n = norm(p);
  if (/^[a-z]:$/.test(n)) return 'protected'; // 整个磁盘
  if (/\\(\$recycle\.bin|system volume information)(\\|$)/.test(n)) return 'protected'; // 回收站自己、系统还原的文件夹
  for (const f of rules.forbidden) if (inside(n, f) || inside(f, n)) return 'protected';
  for (const k of rules.keep) if (inside(k, n)) return 'protected'; // 是"桌面"这些文件夹本身，或者是它们的上一级
  if (rules.usersDir && rules.home && inside(n, rules.usersDir) && !inside(n, rules.home)) return 'protected';
  // 最后才看是不是它自己的家（程序放在桌面上时，"桌面"先按"重要的地方"说）
  for (const h of rules.homes) if (inside(n, h) || inside(h, n)) return 'home';
  return null;
}

/** 在不在本机的硬盘上？不在的话返回 'notLocal' */
function volumeReason(p, native) {
  if (!/^[a-z]:\\/i.test(p)) return 'notLocal'; // \\电脑名\共享、\\?\ 这类路径
  const vol = native && native.volumeOf ? native.volumeOf(p) : null;
  if (!vol) return 'notLocal'; // 查不了就不吃（宁可不吃）
  if (!/^[a-z]:\\$/i.test(vol.root)) return 'notLocal'; // 挂在某个文件夹上、没有盘符的盘
  if (!vol.fixed || !vol.real) return 'notLocal';
  return null;
}

/** 一样东西有多大（文件夹就把里面的加起来）。超过上限或者数不过来，返回 Infinity */
async function measure(p, stat, limits, budget) {
  if (!stat.isDirectory()) return stat.size; // 文件；快捷方式、链接只算它自己
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // 打不开的子文件夹：不数了（真放不进回收站的话，trashItem 会放弃）
    }
    for (const entry of entries) {
      budget.entries += 1;
      if (budget.entries > limits.maxEntries) return Infinity;
      const full = path.join(dir, entry.name);
      // 链接（包括"目录联接"）不顺着走进去：放进回收站的只是链接本身
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(full);
        continue;
      }
      try {
        total += (await fs.promises.lstat(full)).size;
      } catch {
        /* 数的时候正好被删了：不管它 */
      }
      if (total > limits.maxBytes) return Infinity;
    }
  }
  return total;
}

/** shell.trashItem 失败了：猜猜是什么原因 */
function failReason(err) {
  const message = String((err && err.message) || err || '');
  if (/abort/i.test(message)) return 'noBin'; // Windows 说放不进回收站，Electron 放弃了
  if (/0x80270020|0x80070020|sharing|being used|in use|另一个程序|正在使用/i.test(message)) return 'busy';
  if (/not found|cannot find|找不到|0x80070002|0x80070003/i.test(message)) return 'missing';
  return 'failed';
}

class Feeder {
  /**
   * @param trash   (path) => Promise：真正放进回收站的函数（正式运行时是 shell.trashItem；自检时可以换成假的）
   * @param native  native.js（查文件在哪个盘上）
   * @param rules   buildRules() 的结果
   * @param limits  数量、大小的上限
   * @param log     出错时写日志
   * @param dryRun  演习：照常检查，能吃的也说"吃了"，但不真的放进回收站（开发时用 --x-feeddry）
   */
  constructor({ trash, native, rules, limits = LIMITS, log = () => {}, dryRun = false }) {
    this.trash = trash;
    this.native = native;
    this.rules = rules;
    this.limits = limits;
    this.log = log;
    this.dryRun = dryRun;
    this.busy = false;
  }

  /**
   * 吃！paths 是拖到它身上的文件、文件夹的完整路径。
   * 返回 { items: [{ kind: 'file' | 'folder', ok, reason }], eaten, reason }，顺序和拖进来的一样；
   * reason 是"最该说的那个吃不下的原因"（全吃下了就是 null）。
   */
  async feed(paths) {
    if (this.busy) return { items: [], eaten: 0, reason: 'busy' }; // 上一口还没咽下去
    this.busy = true;
    try {
      return await this.#feed(paths);
    } finally {
      this.busy = false;
    }
  }

  async #feed(raw) {
    const L = this.limits;
    // 只认字符串形式的完整路径；同一样东西拖了两次只算一次；最多看 50 样
    const seen = new Set();
    const list = [];
    for (const p of Array.isArray(raw) ? raw : []) {
      if (typeof p !== 'string' || p.length < 3 || p.length > 32000 || p.includes('\0') || !path.win32.isAbsolute(p)) continue;
      const key = norm(p);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ path: path.win32.resolve(p), key, kind: 'file', ok: false, reason: null, stat: null, size: 0 });
      if (list.length >= 50) break;
    }

    // 第一关：是不是重要的地方、在不在本机硬盘上（这两样只看路径、问一下 Windows 是什么盘，不读文件），
    // 然后才去看东西还在不在、是文件还是文件夹。不在本机硬盘上的东西不去读：网络盘连不上时会卡很久
    for (const it of list) {
      it.reason = protectedReason(it.path, this.rules) || volumeReason(it.path, this.native);
      if (it.reason === 'notLocal') continue;
      try {
        it.stat = await fs.promises.lstat(it.path);
        it.kind = it.stat.isDirectory() ? 'folder' : 'file';
      } catch {
        if (!it.reason) it.reason = 'missing';
      }
    }
    // 拖进来的东西里，如果有一样在另一样（文件夹）里面，跟着那个文件夹一起吃就行了，不单独算
    const folders = list.filter((it) => !it.reason && it.kind === 'folder');
    const nested = (it) => folders.some((f) => f !== it && inside(it.key, f.key));
    const candidates = list.filter((it) => !it.reason && !nested(it));

    // 第二关：一次太多就都不吃
    if (candidates.length > L.maxItems) for (const it of candidates) it.reason = 'tooMany';

    // 第三关：太大就不吃（一样太大，或者加起来太大）
    let total = 0;
    const budget = { entries: 0 };
    for (const it of candidates) {
      if (it.reason) continue;
      it.size = await measure(it.path, it.stat, L, budget);
      total += it.size;
      if (it.size > L.maxBytes) it.reason = 'tooBig';
    }
    if (total > L.maxBytes) for (const it of candidates) if (!it.reason) it.reason = 'tooBig';

    // 吃：一样一样放进回收站
    let eaten = 0;
    for (const it of candidates) {
      if (it.reason) continue;
      if (this.dryRun) {
        this.log(`[feed] 演习，没有真的吃：${it.kind}`);
        it.ok = true;
        eaten += 1;
        continue;
      }
      try {
        await this.trash(it.path);
        if (fs.existsSync(it.path)) {
          it.reason = 'failed'; // 说是放进去了，可东西还在原地
        } else {
          it.ok = true;
          eaten += 1;
        }
      } catch (err) {
        it.reason = failReason(err);
        this.log(`[feed] 放不进回收站（${it.reason}）：${err && err.message}`);
      }
    }
    // 跟着文件夹一起吃掉的东西：文件夹吃下了，它们也就吃下了
    for (const it of list) {
      if (it.reason || it.ok) continue;
      const parent = folders.find((f) => f !== it && inside(it.key, f.key));
      if (parent) {
        it.ok = parent.ok;
        it.reason = parent.ok ? null : parent.reason;
      }
    }

    const reasons = list.filter((it) => !it.ok).map((it) => it.reason || 'failed');
    const reason = REASON_ORDER.find((r) => reasons.includes(r)) || null;
    return { items: list.map((it) => ({ kind: it.kind, ok: it.ok, reason: it.ok ? null : it.reason || 'failed' })), eaten, reason };
  }
}

module.exports = { Feeder, buildRules, protectedReason, volumeReason, LIMITS, REASON_ORDER };
