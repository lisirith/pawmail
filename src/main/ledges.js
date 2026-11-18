'use strict';
// 窗口顶边 = 宠物可以站的"台子"。
//
// 后台每 0.5 秒看一遍屏幕上的窗口（native.js 的 visibleWindows：只有位置、大小、前后顺序，不看标题和程序），
// 算出每个窗口的顶边有哪几段露在外面（没被前面的窗口挡住），有变化才告诉画面。
// 宠物站在某个窗口上时，每秒看 30 次那一个窗口（很便宜），这样你拖动窗口时它能跟上；窗口一动就马上重算一遍。
//
// 这个文件不直接碰 Electron：用到的东西（列窗口、换算坐标、发消息）都从外面传进来，所以可以单独测试。

const SCAN_MS = 500; // 平时多久看一遍所有窗口
const FOLLOW_MS = 33; // 站在窗口上时，多久看一次那个窗口
const INSET = 10; // 窗口四角是圆的：顶边两头各让出一点
const BAND_UP = 8; // 前面的窗口盖住了顶边往上这么多（或者往下 BAND_DOWN）的地方，这一段就算被挡住
const BAND_DOWN = 2;
const MIN_SEG = 40; // 太短的一小段不算（站不下）
// 窗口左右两条竖边（宠物可以扒着往上爬）：前面的窗口盖住了边外面 SIDE_OUT 像素（或者边里面 SIDE_IN）以内的地方，这一截就算被挡住
const SIDE_OUT = 8;
const SIDE_IN = 2;

/** 从一段段区间 segs 里挖掉 [a, b] */
function subtract(segs, a, b) {
  const out = [];
  for (const [l, r] of segs) {
    if (b <= l || a >= r) {
      out.push([l, r]);
      continue;
    }
    if (a > l) out.push([l, a]);
    if (b < r) out.push([b, r]);
  }
  return out;
}

/**
 * 窗口的一条竖边（左边或右边），从顶到底哪几截露在外面（没被前面的窗口挡住）。
 * x：这条边在哪；out：边的外面在哪一侧（-1 左 / 1 右）；covers：前面的窗口。返回 [[上, 下], ...]
 */
function sideSpans(r, x, out, covers, view) {
  let spans = [[Math.max(r.top, 0), Math.min(r.bottom, view.height)]];
  const lo = out < 0 ? x - SIDE_OUT : x - SIDE_IN;
  const hi = out < 0 ? x + SIDE_IN : x + SIDE_OUT;
  for (const c of covers) {
    if (c.left < hi && c.right > lo) spans = subtract(spans, c.top, c.bottom);
    if (!spans.length) break;
  }
  return spans.filter(([a, b]) => b - a >= MIN_SEG).map(([a, b]) => [Math.round(a), Math.round(b)]);
}

/**
 * 算出每个窗口顶边露在外面的几段。
 * wins：从最前面往后排的窗口 [{ id, rect: { left, top, right, bottom }（画面坐标）, perch, topmost }]
 * view：画面多大 { width, height }
 * 返回 [{ id, x, y, right, bottom, segs: [[左, 右], ...], sideL, sideR }]：
 *   x 是窗口的左边（窗口被拖动时，宠物跟着挪同样的距离），y 是顶边，right、bottom 是右边和底边；
 *   sideL / sideR 是左边、右边那条竖边露在外面的几截 [[上, 下], ...]（宠物顺着它爬上去，见画面的 activities.js 的 climbUp）
 */
