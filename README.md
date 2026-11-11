# 爪爪来信 Pawmail 🐾

一只住在你电脑桌面上的小动物。它会自己散步、发呆、打瞌睡、追你的鼠标；
以后，它还会在你每天开机时给你写一封信，讲讲它"昨天"去了哪里，并随信附上一件小礼物。

*A tiny pet that lives on your desktop. It wanders, naps and chases your cursor — and (soon) writes you a letter every day about where it went "yesterday", with a little gift attached.*

> 目前是早期开发版（阶段 1：会动的宠物）。只支持 Windows。
> *Early development build (Phase 1: a living pet). Windows only for now.*

## 现在能做什么

- 🐱 橘猫和 🐼 熊猫，随时可以切换
- 站在任务栏上走来走去；不在它身上时，鼠标可以直接点到它后面的窗口
- 会呼吸、眨眼、抖耳朵、摇尾巴，眼睛会跟着你的鼠标
- 由"精力、无聊、想被关注、心情"驱动，自己决定做什么，不会来回重复固定的几个动作
- 困了会打哈欠、打瞌睡、趴下睡觉；深夜睡得更多；你离开电脑它也会睡
- 鼠标在它身上来回蹭 = 摸头（冒爱心）；点一下 = 戳它；双击 = 它会开心地蹦；戳太多次它会生气
- 可以把它拎起来、甩一甩、扔出去（甩得太狠会晕）
- 鼠标在它附近晃，它可能会扑过来抓
- 中文 / English

## 怎么运行

需要先安装 [Node.js](https://nodejs.org)（20 或更新的版本）。

**最简单：** 双击文件夹里的 `start.bat`。

**或者用命令行：**

```bash
npm install
```

```bash
npm start
```

## 怎么和它玩

| 操作 | 效果 |
|---|---|
| 右键点它 | 打开菜单：换动物、显示方式、大小、语言、哄睡、退出 |
| 鼠标在它身上来回移动 | 摸头 |
| 左键点一下 | 戳它一下 |
| 双击 | 它开心地蹦两下 |
| 按住拖动 | 把它拎起来；松手会掉下来，带着速度松手可以把它扔出去 |
| 托盘图标（屏幕右下角） | 同样的菜单，另外还有"叫它回来" |

找不到托盘图标？Windows 11 会把新图标收进任务栏右边的 `^` 小箭头里。

## 隐私

- 所有数据只保存在你自己的电脑上（`%APPDATA%\Pawmail\save.json`），不联网、不上传。
- 它只知道"你现在有没有在用电脑"（为了你离开时去睡觉，以及以后信里那句"你昨天三点才睡哦"）。
  它**不会**记录你按了什么键、打开了什么程序或网页。

## 开发

```bash
npm run dev
```

带调试信息启动。加 `-- --x-hud` 可以在屏幕上显示状态面板。

```bash
npm run preview
```

不启动 Electron，直接在浏览器里看宠物（<http://localhost:5177/>），改画面时最方便。
姿势图鉴在 <http://localhost:5177/gallery>。

```bash
npm run sim
```

"大脑模拟器"：把宠物的大脑快进跑几个小时，统计它都做了什么。调整动作的权重之后用它检查效果。

```bash
npm run selftest
```

自检：自动检查透明窗口、鼠标穿透、存档等关键功能，结果和截图在 `tools/shots/selftest/`。

### 代码结构

```
src/
  main/            后台（Electron 主进程）：和 Windows 打交道的事都在这里
    main.js          入口：启动、设置、存档、托盘
    overlay.js       那块透明的全屏窗口 + 鼠标穿透
    tray.js          托盘图标和菜单
    store.js         存档（JSON 文件）
    native.js        直接调用 Windows 的几个小功能
    selftest.js      自检
  preload/         后台和画面之间的安全通道
  renderer/        画面：宠物本身。是普通的网页技术，不依赖 Electron
    js/pet/
      draw.js        怎么画（所有动物共用的身体）
      species/       每种动物：配色 + 耳朵、尾巴、花纹
      pose.js        姿势参数
      pet.js         位置、物理、呼吸眨眼等小动作
      activities.js  所有动作（散步、睡觉、追鼠标……）
      brain.js       大脑：决定下一步做什么
      fx.js          爱心、Zzz 等小特效
    js/ui/           气泡、右键菜单
  shared/locales/  所有文字（zh.json / en.json）
tools/             开发工具：预览服务器、大脑模拟器
```

想加一种新动物：在 `src/renderer/js/pet/species/` 里照着 `cat.js` 写一个，再到 `index.js` 登记。
想加一个新动作：在 `activities.js` 里加一个函数，再到 `brain.js` 的 `scores()` 里给它一个权重。

## 路线图

- [x] 阶段 1：会动的宠物（透明窗口、猫和熊猫、动作、大脑、互动）
- [ ] 阶段 2：每日来信、礼物、信箱、明信片分享
- [ ] 阶段 3：换装（帽子、衣服……所有动物通用）
- [ ] 阶段 4：把文件拖给它吃（其实是放进回收站，可以恢复）
- [ ] 阶段 5：沙滩椅、遮阳伞、小音响、涂鸦
- [ ] 阶段 6：彩蛋（节日、深夜催你睡觉、电量低它也没精神……）
- [ ] 阶段 7：打包发布（安装程序、开机自启、itch.io / Steam）

## 已知情况

- 用 Electron 制作，内存占用大约 350–400 MB。
- 目前只在主显示器上活动。
- 美术是用代码画的占位图，以后会换。
