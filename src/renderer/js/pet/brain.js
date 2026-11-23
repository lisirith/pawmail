// 大脑：决定宠物"接下来做什么"。
//
// 它不是按固定顺序播放动作，而是像真的小动物一样被几种"需求"驱动：
//   energy   精力：醒着会慢慢消耗，睡觉会恢复。精力低了就打哈欠、打瞌睡、睡觉。
//   boredom  无聊：发呆越久越无聊，无聊了就想走走、跑跑、追鼠标。
//   social   想被关注：很久没人理它，就会走到鼠标旁边眼巴巴地看着你。
//   mood     心情：被摸会变好，被戳烦了会变差。
//
// 每次要选新动作时，给每个候选动作算一个分数（越符合当前需求分越高），
// 再按分数"加权随机"抽一个。刚做过的动作有冷却时间，所以不会来回重复同样几个。

import { clamp, damp, pickWeighted, chance, pick } from '../util/math.js';
import { ACTIVITIES, INTERRUPTIBLE, REACTIVE, wallDistances, planHop, planClimb } from './activities.js';
import { TRICKS, TRICK_INFO, ENERGETIC_TRICKS } from './tricks.js';

// 所有会做的动作：日常的（activities.js）+ 招牌动作（tricks.js）
const ACTIONS = { ...ACTIVITIES, ...TRICKS };

// 每个动作做完之后，过多少秒才会恢复到正常的出现概率
const COOLDOWN = {
  lookAround: 25,
  walk: 8,
  run: 70,
  sit: 35,
  groom: 80,
  yawn: 100,
  nap: 360,
  sleep: 600,
  hop: 150,
  chase: 90,
  seekUser: 900,
  climb: 420, // 爬墙很好玩，但爬多了就不稀奇了：最多七分钟一次
  showMail: 150, // 手里有信没拆时，大约每两三分钟举起来提醒一次
  festiveGreet: 600, // 过节时，大约每十分钟再打一次节日招呼
  peekSheet: 25, // 万圣节披着白布时，时不时撩起来看你一眼
  peekDown: 40, // 站在窗口上，探头往下看
  jumpDown: 20,
  hopUp: 360, // 自己跳上窗口：最多六分钟一次
  climbUp: 420, // 自己顺着窗口侧边爬上去（和爬屏幕边的 climb 互相也算冷却，见 scores）
  orangeNap: 900, // 卡皮巴拉头顶橘子发呆：一小时两三次，多了就不稀奇了
  stubborn: 900, // 柴犬赖着不走：模拟器里一小时四次左右，多了就不好笑了
  bluff: 20, // 小熊猫举手吓唬你：刚吓唬完，再戳它就只是普通地吓一跳
};

// 小熊猫被鼠标猛地冲过来吓到、举手吓唬你：至少隔这么多秒（你在电脑上忙的时候，鼠标常常飞快地划过任务栏）
const RUSH_BLUFF_AFTER = 90;

// 刚从窗口上下来（自己跳的、掉下来的）：过这么多秒才想再上去
const UP_AGAIN_AFTER = 180;
// 活动的、费劲的动作：精力掉得快
const ENERGETIC = new Set(['walk', 'run', 'chase', 'hop', 'climb', 'hopUp', 'climbUp', ...ENERGETIC_TRICKS]);
// 打盹一类的（招牌动作里的抱着尾巴睡、趴在窗口边上睡）：和 nap 一样慢慢恢复精力，眼皮不算"困"
const NAPPING = new Set(['nap', 'tailHug', 'drapeNap']);

/** 现在有多"深夜"：白天是 0，晚上 11 点开始升高，凌晨 0~6 点是 1，早上 8 点回到 0 */
export function nightFactor(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 23) return h - 23;
  if (h < 6) return 1;
  if (h < 8) return 1 - (h - 6) / 2;
  return 0;
}

