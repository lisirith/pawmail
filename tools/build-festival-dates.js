'use strict';
// 生成中国传统节日的日期表：src/shared/festivals/dates.json
//
// 为什么要这张表：电脑自带的农历计算（Intl 的 chinese 日历）偶尔会差一天，
// 比如它把 2027 年春节算成 2 月 7 日，实际是 2 月 6 日。所以节日日期用香港天文台公布的官方农历对照表。
// 来源：https://www.hko.gov.hk/en/gts/time/conversion.htm （每年一个文本文件）
//
// 用法：node tools/build-festival-dates.js [开始年份] [结束年份]
// 一般不用再跑；表快用完了（快到结束年份时）再跑一次，把年份往后延。

const fs = require('node:fs');
const path = require('node:path');

const FROM = Number(process.argv[2]) || 2025;
const TO = Number(process.argv[3]) || 2060;
const OUT = path.join(__dirname, '..', 'src', 'shared', 'festivals', 'dates.json');
const url = (year) => `https://www.hko.gov.hk/en/gts/time/calendar/text/files/T${year}e.txt`;

const pad = (n) => String(n).padStart(2, '0');

/** 把一年的表解析成一天一条：{ date: Date, month, leap, day, term } */
function parseYear(text) {
  const days = [];
  let month = null;
  let leap = false;
  let day = 0;
  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.split(/\s{2,}/).map((s) => s.trim());
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(cols[0] || '');
    if (!m) continue;
    const lunar = cols[1] || '';
    const start = /^(Leap\s+)?(\d+)(?:st|nd|rd|th)\s+Lunar\s+Month/i.exec(lunar);
    if (start) {
      month = Number(start[2]);
      leap = !!start[1] || /leap/i.test(lunar);
      day = 1;
    } else if (/^\d+$/.test(lunar)) {
      day = Number(lunar);
    } else {
      throw new Error(`看不懂这一行的农历日期：${raw}`);
    }
    days.push({ date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12), month, leap, day, term: cols[3] || '' });
  }
  return days;
}

const fmt = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function festivalsOf(year, days) {
  const lunar = (m, d) => days.find((x) => x.month === m && !x.leap && x.day === d);
  const term = (name) => days.find((x) => x.term === name);
  const spring = lunar(1, 1);
  const eve = new Date(spring.date);
  eve.setDate(eve.getDate() - 1);
  const result = {
    chuxi: fmt(eve),
    springFestival: fmt(spring.date),
    lantern: fmt(lunar(1, 15).date),
    qingming: fmt(term('Bright & Clear').date),
    dragonBoat: fmt(lunar(5, 5).date),
    qixi: fmt(lunar(7, 7).date),
    midAutumn: fmt(lunar(8, 15).date),
    winterSolstice: fmt(term('Winter Solstice').date),
  };
  for (const [k, v] of Object.entries(result)) if (!/^\d{2}-\d{2}$/.test(v)) throw new Error(`${year} 年的 ${k} 没找到`);
  return result;
}

/** 用电脑自带的农历再算一遍，看看和官方表哪里不一样（只是为了记录，不会用它的结果） */
function icuCheck(year, official) {
  const f = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' });
  const lunarOf = (d) => {
    const parts = f.formatToParts(d);
    const month = parts.find((p) => p.type === 'month').value;
    return { m: Number(month.replace(/\D/g, '')), leap: /bis|leap/i.test(month), d: Number(parts.find((p) => p.type === 'day').value) };
  };
  const find = (m, d) => {
    for (let t = new Date(year, 0, 1, 12); t.getFullYear() === year; t.setDate(t.getDate() + 1)) {
      const l = lunarOf(t);
      if (l.m === m && l.d === d && !l.leap) return fmt(t);
    }
    return null;
  };
  const diffs = [];
  for (const [key, [m, d]] of Object.entries({ springFestival: [1, 1], lantern: [1, 15], dragonBoat: [5, 5], qixi: [7, 7], midAutumn: [8, 15] })) {
    const icu = find(m, d);
    if (icu !== official[key]) diffs.push(`${key}: 官方 ${official[key]}，电脑自带 ${icu}`);
  }
  return diffs;
}

async function main() {
  const years = {};
  const mismatches = [];
  for (let year = FROM; year <= TO; year++) {
    const res = await fetch(url(year));
    if (!res.ok) throw new Error(`${year} 年的表下载失败：HTTP ${res.status}`);
    const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
    years[year] = festivalsOf(year, parseYear(text));
    for (const diff of icuCheck(year, years[year])) mismatches.push(`${year} ${diff}`);
    process.stdout.write(`${year} `);
  }
  console.log('\n');
  const data = {
    source: 'Hong Kong Observatory, Gregorian-Lunar Calendar Conversion Tables (https://www.hko.gov.hk/en/gts/time/conversion.htm)',
    generated: new Date().toISOString().slice(0, 10),
    range: [FROM, TO],
    years,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`已写入 ${path.relative(process.cwd(), OUT)}（${FROM}–${TO}，共 ${TO - FROM + 1} 年）`);
  console.log(mismatches.length ? `电脑自带的农历和官方表不一样的地方（${mismatches.length} 处）：\n  ${mismatches.join('\n  ')}` : '电脑自带的农历和官方表完全一致');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