function computeLedges(wins, view) {
  const covers = []; // 已经看过的（更靠前的）窗口
  const out = [];
  for (const w of wins) {
    const r = w.rect;
    if (w.perch && r.top > 0 && r.top < view.height) {
      const y = r.top;
      let segs = [[Math.max(r.left + INSET, 0), Math.min(r.right - INSET, view.width)]];
      for (const c of covers) {
        if (c.top < y + BAND_DOWN && c.bottom > y - BAND_UP) segs = subtract(segs, c.left, c.right);
        if (!segs.length) break;
      }
      segs = segs.filter(([a, b]) => b - a >= MIN_SEG).map(([a, b]) => [Math.round(a), Math.round(b)]);
      if (segs.length) {
        out.push({
          id: w.id,
          x: Math.round(r.left),
          y: Math.round(y),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          segs,
          sideL: sideSpans(r, r.left, -1, covers, view),
          sideR: sideSpans(r, r.right, 1, covers, view),
        });
      }
    }
    covers.push(r);
  }
  return out;
}

class LedgeWatch {
  /**
   * native   有 visibleWindows(skip)、windowFrame(id)
   * toLocal  (物理像素的框) => 画面坐标的框 { left, top, right, bottom }
   * view     () => { width, height }（画面多大）
   * send     (ledges) => void   告诉画面
   * allowed  () => boolean      能不能站到窗口上（设置关了、"只在桌面"模式：不能。会告诉画面"没有台子"，站在上面的宠物会掉下来）
   * active   () => boolean      现在要不要看（全屏时藏起来了、锁屏了：先不看，但也不清空——回来时它还站在原来的窗口上）
   * skip     () => Set          不算的窗口（我们自己的透明窗口）
   */
  constructor({ native, toLocal, view, send, allowed, active, skip, log }) {
    Object.assign(this, { native, toLocal, view, send, allowed, active, skip });
    this.log = log || (() => {});
    this.timer = null;
    this.perchId = null; // 宠物正站在哪个窗口上
    this.perchFrame = '';
    this.sent = '[]';
    this.scanAt = 0;
    this.slowest = 0;
  }

  start() {
    this.stop();
    this.#loop();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** 画面告诉我们：宠物现在站在哪个窗口上（null = 不在窗口上） */
  setPerch(id) {
    this.perchId = id || null;
    this.perchFrame = '';
  }

  /** 马上重新看一遍，结果一样也再发一次（设置变了、画面刚启动或崩溃重开了） */
  refresh() {
    this.scanAt = 0;
    this.sent = '';
  }

  #loop() {
    try {
      this.#tick();
    } catch (err) {
      console.warn('[窗口] 出错：', err && err.message);
    }
    this.timer = setTimeout(() => this.#loop(), this.perchId && this.allowed() && this.active() ? FOLLOW_MS : SCAN_MS);
  }

  #tick() {
    if (!this.allowed()) {
      this.#publish([]); // 不让站了：告诉画面"没有台子"，站在窗口上的宠物会掉下来
      return;
    }
    if (!this.active()) return;
    const now = Date.now();
    let due = now - this.scanAt >= SCAN_MS;
    if (!due && this.perchId) {
      // 只看宠物脚下那个窗口：动了（被拖动、改大小、最小化、关掉）就马上把所有窗口重算一遍
      const f = this.native.windowFrame(this.perchId);
      const key = f ? `${f.left},${f.top},${f.right},${f.bottom}` : 'gone';
      if (key !== this.perchFrame) {
        this.perchFrame = key;
        due = true;
      }
    }
    if (due) this.#scan(now);
  }

  #scan(now) {
    this.scanAt = now;
    const t0 = process.hrtime.bigint();
    const wins = this.native.visibleWindows(this.skip());
    const local = wins.map((w) => ({ ...w, rect: this.toLocal(w.rect) }));
    this.#publish(computeLedges(local, this.view()));
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > this.slowest * 1.5 && ms > 2) {
      this.slowest = ms;
      this.log(`[窗口] 看一遍 ${wins.length} 个窗口用了 ${ms.toFixed(1)} 毫秒`);
    }
  }

  #publish(ledges) {
    const key = JSON.stringify(ledges);
    if (key === this.sent) return;
    this.sent = key;
    this.send(ledges);
  }
}

module.exports = { computeLedges, subtract, LedgeWatch, SCAN_MS, FOLLOW_MS };