export class Brain {
  constructor({ pet, world, say, saved, clock, stat }) {
    this.pet = pet;
    this.world = world;
    this.sayFn = say || (() => {});
    this.clock = clock || (() => new Date()); // 现在几点（模拟测试时可以换成假的时钟）
    this.stat = stat || (() => {}); // 记一次互动（摸头、戳、弄晕），第二天的信里会提到
    this.hasMail = false; // 手里有没有一封等你拆的信
    this.festival = null; // 今天过的节：{ id, day, look, greet }
    this.foodNear = false; // 有没有人正拖着文件停在它身上（要喂它）

    this.needs = { energy: 0.85, boredom: 0.25, social: 0.35 };
    this.mood = 0.65;
    this.curiosity = 0; // 对鼠标的好奇心：鼠标在附近晃得越欢，它越想去追
    this.stroke = 0; // 鼠标在它身上来回蹭的"量"，够多就算在摸它
    this.petting = false;
    this.userAway = false; // 你是不是离开电脑了
    this.awayFor = 0;

    this.name = null; // 正在做的动作的名字
    this.current = null;
    this.t = 0;
    this.lastName = null;
    this.history = {}; // 动作名 → 上次做完的时间
    this.queue = []; // 排队等着做的动作（比如"醒来后打个招呼"）
    this.clicks = [];
    this.checkIn = 0;
    this.lastSayAt = -Infinity;
    this.leftPerchAt = -Infinity; // 上次从窗口上下来是什么时候（world.time）
    this.lastNear = Infinity; // 上一帧鼠标离它多远（小熊猫看鼠标是不是正朝它冲过来）
    this.rushArmed = true; // 鼠标离开远一点以后才算"新的一次冲过来"
    this.lastRushBluff = -Infinity;
    this.lastTrick = null; // 上次"来一个！"表演的是哪个（下次尽量换一个）

    if (saved) this.restore(saved);
    pet.onLand = (impact, dizzy, leapt) => this.onLand(impact, dizzy, leapt);
    pet.onSlip = () => this.onSlip();
  }

  /** 是不是正站在别的窗口顶上 */
  get perched() {
    return !!this.pet.perch && this.pet.mode === 'ground';
  }

  // ------------------------------------------------------------ 存档

  snapshot() {
    return { needs: { ...this.needs }, mood: this.mood, savedAt: Date.now() };
  }

  restore(saved) {
    const n = saved.needs || {};
    for (const k of Object.keys(this.needs)) {
      if (Number.isFinite(n[k])) this.needs[k] = clamp(n[k], 0, 1);
    }
    if (Number.isFinite(saved.mood)) this.mood = clamp(saved.mood, 0, 1);
    if (Number.isFinite(saved.savedAt)) {
      // 程序关着的这段时间，它在休息，也在想你
      const minutes = Math.max(0, (Date.now() - saved.savedAt) / 60000);
      this.needs.energy = clamp(this.needs.energy + minutes / 15, 0, 1);
      this.needs.social = clamp(this.needs.social + minutes / 600, 0, 1);
      this.needs.boredom = Math.min(this.needs.boredom, 0.4);
    }
  }

  // ------------------------------------------------------------ 给动作用的小接口

  /** 说一句话（气泡）。key 对应语言文件里 say.xxx */
  say(key, seconds) {
    this.lastSayAt = this.world.time;
    this.sayFn(key, seconds);
  }

  reward({ mood = 0, boredom = 0, social = 0, energy = 0 }) {
    this.mood = clamp(this.mood + mood, 0, 1);
    this.needs.boredom = clamp(this.needs.boredom + boredom, 0, 1);
    this.needs.social = clamp(this.needs.social + social, 0, 1);
    this.needs.energy = clamp(this.needs.energy + energy, 0, 1);
  }

  /** 睡觉的动作每帧来问：可以醒了吗？ */
  shouldWake(t, st) {
    if (t < st.minDur) return false;
    if (this.userAway) return false; // 你不在，它就继续睡
    return this.needs.energy >= 0.88;
  }

  // ------------------------------------------------------------ 开始一个动作

  start(name, params) {
    if (this.current && this.current.exit) this.current.exit(this);
    if (this.name) {
      this.history[this.name] = this.world.time;
      this.lastName = this.name;
    }
    if (!ACTIONS[name]) name = 'idle';
    this.name = name;
    this.current = ACTIONS[name](this, params || {});
    this.t = 0;
    if (TRICK_INFO[name]) this.reward({ boredom: -0.2, mood: 0.02 }); // 招牌动作做起来挺开心的
    if (name === 'walk' || name === 'run') this.reward({ boredom: -0.22 });
    if (name === 'hop') this.reward({ boredom: -0.2, energy: -0.01 });
    if (name === 'chase') this.reward({ energy: -0.015 });
    if (name === 'climb' || name === 'climbUp') this.reward({ boredom: -0.35, energy: -0.02 });
    if (name === 'hopUp') this.reward({ boredom: -0.25, energy: -0.01 });
    if (name === 'jumpDown') {
      this.reward({ boredom: -0.15 });
      this.leftPerchAt = this.world.time;
    }
  }

