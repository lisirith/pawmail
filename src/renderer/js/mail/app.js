// 信纸窗口的主程序：拆信、读信、信箱、礼物图鉴、给宠物起名字。
//
// 所有内容（信的文字、图鉴、界面上的字）都由后台准备好一次性发过来（见 src/main/mail.js 的 payload），
// 这里只负责把它们摆出来。在普通浏览器里预览时没有后台，就向预览服务器要一份示例数据。

import { getSpecies } from '../pet/species/index.js';
import { drawEnvelope, drawHeadOnly } from '../pet/draw.js';
import { makePose } from '../pet/pose.js';
import { drawPhoto, renderPostcard, capitalize } from './postcard.js';

// ---------------------------------------------------------------- 和后台说话

function createMockApi() {
  const params = new URLSearchParams(location.search);
  const listeners = [];
  const opened = new Set();
  let name = params.get('name');
  const load = async () => {
    const query = new URLSearchParams({
      lang: params.get('lang') || 'zh',
      species: params.get('species') || 'cat',
      unread: params.get('unread') || '1',
      name: name || '',
    });
    const data = await (await fetch(`/__mock/mail?${query}`)).json();
    for (const letter of data.letters) if (opened.has(letter.id)) letter.opened = true;
    if (params.get('view')) data.nav = { view: params.get('view') };
    return data;
  };
  return {
    init: load,
    opened: (id) => opened.add(id),
    setName(next) {
      name = next;
      load().then((data) => {
        data.nav = null;
        listeners.forEach((cb) => cb(data));
      });
    },
    async savePostcard(dataUrl) {
      window.__lastPostcard = dataUrl; // 预览时不存文件，留着给检查用
      return { ok: true };
    },
    copyPostcard: async () => ({ ok: true }),
    close: () => console.log('[预览] 这里会关闭窗口'),
    onUpdate: (cb) => listeners.push(cb),
  };
}

const isPreview = !window.pawmailMail;
const api = window.pawmailMail || createMockApi();

