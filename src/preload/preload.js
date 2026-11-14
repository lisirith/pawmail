'use strict';
// "预加载脚本"：画面（网页）和后台之间的安全通道。
// 画面本身不能直接碰电脑上的任何东西，只能通过这里列出的这几个函数和后台说话。

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// 后台 → 画面 允许的消息种类
const INBOUND = new Set(['cursor', 'settings', 'command', 'system', 'save-now', 'mail', 'festival']);

contextBridge.exposeInMainWorld('pawmail', {
  /** 启动时取一次：设置、存档、所有语言的文字 */
  init: () => ipcRenderer.invoke('pawmail:init'),
  /** 要不要"接住"鼠标（true = 鼠标点在窗口上；false = 鼠标穿过窗口，点到下面的东西） */
  setCapture: (flag) => ipcRenderer.send('pawmail:set-capture', !!flag),
  savePet: (state) => ipcRenderer.send('pawmail:save-pet', state),
  setSetting: (key, value) => ipcRenderer.send('pawmail:set-setting', key, value),
  setTrayIcon: (dataUrl) => ipcRenderer.send('pawmail:tray-icon', dataUrl),
  /** 正在画"活动范围"：就算是"只在桌面"模式，也先把窗口提到最前面，画完再放回去 */
  setEditing: (flag) => ipcRenderer.send('pawmail:editing', !!flag),
  /**
   * 把拖到它身上的文件喂给它（其实是放进回收站，见 src/main/feed.js）。
   * 文件的完整路径在这里换算出来、直接交给后台，画面那边拿不到，只会收到"吃了几样、哪样吃不下、为什么"。
   */
  feed: (files) => {
    const paths = [];
    for (const file of Array.from(files || []).slice(0, 50)) {
      try {
        const p = webUtils.getPathForFile(file);
        if (p) paths.push(p);
      } catch {
        /* 不是从电脑上拖来的文件（比如网页里的图片）：不吃 */
      }
    }
    return ipcRenderer.invoke('pawmail:feed', paths);
  },
  /** 文件拖到它身上时，不让 Windows 画那个挡住它脸的大图标：'hide' 停在身上 | 'leave' 拖走了 | 'drop' 松手了 */
  dragImage: (mode) => ipcRenderer.send('pawmail:drag-image', String(mode)),
  /** 打开信纸窗口（有没拆的信就直接打开那封） */
  /** 打开信纸窗口。view = 'wardrobe' 时直接打开衣柜 */
  openMail: (view) => ipcRenderer.send('pawmail:open-mail', view === 'wardrobe' ? 'wardrobe' : null),
  /** 记一次互动：'pet' 摸头 | 'poke' 戳 | 'throw' 扔 | 'dizzy' 弄晕 */
  stat: (kind) => ipcRenderer.send('pawmail:stat', String(kind)),
  quit: () => ipcRenderer.send('pawmail:quit'),
  log: (...args) => ipcRenderer.send('pawmail:log', args.map((a) => String(a)).join(' ')),
  on: (channel, callback) => {
    if (!INBOUND.has(channel) || typeof callback !== 'function') return;
    ipcRenderer.on(`pawmail:${channel}`, (_event, data) => callback(data));
  },
});
