// 数学小工具：平滑、弹簧、随机数。整个项目里"让动作看起来自然"的基础都在这里。

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/**
 * 指数平滑：每过 halfLife 秒，离目标的距离减半。
 * 好处是和帧率无关：30 帧和 144 帧下看起来一样。
 */
export function damp(current, target, halfLife, dt) {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(0.5, dt / halfLife);
}

/** 弹簧：用来做"有弹性"的东西，比如落地时的挤压回弹、被拎起来时的摇晃。 */
export class Spring {
  constructor(stiffness = 120, damping = 12, value = 0) {
    this.k = stiffness;
    this.c = damping;
    this.x = value;
    this.v = 0;
  }

  step(target, dt) {
    // 分成小步计算，避免帧率低时弹簧"爆炸"
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6) {
      const h = Math.min(remaining, 1 / 120);
      const a = -this.k * (this.x - target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
      remaining -= h;
    }
    return this.x;
  }

  kick(impulse) {
    this.v += impulse;
  }

  set(value) {
    this.x = value;
    this.v = 0;
  }
}

// ---- 随机数 ----
// 默认用 Math.random；测试时可以换成固定种子的随机数，让结果可重复。

export function makeRng(seed) {
  let a = seed >>> 0;
  return function mulberry32() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = Math.random;
export function setRng(fn) {
  rng = fn || Math.random;
}
export const random = () => rng();
export const rand = (a, b) => a + (b - a) * rng();
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => rng() < p;
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];

/** 按权重随机选一个。entries: [{ item, weight }] */
export function pickWeighted(entries) {
  let total = 0;
  for (const e of entries) total += Math.max(0, e.weight);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

/**
 * 平滑、几乎不重复的摆动，范围大约 [-1, 1]。
 * 用几个频率互不成倍数的正弦叠加，所以不会像单个正弦那样机械地循环。
 */
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 1.0 + seed * 1.7) * 0.5 +
    Math.sin(t * 1.618 + seed * 2.9) * 0.3 +
    Math.sin(t * 2.71828 + seed * 0.37) * 0.2
  );
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
export const easeOutBack = (t) => {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** 0 → 1 → 0 的钟形曲线 */
export const bell = (t) => Math.sin(clamp01(t) * Math.PI);
