'use strict';
// 直接调用 Windows 系统功能的地方（通过 koffi 这个库）。
//   sendToBottom  "只待在桌面上"模式需要把窗口压到所有窗口的最下面，Electron 自己做不到。
//   rootWindowAt  查一下屏幕上某个点最上面是哪个窗口（只在自检时用，用来确认"鼠标穿透"真的生效）。
// 如果 koffi 加载失败，程序照样能运行，只是"只待在桌面上"模式的效果会差一点。

let SetWindowPos = null;
let WindowFromPoint = null;
let GetAncestor = null;

if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    koffi.struct('POINT', { x: 'long', y: 'long' });
    SetWindowPos = user32.func(
      'bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
    );
    WindowFromPoint = user32.func('intptr_t __stdcall WindowFromPoint(POINT pt)');
    GetAncestor = user32.func('intptr_t __stdcall GetAncestor(intptr_t hWnd, uint32_t gaFlags)');
  } catch (err) {
    console.warn('[native] koffi 不可用，"只待在桌面上"模式会降级：', err.message);
  }
}

const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const GA_ROOT = 2;

/** 窗口在 Windows 里的编号（句柄） */
function handleOf(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigInt64LE(0) : BigInt(buf.readInt32LE(0));
}

/** 把窗口放到所有窗口的最下面（紧贴桌面）。成功返回 true。 */
function sendToBottom(win) {
  if (!SetWindowPos || !win || win.isDestroyed()) return false;
  try {
    return !!SetWindowPos(handleOf(win), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  } catch (err) {
    console.warn('[native] SetWindowPos 失败：', err.message);
    return false;
  }
}

/** 屏幕上（物理像素坐标）这个点，鼠标会点到哪个顶层窗口？返回它的句柄；查不了返回 null。 */
function rootWindowAt(x, y) {
  if (!WindowFromPoint || !GetAncestor) return null;
  try {
    const hit = WindowFromPoint({ x: Math.round(x), y: Math.round(y) });
    if (!hit) return 0n;
    return BigInt(GetAncestor(hit, GA_ROOT) || hit);
  } catch (err) {
    console.warn('[native] WindowFromPoint 失败：', err.message);
    return null;
  }
}

module.exports = { sendToBottom, rootWindowAt, handleOf, available: !!SetWindowPos };
