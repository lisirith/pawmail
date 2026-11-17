// 宣传图：把一封信存成的明信片（原图 1080×1440，这里缩成一半宽，放在说明页里够用了）
await promo.wait(300);
const M = window.__mail;
const letter = M.state.data.letters.find((l) => l.kind === 'daily' && l.outfit && l.gift);
if (letter) M.go('letter', letter.id);
await promo.wait(400);
const img = new Image();
img.src = M.postcard();
await img.decode();
const c = document.createElement('canvas');
c.width = 540;
c.height = Math.round((540 * img.height) / img.width);
c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
return c.toDataURL('image/png');
