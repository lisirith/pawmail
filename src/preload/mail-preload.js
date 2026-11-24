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
  /** 换衣服：整身 { hat, glasses, top, bag, held }，每个部位是衣服编号或 null。返回 { ok } */
  setOutfit: (outfit) => ipcRenderer.invoke('pawmail-mail:set-outfit', outfit),
  /** 待办事项：{ type: 'add' | 'update' | 'done' | 'remove' | 'clearDone' | 'notify', id, text, due, lead, done, on }。返回 { ok } */
  todo: (action) => ipcRenderer.invoke('pawmail-mail:todo', action),
  /**
   * 手机提醒：{ type: 'service', service } | { type: 'newTopic' } | { type: 'sctKey', key } | { type: 'options', hideText, skipPresent }
   * | { type: 'test' } | { type: 'copyTopic' } | { type: 'open', which }。返回 { ok }（'test' 还有 error、code）
   */
  phone: (action) => ipcRenderer.invoke('pawmail-mail:phone', action),
  savePostcard: (dataUrl, id) => ipcRenderer.invoke('pawmail-mail:save-postcard', dataUrl, id),
  copyPostcard: (dataUrl) => ipcRenderer.invoke('pawmail-mail:copy-postcard', dataUrl),
  close: () => ipcRenderer.send('pawmail-mail:close'),
  onUpdate: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('pawmail-mail:update', (_event, data) => callback(data));
  },
});
