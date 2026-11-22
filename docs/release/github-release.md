# GitHub 发布页文字（v0.2.0）

在 GitHub 上建 Release 时用：Tag 填 `v0.2.0`，标题填下面的"Title"，正文粘贴"Notes"，
再把 `dist/` 里的 `Pawmail-Setup-0.2.0.exe` 和 `Pawmail-0.2.0-win-x64.zip` 拖进附件，勾选"This is a pre-release"。
（以后发新版本：把版本号和"What's new / 新内容"换掉，其余照抄。）

---

## Title

Pawmail 0.2.0 beta · 爪爪来信 0.2.0 测试版

## Notes

**What's new**

- **Three new pets: a capybara, a Shiba Inu and a red panda.** Each has its own temper. The capybara takes things slowly (sit it down long enough and an orange may land on its head). The Shiba has a mind of its own: now and then it flops down mid-walk and refuses to budge. The red panda is a bit timid but loves heights; startle it and it stands up tall with its arms raised to look fierce. Pick one from the right-click menu (*Animal*).
- **It can perch on your windows.** Drop the pet on top of a window and it stands there: it strolls along the top, naps, peeks over the edge, and rides along when you drag the window. Close, minimize or cover the window and down it goes. Sometimes it gets up there by itself, hopping onto a low window or climbing the side of one that reaches down to the taskbar.
  Works in *On top* (*Always on top*) mode. You can turn it off in the menu (*Perch on windows*). It only looks at where your windows are, never at their titles or which program they belong to.
- **Help & feedback** in the tray menu: check for a new version (opens this page in your browser), report a problem, open the log folder.
- A small log file (`%APPDATA%\Pawmail\logs`) you can attach to a bug report. Your Windows user name is replaced with `~`, and the log is never sent anywhere.
- Taking a screenshot with Win+Shift+S no longer makes the pet vanish for a few seconds.
- Uninstalling now also removes the start-at-login entry.

**Download one of these:**

- `Pawmail-Setup-0.2.0.exe`: installer (installs for your account, no admin needed)
- `Pawmail-0.2.0-win-x64.zip`: no install; unzip and run `Pawmail.exe`

**Updating from 0.1.0:** quit the running pet first (right-click it → *Quit Pawmail*), then run the new installer, or unzip over the old folder. Your letters, gifts and clothes carry over.

Windows 10 / 11, 64-bit. The first time you run it, Windows may show *"Windows protected your PC"*: click **More info → Run anyway**. Pawmail isn't code-signed yet.

Found a bug? Please [open an issue](../../issues) and attach `pawmail.log` (tray icon → *Help & feedback → Open log folder*).

---

**新内容**

- **三只新动物：卡皮巴拉、柴犬、小熊猫。** 各有各的脾气：卡皮巴拉慢悠悠的，坐着发呆时头顶偶尔会落下一个橘子；柴犬很有主见，散步散到一半会突然趴下，赖着不走；小熊猫胆子小、最爱爬高，被吓到会站起来举起双手"吓唬"你。在右键菜单的"动物"里换。
- **它会站到窗口上了。** 把它放到某个窗口的顶上，它就站在那儿：在上面溜达、打盹、探头往下看；你拖动那个窗口，它跟着一起走。窗口关掉、最小化或者被挡住，它就掉下来。它有时也会自己上去：跳上不太高的窗口，或者顺着一直伸到任务栏的窗口侧边爬上去。
  显示方式是"最前面"（始终在最前面）时才有。不想要的话，可以在菜单里关掉（*站到窗口上*）。它只看窗口在哪儿，不看窗口标题，也不看是哪个程序的窗口。
- 托盘菜单里多了 **帮助与反馈**：检查新版本（用浏览器打开这个页面）、反馈问题、打开日志文件夹。
- 多了一份小日志（`%APPDATA%\Pawmail\logs`），反馈问题时可以附上。日志里你的 Windows 用户名会换成 `~`，也不会被发到任何地方。
- 用 Win+Shift+S 截图时，宠物不会再消失几秒钟了。
- 卸载时会一起删掉开机启动项。

**二选一下载：**

- `Pawmail-Setup-0.2.0.exe`：安装程序（只装给你自己，不需要管理员权限）
- `Pawmail-0.2.0-win-x64.zip`：免安装，解压后运行 `Pawmail.exe`

**从 0.1.0 更新：** 先退出正在运行的它（右键 → *退出爪爪来信*），再运行新的安装程序，或者把压缩包解压覆盖原来的文件夹。信、礼物和衣服都还在。

支持 Windows 10 / 11（64 位）。第一次运行时 Windows 可能提示"Windows 已保护你的电脑"，点 **更多信息 → 仍要运行**（暂时还没有代码签名）。

发现问题？欢迎[提 issue](../../issues)，附上 `pawmail.log` 会很有帮助（托盘图标 → *帮助与反馈 → 打开日志文件夹*）。
