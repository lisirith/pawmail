// "活动范围"编辑器：像截图工具一样，在屏幕上拖出一个方框，宠物以后只在方框里活动。
//
//   在方框外面按住拖动 → 画一个新方框
//   在方框里面按住拖动 → 挪动方框
//   拖方框的四个角     → 改大小
//   下面的按钮：就这里 / 整个屏幕 / 取消（点右键也是取消）
//
// 宠物的窗口是"不抢焦点"的（见 src/main/overlay.js），收不到键盘，所以全靠鼠标操作。
// 这个文件只管"画框"，画好之后把结果交给 app.js 去保存。

import { clamp } from '../util/math.js';

const IDLE_CANCEL_MS = 120000; // 两分钟没碰鼠标：自动取消，免得一层暗色一直挡着屏幕

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class AreaEditor {
  /**
   * @param root    放编辑器的元素（index.html 里的 #area-editor）
   * @param t       取界面文字的函数
   * @param onDone  画完了：onDone(结果)。结果是 { x, y, w, h }（占整个窗口的比例）、
   *                null（整个屏幕）、或 undefined（取消，什么都不改）
   */
  constructor(root, { t, onDone }) {
    this.root = root;
    this.t = t;
    this.onDone = onDone;
    this.isOpen = false;
    this.rect = null; // 方框（像素）：{ x, y, w, h }；null = 还没画
    this.drag = null;
    this.W = 0;
    this.H = 0;
    this.minW = 0;
    this.minH = 0;
    this.touchedAt = 0;
    this.timer = null;

    this.tip = el('div', 'area-tip');
    this.box = el('div', 'area-box');
    this.size = el('span', 'area-size');
    this.box.append(this.size);
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = el('i', `area-handle ${corner}`);
      handle.dataset.corner = corner;
      this.box.append(handle);
    }
    this.bar = el('div', 'area-bar');
    this.okBtn = this.#button('ok', 'area-btn primary', () => this.#finish(this.#fractions()));
    this.fullBtn = this.#button('full', 'area-btn', () => this.#finish(null));
    this.cancelBtn = this.#button('cancel', 'area-btn', () => this.#finish(undefined));
    this.bar.append(this.okBtn, this.fullBtn, this.cancelBtn);
    root.append(this.box, this.tip, this.bar); // 方框在最下面：它外面那圈暗色不能盖住提示和按钮

    root.addEventListener('pointerdown', (e) => this.#down(e));
    root.addEventListener('pointermove', (e) => this.#move(e));
    root.addEventListener('pointerup', () => this.#up());
    root.addEventListener('pointercancel', () => this.#up());
  }

  #button(key, className, onClick) {
    const button = el('button', className);
    button.type = 'button';
    button.dataset.key = key;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * 打开编辑器。
   * rect：现在的活动范围（像素），整个屏幕时传 null；W、H：窗口大小；minW、minH：方框最小多大
   */
  open(rect, W, H, minW, minH) {
    this.W = W;
    this.H = H;
    this.minW = Math.min(minW, W);
    this.minH = Math.min(minH, H);
    this.rect = rect ? { ...rect } : null;
    this.drag = null;
    this.isOpen = true;
    this.root.hidden = false;
    for (const button of [this.okBtn, this.fullBtn, this.cancelBtn]) button.textContent = this.t(`area.${button.dataset.key}`);
    this.touchedAt = performance.now();
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (performance.now() - this.touchedAt > IDLE_CANCEL_MS) this.#finish(undefined);
    }, 5000);
    this.#render();
  }

  /** 取消（比如点了右键） */
  cancel() {
    if (this.isOpen) this.#finish(undefined);
  }

  #finish(result) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.drag = null;
    this.root.hidden = true;
    this.root.classList.remove('dragging');
    clearInterval(this.timer);
    this.timer = null;
    this.onDone(result);
  }

  /** 把方框换算成"占窗口的比例"，存档用。几乎占满整个窗口的话，就当作"整个屏幕" */
  #fractions() {
    const r = this.rect;
    if (!r) return undefined;
    if (r.w >= this.W - 2 && r.h >= this.H - 2) return null;
    const round = (v) => Math.floor(v * 10000) / 10000; // 只往下取整：保证方框不会因为四舍五入超出窗口
    return { x: round(r.x / this.W), y: round(r.y / this.H), w: round(r.w / this.W), h: round(r.h / this.H) };
  }

  // ---------------------------------------------------------------- 鼠标

  #down(e) {
    if (!this.isOpen || e.button !== 0) return;
    if (e.target.closest('.area-bar')) return; // 点的是按钮
    this.touchedAt = performance.now();
    const x = e.clientX;
    const y = e.clientY;
    const r = this.rect;
    const corner = e.target.dataset && e.target.dataset.corner;
    if (corner && r) {
      // 拖角 = 以对面那个角为起点重新画
      this.drag = {
        mode: 'draw',
        ax: corner.includes('w') ? r.x + r.w : r.x,
        ay: corner.includes('n') ? r.y + r.h : r.y,
      };
    } else if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      this.drag = { mode: 'move', dx: x - r.x, dy: y - r.y };
    } else {
      this.drag = { mode: 'draw', ax: clamp(x, 0, this.W), ay: clamp(y, 0, this.H) };
    }
    try {
      this.root.setPointerCapture(e.pointerId); // 拖到按钮上面也能继续拖
    } catch {
      /* 没关系 */
    }
    this.root.classList.add('dragging');
    e.preventDefault();
    this.#update(x, y);
  }

  #move(e) {
    if (!this.isOpen) return;
    this.touchedAt = performance.now();
    if (this.drag) this.#update(e.clientX, e.clientY);
  }

  #up() {
    if (!this.drag) return;
    this.drag = null;
    this.root.classList.remove('dragging');
    this.#render();
  }

  #update(px, py) {
    const d = this.drag;
    const { W, H } = this;
    if (d.mode === 'move') {
      const r = this.rect;
      r.x = clamp(px - d.dx, 0, W - r.w);
      r.y = clamp(py - d.dy, 0, H - r.h);
    } else {
      // 从起点往鼠标的方向长；比最小尺寸还小的话，按最小尺寸算（太小了它转不开身）
      const x = clamp(px, 0, W);
      const y = clamp(py, 0, H);
      const w = Math.min(W, Math.max(Math.abs(x - d.ax), this.minW));
      const h = Math.min(H, Math.max(Math.abs(y - d.ay), this.minH));
      this.rect = {
        x: clamp(x >= d.ax ? d.ax : d.ax - w, 0, W - w),
        y: clamp(y >= d.ay ? d.ay : d.ay - h, 0, H - h),
        w,
        h,
      };
    }
    this.#render();
  }

  // ---------------------------------------------------------------- 画面

  #render() {
    const r = this.rect;
    const { W, H } = this;
    this.root.classList.toggle('empty', !r);
    this.tip.textContent = this.t(r ? 'area.tipMove' : 'area.tip');
    this.okBtn.disabled = !r;
    this.box.hidden = !r;
    if (r) {
      Object.assign(this.box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      this.size.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
    }

    // 提示文字放在屏幕上方正中；方框顶到了屏幕上沿的话，挪到下方
    const tipAtBottom = r && r.y < 70 && r.x < W / 2 + 260 && r.x + r.w > W / 2 - 260;
    this.tip.classList.toggle('bottom', !!tipAtBottom);

    // 按钮放在方框正下方；下面放不下就放上面；都放不下就放在方框里面靠下的地方
    const bw = this.bar.offsetWidth;
    const bh = this.bar.offsetHeight;
    let left;
    let top;
    if (r) {
      left = r.x + r.w / 2 - bw / 2;
      top = r.y + r.h + 12;
      if (top + bh > H - 8) top = r.y - bh - 12;
      if (top < 8) top = r.y + r.h - bh - 14;
    } else {
      left = W / 2 - bw / 2;
      top = H - bh - 40;
    }
    this.bar.style.left = `${clamp(left, 8, Math.max(8, W - bw - 8))}px`;
    this.bar.style.top = `${clamp(top, 8, Math.max(8, H - bh - 8))}px`;
  }
}
