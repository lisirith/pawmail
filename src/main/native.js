'use strict';
// 直接调用 Windows 系统功能的地方（通过 koffi 这个库）。
//   sendToBottom  "只待在桌面上"模式需要把窗口压到所有窗口的最下面，Electron 自己做不到。
//   rootWindowAt  查一下屏幕上某个点最上面是哪个窗口（只在自检时用，用来确认"鼠标穿透"真的生效）。
//   volumeOf      一个文件在哪个盘上、是不是本机的硬盘（喂它吃文件之前要查，见 feed.js）。
//   dragImage…    拖着文件到宠物身上时，不让 Windows 画那个挡住它脸的大文件图标（见下面的说明）。
//   foregroundFullscreen  最前面的窗口是不是铺满了整个主屏幕（有人在全屏打游戏、看视频时，宠物先躲起来）。
//   visibleWindows / windowFrame  屏幕上看得见的窗口在哪儿（宠物可以站到窗口顶上，见 ledges.js）。
// 如果 koffi 加载失败，程序照样能运行，只是"只待在桌面上"模式的效果会差一点，也不能喂它吃文件了。

let koffi = null;
let SetWindowPos = null;
let WindowFromPoint = null;
let GetAncestor = null;
let GetDriveTypeW = null;
let GetVolumePathNameW = null;
let GetVolumeNameForVolumeMountPointW = null;
let FindWindowW = null;
let IsWindowVisible = null;
let ShowWindow = null;
let CoInitializeEx = null;
let CoCreateInstance = null;
let HelperDragLeave = null;
let GetForegroundWindow = null;
let GetWindowRect = null;
let GetClassNameW = null;
let MonitorFromWindow = null;
let GetMonitorInfoW = null;
let IsZoomed = null;
let GetTopWindow = null;
let GetWindow = null;
let IsWindowVisibleH = null;
let IsIconic = null;
let GetWindowLongPtrW = null;
let DwmGetRect = null;
let DwmGetInt = null;

if (process.platform === 'win32') {
  try {
    koffi = require('koffi');
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
    FindWindowW = user32.func('void * __stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)');
    IsWindowVisible = user32.func('int __stdcall IsWindowVisible(void *hWnd)');
    ShowWindow = user32.func('int __stdcall ShowWindow(void *hWnd, int nCmdShow)');
    const ole32 = koffi.load('ole32.dll');
    koffi.struct('PAWMAIL_GUID', { Data1: 'uint32', Data2: 'uint16', Data3: 'uint16', Data4: koffi.array('uint8', 8) });
    CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *reserved, uint32_t coinit)');
    CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(PAWMAIL_GUID *rclsid, void *outer, uint32_t ctx, PAWMAIL_GUID *riid, _Out_ void **ppv)');
    HelperDragLeave = koffi.proto('long __stdcall PawmailHelperDragLeave(void *self)');
    // 判断"最前面的窗口是不是全屏"要用的几个
    koffi.struct('PAWMAIL_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    koffi.struct('PAWMAIL_MONITORINFO', { cbSize: 'uint32', rcMonitor: 'PAWMAIL_RECT', rcWork: 'PAWMAIL_RECT', dwFlags: 'uint32' });
    GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
    GetWindowRect = user32.func('int __stdcall GetWindowRect(intptr_t hWnd, _Out_ PAWMAIL_RECT *rect)');
    GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr_t hWnd, _Out_ uint8_t *buf, int cch)');
    MonitorFromWindow = user32.func('intptr_t __stdcall MonitorFromWindow(intptr_t hWnd, uint32_t flags)');
    GetMonitorInfoW = user32.func('int __stdcall GetMonitorInfoW(intptr_t hMonitor, _Inout_ PAWMAIL_MONITORINFO *info)');
    IsZoomed = user32.func('int __stdcall IsZoomed(intptr_t hWnd)');
    // 列出屏幕上的窗口要用的几个（宠物站到窗口顶上，见 visibleWindows）
    GetTopWindow = user32.func('intptr_t __stdcall GetTopWindow(intptr_t hWnd)');
    GetWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)');
    IsWindowVisibleH = user32.func('int __stdcall IsWindowVisible(intptr_t hWnd)');
    IsIconic = user32.func('int __stdcall IsIconic(intptr_t hWnd)');
    GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int nIndex)');
    const dwmapi = koffi.load('dwmapi.dll');
    DwmGetRect = dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ PAWMAIL_RECT *value, uint32_t size)');
    DwmGetInt = dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ uint32_t *value, uint32_t size)');
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

