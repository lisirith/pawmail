// itch.io 的封面图（630×500，itch.io 要求的尺寸）：名字 + 一句话介绍 + 抱着信的猫和挥手的熊猫
const { getSpecies } = await import('/src/renderer/js/pet/species/index.js');
const { makePose } = await import('/src/renderer/js/pet/pose.js');
const { drawPet } = await import('/src/renderer/js/pet/draw.js');

const W = 630;
const H = 500;
const c = document.createElement('canvas');
c.width = W;
c.height = H;
const ctx = c.getContext('2d');

// 背景：和桌面预览一样的天空色渐变，底下一片暖色的"地面"
const sky = ctx.createLinearGradient(0, 0, 0, H);
sky.addColorStop(0, '#8dbbe8');
sky.addColorStop(0.55, '#c9e0f3');
sky.addColorStop(1, '#f6e3c5');
ctx.fillStyle = sky;
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#f3dcb8';
ctx.fillRect(0, 440, W, H - 440);
ctx.fillStyle = 'rgba(91, 58, 36, 0.25)';
ctx.fillRect(0, 440, W, 2);

// 名字和一句话介绍
ctx.textAlign = 'center';
ctx.fillStyle = '#5b3a24';
ctx.font = "800 70px 'Segoe UI', sans-serif";
ctx.fillText('Pawmail', W / 2, 100);
ctx.font = "700 34px 'Microsoft YaHei', sans-serif";
ctx.fillText('爪爪来信', W / 2, 148);
ctx.fillStyle = '#6f5444';
ctx.font = "500 19px 'Segoe UI', sans-serif";
ctx.fillText('A desktop pet that writes you a letter every day', W / 2, 186);
ctx.font = "500 17px 'Microsoft YaHei', sans-serif";
ctx.fillText('每天给你写一封信的桌面小宠物', W / 2, 212);

// 两只宠物站在地面上：猫抱着信，熊猫挥手
const draw = (id, x, scale, pose, opts) => {
  ctx.save();
  ctx.translate(x, 440);
  ctx.scale(scale, scale);
  drawPet(ctx, getSpecies(id), makePose(pose), { time: 0.3, ...opts });
  ctx.restore();
};
draw('cat', 215, 1.65, { armL: -0.75, armR: -0.75, blush: 0.8, mouth: 'smile', mouthOpen: 0.3, lookX: 0.25, tailSide: -1 }, { carry: true, carryLift: 0 });
draw('panda', 425, 1.65, { armR: 1.6, mouth: 'smile', mouthOpen: 0.45, eyes: 'happy', blush: 0.9, headTilt: 0.08, lookX: -0.2 }, {});
return c.toDataURL('image/png');
