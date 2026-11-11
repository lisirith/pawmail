// "桥"：画面这一侧和 Electron 后台之间的唯一通道。
//
// 正式运行时，window.pawmail 由 src/preload/preload.js 提供。
// 在普通浏览器里预览（npm run preview）时没有后台，这里就造一个"假的后台"，
// 这样同一份画面代码两边都能跑。

export const isElectron = typeof window !== 'undefined' && !!window.pawmail;

function createMockBridge() {
  const params = new URLSearchParams(location.search);
  const listeners = {};
  const emit = (channel, data) => (listeners[channel] || []).forEach((cb) => cb(data));
  let settings = {
    species: params.get('species') || 'cat',
    displayMode: 'top',
    scale: Number(params.get('scale')) || 1,
    language: params.get('lang') || 'zh',
    firstRunDone: params.get('first') !== '1',
  };

  return {
    isMock: true,
    async init() {
      const strings = {};
      for (const lang of ['zh', 'en']) {
        strings[lang] = await (await fetch(`../shared/locales/${lang}.json`)).json();
      }
      return { settings: { ...settings }, pet: null, strings, dev: true, preview: true, version: 'preview' };
    },
    setCapture() {},
    savePet() {},
    setSetting(key, value) {
      settings = { ...settings, [key]: value };
      emit('settings', { ...settings });
    },
    setTrayIcon() {},
    quit() {
      console.log('[预览] 这里会退出程序');
    },
    log(...args) {
      console.log('[pawmail]', ...args);
    },
    on(channel, cb) {
      (listeners[channel] ||= []).push(cb);
    },
    emit, // 仅预览/测试用：模拟后台发来的消息
  };
}

export function createBridge() {
  return isElectron ? window.pawmail : createMockBridge();
}