// ---------------------------------------------------------------- 有没有全屏的程序在最前面
//
// 有人在全屏打游戏、全屏看视频时，宠物还在画面上走来走去会很烦，所以要先躲起来（见 main.js 的 watchFullscreen）。
// 判断的办法：看"最前面的那个窗口"是不是正好铺满了整个主屏幕（宠物只住在主屏幕上）。
// 只看窗口的大小和它是不是 Windows 自己的桌面，不看它是哪个程序、叫什么名字——我们不记录你在用什么。

const MONITOR_DEFAULTTONEAREST = 2;
const MONITORINFOF_PRIMARY = 1;
// Windows 自己的界面：桌面（点一下桌面，最前面的窗口就是它，它也铺满屏幕）、切换窗口时的那一层。这些不算全屏程序
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'MultitaskingViewFrame', 'XamlExplorerHostIslandWindow', 'TaskSwitcherWnd', 'TaskSwitcherOverlayWnd', 'ForegroundStaging']);
// Windows 临时盖上来的一整层：比如 Win+Shift+S 截图时的遮罩（2026-11-17 实测类名是 XamlWindow）。
// 它会铺满屏幕，但不是"有人在全屏打游戏"：宠物原来露着就接着露着（不然截图时它会躲起来、截完过两秒才回来），
// 原来躲着就接着躲着（打全屏游戏时叫出系统浮层，它也不该冒出来）。
const OVERLAY_CLASSES = new Set(['XamlWindow']);

/**
 * 这个窗口（句柄）是不是铺满了整个主屏幕。查不了返回 false。
 *   - 最大化的窗口不算：它不盖住任务栏。任务栏设成自动隐藏时，最大化的窗口四边会比屏幕多出几个像素，
 *     也"盖住"了整个屏幕，所以要另外排除（真正全屏的窗口是正好等于屏幕大小的）。
 *   - 少 1 个像素都不算：有些程序（包括我们自己的透明窗口）故意少铺 1 像素，就是不想被当成全屏。
 */
function coversPrimaryScreen(hwnd) {
  if (!GetWindowRect || !MonitorFromWindow || !GetMonitorInfoW || !hwnd) return false;
  try {
    const rect = {};
    if (!GetWindowRect(hwnd, rect)) return false;
    const info = { cbSize: 40, rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 }, rcWork: { left: 0, top: 0, right: 0, bottom: 0 }, dwFlags: 0 };
    if (!GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), info)) return false;
    if (!(info.dwFlags & MONITORINFOF_PRIMARY)) return false; // 在别的显示器上：不影响宠物
    const m = info.rcMonitor;
    const covers = rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
    if (!covers) return false;
    const exact = rect.left === m.left && rect.top === m.top && rect.right === m.right && rect.bottom === m.bottom;
    if (!exact && IsZoomed && IsZoomed(hwnd)) return false; // 只是最大化（任务栏自动隐藏）
    const buf = Buffer.alloc(2 * 128);
    const cls = GetClassNameW && GetClassNameW(hwnd, buf, 128) ? wideString(buf) : '';
    return !SHELL_CLASSES.has(cls);
  } catch (err) {
    console.warn('[native] 查不了窗口是不是全屏：', err.message);
    return false;
  }
}

/**
 * 现在最前面的窗口是不是全屏的（铺满了整个主屏幕）。查不了返回 false（宁可不躲）。
 * 返回 null：最前面是 Windows 临时盖上来的一层（截图遮罩之类，见 OVERLAY_CLASSES），宠物保持原样，不躲也不出来。
 */
