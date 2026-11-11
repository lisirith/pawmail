'use strict';
// 来信模拟器：不开程序，一口气生成几十天的信，打印出来检查。
// 用来看：文字读着顺不顺？会不会老去同一个地方、老说同一句话？礼物多久来一次？
//
// 用法：
//   npm run letters                  中文，从今天起 30 天
//   npm run letters -- 45 en         英文，45 天
//   npm run letters -- 30 zh panda   熊猫的口吻（零食不一样）
//
// 改了 src/shared/letters/ 里的文字或 src/main/letters.js 里的规则之后，跑一下这个。

const L = require('../src/main/letters');

const days = Number(process.argv[2]) || 30;
const lang = process.argv[3] === 'en' ? 'en' : 'zh';
const species = process.argv[4] === 'panda' ? 'panda' : 'cat';

const problems = L.validateContent();

// 假装的使用情况：大多数日子正常，偶尔熬夜、偶尔几天不来、偶尔把它扔来扔去
let seed = 7;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const start = new Date();
start.setHours(9, 30, 0, 0);
const usage = {};
const history = [];
const owned = {};
let lastDay = null;
let streak = 0;
let leftovers = 0;
const stats = { gifts: 0, rarity: { common: 0, rare: 0, legendary: 0 }, places: {}, remarks: {} };

history.push(L.welcomeLetter({ day: L.logicalDay(start.getTime()), now: start.getTime() }));
owned.pawprint = { count: 1 };

const print = (r) => {
  console.log(`\n── ${r.dateText} ── ${r.title} ──`);
  for (const line of r.lines) console.log(`  ${line}`);
  if (r.gift) console.log(`  ${r.gift.line} ${r.gift.emoji}${r.gift.rarity !== 'common' ? `（${r.gift.rarityLabel}）` : ''}`);
  console.log(`  ${r.sign}`);
};
print(L.renderLetter(history[0], lang, { name: lang === 'zh' ? '年糕' : 'Mochi', species }));
lastDay = history[0].day;
streak = 1;

for (let i = 1; i <= days; i++) {
  const now = new Date(start.getTime() + i * 86400000);
  const day = L.logicalDay(now.getTime());
  if (rnd() < 0.1) continue; // 这天没开电脑

  // 昨天（上一次见面那天）的使用情况
  const y = new Date(now.getTime() - 86400000);
  const late = rnd() < 0.3;
  const first = new Date(y);
  first.setHours(rnd() < 0.1 ? 6 : 9, Math.floor(rnd() * 59), 0, 0);
  const last = new Date(y);
  if (late) {
    last.setDate(last.getDate() + 1);
    last.setHours(1, 5 + Math.floor(rnd() * 50), 0, 0);
  } else {
    last.setHours(22, Math.floor(rnd() * 59), 0, 0);
  }
  if (lastDay === L.addDays(day, -1)) {
    usage[lastDay] = {
      first: first.getTime(),
      last: last.getTime(),
      activeMin: Math.floor(60 + rnd() * 560),
      pets: rnd() < 0.4 ? Math.floor(rnd() * 14) : 0,
      pokes: rnd() < 0.3 ? Math.floor(rnd() * 16) : 0,
      throws: rnd() < 0.25 ? Math.floor(rnd() * 7) : 0,
      dizzies: rnd() < 0.1 ? 1 : 0,
    };
  }

  streak = lastDay && L.dayDiff(lastDay, day) === 1 ? streak + 1 : 1;
  const letter = L.generateLetter({ day, now: now.getTime(), installId: 'simulator', history, owned, usage, lastDay, streak });
  history.push(letter);
  lastDay = day;

  const r = L.renderLetter(letter, lang, { name: lang === 'zh' ? '年糕' : 'Mochi', species });
  print(r);
  if (r.lines.concat(r.sign, r.gift ? r.gift.line : '').some((t) => /\{\w+\}/.test(t))) leftovers += 1;
  stats.places[letter.place] = (stats.places[letter.place] || 0) + 1;
  stats.remarks[letter.remark.key] = (stats.remarks[letter.remark.key] || 0) + 1;
  if (letter.gift) {
    stats.gifts += 1;
    stats.rarity[L.GIFTS[letter.gift].rarity] += 1;
    owned[letter.gift] = { count: (owned[letter.gift] ? owned[letter.gift].count : 0) + 1 };
  }
}

const letters = history.length - 1;
console.log('\n════════ 统计 ════════');
console.log(`一共 ${letters} 封日常来信；其中 ${stats.gifts} 封有礼物（普通 ${stats.rarity.common}，稀有 ${stats.rarity.rare}，传说 ${stats.rarity.legendary}）`);
console.log(`图鉴进度：${Object.keys(owned).length} / ${Object.keys(L.GIFTS).length}`);
console.log(`去过 ${Object.keys(stats.places).length} 个不同的地方；去得最多的：${Object.entries(stats.places).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、')}`);
console.log(`"关于你"的话：${Object.entries(stats.remarks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('、')}`);
console.log(leftovers ? `⚠ 有 ${leftovers} 封信里留着没填上的 {占位符}` : '没有漏填的占位符');
console.log(problems.length ? `⚠ 内容检查发现问题：\n  ${problems.join('\n  ')}` : '中英文内容检查通过');
process.exitCode = leftovers || problems.length ? 1 : 0;
