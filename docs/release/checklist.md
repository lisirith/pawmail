# 发布清单（第三步：上传）

上传要用你自己的 GitHub 和 itch.io 账号，按下面的顺序来。打 ☐ 的是要你决定或者亲手做的。

## 一、上传之前（Claude 做，需要你给一样东西）

- ☐ 把你的 GitHub 匿名邮箱告诉 Claude：GitHub 网站右上角头像 → Settings → Emails，
  勾上"Keep my email addresses private"，下面会显示一个"数字+用户名@users.noreply.github.com"的地址。
- 用这个地址改写全部保存记录的作者邮箱（改之前先备份），以后的保存也用它。
- `CLAUDE.md` 从 Git 记录里拿掉，只留在你电脑上（它写着你电脑的用户名、路径和关于你的描述）。
- 检查一遍：仓库里搜不到你的个人邮箱、用户名路径。
- 用最新代码重新打包（`npm run dist`），在打好的包上跑一遍自检（`npm run selftest:packaged`）。

## 二、GitHub

- ☐ 在 GitHub 上新建一个公开仓库（名字建议 `pawmail`），**不要**勾选"添加 README / LICENSE"（我们已经有了）。
- 把代码推上去（Claude 可以用 GitHub Desktop 自带的 Git 推，或者你在 GitHub Desktop 里点"Publish"）。
- ☐ 建 Release：文字见 `docs/release/github-release.md`，附上 `dist/` 里的安装程序和压缩包，勾选 pre-release。
- 仓库首页右边的 About 里填一句介绍，Topics 可以加：`desktop-pet`、`virtual-pet`、`electron`、`windows`、`cute`。

## 三、itch.io

- ☐ 注册或登录 itch.io → Upload new project。
- Kind of project：**Downloadable**；Classification：**Games**（桌面宠物一般放这里），Genre：**Simulation**。
- Pricing：**No payments**（或者"Donate"，允许别人自愿打赏）。
- Uploads：传安装程序和压缩包，平台都勾 **Windows**。
- 文字：见 `docs/release/itch-page.md`；封面 `docs/images/cover.png`，截图和动图在 `docs/images/`。
- Tags 可以填：`desktop-pet`、`cute`、`cozy`、`virtual-pet`、`idle`、`letters`。
- ☐ **AI 生成内容的声明**：itch.io（以后 Steam 也是）会问项目里有没有用生成式 AI 做的内容。
  爪爪来信的设定图是 ChatGPT 生成的，代码和文字是在 AI（Claude、ChatGPT）的帮助下写的。
  怎么填由你决定；照实勾选是最稳妥的，被发现没声明可能会被下架。
- ☐ 先存成 Draft，自己从页面上下载一次、装一次，没问题再改成 Public。

## 四、发布之后

- 把 itch.io 的链接加到 README（中英文）里。
- 发到你想发的地方（小红书、朋友圈……），带上 `pickup.gif`、`climb.gif` 或一张明信片。
