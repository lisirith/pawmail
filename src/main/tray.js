'use strict';
// 屏幕右下角托盘区的小图标和它的菜单。
// 图标是画面那边用宠物的头画出来、再传过来的，所以换动物时图标也会跟着变。

const { Tray, Menu, nativeImage } = require('electron');

/** 画面还没准备好之前，先用一个橙色小圆点顶着 */
function fallbackIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      const a = d < 12 ? 1 : d < 13 ? 13 - d : 0;
      const i = (y * size + x) * 4;
      // Windows 上的位图是 B、G、R、A 的顺序，颜色要先乘上透明度
      buf[i] = Math.round(0x52 * a);
      buf[i + 1] = Math.round(0xa6 * a);
      buf[i + 2] = Math.round(0xf5 * a);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

class PetTray {
  /**
   * @param getModel   () => { t, settings }   t 是取文字的函数，settings 是当前设置
   * @param onSet      (key, value) => void    改设置
   * @param onCommand  (type) => void          给宠物下指令
   * @param onHelp     (what) => void          「帮助与反馈」：'releases' 看新版本、'issues' 反馈问题、'logs' 打开日志文件夹
   * @param onQuit     () => void
   */
  constructor({ getModel, onSet, onCommand, onOpenMail, onHelp, onQuit }) {
    this.getModel = getModel;
    this.onSet = onSet;
    this.onCommand = onCommand;
    this.onOpenMail = onOpenMail;
    this.onHelp = onHelp;
    this.onQuit = onQuit;
    this.tray = null;
  }

  create() {
    this.tray = new Tray(fallbackIcon());
    this.tray.on('click', () => this.tray.popUpContextMenu()); // 左键点也弹出菜单
    this.refresh();
  }

  setIcon(dataUrl) {
    if (!this.tray || this.tray.isDestroyed()) return;
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) return;
    this.tray.setImage(image.resize({ width: 32, height: 32, quality: 'best' }));
  }

  /** 设置或语言变了之后，重新生成菜单 */
  refresh() {
    if (!this.tray || this.tray.isDestroyed()) return;
    const { t, settings, mail, version } = this.getModel();
    const radio = (key, value, label) => ({
      label,
      type: 'radio',
      checked: settings[key] === value,
      click: () => this.onSet(key, value),
    });
    const unread = mail ? mail.unread : 0;
    this.tray.setToolTip(unread ? `${t('appName')} · ${t('menu.mailboxUnread', { n: unread })}` : t('appName'));
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: unread ? t('menu.mailboxUnread', { n: unread }) : t('menu.mailbox'), click: () => this.onOpenMail() },
        { label: t('menu.wardrobe'), click: () => this.onOpenMail('wardrobe') },
        { type: 'separator' },
        { label: t('menu.animal'), submenu: [radio('species', 'cat', t('menu.cat')), radio('species', 'panda', t('menu.panda'))] },
        ...(settings.species === 'cat' ? [{ label: t('menu.catCoat'), submenu: [radio('catCoat', 'tabby', t('menu.tabby')), radio('catCoat', 'lucky', t('menu.luckyCat'))] }] : []),
        {
          label: t('menu.display'),
          submenu: [radio('displayMode', 'top', t('menu.topLong')), radio('displayMode', 'desktop', t('menu.desktopLong'))],
        },
        {
          label: t('menu.size'),
          submenu: [radio('scale', 0.8, t('menu.small')), radio('scale', 1, t('menu.medium')), radio('scale', 1.3, t('menu.large'))],
        },
        { label: t('menu.language'), submenu: [radio('language', 'zh', '中文'), radio('language', 'en', 'English')] },
        {
          label: t('menu.area'),
          submenu: [
            { label: t('menu.areaEdit'), click: () => this.onCommand('editArea') },
            { label: t('menu.areaFull'), type: 'radio', checked: !settings.area, click: () => this.onSet('area', null) },
            ...(settings.area ? [{ label: t('menu.areaCustom'), type: 'radio', checked: true, click: () => this.onCommand('editArea') }] : []),
          ],
        },
        {
          label: t('menu.autoStartLong'),
          type: 'checkbox',
          checked: !!settings.autoStart,
          click: (item) => this.onSet('autoStart', item.checked),
        },
        {
          label: t('menu.hideOnFullscreen'),
          type: 'checkbox',
          checked: settings.hideOnFullscreen !== false,
          click: (item) => this.onSet('hideOnFullscreen', item.checked),
        },
        {
          label: t('menu.windowPerchLong'),
          type: 'checkbox',
          checked: settings.windowPerch !== false,
          click: (item) => this.onSet('windowPerch', item.checked),
        },
        { type: 'separator' },
        { label: t('menu.comeBack'), click: () => this.onCommand('comeBack') },
        { label: t('menu.sleep'), click: () => this.onCommand('sleep') },
        { label: t('menu.wake'), click: () => this.onCommand('wake') },
        { type: 'separator' },
        {
          // 第一行灰色的版本号：反馈问题时告诉我们用的是哪一版；和发布页上的版本号一比，就知道有没有新版
          label: t('menu.help'),
          submenu: [
            { label: t('menu.version', { v: version }), enabled: false },
            { label: t('menu.checkUpdate'), click: () => this.onHelp('releases') },
            { label: t('menu.feedback'), click: () => this.onHelp('issues') },
            { label: t('menu.openLogs'), click: () => this.onHelp('logs') },
          ],
        },
        { label: t('menu.quit'), click: () => this.onQuit() },
      ])
    );
  }

  destroy() {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }
}

module.exports = { PetTray };
