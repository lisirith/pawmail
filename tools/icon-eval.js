// 画程序图标（安装包、Pawmail.exe、任务栏上看到的那个）：橘猫的头，透明背景，512×512。
// 图标和宠物本身用的是同一份画法（drawHeadOnly），所以以后改了造型，重新生成一次图标就跟着变。
//
// 怎么生成（先开着预览服务器 npm run preview；PowerShell 里）：
//   $env:SNAP_EVAL = [IO.File]::ReadAllText('tools/icon-eval.js')
//   npm run snap -- "/src/renderer/gallery.html?bg=none" build/icon.png 600 600
//   $env:SNAP_EVAL = $null
// 这段代码是在页面里执行的（见 tools/snap.js），最后返回一张图片，截图工具把它存成文件。
// 打包工具（electron-builder）会自己把这张 PNG 转成 Windows 要的 .ico（里面有 16～256 各种大小）。

const { getSpecies } = await import('/src/renderer/js/pet/species/index.js');
const { makePose } = await import('/src/renderer/js/pet/pose.js');
const { drawHeadOnly } = await import('/src/renderer/js/pet/draw.js');

const SIZE = 512;
const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
const ctx = canvas.getContext('2d');
const sp = getSpecies('cat');
// 头（连耳朵）差不多撑满整张图，四周留一点边；耳朵往上多出一截，所以整体往下挪一点才居中
const k = SIZE / (2 * (sp.head.rx + 6));
ctx.translate(SIZE / 2, SIZE / 2 + sp.earReach * 0.5 * k);
ctx.scale(k, k);
drawHeadOnly(ctx, sp, makePose({ blush: 0.7, mouth: 'smile', mouthOpen: 0.25 }));
return canvas.toDataURL('image/png');
