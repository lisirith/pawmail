# 爪爪来信 Pawmail · 开发说明

给想从源代码运行、修改爪爪来信的人看。玩家看 [README](README.zh-CN.md) 就够了。
（This page is in Chinese. The player-facing README is available in [English](README.md).）

技术：Electron，纯 JavaScript，没有构建步骤。只支持 Windows。

## 从源代码运行

需要先安装 [Node.js](https://nodejs.org)（20 或更新的版本）。

**最简单：** 双击文件夹里的 `start.bat`（第一次会自动装好需要的组件）。

**或者用命令行：**

```bash
npm install
```

```bash
npm start
```

## 开发用的命令

```bash
npm run dev
```

带调试信息启动，控制台会打印它每次换动作的原因。可以追加的开关：`--x-hud`（屏幕上显示状态面板）、
`--x-newday`（假装现在是明天，马上收到一封新信）、`--x-date=2026-10-31`（跳到那一天，看看过节的样子）、
`--x-feeddry`（喂它吃文件时只演习，不真的放进回收站）、`--x-allclothes`（衣柜里的衣服全部解锁）。
用 `--x-newday`、`--x-date` 时请同时加 `--userdata=某个测试文件夹`，免得弄乱你真正的存档。

```bash
npm run preview
```

不启动 Electron，直接在浏览器里看。宠物：<http://localhost:5177/>（加 `&mail=1` 看它拿着信的样子；
`&festival=halloween&look=ghost&greet=boo` 看过节的样子；`&area=0.3,0.25,0.45,0.6` 看活动范围，四个数是方框的
左、上、宽、高占窗口的比例；`&outfit=capRed,roundGlasses,hoodie` 穿着衣服）。
节日装扮一览：<http://localhost:5177/src/renderer/gallery.html?looks=1>；
信纸窗口：<http://localhost:5177/mail>（加 `?lang=en&species=panda&unread=0` 之类的参数；
`&from=2026-11-20&days=45` 会从那天起模拟 45 天，能看到月报和年度回顾）；
姿势图鉴：<http://localhost:5177/gallery>；衣服一览：<http://localhost:5177/src/renderer/gallery.html?outfits=1>
（`&only=capRed,hoodie` 只看几件，`&poses=站,坐` 只看几个姿势，`&zoom=2` 放大）；衣柜：<http://localhost:5177/mail?view=wardrobe&days=10>；
喂它吃的纸团一览：<http://localhost:5177/src/renderer/gallery.html?food=1>；
和设定图对照：<http://localhost:5177/src/renderer/gallery.html?compare=1>（需要本机的 `img resource/` 文件夹里有设定图，它不在仓库里）。

```bash
npm run letters
```

"来信模拟器"：一口气模拟几十天，把收到的信（包括月报、年度回顾）打印出来，并检查中英文内容有没有缺漏、
衣服的目录和画法对不对得上。改了信的文字后用它检查。可以加参数，比如 `npm run letters -- 80 en panda brief`
（80 天，英文，熊猫；`brief` 表示每天的信只打一行，月报和年度回顾照常完整打印）。

```bash
npm run sim
```

"大脑模拟器"：把宠物的大脑快进跑几个小时，统计它都做了什么，并检查它有没有跑出活动范围。
调整动作的权重之后用它检查效果。`npm run sim -- 6 cat 10 small` 是在一个 720×420 的小方框里模拟。

```bash
npm run selftest
```

自检：真的启动程序，自动检查透明窗口、鼠标穿透、活动范围、爬墙、喂它吃文件、来信、拆信、明信片、换装、月报、
年度回顾、删信、生日、节日、装扮、全屏时躲起来、新手提示、存档等 78 项，结果和截图在 `tools/shots/selftest/`。
用的是单独的测试存档。注意：跑的时候最前面不能是全屏的程序（游戏、全屏视频），否则 Windows 不让窗口重新置顶，
和"置顶"有关的两项会失败。

```bash
npm run snap -- "/src/renderer/gallery.html?looks=1" tools/shots/looks.png 800 1200
```

截图工具：在后台把预览页面截成图片（先开着 `npm run preview`），不依赖窗口有没有被挡住。

```bash
npm run artcheck
```

角色美术检查（先开 `npm run preview`）：检查每种动物的姿势过渡、抱信、节日装扮、每件衣服、被拎起来和爬墙，
查 NaN 坐标、画出画布边缘等问题，输出动作预览到 `tools/shots/art-review/`。不会启动桌宠后台或改动存档。

```bash
node tools/build-festival-dates.js 2025 2060
```

重新生成中国传统节日的日期表（从香港天文台下载官方农历表）。表用到 2060 年，快到了再跑一次往后延。

## 打包和发布

```bash
npm run dist
```

做出别人不用装 Node.js 就能直接用的版本，放在 `dist/` 里（大约要两三分钟）：
`Pawmail-版本号-win-x64.zip` 是免安装版（解压后双击 `Pawmail.exe`），`Pawmail-Setup-版本号.exe` 是安装程序。
配置在 `electron-builder.yml`，版本号在 `package.json` 里改。第一次运行会从网上下载几个小组件。

```bash
npm run selftest:packaged
```

在打包好的程序（`dist/win-unpacked/Pawmail.exe`）上再跑一遍同样的自检。

```bash
npm run promo
```

生成说明页和 itch.io 用的宣传图、动图，放到 `docs/images/`（先开着 `npm run preview`；做动图需要电脑上有 ffmpeg）。
图都是用程序自己的画法现拍的，改了造型、衣服、文字之后重新跑一遍就行。`npm run promo -- hero cover` 只拍这几张。
脚本在 `tools/promo/`。程序图标也是代码画的：`tools/icon-eval.js` → `build/icon.png`（用法见文件开头）。

给 ChatGPT 的"设定草图"（`tools/draft-sheet.js`）：把某只动物现在用代码画的样子排成一张贴纸表
（大坐姿、几个动作、一排表情、拆开的部件），存进 `img resource/`，再交给 ChatGPT 照着以前的设定图改画风。
新动物先用代码画个初稿、出草图，比让 ChatGPT 从零开始画更容易画成我们想要的样子。用法写在文件开头。

## 代码结构

```
src/
  main/            后台（Electron 主进程）：和 Windows 打交道的事都在这里
    main.js          入口：启动、设置、存档、托盘、记录使用情况、全屏时躲起来
    overlay.js       那块透明的全屏窗口 + 鼠标穿透
    mail.js          邮局：什么时候来信、保管信和礼物、信纸窗口
    feed.js          喂它吃文件：检查能不能吃、放进回收站
    wardrobe.js      衣柜：信里捎哪件衣服、衣柜里显示什么（纯计算）
    letters.js       写信：按规则把句子拼成一封信（纯计算，可单独测试）
    tray.js          托盘图标和菜单
    store.js         存档（JSON 文件）
    native.js        直接调用 Windows 的几个小功能（通过 koffi）
    selftest.js      自检
  preload/         后台和画面之间的安全通道（宠物窗口、信纸窗口各一个）
  renderer/        画面。是普通的网页技术，不依赖 Electron
    js/pet/          宠物：怎么画、动作、大脑、特效、衣服、节日装扮
    js/mail/         信纸窗口：读信、信箱、图鉴、衣柜、风景、明信片
    js/ui/           气泡、右键菜单、画活动范围
  shared/
    locales/       界面文字（zh.json / en.json）
    letters/       信的内容：地点和礼物目录（catalog.js），以及中英文的全部句子
    outfits/       衣服：目录（catalog.js：部位、一开始送的、在哪儿容易捡到），以及中英文的名字和信里的句子
    festivals/     节日：节日组和日期规则（catalog.js）、官方农历日期表（dates.json）、节日来信（zh.json / en.json）
tools/             开发工具：预览服务器、来信模拟器、大脑模拟器、截图工具、美术检查、宣传图、农历表生成
build/             打包用的图标
docs/images/       说明页里的图（由 npm run promo 生成）
```

宠物是用代码画的（所以能眨眼、转眼珠、做各种动作，放多大都清楚），所有动物共用一套身体骨架和姿势参数（`pose.js`），
只有配色、耳朵、尾巴、花纹不同（`species/`），所以衣服画一次所有动物都能穿。

## 想加点东西

- 新地点：在 `src/shared/letters/catalog.js` 的 `PLACES` 里加一行，再到 `zh.json`、`en.json` 的 `places` 里各写一段，
  然后运行 `npm run letters` 检查。
- 一种文化的节日（比如日本、韩国）：照着 `src/shared/festivals/catalog.js` 开头的说明做。
- 新衣服：先在 `src/renderer/js/pet/outfits.js` 里画出来，再到 `src/shared/outfits/catalog.js` 登记一行、
  `zh.json`、`en.json` 里写上名字，然后运行 `npm run letters`（会核对三边的编号）和 `npm run artcheck`。
- 新动物：在 `src/renderer/js/pet/species/` 里照着 `cat.js` 写一个，再到 `index.js` 登记。
- 新动作：在 `activities.js` 里加一个函数，再到 `brain.js` 的 `scores()` 里给它一个权重。

面向玩家的文字都要中英文各一份。

## 许可

代码是 MIT 许可证（[LICENSE](LICENSE)）。宠物、衣服、装扮、风景的画法，以及所有信件和界面文字，属于美术和文字，
保留所有权利，具体是哪些文件见 [ASSETS-LICENSE.md](ASSETS-LICENSE.md)。

## 路线图

- [x] 会动的宠物（透明窗口、猫和熊猫、动作、大脑、互动）
- [x] 每日来信、礼物、信箱、图鉴、明信片、起名字、开机启动、月报、年度回顾、删信
- [x] 节日：生日、四组节日、节日来信和限定礼物、节日装扮和动作
- [x] 活动范围、爬墙
- [x] 换装（第一批 16 件 + 第二批 34 件，一共 50 件，随信寄来，所有动物通用）
- [x] 把文件拖给它吃（其实是放进回收站，可以恢复）
- [ ] 打包发布：测试版放到 GitHub 和 itch.io（进行中），之后 Steam
- [ ] 沙滩椅、遮阳伞、小音响、涂鸦
- [ ] 彩蛋：深夜催你睡觉、电量低它也没精神……
- [x] 卡皮巴拉、柴犬、小熊猫、兔子
- [ ] 原创的礼物图标；多显示器
