// 动图：走到活动范围的右边，两只爪子轮流往上爬，在上面东张西望一会儿，再蹬墙跳下来。
// 活动范围的右边正好挨着一个（假的）程序窗口，看起来就是扒着窗口边往上爬——
// 要是直接爬屏幕的边，它会被屏幕边切掉半个身子，看不出在干什么。
// 预览页要带 &area=0,0,<比例>,1，让活动范围的右边停在窗口左边。
const P = promo.setupPet(0.72);
const FPS = Number(promo.q.get('fps') || 15);
const S = P.world.scale;
const wallX = P.world.area.right;
const frames = [];
const decorate = (ctx, W, H) => promo.fakeWindow(ctx, wallX, 22, W - wallX + 30, H - 48 - 22);
const step = () => {
  P.run(1 / FPS);
  frames.push(promo.frame(null, decorate));
};

P.brain.start('climb', { side: 1, goal: 140 * S });
while (P.brain.name === 'climb' && P.brain.current.phase !== 'cling' && frames.length < 600) step();
if (P.brain.name === 'climb') P.brain.current.clingFor = 99; // 别自己跳下来，等我们拍够了再说
for (let i = 0; i < 1.6 * FPS; i++) step();
if (P.brain.name === 'climb') P.brain.current.next('leap');
for (let i = 0; i < 1.8 * FPS; i++) step();
return promo.sheet(frames, Number(promo.q.get('cols') || 12));