  // ------------------------------------------------------------ 每帧

  update(dt) {
    this.#needs(dt);
    this.#senses(dt);
    if (!this.current) this.start(...this.#next());
    this.t += dt;
    let done = false;
    try {
      done = this.current.update(this, dt, this.t);
    } catch (err) {
      console.error('[brain] 动作出错：', this.name, err);
      done = true;
    }
    if (done) this.start(...this.#next());
    else if (INTERRUPTIBLE.has(this.name)) this.#interrupts(dt);
  }

  /** 程序被暂停了一段时间（屏幕锁了、窗口被完全挡住）之后，把这段时间补上 */
  advance(seconds) {
    if (seconds <= 0) return;
    this.#needs(Math.min(seconds, 6 * 3600));
  }

  #needs(dt) {
    const n = this.needs;
    const name = this.name;
    const night = nightFactor(this.clock());
    // 设计取舍：很多人正是深夜用电脑。所以夜里它不会一直睡，而是"陪你熬夜"——
    // 只是困得更快、每觉睡得久一点、哈欠更多、眼皮更重。你离开电脑之后，它才会一直睡到你回来。
    if (name === 'sleep') {
      n.energy += dt / (720 * (1 + night * 0.5)); // 白天大约 12 分钟睡饱，深夜大约 18 分钟
    } else if (NAPPING.has(name)) {
      n.energy += dt / 2400;
    } else {
      let drain = 1 / 9000; // 白天大约能精神 1~1.5 小时
      drain *= 1 + night * 1.5; // 深夜困得快：大约半小时就想睡
      if (ENERGETIC.has(name)) drain *= 3;
      n.energy -= dt * drain;
    }
    if (name === 'idle' || name === 'sit' || name === 'lookAround' || name === 'orangeNap') n.boredom += dt / 300;
    else if (name === 'walk' || name === 'run' || name === 'chase' || name === 'climb' || name === 'climbUp') n.boredom -= dt / 30;
    n.social += dt / 2700;
    if (this.petting) {
      n.social -= dt * 0.1;
      n.boredom -= dt * 0.05;
      this.mood += dt * 0.03;
    }
    this.mood = damp(this.mood, 0.62, 900, dt); // 心情会慢慢回到平常
    n.energy = clamp(n.energy, 0, 1);
    n.boredom = clamp(n.boredom, 0, 1);
    n.social = clamp(n.social, 0, 1);
    this.mood = clamp(this.mood, 0, 1);

    // 眼皮有多重：精力低时下垂；深夜即使精力还行，也会带一点困意
    const awake = name !== 'sleep' && !NAPPING.has(name) && name !== 'wake';
    this.pet.sleepy = awake ? clamp(Math.max((0.3 - n.energy) / 0.3, night * 0.3), 0, 1) : 0;
  }

  /** 感知周围：鼠标在干嘛？你在摸它吗？你还在电脑前吗？ */
  #senses(dt) {
    const pet = this.pet;
    const w = this.world;
    const p = w.pointer;
    const S = w.scale;

    // 好奇心
    let stimulus = 0;
    if (p.inside) {
      const d = Math.hypot(p.x - pet.x, p.y - (pet.y - 60 * S));
      stimulus = clamp(p.speed / 900, 0, 1) * clamp(1 - d / (600 * S), 0, 1);
    }
    this.curiosity = damp(this.curiosity, stimulus, stimulus > this.curiosity ? 0.25 : 2.5, dt);
    if (pet.sp.quirk === 'bluff') this.#watchRush(p, S);

    // 摸头：鼠标停在它身上来回移动（不按键）
    const over = p.inside && !p.down && pet.mode === 'ground' && !!pet.hit(p.x, p.y);
    this.stroke = this.stroke * Math.pow(0.35, dt) + (over ? Math.min(p.speed, 900) * dt : 0);
    const was = this.petting;
    this.petting = over && this.stroke > (was ? 35 : 110) * S;
    if (this.petting && !was) this.stat('pet');
    if (this.petting && !was && !REACTIVE.has(this.name) && this.name !== 'sleep' && this.name !== 'petted') {
      this.start('petted');
    }

    // 你离开 / 回来
    const idle = w.system.idle || 0;
    const away = idle > 180;
    if (away) this.awayFor = idle;
    if (this.userAway && !away) {
      if (this.awayFor > 300) {
        this.queue.push(['greet', { line: 'welcomeBack' }]);
        if (this.name === 'sleep' && !this.current.forced) this.start('wake');
      }
      this.awayFor = 0;
    }
    this.userAway = away;
  }

