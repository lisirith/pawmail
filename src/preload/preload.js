'use strict';
// "预加载脚本"：画面（网页）和后台之间的安全通道。
// 画面本身不能直接碰电脑上的任何东西，只能通过这里列出的这几个函数和后台说话。

const { contextBridge, ipcRenderer } = require('electron');

// 后台 → 画面 允许的消息种类
const INBOUND = new Set(['cursor', 'settings', 'command', 'system', 'save-now']);

contextBridge.exposeInMainWorld('pawmail', {
  /** 启动时取一次：设置、存档、所有语言的文字 */
  init: () => ipcRenderer.invoke('pawmail:init'),
  /** 要不要"接住"鼠标（true = 鼠标点在窗口上；false = 鼠标穿过窗口，点到下面的东西） */
  setCapture: (flag) => ipcRenderer.send('pawmail:set-capture', !!flag),
  savePet: (state) => ipcRenderer.send('pawmail:save-pet', state),
  setSetting: (key, value) => ipcRenderer.send('pawmail:set-setting', key, value),
  setTrayIcon: (dataUrl) => ipcRenderer.send('pawmail:tray-icon', dataUrl),
  quit: () => ipcRenderer.send('pawmail:quit'),
  log: (...args) => ipcRenderer.send('pawmail:log', args.map((a) => String(a)).join(' ')),
  on: (channel, callback) => {
    if (!INBOUND.has(channel) || typeof callback !== 'function') return;
    ipcRenderer.on(`pawmail:${channel}`, (_event, data) => callback(data));
  },
});
