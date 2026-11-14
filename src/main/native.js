'use strict';
// 直接调用 Windows 系统功能的地方（通过 koffi 这个库）。
//   sendToBottom  "只待在桌面上"模式需要把窗口压到所有窗口的最下面，Electron 自己做不到。
//   rootWindowAt  查一下屏幕上某个点最上面是哪个窗口（只在自检时用，用来确认"鼠标穿透"真的生效）。
//   volumeOf      一个文件在哪个盘上、是不是本机的硬盘（喂它吃文件之前要查，见 feed.js）。
// 如果 koffi 加载失败，程序照样能运行，只是"只待在桌面上"模式的效果会差一点，也不能喂它吃文件了。

let SetWindowPos = null;
let WindowFromPoint = null;
let GetAncestor = null;
let GetDriveTypeW = null;
let GetVolumePathNameW = null;
let GetVolumeNameForVolumeMountPointW = null;

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
    const kernel32 = koffi.load('kernel32.dll');
    GetDriveTypeW = kernel32.func('uint32_t __stdcall GetDriveTypeW(str16 lpRootPathName)');
    GetVolumePathNameW = kernel32.func('int __stdcall GetVolumePathNameW(str16 lpszFileName, _Out_ uint8_t *buf, uint32_t cch)');
    GetVolumeNameForVolumeMountPointW = kernel32.func(
      'int __stdcall GetVolumeNameForVolumeMountPointW(str16 lpszVolumeMountPoint, _Out_ uint8_t *buf, uint32_t cch)'
    );
  } catch (err) {
    console.warn('[native] koffi 不可用，"只待在桌面上"模式会降级：', err.message);
  }
}

const DRIVE_FIXED = 3;

/** Windows 往缓冲区里写的是 UTF-16 文字，读到第一个 \0 为止 */
function wideString(buf) {
  const text = buf.toString('utf16le');
  const end = text.indexOf('\0');
  return end < 0 ? text : text.slice(0, end);
}

/**
 * 这个路径在哪个盘上？返回 { root: 'C:\\', fixed, real }；查不了返回 null。
 *   root   盘的根目录。挂在文件夹上的盘（没有盘符）、网络共享，root 就不是 "X:\" 这种样子
 *   fixed  是不是本机的硬盘（U 盘、网络盘、光盘、内存盘都不是）
 *   real   是不是真正的分区（用 subst 命令虚拟出来的盘符不是：那种盘上删东西不进回收站）
 */
function volumeOf(filePath) {
  if (!GetVolumePathNameW || !GetVolumeNameForVolumeMountPointW || !GetDriveTypeW) return null;
  try {
    const buf = Buffer.alloc(2 * 1024);
    if (!GetVolumePathNameW(String(filePath), buf, 1024)) return null;
    const root = wideString(buf);
    const name = Buffer.alloc(2 * 128);
    const real = !!GetVolumeNameForVolumeMountPointW(root, name, 128);
    return { root, fixed: GetDriveTypeW(root) === DRIVE_FIXED, real };
  } catch (err) {
    console.warn('[native] 查不到文件在哪个盘上：', err.message);
    return null;
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

module.exports = { sendToBottom, rootWindowAt, handleOf, volumeOf, available: !!SetWindowPos };
