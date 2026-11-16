'use strict';
// 在"打包好的程序"上跑一遍自检（和 npm run selftest 是同一套检查，只是跑的是 dist/ 里的 Pawmail.exe）。
// 先 npm run dist 打包，再运行：node tools/selftest-packaged.js
// 用的是单独的测试存档（tools/shots/pkg-userdata），不会碰你真正的存档。
//
// 为什么要用这个脚本启动，而不是在 PowerShell 里直接 Start-Process：
// 实测用 Start-Process 加输出重定向启动时，窗口"始终在最前面"会失效（开发版也一样），
// 自检里和置顶有关的几项就会失败。这里的启动方式和 npm run selftest 一样，结果才可信。

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const exe = path.join(root, 'dist', 'win-unpacked', 'Pawmail.exe');
const out = path.join(root, 'tools', 'shots', 'pkg-selftest');
const userData = path.join(root, 'tools', 'shots', 'pkg-userdata');

if (!fs.existsSync(exe)) {
  console.error('还没有打包：先运行 npm run dist');
  process.exit(1);
}
fs.rmSync(path.join(out, 'result.json'), { force: true });
const run = spawnSync(exe, [`--selftest=${out}`, `--userdata=${userData}`], { cwd: root, stdio: 'inherit', windowsHide: false });
if (run.error) {
  console.error('启动失败：', run.error.message);
  process.exit(1);
}
let result = null;
try {
  result = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
} catch {
  console.error('没有拿到自检结果（程序可能没跑完）');
  process.exit(1);
}
for (const r of result.results) if (!r.ok) console.log(`FAIL  ${r.name}  ${JSON.stringify(r.detail)}`);
console.log(`打包版自检：${result.passed}/${result.total} 项通过`);
process.exit(result.passed === result.total ? 0 : 1);
