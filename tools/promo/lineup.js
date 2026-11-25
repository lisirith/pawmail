// 宣传图：九只动物站成一排（不写字，中英文说明页共用一张）。
// 从左到右：卡皮巴拉（头顶橘子发呆）、熊猫（坐着抱爪）、橘猫（抱着信）、狐狸（站着翘尾巴笑）、兔子（坐着抱胡萝卜）、
// 柴犬（坐着眯眼笑）、水獭（搓手手）、企鹅（张开小翅膀）、小熊猫（举起双手）
const { getSpecies } = await import('/src/renderer/js/pet/species/index.js');
const { makePose } = await import('/src/renderer/js/pet/pose.js');
const { drawPet } = await import('/src/renderer/js/pet/draw.js');

const W = 1620;
const H = 360;
const GROUND = 318;
const c = document.createElement('canvas');
c.width = W;
c.height = H;
const ctx = c.getContext('2d');

// 背景：和封面一样的天空色渐变，底下一片暖色的"地面"
const sky = ctx.createLinearGradient(0, 0, 0, H);
sky.addColorStop(0, '#8dbbe8');
sky.addColorStop(0.6, '#c9e0f3');
sky.addColorStop(1, '#f6e3c5');
ctx.fillStyle = sky;
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#f3dcb8';
ctx.fillRect(0, GROUND, W, H - GROUND);
ctx.fillStyle = 'rgba(91, 58, 36, 0.25)';
ctx.fillRect(0, GROUND, W, 2);

const draw = (id, x, pose, opts = {}) => {
  ctx.save();
  ctx.translate(x, GROUND);
  ctx.scale(1.5, 1.5);
  drawPet(ctx, getSpecies(id), makePose(pose), { time: 0.3, ...opts });
  ctx.restore();
};
const step = W / 9;
draw('capybara', step * 0.5, { crouch: 1, prop: 1, eyeL: 0.45, eyeR: 0.45, blush: 0.6, lookX: 0.15 });
draw('panda', step * 1.5, { crouch: 1, mouth: 'smile', mouthOpen: 0.5, eyes: 'happy', blush: 0.9, tailCurl: 0.35 });
draw('cat', step * 2.5, { armL: -0.75, armR: -0.75, blush: 0.8, mouth: 'smile', mouthOpen: 0.3, tailSide: -1 }, { carry: true, carryLift: 0 });
draw('fox', step * 3.5, { eyes: 'happy', mouth: 'smile', mouthOpen: 0.6, blush: 0.9, tailCurl: 1, tail: 0.3, headTilt: 0.08, lookX: 0.1 });
draw('bunny', step * 4.5, { crouch: 1, snack: 1, armL: -0.75, armR: -0.75, mouth: 'smile', mouthOpen: 0.6, blush: 1, lookX: -0.15, tailSide: -1 });
draw('shiba', step * 5.5, { crouch: 1, eyes: 'happy', mouth: 'smile', mouthOpen: 1, blush: 0.9, tailCurl: 0.4, lookX: -0.15 });
draw('otter', step * 6.5, { crouch: 1, armL: -1.33, armR: -1.57, eyes: 'happy', mouth: 'smile', mouthOpen: 0.4, blush: 1, headTilt: -0.06 });
draw('penguin', step * 7.5, { armL: 1.1, armR: 1.1, eyes: 'happy', mouth: 'o', blush: 0.9, lift: 2 });
draw('redpanda', step * 8.5, { armL: 1.9, armR: 1.9, mouth: 'smile', mouthOpen: 0.8, eyes: 'happy', blush: 0.9, lift: 3, tailCurl: 1, lookX: -0.2 });
return c.toDataURL('image/png');