  /**
   * 小熊猫：鼠标飞快地冲到它跟前，有时吓一跳，站起来举手"吓唬"你。
   * 每冲过来一次只掷一次骰子（鼠标离开远一点才算下一次），而且至少隔 RUSH_BLUFF_AFTER 秒
   */
  #watchRush(p, S) {
    const pet = this.pet;
    const near = p.inside ? Math.hypot(p.x - pet.x, p.y - (pet.y - 45 * S)) : Infinity;
    const rushing = p.speed > 1300 * S && near < 130 * S && near < this.lastNear;
    this.lastNear = near;
    if (!rushing) {
      if (near > 220 * S) this.rushArmed = true;
      return;
    }
    if (!this.rushArmed) return;
    this.rushArmed = false;
    if (pet.mode !== 'ground' || !INTERRUPTIBLE.has(this.name)) return; // 睡着、被拎着、正忙别的：不管
    if (this.world.time - this.lastRushBluff < RUSH_BLUFF_AFTER || !chance(0.5)) return;
    this.lastRushBluff = this.world.time;
    this.start('bluff');
  }

  /** 发呆、坐着的时候，每隔一小会儿看看有没有更想做的事 */
  #interrupts(dt) {
    this.checkIn -= dt;
    if (this.checkIn > 0) return;
    this.checkIn = 0.6;
    if (this.queue.length) {
      this.start(...this.queue.shift());
      return;
    }
    if (this.userAway && this.t > 2) {
      this.start('sleep', { minDur: 20 });
      return;
    }
    if (this.hasMail && !this.userAway && this.#cooldown('showMail') >= 1 && chance(0.25)) {
      this.start('showMail', { say: chance(0.3) }); // 信还没拆：再举起来提醒一下
      return;
    }
    if (this.curiosity > 0.5 && this.#canChase() && chance(0.3 * (1 - 0.6 * (this.pet.sp.calm || 0)))) {
      this.start('chase');
    }
  }

  #cooldown(name) {
    const cd = COOLDOWN[name] ?? (TRICK_INFO[name] && TRICK_INFO[name].cd);
    if (!cd) return 1;
    const last = this.history[name];
    if (last === undefined) return 1;
    return clamp((this.world.time - last) / cd, 0, 1) ** 2;
  }

  #canChase() {
    const pet = this.pet;
    const w = this.world;
    const p = w.pointer;
    const S = w.scale;
    const A = w.area;
    if (!p.inside || this.needs.energy < 0.25 || this.perched) return false; // 站在窗口上不追（会冲出窗口去）
    if (w.time - p.lastMoveAt > 2.5) return false;
    if (p.x < A.left || p.x > A.right || p.y > A.bottom) return false; // 鼠标在活动范围外面：够不着，不追
    const dx = Math.abs(p.x - pet.x);
    const up = w.groundY - p.y;
    if (dx > 560 * S || dx < 50 * S || up > 300 * S) return false;
    return this.#cooldown('chase') >= 1;
  }

  /** 能不能去爬墙：离左边或右边的墙不远、墙够高、有精神、手里没拿东西 */
  #canClimb() {
    const pet = this.pet;
    const w = this.world;
    const S = w.scale;
    if (this.needs.energy < 0.35 || this.userAway || this.hasMail || this.perched) return false;
    if (pet.look && (pet.look.held || pet.look.cover)) return false; // 拿着灯笼、披着白布，不方便爬
    if (w.groundY - pet.ceilingY() < 150 * S) return false;
    return this.#wallNear() > 0;
  }

  /** 想不想自己上窗口：有精神、你在、手里没有信、没拿着灯笼 / 披着白布；刚从窗口上下来的话，先在地上待一会儿 */
  #canGoUp() {
    const pet = this.pet;
    if (pet.mode !== 'ground' || this.needs.energy < 0.35 || this.userAway || this.hasMail) return false;
    if (pet.look && (pet.look.held || pet.look.cover)) return false;
    return this.world.time - this.leftPerchAt >= UP_AGAIN_AFTER;
  }

  /** 能不能顶着橘子发呆：这种动物有这个小动作（卡皮巴拉）、你在、头上没戴帽子或节日头饰 */
  #canOrange() {
    const pet = this.pet;
    if (pet.sp.headProp !== 'orange' || pet.mode !== 'ground' || this.userAway) return false;
    return !(pet.outfit && pet.outfit.hat) && !(pet.look && pet.look.head);
  }

  /** 能不能赖着不走：这种动物有这个小动作（柴犬）、在地面上（站在窗口顶上地方太窄，不赖）、你在 */
  #canStubborn() {
    const pet = this.pet;
    return pet.sp.quirk === 'stubborn' && pet.mode === 'ground' && !this.perched && !this.userAway;
  }

  /** 离最近的墙有多近：贴着墙是 1，300 像素开外是 0 */
  #wallNear() {
    const d = wallDistances(this);
    return clamp(1 - Math.min(d.left, d.right) / (300 * this.world.scale), 0, 1);
  }

  /** 下一个动作是什么？返回 [名字, 参数] */
  #next() {
    const prev = this.name;
    if (prev === 'sleep') return ['wake', {}]; // 睡醒 → 睁眼坐起来
    if (prev === 'wake') return ['yawn', {}]; // → 打个哈欠
    if (this.queue.length) return this.queue.shift();
    return [this.#choose(), {}];
  }

  /** 给每个候选动作打分。调试面板也会显示这些分数。 */
  scores() {
    const n = this.needs;
    const e = n.energy;
    const bo = n.boredom;
    const night = nightFactor(this.clock());
    const away = this.userAway ? 1 : 0;
    const tired = clamp((0.5 - e) / 0.5, 0, 1); // 精力 > 0.5 时是 0，耗尽时是 1
    // 自己上窗口：附近有跳得上去的窗口（hop），或者有伸到地面、侧边能扒着爬的窗口（wall）。
    // 劲头和爬墙差不多（无聊、有精神、心情好就想；深夜没那么想），离得越近越想
    const goUp = this.#canGoUp();
    const hop = goUp ? planHop(this) : null;
    const wall = goUp ? planClimb(this) : null;
    const keen = (0.08 + 0.5 * bo) * e * (0.6 + 0.6 * this.mood) * (1 - 0.6 * night);
    const near = (plan) => clamp(1 - plan.cost / (900 * this.world.scale), 0.25, 1);
    const s = {
      idle: 1.0,
      lookAround: 0.5,
      walk: (0.3 + 1.6 * bo) * (0.35 + 0.65 * e),
      run: (0.06 + 0.9 * bo) * e * e * (0.5 + this.mood),
      sit: 0.8 + 0.9 * tired,
      groom: 0.4 + 0.3 * bo,
      yawn: 0.04 + 1.4 * tired * tired + 0.4 * night,
      nap: 0.04 + 1.6 * tired * tired,
      sleep: tired * tired * 6 + night * 0.5 * (1 - e) + away * 3,
      hop: (0.03 + 1.2 * Math.max(0, this.mood - 0.7)) * e,
      chase: this.#canChase() ? (0.3 + 2.4 * this.curiosity) * e * (0.6 + bo) : 0,
      seekUser: n.social > 0.75 && this.world.pointer.inside ? (n.social - 0.75) * 4 : 0,
      // 离墙越近越想爬；深夜没那么想爬。刚爬过窗口的侧边，也先不爬屏幕边
      climb: this.#canClimb() ? (0.25 + 0.9 * bo) * e * (0.6 + 0.6 * this.mood) * (1 - 0.6 * night) * (0.25 + 0.75 * this.#wallNear()) * this.#cooldown('climbUp') : 0,
      festiveGreet: this.festival ? 0.12 : 0,
      peekSheet: this.pet.look && this.pet.look.cover ? 0.8 : 0,
      peekDown: 0,
      jumpDown: 0,
      hopUp: hop ? keen * near(hop) : 0,
      climbUp: wall ? keen * near(wall) * this.#cooldown('climb') : 0,
      // 卡皮巴拉：坐着发呆，头顶落下一个橘子。戴着帽子、节日头饰时不做（橘子没地方放）
      orangeNap: this.#canOrange() ? 0.08 + 0.15 * tired : 0,
      // 柴犬：走着走着突然趴下赖着不走。越无聊越容易犯倔，太累了就直接睡了、不用赖
      stubborn: this.#canStubborn() ? (0.06 + 0.2 * bo) * (0.4 + 0.6 * e) : 0,
    };
    // 招牌动作（tricks.js）：这种动物会的那几个、外加大家都会的"抱着零食啃"，现在能做的才有分
    for (const name of this.#trickNames()) {
      const info = TRICK_INFO[name];
      if (info) s[name] = info.can(this) ? info.weight(this) : 0;
    }
    // 性格（动物文件里的 calm：0 平常，1 佛系）：佛系的少跑、少追、少蹦，多坐、多打盹
    const calm = this.pet.sp.calm || 0;
    if (calm) {
      s.run *= 1 - 0.75 * calm;
      s.chase *= 1 - 0.6 * calm;
      s.hop *= 1 - 0.5 * calm;
      s.walk *= 1 - 0.25 * calm;
      s.climb *= 1 - 0.4 * calm;
      s.hopUp *= 1 - 0.3 * calm;
      s.climbUp *= 1 - 0.3 * calm;
      s.sit *= 1 + 0.4 * calm;
      s.nap *= 1 + 0.6 * calm;
    }
    if (this.perched) {
      // 站在窗口顶上：只在上面走几步、坐坐、睡一觉、探头往下看；待得越久、越无聊，越想跳下去
      const up = this.pet.time - this.pet.perchSince; // 在这个窗口上待了多少秒
      s.run = 0;
      s.chase = 0;
      s.seekUser = 0;
      s.climb = 0;
      s.walk *= 0.5;
      s.hopUp *= 0.5; // 从这个窗口跳上更高的一个：偶尔
      s.peekDown = 0.6;
      s.jumpDown = (0.03 + up / 240 + 0.35 * bo) * (this.userAway ? 0.2 : 1);
    }
    // 各自的喜好（动物文件里的 likes：某个动作的分数乘多少）。比如柴犬不太黏人、爱自己溜达，
    // 小熊猫爱爬高、在窗口上待得久（jumpDown 小一点）。放在"站在窗口上"那段后面，那里会重新算 jumpDown
    const likes = this.pet.sp.likes;
    if (likes) for (const [name, k] of Object.entries(likes)) if (name in s) s[name] *= k;
    for (const name of Object.keys(s)) {
      s[name] *= this.#cooldown(name);
      if (name === this.name) s[name] *= name === 'idle' ? 0.5 : 0.15; // 尽量别连着做同一件事
    }
    return s;
  }

  #choose() {
    const entries = Object.entries(this.scores()).map(([item, weight]) => ({ item, weight }));
    return pickWeighted(entries) || 'idle';
  }

  /** 这种动物会的招牌动作（动物文件里的 tricks），再加上大家都会的"抱着零食啃" */
  #trickNames() {
    const list = [...(this.pet.sp.tricks || [])];
    if (!list.includes('snack')) list.push('snack');
    return list;
  }

  /** 这个招牌动作现在能不能做（不管冷却） */
  #canTrick(name) {
    if (TRICK_INFO[name]) return TRICK_INFO[name].can(this);
    if (name === 'orangeNap') return this.#canOrange();
    if (name === 'stubborn') return this.#canStubborn();
    if (name === 'bluff') return this.pet.mode === 'ground';
    return false;
  }

  /**
   * 右键菜单"来一个！"：马上表演一个招牌动作（不管冷却，尽量别和上一次一样）。
   * 睡着了就先醒过来：醒 → 打个哈欠 → 表演。现在一个都做不了（比如站在窗口上、窗口太窄）就开心地蹦两下
   */
  performTrick() {
    const pet = this.pet;
    if (pet.mode !== 'ground' || REACTIVE.has(this.name) || this.name === 'arrive') return false;
    const ready = this.#trickNames().filter((name) => this.#canTrick(name));
    if (!ready.length) {
      this.start('hop');
      return true;
    }
    const fresh = ready.filter((name) => name !== this.lastTrick && name !== this.name);
    const name = pick(fresh.length ? fresh : ready);
    this.lastTrick = name;
    this.queue = this.queue.filter(([q]) => !TRICK_INFO[q]); // 之前排着的招牌动作不要了
    if (this.name === 'sleep') {
      this.start('wake');
      this.queue.unshift([name, {}]);
    } else {
      this.start(name);
    }
    return true;
  }

  // ------------------------------------------------------------ 你对它做了什么

  onGrab() {
    this.reward({ boredom: -0.3 });
    this.start('held');
  }

  onRelease() {
    if (this.pet.mode === 'air') this.start('falling');
  }

  /**
   * 今天过不过节变了（换装扮是画面那边做的，这里只管行为）。
   * greet：要不要马上打个节日招呼（启动时由 app.js 自己安排顺序，所以传 false）
   */
  setFestival(festival, { greet = true } = {}) {
    const prev = this.festival;
    this.festival = festival || null;
    const changed = festival && (!prev || prev.id !== festival.id || prev.day !== festival.day);
    if (changed && greet) {
      this.queue.push(['festiveGreet', {}]);
      if (this.name === 'sleep' && !this.current.forced) this.start('wake');
    }
  }

  /**
   * 信的情况变了。unread = 还有几封没拆；fresh = 是不是刚刚新来了一封。
   * 有没拆的信时，它会把信抱在手里，并且时不时举起来提醒你。
   */
  onMail(unread, fresh) {
    const had = this.hasMail;
    this.hasMail = unread > 0;
    this.pet.carry = this.hasMail;
    if (this.hasMail && (fresh || !had)) {
      this.queue.push(['showMail', { say: true }]);
      if (this.name === 'sleep' && !this.current.forced) this.start('wake'); // 有信来了，醒一醒
    }
  }

  /**
   * 你在衣柜里给它换了衣服：它会低头看看、转一圈、问"好看吗？"。off = 全脱了。
   * 在衣柜里一口气试好几件时，只排一次，不会一件一件地转个没完。
   */
  onOutfit({ off = false } = {}) {
    if (this.name === 'showOff' || this.queue.some(([name]) => name === 'showOff')) return;
    this.queue.push(['showOff', { off }]);
    if (this.name === 'sleep' && !this.current.forced) this.start('wake'); // 换了新衣服，醒来看看（哄睡的不叫醒）
  }

  /** 落地了。leapt：是它自己（从墙上、窗口上）跳下来的 */
  onLand(impact, dizzy, leapt) {
    if (dizzy) {
      this.stat('dizzy');
      this.reward({ mood: -0.05 });
      this.start('dizzy');
    } else {
      const cameUp = this.name === 'hopUp' || this.name === 'climbUp'; // 自己跳上来、爬上来的
      this.start('landed', { happy: !!leapt });
      const quiet = this.world.time - this.lastSayAt > 20; // 别说得太勤
      // 被你放到了窗口顶上："这里视野真好"；自己上来的："上来啦！"
      if (this.pet.perch && !leapt && quiet && chance(0.6)) this.say('perch', 2.4);
      else if (this.pet.perch && cameUp && quiet && chance(0.4)) this.say('perchUp', 2.2);
    }
  }

  /** 脚下的窗口没了（关掉、最小化、被挡住），或者被你晃得站不住；或者正扒着窗口边往上爬，窗口没了：吓一跳，掉下去 */
  onSlip() {
    this.leftPerchAt = this.world.time;
    this.start('falling');
    if (this.world.time - this.lastSayAt > 8 && chance(0.5)) this.say('slip', 1.8);
  }

  /**
   * 有人拖着文件到了它身上（on = true），或者又没了（on = false；how：'leave' 拿走了 | 'drop' 放下了）。
   * 文件 = 吃的：它会张大嘴等着喂。睡着了也会被"香味"弄醒。
   */
  onFood(on, how = 'leave') {
    const was = this.foodNear;
    this.foodNear = on;
    const pet = this.pet;
    if (on && !was) {
      if (pet.mode !== 'ground' || this.name === 'eat' || this.name === 'arrive') return;
      if (this.name === 'sleep') pet.fx.spawn('bang', { x: 28, y: pet.headTop() + 4, life: 0.7 });
      this.start('hungry');
    } else if (!on && was && how === 'leave' && this.name === 'hungry') {
      pet.fx.spawn('question', { x: 30, y: pet.headTop() - 2, life: 1 }); // 咦？不给我吃了？
    }
  }

  /**
   * 文件放到它身上了：开始吃。items：[{ kind: 'file' | 'folder' }]；from：从哪里飞过来（宠物坐标）。
   * 返回这个"吃"的动作：后台真的把东西放进回收站以后，要调它的 resolve(结果)。
   */
  onFeed(items, from) {
    this.foodNear = false;
    this.start('eat', { items, from });
    return this.current;
  }

  /** 活动范围变了（app.js 已经把宠物挪进新的范围里了）：手上的事先放一放，看看新地方 */
  onAreaChange() {
    if (this.pet.mode !== 'ground' || this.name === 'sleep' || this.name === 'arrive') return;
    this.start('lookAround');
  }

  /** 点了它一下（isDouble：是双击的第二下） */
  onClick(isDouble) {
    const pet = this.pet;
    if (pet.mode === 'wall' && this.current && this.current.letGo) {
      // 正在爬墙：被点了一下就蹬墙跳下来
      this.stat('poke');
      this.current.letGo(this);
      return;
    }
    if (pet.mode !== 'ground' || this.name === 'arrive' || this.name === 'eat') return; // 正在吃东西：别打扰它
    const now = this.world.time;
    pet.squashSpring.kick(2.4);
    this.stat('poke');
    this.reward({ social: -0.06, boredom: -0.12 });
    if (this.name === 'annoyed' || this.name === 'dizzy') return;
    if (this.name === 'sleep') {
      pet.fx.spawn('bang', { x: 28, y: pet.headTop() + 4, life: 0.7 });
      this.start('wake');
      return;
    }
    this.clicks = this.clicks.filter((t) => now - t < 4);
    this.clicks.push(now);
    if (this.clicks.length >= 6) {
      // 4 秒内被戳了 6 下：烦了
      this.clicks.length = 0;
      this.reward({ mood: -0.15 });
      this.start('annoyed');
      return;
    }
    if (isDouble) {
      this.reward({ mood: 0.06 });
      this.start('hop');
      return;
    }
    pet.fx.spawn('bang', { x: chance(0.5) ? 28 : -28, y: pet.headTop() + 4, life: 0.7 });
    // 小熊猫：被戳了，有一半时候站起来举手"吓唬"你（刚吓唬过就只是普通地吓一跳）
    if (pet.sp.quirk === 'bluff' && this.#cooldown('bluff') >= 1 && chance(0.5)) {
      this.start('bluff');
      return;
    }
    this.start('poked');
  }

  /** 菜单 / 托盘发来的指令 */
  command(type) {
    const pet = this.pet;
    const A = this.world.area;
    if (pet.mode === 'wall' && this.current && this.current.letGo && (type === 'sleep' || type === 'comeBack')) {
      // 正在爬墙：先跳下来，落地之后再去做
      this.current.letGo(this);
      this.queue.length = 0;
      if (type === 'sleep') this.queue.push(['sleep', { forced: true, minDur: 240 }]);
      else this.queue.push(['walk', { tx: (A.left + A.right) / 2, gait: 'run' }], ['greet', {}]);
      return;
    }
    if (pet.mode !== 'ground') return;
    if (type === 'comeBack' && this.perched) {
      // 站在窗口上：先跳下来，再跑回活动范围中间
      pet.unbounded = false;
      this.queue.length = 0;
      this.queue.push(['walk', { tx: (A.left + A.right) / 2, gait: 'run' }], ['greet', {}]);
      this.start('jumpDown', { dir: pet.x < (A.left + A.right) / 2 ? 1 : -1 });
      return;
    }
    if (type === 'sleep' && this.name !== 'sleep') {
      this.start('sleep', { forced: true, minDur: 240 });
    } else if (type === 'wake' && this.name === 'sleep') {
      this.start('wake');
    } else if (type === 'comeBack') {
      pet.unbounded = false;
      this.queue.length = 0;
      const back = ['walk', { tx: (A.left + A.right) / 2, gait: 'run' }]; // 回到活动范围的正中间
      if (pet.sp.quirk === 'stubborn' && chance(0.35)) {
        // 柴犬：有时先原地赖一下（"不走！"），赖完再乖乖跑回来
        this.queue.push(back, ['greet', {}]);
        this.start('stubborn', { short: true });
      } else {
        this.queue.push(['greet', {}]);
        this.start(...back);
      }
    }
  }

  get asleep() {
    return this.name === 'sleep';
  }
}
