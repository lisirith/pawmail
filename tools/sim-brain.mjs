// 大脑模拟器：不开窗口，把宠物的"大脑"快进跑几个小时，统计它都做了些什么。
// 用来检查：动作安排自不自然？会不会老重复同样几个？睡觉、清醒的节奏对不对？
//
// 用法：
//   npm run sim                         猫，从上午 10 点开始，模拟 6 小时
//   npm run sim -- 3 panda 23           熊猫，从晚上 11 点开始，模拟 3 小时
//   npm run sim -- 6 cat 10 mouse       同上，但模拟你的鼠标时不时在它附近晃动
//   npm run sim -- 6 cat 10 small       把活动范围设成屏幕中间一小块（720×420）
//
// 调整了 brain.js 里的权重、冷却时间之后，跑一下这个，就能马上看到效果。

import { Pet } from '../src/renderer/js/pet/pet.js';
import { Brain } from '../src/renderer/js/pet/brain.js';
import { getSpecies } from '../src/renderer/js/pet/species/index.js';
import { setRng, makeRng } from '../src/renderer/js/util/math.js';

const hours = Number(process.argv[2]) || 6;
const speciesId = process.argv[3] || 'cat';
const startHour = Number(process.argv[4] ?? 10);
const extras = process.argv.slice(5);
const withMouse = extras.includes('mouse');
const smallArea = extras.includes('small');

setRng(makeRng(20261110)); // 固定的随机种子：每次运行结果一样，方便前后对比

const area = smallArea ? { left: 400, top: 490, right: 1120, bottom: 910 } : { left: 0, top: 0, right: 1536, bottom: 912 };
const world = {
  width: 1536,
  height: 912,
  area,
  groundY: area.bottom - 3,
  scale: 1,
  time: 0,
  pointer: { x: 0, y: 0, inside: false, down: false, vx: 0, vy: 0, ax: 0, speed: 0, lastMoveAt: -Infinity },
  system: { idle: 0 },
};
let escaped = 0; // 宠物跑出活动范围的帧数（应该一直是 0）

let clockMs = new Date(2026, 0, 5, startHour, 0, 0).getTime();
const pet = new Pet(getSpecies(speciesId), world);
const brain = new Brain({ pet, world, say: () => {}, clock: () => new Date(clockMs) });

const dt = 1 / 20;
const stats = {};
const sequence = [];
const sleeps = [];
let last = null;
let lastCurrent = null;
let repeats = 0;
let sleepStart = null;

for (let t = 0; t < hours * 3600; t += dt) {
  world.time += dt;
  clockMs += dt * 1000;

  if (withMouse) {
    // 每 3 分钟里有 20 秒，鼠标在宠物附近晃来晃去
    const p = world.pointer;
    if (t % 180 < 20) {
      const nx = pet.x + 220 + Math.sin(t * 5) * 90;
      p.vx = (nx - p.x) / dt;
      p.x = nx;
      p.y = world.groundY - 140;
      p.speed = Math.abs(p.vx);
      p.inside = true;
      p.lastMoveAt = world.time;
    } else {
      p.inside = false;
      p.speed = 0;
    }
  }

  pet.begin(dt);
  brain.update(dt);
  pet.finish(dt);
  if (brain.name !== 'arrive' && (pet.x < area.left || pet.x > area.right || pet.y > world.groundY + 0.5 || pet.y < area.top)) escaped += 1;

  const name = brain.name;
  const s = stats[name] || (stats[name] = { time: 0, count: 0 });
  s.time += dt;
  if (brain.current !== lastCurrent) {
    // 换了一个新动作
    lastCurrent = brain.current;
    if (name === last) repeats += 1;
    s.count += 1;
    sequence.push(name);
    if (last === 'sleep' && sleepStart !== null) {
      sleeps.push((t - sleepStart) / 60);
      sleepStart = null;
    }
    if (name === 'sleep') sleepStart = t;
    last = name;
  }
}

const total = hours * 3600;
const pad = (v, n) => String(v).padStart(n);
console.log(`\n${speciesId}，从 ${startHour}:00 开始模拟 ${hours} 小时${withMouse ? '（鼠标时不时在附近晃动）' : ''}${smallArea ? '（活动范围 720×420）' : ''}\n`);
console.log('动作'.padEnd(12) + pad('时间占比', 8) + pad('次数', 8) + pad('每小时', 8) + pad('平均时长', 10));
for (const [name, s] of Object.entries(stats).sort((a, b) => b[1].time - a[1].time)) {
  console.log(
    name.padEnd(14) +
      pad(((100 * s.time) / total).toFixed(1) + '%', 8) +
      pad(s.count, 8) +
      pad((s.count / hours).toFixed(1), 8) +
      pad((s.time / Math.max(1, s.count)).toFixed(1) + 's', 10)
  );
}
console.log(`\n一共切换动作 ${sequence.length} 次；紧挨着重复同一个动作 ${repeats} 次`);
console.log(`跑出活动范围的帧数：${escaped}${escaped ? '  ← 有问题！' : '（正常）'}`);
console.log(`睡了 ${sleeps.length} 觉，每觉（分钟）：${sleeps.map((m) => m.toFixed(1)).join('、') || '—'}`);
console.log(`结束时：精力 ${brain.needs.energy.toFixed(2)}  无聊 ${brain.needs.boredom.toFixed(2)}  想被关注 ${brain.needs.social.toFixed(2)}  心情 ${brain.mood.toFixed(2)}`);
console.log(`\n最开始的 40 个动作：\n${sequence.slice(0, 40).join(' → ')}\n`);
