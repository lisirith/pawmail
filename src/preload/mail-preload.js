'use strict';
// 信纸窗口和后台之间的安全通道（和宠物窗口的 preload.js 是同一个道理，只是能做的事不一样）。

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pawmailMail', {
  /** 取全部内容：信、图鉴、界面文字 */
  init: () => ipcRenderer.invoke('pawmail-mail:init'),
  /** 告诉后台：这封信拆开了 */
  opened: (id) => ipcRenderer.send('pawmail-mail:opened', id),
  setName: (name) => ipcRenderer.send('pawmail-mail:set-name', name),
  /** 保存你的生日和过的节日：{ birthday: 'MM-DD' | null, cultures: [...] }，或者 { skip: true }（以后再说） */
  setProfile: (profile) => ipcRenderer.invoke('pawmail-mail:set-profile', profile),
  /** 删信：ids 是信的编号列表。返回 { ok, removed } */
  deleteLetters: (ids) => ipcRenderer.invoke('pawmail-mail:delete', ids),
  savePostcard: (dataUrl, id) => ipcRenderer.invoke('pawmail-mail:save-postcard', dataUrl, id),
  copyPostcard: (dataUrl) => ipcRenderer.invoke('pawmail-mail:copy-postcard', dataUrl),
  close: () => ipcRenderer.send('pawmail-mail:close'),
  onUpdate: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('pawmail-mail:update', (_event, data) => callback(data));
  },
});