// ---------------------------------------------------------------- 小工具

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** 新建一块画布：显示大小是 w×h，实际像素按屏幕缩放比例放大，这样不会发虚 */
function makeCanvas(w, h, className) {
  const dpr = window.devicePixelRatio || 1;
  const canvas = el('canvas', className);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

function drawFace(ctx, size, species, pose) {
  const sp = getSpecies(species);
  const k = size / (2 * (sp.head.rx + 9));
  ctx.save();
  ctx.translate(size / 2, size / 2 + sp.earReach * 0.35 * k);
  ctx.scale(k, k);
  drawHeadOnly(ctx, sp, makePose(pose));
  ctx.restore();
}

let toastTimer = 0;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- 状态

const state = {
  data: null,
  view: 'letter', // letter 读信 | box 信箱 | album 图鉴
  id: null, // 正在看哪一封信
  opening: null, // 正在播放拆信动画的那封
  justOpened: null, // 刚拆开的那封（播放一次展开的动画）
  newGifts: new Set(), // 这次打开窗口期间第一次拿到的礼物，对应的信上显示"新！"
  shown: '', // 当前显示的信的"指纹"，内容没变就不重画（免得打断动画）
};

const letters = () => state.data.letters;
const current = () => letters().find((l) => l.id === state.id) || null;
const fingerprint = (l) => (l ? JSON.stringify([state.data.lang, state.data.species, l.id, l.opened, l.title, l.lines, l.sign, l.gift && l.gift.line]) : '');

function apply(data) {
  const first = !state.data;
  state.data = data;
  document.documentElement.lang = data.lang;
  document.title = data.ui.title;
  if (data.nav) {
    state.view = data.nav.view || 'letter';
    if (data.nav.id) state.id = data.nav.id;
  }
  if (!letters().some((l) => l.id === state.id)) state.id = letters().length ? letters()[0].id : null;
  // 后台只是来同步数据（比如刚记下"这封信拆开了"）时，正在看的信如果没变就不动它
  const keep = !first && !data.nav && state.view === 'letter' && (state.opening || fingerprint(current()) === state.shown);
  renderBar();
  if (!keep) renderMain();
}

function go(view, id) {
  state.view = view;
  if (id) state.id = id;
  renderBar();
  renderMain();
}

// ---------------------------------------------------------------- 顶栏

function renderBar() {
  const { ui, species, name } = state.data;
  const avatar = $('avatar');
  const ctx = avatar.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  drawFace(ctx, 64, species, { blush: 0.5 });

  const nameButton = $('pet-name');
  nameButton.textContent = name || ui.rename;
  nameButton.title = ui.rename;

  const unread = letters().some((l) => !l.opened);
  const tabs = [
    ['letter', ui.tabLetter],
    ['box', ui.tabBox],
    ['album', ui.tabAlbum],
  ].map(([view, label]) => {
    const tab = button(state.view === view ? 'active' : '', label, () => go(view));
    if (view === 'box' && unread && state.view !== 'box') tab.append(el('span', 'dot'));
    return tab;
  });
  $('tabs').replaceChildren(...tabs);
  $('close').title = ui.close;
}

// ---------------------------------------------------------------- 读信

function sealedView(letter) {
  const { ui } = state.data;
  const view = el('section', 'view sealed');
  const { canvas, ctx } = makeCanvas(300, 210, 'sealed-envelope');
  ctx.translate(150, 105);
  ctx.scale(3, 3);
  drawEnvelope(ctx, 90, 62);
  canvas.addEventListener('click', () => openLetter(letter, view));
  view.append(el('div', 'sealed-date', letter.dateText), canvas, el('div', 'sealed-hint', ui.openHint));
  return view;
}

function openLetter(letter, view) {
  if (!state.data.name) {
    showNaming(() => openLetter(letter, view)); // 第一次拆信之前，先给它起个名字
    return;
  }
  if (state.opening) return;
  state.opening = letter.id; // 拆信动画播放期间，后台同步来的数据先不重画画面
  view.classList.add('opening');
  if (letter.gift && letter.gift.isNew) state.newGifts.add(letter.id);
  setTimeout(() => {
    // 动画期间数据可能已经换了一份新的（比如刚起完名字），所以按编号重新找这封信
    const fresh = letters().find((l) => l.id === letter.id);
    if (fresh) fresh.opened = true;
    state.opening = null;
    state.justOpened = letter.id;
    api.opened(letter.id);
    renderBar();
    renderMain();
  }, 540);
}

async function exportPostcard(letter, mode, trigger) {
  const { ui, species } = state.data;
  trigger.disabled = true;
  try {
    const dataUrl = renderPostcard(letter, { species, footer: ui.postcardFooter }).toDataURL('image/png');
    const result = mode === 'copy' ? await api.copyPostcard(dataUrl) : await api.savePostcard(dataUrl, letter.id);
    toast(result && result.ok ? (mode === 'copy' ? ui.copied : ui.saved) : ui.failed);
  } catch (err) {
    console.error(err);
    toast(ui.failed);
  }
  trigger.disabled = false;
}

function paperView(letter) {
  const { ui, species } = state.data;
  const view = el('section', 'view');
  const paper = el('div', state.justOpened === letter.id ? 'paper reveal' : 'paper');
  state.justOpened = null;

  // 照片
  const { canvas, ctx } = makeCanvas(408, 190, 'photo');
  drawPhoto(ctx, 408, 190, letter, species);

  // 地点和日期
  const head = el('div', 'letter-head');
  const title = el('div', 'letter-title');
  title.append(el('small', '', ui.from), capitalize(letter.title));
  head.append(title, el('div', 'letter-date', letter.dateText));

  // 正文
  const body = el('div', 'letter-body');
  for (const line of letter.lines) body.append(el('p', '', line));

  paper.append(canvas, head, body);

  // 礼物
  if (letter.gift) {
    const gift = el('div', 'gift');
    gift.append(el('span', 'gift-emoji', letter.gift.emoji), el('span', 'gift-text', letter.gift.line));
    if (letter.gift.rarity !== 'common') gift.append(el('span', `chip ${letter.gift.rarity}`, letter.gift.rarityLabel));
    if (state.newGifts.has(letter.id)) gift.append(el('span', 'chip new', ui.newGift));
    paper.append(gift);
  }

  paper.append(el('div', 'sign', `${letter.sign} 🐾`));

  // 按钮：翻信、导出明信片
  const index = letters().findIndex((l) => l.id === letter.id);
  const older = letters()[index + 1];
  const newer = letters()[index - 1];
  const actions = el('div', 'actions');
  const prev = button('btn ghost', `‹ ${ui.prev}`, () => older && go('letter', older.id));
  const next = button('btn ghost', `${ui.next} ›`, () => newer && go('letter', newer.id));
  prev.disabled = !older;
  next.disabled = !newer;
  const copy = button('btn', ui.copy, () => exportPostcard(letter, 'copy', copy));
  const save = button('btn primary', ui.save, () => exportPostcard(letter, 'save', save));
  actions.append(prev, next, el('span', 'spacer'), copy, save);
  paper.append(actions);

  view.append(paper);
  return view;
}

function letterView() {
  const letter = current();
  if (!letter) return el('section', 'view empty', state.data.ui.noLetters);
  return letter.opened ? paperView(letter) : sealedView(letter);
}

// ---------------------------------------------------------------- 信箱

function boxView() {
  const { ui } = state.data;
  if (!letters().length) return el('section', 'view empty', ui.noLetters);
  const view = el('section', 'view');
  const list = el('div', 'box');
  for (const letter of letters()) {
    const item = button(letter.opened ? 'box-item' : 'box-item unread', null, () => go('letter', letter.id));
    const text = el('div', 'box-text');
    text.append(
      el('div', 'box-title', letter.opened ? capitalize(letter.title) : ui.unread),
      el('div', 'box-preview', letter.opened ? letter.lines[letter.kind === 'welcome' ? 0 : 1] || '' : ui.openHint)
    );
    item.append(el('span', 'box-icon', letter.opened ? (letter.gift ? letter.gift.emoji : '✉️') : '💌'), text, el('span', 'box-date', letter.dateText));
    list.append(item);
  }
  view.append(list);
  return view;
}

// ---------------------------------------------------------------- 礼物图鉴

function albumView() {
  const { ui, album } = state.data;
  const view = el('section', 'view');
  const have = album.filter((g) => g.count > 0).length;
  view.append(el('div', 'album-head', ui.collected.replace('{have}', have).replace('{total}', album.length)));
  const grid = el('div', 'album');
  for (const gift of album) {
    const owned = gift.count > 0;
    const item = el('div', owned ? `album-item ${gift.rarity}` : `album-item missing ${gift.rarity}`);
    item.title = owned ? `${capitalize(gift.name)} · ${gift.rarityLabel}` : `${ui.unknownGift} · ${gift.rarityLabel}`;
    item.append(el('div', 'album-emoji', owned ? gift.emoji : '？'), el('div', 'album-name', owned ? capitalize(gift.name) : gift.rarityLabel));
    if (gift.count > 1) item.append(el('div', 'album-count', `×${gift.count}`));
    grid.append(item);
  }
  view.append(grid);
  return view;
}

function renderMain() {
  const view = state.view === 'box' ? boxView() : state.view === 'album' ? albumView() : letterView();
  state.shown = state.view === 'letter' ? fingerprint(current()) : '';
  $('main').replaceChildren(view);
}

// ---------------------------------------------------------------- 起名字

function showNaming(after) {
  const { ui, species, name } = state.data;
  const host = $('naming');
  const card = el('div', 'naming-card');

  const { canvas, ctx } = makeCanvas(84, 84, 'naming-face');
  drawFace(ctx, 84, species, { eyes: 'happy', mouth: 'smile', mouthOpen: 0.5, blush: 0.9 });

  const input = el('input', 'naming-input');
  input.type = 'text';
  input.maxLength = 16;
  input.placeholder = ui.namePlaceholder;
  input.value = name || '';

  const chips = el('div', 'naming-chips');
  for (const suggestion of ui.suggestions || []) {
    chips.append(
      button('', suggestion, () => {
        input.value = suggestion;
        input.focus();
      })
    );
  }

  const close = () => {
    host.hidden = true;
    host.replaceChildren();
  };
  const submit = () => {
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    state.data.name = value;
    api.setName(value);
    close();
    renderBar();
    if (after) after();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape' && name) close();
    e.stopPropagation();
  });
  host.onclick = (e) => {
    if (e.target === host && name) close(); // 已经有名字时，点外面可以取消
  };

  card.append(canvas, el('div', 'naming-title', ui.nameTitle), el('div', 'naming-hint', ui.nameHint), input, chips, button('btn primary', ui.nameOk, submit));
  host.replaceChildren(card);
  host.hidden = false;
  setTimeout(() => input.focus(), 30);
}

// ---------------------------------------------------------------- 启动

$('close').addEventListener('click', () => api.close());
$('pet-name').addEventListener('click', () => showNaming());

window.addEventListener('keydown', (e) => {
  if (!state.data || !$('naming').hidden) return;
  if (e.key === 'Escape') api.close();
  if (state.view !== 'letter') return;
  const index = letters().findIndex((l) => l.id === state.id);
  if (e.key === 'ArrowLeft' && letters()[index + 1]) go('letter', letters()[index + 1].id);
  if (e.key === 'ArrowRight' && letters()[index - 1]) go('letter', letters()[index - 1].id);
});

if (isPreview) document.body.classList.add('preview');

api.onUpdate(apply);
api.init().then((data) => {
  if (!data) return;
  apply(data);
  // 给自检和调试用：__mail.postcard() 返回当前这封信的明信片图片
  window.__mail = {
    state,
    go,
    postcard: () => renderPostcard(current(), { species: state.data.species, footer: state.data.ui.postcardFooter }).toDataURL('image/png'),
  };
});
