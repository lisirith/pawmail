// 宠物头顶的说话气泡。

import { clamp } from '../util/math.js';

export class Bubble {
  constructor(el) {
    this.el = el;
    this.textEl = el.querySelector('.bubble-text');
    this.until = 0;
    this.visible = false;
    this.halfWidth = 0;
  }

  say(text, seconds = 2.4) {
    if (!text) return;
    this.textEl.textContent = text;
    this.until = performance.now() + seconds * 1000;
    this.visible = true;
    this.el.classList.add('show');
    this.halfWidth = this.el.offsetWidth / 2;
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove('show');
  }

  /** 每帧调用：跟着宠物走，并且不超出屏幕左右两边 */
  update(x, y, stageWidth) {
    if (!this.visible) return;
    if (performance.now() > this.until) {
      this.hide();
      return;
    }
    const cx = clamp(x, this.halfWidth + 6, Math.max(this.halfWidth + 6, stageWidth - this.halfWidth - 6));
    const transform = `translate(${Math.round(cx)}px, ${Math.round(Math.max(y, 40))}px) translate(-50%, -100%)`;
    if (transform !== this.transform) {
      this.transform = transform; // 位置没变就不去碰页面，免得白白触发一次重画
      this.el.style.transform = transform;
    }
  }
}
