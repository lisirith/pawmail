// 宣传图脚本共用的小工具。make.js 会把这段代码拼在每个脚本前面，一起放进页面里执行（见 tools/snap.js 的 SNAP_EVAL）。
// 只用到 promo 这一个名字，免得和脚本自己的变量撞名。

const promo = {
  q: new URLSearchParams(location.search),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

  /** 宠物预览页：暂停时间、跳过进场、站到指定位置（0 最左 … 1 最右）、藏起开发用的状态面板 */
  setupPet(xFrac = 0.5) {
    const P = window.__pawmail;
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    P.pause();
    P.run(10);
    P.brain.queue.length = 0;
    P.brain.start('idle');
    P.bubble.hide();
    const A = P.world.area;
    P.pet.x = A.left + (A.right - A.left) * xFrac;
    P.run(0.6);
    return P;
  },

  /**
   * 把"假桌面 + 宠物 + 鼠标箭头"画成一帧（和预览页的样子一样：渐变背景、底下一条任务栏）。
   * decorate(ctx, W, H)：在背景上、宠物下面再画点东西（比如一个假的程序窗口）
   */
  frame(cursor, decorate) {
    const W = document.body.clientWidth;
    const H = document.body.clientHeight;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    // CSS 的 linear-gradient(160deg, …)：渐变线的方向和长度照 CSS 的规则算
    const a = (160 * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const len = Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a));
    const g = ctx.createLinearGradient(W / 2 - (dx * len) / 2, H / 2 - (dy * len) / 2, W / 2 + (dx * len) / 2, H / 2 + (dy * len) / 2);
    g.addColorStop(0, '#7fb2e5');
    g.addColorStop(0.45, '#b9d7f0');
    g.addColorStop(1, '#f6e3c5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(24, 28, 38, 0.88)';
    ctx.fillRect(0, H - 48, W, 48);
    if (decorate) decorate(ctx, W, H);
    // 宠物的小画布：只画活动范围框里面的部分（和真程序一样，框外看不见）
    const arena = document.getElementById('arena').getBoundingClientRect();
    const pet = document.getElementById('pet');
    const r = pet.getBoundingClientRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(arena.left, arena.top, arena.width, arena.height);
    ctx.clip();
    ctx.drawImage(pet, r.left, r.top, r.width, r.height);
    ctx.restore();
    if (cursor) promo.cursor(ctx, cursor.x, cursor.y);
    return c;
  },

  /** 画一个普通的程序窗口（标题栏、三个按钮、几行"字"），左上角在 (x, y) */
  fakeWindow(ctx, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = 'rgba(20, 30, 50, 0.25)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#fbfbfd';
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#eceff4';
    ctx.fillRect(x, y, w, 26);
    ctx.strokeStyle = '#c3c9d3';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1.2;
    const bx = x + w - 20; // 关闭、最大化、最小化（窗口右边可能伸出画面，所以按钮画在看得见的地方也没关系）
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 13); ctx.lineTo(x + 24, y + 13);
    ctx.stroke();
    ctx.fillStyle = '#d5dae2';
    for (let i = 0; i < 9; i++) {
      const lw = (w - 40) * (0.55 + 0.4 * Math.abs(Math.sin(i * 1.7)));
      ctx.fillRect(x + 16, y + 46 + i * 22, Math.min(lw, w - 32), 8);
    }
    ctx.restore();
    return bx;
  },

  /** 画一个普通的鼠标箭头 */
  cursor(ctx, x, y) {
    const pts = [[0, 0], [0, 17], [4.2, 13.2], [7.2, 19.8], [10, 18.6], [7.1, 12.1], [12.4, 12.1]];
    ctx.save();
    ctx.translate(Math.round(x) + 0.5, Math.round(y) + 0.5);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.restore();
  },

  /**
   * 把很多帧拼成一张大图，一行 cols 帧（make.js 再用 ffmpeg 把它切开做成动图）。
   * 最后一行不满的格子用最后一帧补上：动图结尾会停一下，正好。
   */
  sheet(frames, cols) {
    const w = frames[0].width;
    const h = frames[0].height;
    const rows = Math.ceil(frames.length / cols);
    const out = document.createElement('canvas');
    out.width = w * cols;
    out.height = h * rows;
    const ctx = out.getContext('2d');
    for (let i = 0; i < cols * rows; i++) {
      const f = frames[Math.min(i, frames.length - 1)];
      ctx.drawImage(f, (i % cols) * w, Math.floor(i / cols) * h);
    }
    return out.toDataURL('image/png');
  },
};
