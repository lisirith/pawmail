// 宣传图：桌面上的它把信举过头顶，冒出"有你的信！"（预览页要带 ?mail=1，手里才有信）
const P = promo.setupPet(0.5);
P.brain.start('showMail', { say: true });
P.run(0.9);
return undefined; // 不返回图片：截图工具直接把整个页面截下来（气泡是网页元素，不在宠物的画布里）
