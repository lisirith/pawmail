// 右键点宠物弹出的菜单。
//
// 菜单内容由一个简单的列表（model）描述，三种行：
//   { type: 'choice', key, label, value, options: [{ value, label, icon }], compact }   几选一（icon：可选的小图片，图片网址；
//                                                                                     compact：没选中的只显示小图片，名字在鼠标停上去时显示）
//   { type: 'action', id, label, danger }                                点一下执行
//   { type: 'separator' }                                                分隔线

import { clamp } from '../util/math.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class PetMenu {
  constructor(root, { onChoice, onAction }) {
    this.el = root;
    this.onChoice = onChoice;
    this.onAction = onAction;
    this.isOpen = false;
  }

  contains(node) {
    return this.el.contains(node);
  }

  /** 屏幕上的这个点在不在菜单附近（留一点边距） */
  containsPoint(x, y, margin = 18) {
    if (!this.isOpen) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
  }

  open(model, x, y, stageWidth, stageHeight) {
    this.render(model);
    this.el.hidden = false;
    this.isOpen = true;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    // 优先出现在鼠标的右上方，放不下再换边
    let left = x + 14;
    let top = y - h - 10;
    if (left + w > stageWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 14;
    this.el.style.left = `${clamp(left, 8, Math.max(8, stageWidth - w - 8))}px`;
    this.el.style.top = `${clamp(top, 8, Math.max(8, stageHeight - h - 8))}px`;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
  }

  render(model) {
    const rows = model.map((row) => {
      if (row.type === 'separator') return el('div', 'menu-sep');

      if (row.type === 'action') {
        const button = el('button', row.danger ? 'menu-item danger' : 'menu-item', row.label);
        button.type = 'button';
        button.addEventListener('click', () => this.onAction(row.id));
        return button;
      }

      const line = el('div', 'menu-row');
      line.append(el('span', 'menu-label', row.label));
      const seg = el('div', 'seg');
      for (const option of row.options) {
        const button = el('button', option.value === row.value ? 'seg-btn active' : 'seg-btn');
        if (option.icon) {
          const img = el('img', 'seg-icon');
          img.src = option.icon;
          img.alt = '';
          button.append(img);
        }
        // 动物多了，名字全写出来一行放不下（英文更长）：选中的那个写名字，其他的只放小头像
        const iconOnly = row.compact && option.icon && option.value !== row.value;
        if (iconOnly) {
          button.classList.add('icon-only');
          button.title = option.label;
          button.setAttribute('aria-label', option.label);
        } else {
          button.append(option.label);
        }
        button.type = 'button';
        if (option.title) button.title = option.title;
        button.addEventListener('click', () => this.onChoice(row.key, option.value));
        seg.append(button);
      }
      line.append(seg);
      return line;
    });
    this.el.replaceChildren(...rows);
  }
}
