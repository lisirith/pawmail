'use strict';
// 来信模拟器：不开程序，一口气模拟几十天，把收到的信（包括月报、年度回顾）打印出来检查。
// 用的是和真实程序完全一样的规则（src/main/letters.js 的 advanceDay）。
//
// 用法：
//   npm run letters                     中文，从今天起 30 天
//   npm run letters -- 80 en            英文，80 天（从 11 月开始的话会跨年，能看到年度回顾）
//   npm run letters -- 30 zh panda      熊猫的口吻（零食不一样）
//   npm run letters -- 60 zh cat brief  每天的信只打印一行，月报和年度回顾照常完整打印
//
// 改了 src/shared/letters/ 里的文字或 src/main/letters.js 里的规则之后，跑一下这个。

const L = require('../src/main/letters');

const days = Number(process.argv[2]) || 30;
const lang = process.argv[3] === 'en' ? 'en' : 'zh';
const species = process.argv[4] === 'panda' ? 'panda' : 'cat';
const brief = process.argv[5] === 'brief';
const name = lang === 'zh' ? '年糕' : 'Mochi';

const problems = L.validateContent();

// 假装的使用情况：大多数日子正常，偶尔熬夜、偶尔几天不来、偶尔把它扔来扔去
let seed = 7;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const DAY_MS = 86400000;
const start = new Date();
start.setHours(10, 0, 0, 0);
const mail = { installId: 'simulator', letters: [], gifts: {}, lastDay: null, streak: 0, bestStreak: 0, welcomed: false, monthly: {} };
const usage = {};
const stats = { daily: 0, gifts: 0, rarity: { common: 0, rare: 0, legendary: 0, festival: 0 }, places: {}, remarks: {}, reports: [], festivals: [] };
// 假装你已经填过生日和节日：中文用户过中华传统节日 + 西方节日，英文用户过西方节日 + 美国节日
const profile = {
  birthday: '03-14',
  cultures: lang === 'zh' ? ['chinese', 'cnPublic', 'western'] : ['western', 'us'],
  asked: true,
};
let leftovers = 0;

function print(letter) {
  const r = L.renderLetter(letter, lang, { name, species });
  const texts = [r.title, ...r.lines, r.sign, r.gift ? r.gift.line : ''].concat((r.stats || []).map((s) => `${s.value} ${s.label}`));
  if (texts.some((t) => /\{\w+\}/.test(t))) leftovers += 1;
  if (brief && letter.kind === 'daily') {
    console.log(`  ${r.dateText}  ${r.title}${r.gift ? ` ${r.gift.emoji}` : ''}`);
    return;
  }
  const banner = letter.kind === 'monthly' || letter.kind === 'yearly' ? '★★★' : letter.kind === 'festival' ? '🎉' : '──';
  console.log(`\n${banner} ${r.dateText} ── ${r.title} ${banner}`);
  if (r.stats) console.log(`  [${r.stats.map((s) => `${s.emoji} ${s.value} ${s.label}`).join(' | ')}]`);
  for (const line of r.lines) console.log(`  ${line}`);
  if (r.gift) console.log(`  ${r.gift.line} ${r.gift.emoji}${r.gift.rarity !== 'common' ? `（${r.gift.rarityLabel}）` : ''}`);
  console.log(`  ${r.sign}`);
}

for (let i = 0; i <= days; i++) {
  const now = start.getTime() + i * DAY_MS;
  const day = L.logicalDay(now);
  if (i > 0 && rnd() < 0.1) continue; // 这天没开电脑

  // 今天的使用情况（明天的信会提到）
  const late = rnd() < 0.3;
  const first = new Date(now);
  first.setHours(rnd() < 0.1 ? 6 : 9, Math.floor(rnd() * 59), 0, 0);
  const last = new Date(now);
  if (late) {
    last.setDate(last.getDate() + 1);
    last.setHours(1, 5 + Math.floor(rnd() * 50), 0, 0);
  } else {
    last.setHours(22, Math.floor(rnd() * 59), 0, 0);
  }

  const added = L.advanceDay(mail, { day, now, usage, profile });
  usage[day] = {
    first: first.getTime(),
    last: last.getTime(),
    activeMin: Math.floor(60 + rnd() * 560),
    pets: rnd() < 0.4 ? Math.floor(rnd() * 14) : 0,
    pokes: rnd() < 0.3 ? Math.floor(rnd() * 16) : 0,
    throws: rnd() < 0.25 ? Math.floor(rnd() * 7) : 0,
    dizzies: rnd() < 0.1 ? 1 : 0,
  };

  for (const letter of added) {
    print(letter);
    // 假装你每天都把信拆了：礼物进图鉴
    letter.opened = true;
    if (letter.gift && L.GIFTS[letter.gift]) {
      const have = mail.gifts[letter.gift];
      mail.gifts[letter.gift] = { count: (have ? have.count : 0) + 1, firstDay: have ? have.firstDay : letter.day };
    }
    if (letter.kind === 'daily') {
      stats.daily += 1;
      stats.places[letter.place] = (stats.places[letter.place] || 0) + 1;
      stats.remarks[letter.remark.key] = (stats.remarks[letter.remark.key] || 0) + 1;
      if (letter.gift) {
        stats.gifts += 1;
        stats.rarity[L.GIFTS[letter.gift].rarity] += 1;
      }
    } else if (letter.kind === 'festival') {
      stats.festivals.push(`${letter.festival}(${letter.day.slice(5)})`);
      stats.rarity.festival += 1;
    } else if (letter.kind !== 'welcome') {
      stats.reports.push(letter.id);
    }
  }
}

console.log('\n════════ 统计 ════════');
console.log(`一共 ${stats.daily} 封日常来信；其中 ${stats.gifts} 封有礼物（普通 ${stats.rarity.common}，稀有 ${stats.rarity.rare}，传说 ${stats.rarity.legendary}）`);
console.log(`节日来信：${stats.festivals.join('、') || '（这段时间没有节日）'}`);
console.log(`月报 / 年度回顾：${stats.reports.join('、') || '（这段时间没有跨月）'}`);
const regular = Object.keys(L.GIFTS).filter((id) => L.GIFTS[id].rarity !== 'festival');
console.log(`图鉴进度：${regular.filter((id) => mail.gifts[id]).length} / ${regular.length}（另有节日限定 ${stats.rarity.festival} 件）`);
console.log(`去过 ${Object.keys(stats.places).length} 个不同的地方；去得最多的：${Object.entries(stats.places).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join('、')}`);
console.log(`"关于你"的话：${Object.entries(stats.remarks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('、')}`);
console.log(`存档里信件部分的大小：约 ${(JSON.stringify(mail.letters, null, 2).length / 1024).toFixed(0)} KB（${mail.letters.length} 封）`);
console.log(leftovers ? `⚠ 有 ${leftovers} 封信里留着没填上的 {占位符}` : '没有漏填的占位符');
console.log(problems.length ? `⚠ 内容检查发现问题：\n  ${problems.join('\n  ')}` : '中英文内容检查通过');
process.exitCode = leftovers || problems.length ? 1 : 0;
