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
    petName: null,
    autoStart: false,
    // 预览时加 ?area=0.3,0.4,0.4,0.6 可以直接看"活动范围"的样子（x,y,宽,高，都是占窗口的比例）
    area: (() => {
      const v = (params.get('area') || '').split(',').map(Number);
      return v.length === 4 && v.every(Number.isFinite) ? { x: v[0], y: v[1], w: v[2], h: v[3] } : null;
    })(),
  };

  return {
    isMock: true,
    async init() {
      const strings = {};
      for (const lang of ['zh', 'en']) {
        strings[lang] = await (await fetch(`../shared/locales/${lang}.json`)).json();
      }
      // 预览时加 ?mail=1 可以看到"手里有一封没拆的信"的样子；?mail=gold 是金色信封（月报）
      const mail = { unread: params.get('mail') ? 1 : 0, total: 1, special: params.get('mail') === 'gold' };
      // 加 ?festival=halloween&look=ghost&greet=boo 可以看过节的样子
      const festival = params.get('festival')
        ? { id: params.get('festival'), day: 'preview', look: params.get('look') || null, greet: params.get('greet') || 'cheer' }
        : null;
      return { settings: { ...settings }, pet: null, mail, festival, strings, dev: true, preview: true, version: 'preview' };
    },
    setCapture() {},
    savePet() {},
    openMail() {
      console.log('[预览] 这里会打开信纸窗口（预览地址：mail.html）');
      emit('mail', { unread: 0, total: 1 });
    },
    stat() {},
    setSetting(key, value) {
      settings = { ...settings, [key]: value };
      emit('settings', { ...settings });
    },
    setTrayIcon() {},
    setEditing() {},
    dragImage() {},
    /** 预览时没有后台：假装都吃下了（拖进来的东西不会被动） */
    async feed(files) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const items = Array.from(files || []).map(() => ({ kind: 'file', ok: true, reason: null }));
      return { items, eaten: items.length, reason: null, first: false };
    },
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
