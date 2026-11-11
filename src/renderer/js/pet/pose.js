// 姿势（pose）：描述宠物"此刻摆成什么样子"的一组数字。
// 所有动物共用这一套姿势参数，所以同一个动作、同一件衣服，所有动物都能用。
//
// 动作代码只负责设定"目标姿势"，真正显示的姿势会平滑地追过去，
// 所以任意两个动作之间切换都不会生硬地跳变。

export const POSE_DEFAULTS = Object.freeze({
  // —— 整个身体 ——
  lift: 0, // 整体离地高度（跳、走路时的起伏）
  crouch: 0, // 0 站着 … 1 坐下
  loaf: 0, // 0 … 1 趴成一团（睡觉）
  lean: 0, // 整体倾斜（弧度，正数 = 顺时针）
  squash: 0, // 正数 = 压扁变宽（落地），负数 = 拉长（被拎起）
  facing: 0, // -1 朝左 … 0 朝前 … 1 朝右

  // —— 头 ——
  headTilt: 0, // 歪头（弧度）
  headX: 0,
  headY: 0,
  lookX: 0, // 看向哪里：-1 左 … 1 右
  lookY: 0, // -1 上 … 1 下

  // —— 脸 ——
  eyeL: 1, // 眼睛睁开程度 0…1
  eyeR: 1,
  mouthOpen: 0,
  blush: 0.4, // 腮红深浅

  // —— 耳朵 ——
  earL: 0, // 额外转动（抖耳朵）
  earR: 0,
  earDroop: 0, // 0 … 1 耷拉下来

  // —— 手 ——（0 = 自然下垂，越大抬得越高）
  armL: 0,
  armR: 0,

  // —— 脚 ——（相对站立位置的偏移）
  footLX: 0,
  footLY: 0,
  footRX: 0,
  footRY: 0,

  // —— 尾巴 ——
  tail: 0, // 左右摆动
  tailCurl: 1, // 0 下垂 … 1 翘起
  tailSide: 1, // 尾巴在身体哪一侧：-1 左 … 1 右
});

// 表情不是数字，直接切换
export const FACE_DEFAULTS = Object.freeze({
  eyes: 'open', // open | wide | happy | sleep | squeeze | dizzy | annoyed
  mouth: 'cat', // cat | smile | o | yawn | flat | wavy | pout
});

// 每个参数追上目标的快慢（秒）。数字越小越干脆，越大越柔和。
export const HALF_LIFE = Object.freeze({
  default: 0.07,
  lift: 0.03,
  crouch: 0.11,
  loaf: 0.16,
  lean: 0.08,
  squash: 0.05,
  facing: 0.12,
  headTilt: 0.1,
  headX: 0.08,
  headY: 0.09,
  lookX: 0.075,
  lookY: 0.075,
  eyeL: 0.045,
  eyeR: 0.045,
  mouthOpen: 0.06,
  blush: 0.3,
  earDroop: 0.14,
  footLX: 0.035,
  footLY: 0.03,
  footRX: 0.035,
  footRY: 0.03,
  tailCurl: 0.2,
  tailSide: 0.2,
});

export const POSE_KEYS = Object.freeze(Object.keys(POSE_DEFAULTS));

// 每个参数变化 1，画面上大约会移动多少像素（按宠物原始大小算）。
// 用来判断"姿势的变化肉眼看不看得出来"：看不出来就不重画，省电。
const POSE_PIXELS = Object.freeze({
  lift: 1,
  crouch: 10,
  loaf: 26,
  lean: 110,
  squash: 115,
  facing: 9,
  headTilt: 40,
  headX: 1,
  headY: 1,
  lookX: 8.5,
  lookY: 4.5,
  eyeL: 6.8,
  eyeR: 6.8,
  mouthOpen: 8,
  blush: 4,
  earL: 27,
  earR: 27,
  earDroop: 22,
  armL: 20,
  armR: 20,
  footLX: 1,
  footLY: 1,
  footRX: 1,
  footRY: 1,
  tail: 17,
  tailCurl: 60,
  tailSide: 45,
});

/** 两个姿势在画面上最多差了多少像素（按宠物原始大小算） */
export function poseDistance(a, b) {
  let max = a.eyes !== b.eyes || a.mouth !== b.mouth ? Infinity : 0;
  for (const k of POSE_KEYS) {
    const d = Math.abs(a[k] - b[k]) * POSE_PIXELS[k];
    if (d > max) max = d;
  }
  return max;
}

export function copyPose(from, to) {
  for (const k of POSE_KEYS) to[k] = from[k];
  to.eyes = from.eyes;
  to.mouth = from.mouth;
}

export function makePose(overrides) {
  return { ...POSE_DEFAULTS, ...FACE_DEFAULTS, ...(overrides || {}) };
}

/** 把 target 重置成默认姿势（每一帧开始时调用，然后由动作去修改） */
export function resetPose(target) {
  for (const k of POSE_KEYS) target[k] = POSE_DEFAULTS[k];
  target.eyes = FACE_DEFAULTS.eyes;
  target.mouth = FACE_DEFAULTS.mouth;
}