function foregroundFullscreen() {
  if (!GetForegroundWindow) return false;
  try {
    const hwnd = GetForegroundWindow();
    if (!coversPrimaryScreen(hwnd)) return false;
    const buf = Buffer.alloc(2 * 128);
    const cls = GetClassNameW && GetClassNameW(hwnd, buf, 128) ? wideString(buf) : '';
    return OVERLAY_CLASSES.has(cls) ? null : true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 屏幕上的窗口在哪儿
//
// 宠物可以站到别的窗口顶上（见 ledges.js）。为此要知道：屏幕上看得见哪些窗口、各在哪儿、谁压着谁。
// 和"全屏时躲起来"一样，只看窗口的位置、大小和前后顺序，不看标题、不看是哪个程序。

const GW_HWNDNEXT = 2;
const GW_OWNER = 4;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CAPTION = 0x00c00000; // 有标题栏
const WS_POPUP = 0x80000000;
const WS_EX_TOPMOST = 0x8;
const WS_EX_TRANSPARENT = 0x20; // 鼠标能穿过去的透明窗口（比如我们自己这种桌宠）
const WS_EX_TOOLWINDOW = 0x80; // 工具窗口：浮动的小面板、提示框、透明的桌宠窗口
const WS_EX_APPWINDOW = 0x40000;
const WS_EX_LAYERED = 0x80000; // 分层（可以半透明）的窗口
const WS_EX_NOACTIVATE = 0x08000000; // 点了也不会变成"当前窗口"的：音量提示、通知之类
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;

/** Windows 给的窗口样式是 32 位的数，64 位程序里可能被当成负数读出来：统一换成正的 */
const u32 = (v) => Number(BigInt.asUintN(32, BigInt(v)));

/**
 * 窗口在屏幕上真正看得见的那个框（物理像素）。
 * Windows 10/11 的窗口四周有一圈看不见的"拉伸边框"，GetWindowRect 会把它算进去，所以优先问 DWM 要实际画出来的框。
 */
function frameOf(hwnd) {
  const rect = {};
  if (DwmGetRect && DwmGetRect(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) === 0) return rect;
  const r = {};
  return GetWindowRect(hwnd, r) ? r : null;
}

/** 被"隐藏"起来的窗口：别的虚拟桌面上的、挂起的商店应用。它们算"可见"，其实看不见 */
function cloaked(hwnd) {
  if (!DwmGetInt) return false;
  const v = [0];
  return DwmGetInt(hwnd, DWMWA_CLOAKED, v, 4) === 0 && v[0] !== 0;
}

/**
 * 屏幕上看得见的窗口，从最前面往后排。每个：{ id, rect（物理像素）, perch, topmost }
 *   perch   能不能站上去：普通的程序窗口和对话框可以；最大化的（顶上没地方）、弹出菜单这类不行
 *   topmost 是不是"总在最前面"的窗口
 * 不算的：最小化的、隐藏的、透明可穿透的（别的桌宠）、浮动小面板、Windows 自己的桌面和任务栏、skip 里的（我们自己的）。
 */
function visibleWindows(skip = new Set()) {
  if (!GetTopWindow) return [];
  const out = [];
  try {
    let h = GetTopWindow(0);
    for (let n = 0; h && n < 2000; n++, h = GetWindow(h, GW_HWNDNEXT)) {
      if (skip.has(String(h))) continue;
      if (!IsWindowVisibleH(h) || IsIconic(h) || cloaked(h)) continue;
      const ex = u32(GetWindowLongPtrW(h, GWL_EXSTYLE));
      if (ex & (WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE)) continue;
      // 总在最前面的半透明大窗口：多半是别的桌宠、屏幕特效。它们平时鼠标能穿过去（上面那条就跳过了），
      // 但鼠标停在它们的宠物身上时会暂时"接住"鼠标、不再透明——不能因此把它当成挡住窗口的东西，害我们的宠物掉下来
      if ((ex & WS_EX_LAYERED) && (ex & WS_EX_TOPMOST)) continue;
      const rect = frameOf(h);
      if (!rect || rect.right - rect.left < 2 || rect.bottom - rect.top < 2) continue;
      const buf = Buffer.alloc(2 * 128);
      const cls = GetClassNameW(h, buf, 128) ? wideString(buf) : '';
      if (SHELL_CLASSES.has(cls) || OVERLAY_CLASSES.has(cls)) continue;
      const style = u32(GetWindowLongPtrW(h, GWL_STYLE));
      const owned = !!GetWindow(h, GW_OWNER);
      const normal = (style & WS_CAPTION) === WS_CAPTION || (ex & WS_EX_APPWINDOW) || (!owned && !(style & WS_POPUP));
      out.push({ id: String(h), rect, perch: !!normal && !IsZoomed(h), topmost: !!(ex & WS_EX_TOPMOST) });
    }
  } catch (err) {
    console.warn('[native] 列不出窗口：', err.message);
  }
  return out;
}

/** 某一个窗口现在在哪儿（物理像素）。已经关掉、最小化、藏起来了返回 null */
function windowFrame(id) {
  if (!GetTopWindow) return null;
  try {
    const h = Number(id);
    if (!h || !IsWindowVisibleH(h) || IsIconic(h) || cloaked(h)) return null;
    return frameOf(h);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 拖文件时的那个大图标
//
// 从文件管理器拖文件时，鼠标下面那个半透明的大图标是 Windows 的"拖动图标管家"画的：
// 鼠标停在哪个窗口上，那个窗口就要告诉管家"拖进来了 / 在动 / 离开了"，管家据此画图标。
// 我们窗口里的拖放是 Chromium 管的，它会一直告诉管家"在动"，所以大图标会盖住宠物的脸。
// 办法：管家在一个程序里只有一个（实测：同一个程序里创建两次，拿到的是同一个），
// 所以我们自己再"拿"一次这个管家，告诉它"已经离开了"，它就不在我们的窗口上画了。
// 等文件拖离宠物，鼠标下面换成别的窗口，那个窗口会重新告诉管家"拖进来了"，图标自己就回来了。

const CLSID_DragDropHelper = { Data1: 0x4657278a, Data2: 0x411b, Data3: 0x11d2, Data4: [0x83, 0x9a, 0x00, 0xc0, 0x4f, 0xd9, 0x18, 0xd0] };
const IID_IDropTargetHelper = { Data1: 0x4657278b, Data2: 0x411b, Data3: 0x11d2, Data4: [0x83, 0x9a, 0x00, 0xc0, 0x4f, 0xd9, 0x18, 0xd0] };
const CO_E_NOTINITIALIZED = 0x800401f0;
let dragHelper; // undefined = 还没试过；null = 拿不到

function dropTargetHelper() {
  if (dragHelper !== undefined) return dragHelper;
  dragHelper = null;
  if (!CoCreateInstance) return null;
  try {
    const out = [null];
    let hr = CoCreateInstance(CLSID_DragDropHelper, null, 1, IID_IDropTargetHelper, out) >>> 0;
    if (hr === CO_E_NOTINITIALIZED) {
      CoInitializeEx(null, 2);
      hr = CoCreateInstance(CLSID_DragDropHelper, null, 1, IID_IDropTargetHelper, out) >>> 0;
    }
    if (hr === 0 && out[0]) dragHelper = out[0];
  } catch (err) {
    console.warn('[native] 拿不到拖动图标管家：', err.message);
  }
  return dragHelper;
}

/** 告诉拖动图标管家"拖着的东西已经离开了"：它就不在我们的窗口上画那个大图标了。返回 Windows 的结果码（0 = 成功） */
function dragImageLeave() {
  const helper = dropTargetHelper();
  if (!helper) return null;
  try {
    const vtable = koffi.decode(helper, 'void *');
    const slots = koffi.decode(vtable, koffi.array('void *', 8)); // IUnknown 三个 + DragEnter、DragLeave……
    return koffi.call(slots[4], HelperDragLeave, helper) >>> 0;
  } catch (err) {
    console.warn('[native] DragLeave 失败：', err.message);
    return null;
  }
}

/** Windows 画拖动图标用的那个窗口（只在拖东西时才有）：{ hwnd, visible }；没有返回 null */
function dragImageWindow() {
  if (!FindWindowW) return null;
  try {
    const hwnd = FindWindowW('SysDragImage', null);
    return hwnd ? { hwnd, visible: !!IsWindowVisible(hwnd) } : null;
  } catch {
    return null;
  }
}

/** 直接把拖动图标的窗口藏起来 / 放出来（上面的办法不管用时的后备） */
function setDragImageWindowVisible(hwnd, visible) {
  if (!ShowWindow || !hwnd) return;
  try {
    ShowWindow(hwnd, visible ? 8 /* SW_SHOWNA：显示，但不抢焦点 */ : 0 /* SW_HIDE */);
  } catch {
    /* 窗口已经没了（拖放结束了）：不用管 */
  }
}

module.exports = {
  sendToBottom,
  rootWindowAt,
  handleOf,
  volumeOf,
  dragImageLeave,
  dragImageWindow,
  setDragImageWindowVisible,
  coversPrimaryScreen,
  foregroundFullscreen,
  visibleWindows,
  windowFrame,
  available: !!SetWindowPos,
};
