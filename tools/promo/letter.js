// 宣传图：信纸窗口（拆开的信、衣柜……）。背景换成和桌面预览一样的渐变，看起来像放在桌面上
//   &pick=outfit   打开一封既有礼物、又捎来一件衣服的信
//   &tall=832      把信纸窗口拉高到这么多像素（预览模式下窗口高度是固定的，信太长时下面的衣服卡片拍不到）
await promo.wait(300);
document.body.style.background = 'linear-gradient(160deg, #7fb2e5 0%, #b9d7f0 45%, #f6e3c5 100%)';
const M = window.__mail;
if (promo.q.get('pick') === 'outfit') {
  const letter = M.state.data.letters.find((l) => l.kind === 'daily' && l.outfit && l.gift);
  if (letter) M.go('letter', letter.id);
}
const tall = Number(promo.q.get('tall') || 0);
if (tall) document.getElementById('card').style.height = `${tall}px`;
await promo.wait(700);
return undefined; // 截整个页面
