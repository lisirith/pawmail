'use strict';
// 来信的"目录"：它会去哪些地方、每个地方能捡到什么礼物、礼物有多稀有。
// 这里只放和语言无关的东西；地名、信里的句子、礼物的名字都在同一个文件夹的 zh.json / en.json 里。
//
// 想加一个新地点：
//   1. 在下面的 PLACES 里加一行（id 随便起，别和已有的重复）
//   2. 在 zh.json 和 en.json 的 "places" 里各加一段同名的内容（名字 + 几件发生的小事）
//   3. 运行 npm run letters 看看效果

/**
 * scene   明信片的背景风景：sea 海 | mountain 山 | forest 森林 | city 城市 | snow 雪地 | night 夜晚
 * gifts   在那里可能捡到的礼物
 * months  只在这些月份会去（不写 = 全年都可能去）
 */
const PLACES = [
  { id: 'seaside', scene: 'sea', gifts: ['shell', 'pebble', 'driedFish', 'compass', 'gem'] },
  { id: 'lighthouse', scene: 'sea', gifts: ['feather', 'shell', 'oldKey', 'compass', 'treasureMap'] },
  { id: 'harbor', scene: 'sea', gifts: ['driedFish', 'pebble', 'bell', 'coin', 'treasureMap'] },
  { id: 'hill', scene: 'mountain', gifts: ['wildflower', 'pebble', 'clover', 'kite', 'rainbow'] },
  { id: 'teaField', scene: 'mountain', gifts: ['teaLeaf', 'wildflower', 'bell', 'rainbow'] },
  { id: 'hotSpring', scene: 'mountain', gifts: ['pebble', 'tangerine', 'dango', 'coin', 'gem'] },
  { id: 'riverside', scene: 'mountain', gifts: ['pebble', 'feather', 'leaf', 'kite', 'gem'] },
  { id: 'flowerField', scene: 'mountain', months: [3, 4, 5], gifts: ['wildflower', 'strawberry', 'clover', 'kite', 'rainbow'] },
  { id: 'mapleValley', scene: 'forest', months: [10, 11], gifts: ['mapleLeaf', 'chestnut', 'mushroom', 'windChime', 'rainbow'] },
  { id: 'bambooGrove', scene: 'forest', gifts: ['bambooSprig', 'feather', 'leaf', 'bell', 'moonPiece'] },
  { id: 'forest', scene: 'forest', gifts: ['chestnut', 'mushroom', 'feather', 'leaf', 'oldKey', 'gem'] },
  { id: 'orchard', scene: 'forest', gifts: ['apple', 'strawberry', 'tangerine', 'leaf', 'clover'] },
  { id: 'park', scene: 'city', gifts: ['leaf', 'balloon', 'candy', 'kite', 'clover', 'coin'] },
  { id: 'bookstore', scene: 'city', gifts: ['bookmark', 'pencil', 'ticket', 'oldKey', 'treasureMap'] },
  { id: 'trainStation', scene: 'city', gifts: ['ticket', 'candy', 'tangerine', 'bell', 'coin'] },
  { id: 'convenience', scene: 'city', gifts: ['candy', 'dango', 'pencil', 'marble', 'coin'] },
  { id: 'nightMarket', scene: 'night', gifts: ['candy', 'dango', 'balloon', 'lantern', 'marble', 'coin'] },
  { id: 'rooftop', scene: 'night', gifts: ['yarn', 'feather', 'windChime', 'fallenStar', 'moonPiece'] },
  { id: 'observatory', scene: 'night', gifts: ['pencil', 'ticket', 'compass', 'fallenStar', 'moonPiece'] },
  { id: 'snowfield', scene: 'snow', months: [12, 1, 2], gifts: ['chestnut', 'tangerine', 'scarf', 'snowflake', 'gem'] },
  { id: 'frozenLake', scene: 'snow', months: [12, 1, 2], gifts: ['driedFish', 'pebble', 'scarf', 'snowflake', 'fallenStar'] },
];

/**
 * 礼物。emoji 是暂时的占位图标（以后会换成自己画的）。
 * rarity 稀有度：common 普通 | rare 稀有 | legendary 传说
 */
const GIFTS = {
  // —— 普通 ——
  shell: { emoji: '🐚', rarity: 'common' },
  pebble: { emoji: '🪨', rarity: 'common' },
  leaf: { emoji: '🍂', rarity: 'common' },
  mapleLeaf: { emoji: '🍁', rarity: 'common' },
  chestnut: { emoji: '🌰', rarity: 'common' },
  feather: { emoji: '🪶', rarity: 'common' },
  wildflower: { emoji: '🌼', rarity: 'common' },
  mushroom: { emoji: '🍄', rarity: 'common' },
  bambooSprig: { emoji: '🎋', rarity: 'common' },
  teaLeaf: { emoji: '🍃', rarity: 'common' },
  bookmark: { emoji: '🔖', rarity: 'common' },
  pencil: { emoji: '✏️', rarity: 'common' },
  ticket: { emoji: '🎫', rarity: 'common' },
  yarn: { emoji: '🧶', rarity: 'common' },
  dango: { emoji: '🍡', rarity: 'common' },
  candy: { emoji: '🍬', rarity: 'common' },
  strawberry: { emoji: '🍓', rarity: 'common' },
  tangerine: { emoji: '🍊', rarity: 'common' },
  apple: { emoji: '🍎', rarity: 'common' },
  driedFish: { emoji: '🐟', rarity: 'common' },
  balloon: { emoji: '🎈', rarity: 'common' },
  pawprint: { emoji: '🐾', rarity: 'common', special: true }, // 只随第一封"见面信"附送
  // —— 稀有 ——
  coin: { emoji: '🪙', rarity: 'rare' },
  oldKey: { emoji: '🗝️', rarity: 'rare' },
  bell: { emoji: '🔔', rarity: 'rare' },
  compass: { emoji: '🧭', rarity: 'rare' },
  lantern: { emoji: '🏮', rarity: 'rare' },
  windChime: { emoji: '🎐', rarity: 'rare' },
  clover: { emoji: '🍀', rarity: 'rare' },
  kite: { emoji: '🪁', rarity: 'rare' },
  scarf: { emoji: '🧣', rarity: 'rare' },
  snowflake: { emoji: '❄️', rarity: 'rare' },
  marble: { emoji: '🔮', rarity: 'rare' },
  // —— 传说 ——
  rainbow: { emoji: '🌈', rarity: 'legendary' },
  fallenStar: { emoji: '🌠', rarity: 'legendary' },
  gem: { emoji: '💎', rarity: 'legendary' },
  moonPiece: { emoji: '🌙', rarity: 'legendary' },
  treasureMap: { emoji: '📜', rarity: 'legendary' },
  // —— 节日限定：只有节日那天的信里有（见 ../festivals/catalog.js） ——
  partyPopper: { emoji: '🎉', rarity: 'festival', special: true },
  birthdayCake: { emoji: '🎂', rarity: 'festival', special: true },
  memoryAlbum: { emoji: '📔', rarity: 'festival', special: true },
  firecracker: { emoji: '🧨', rarity: 'festival', special: true },
  redEnvelope: { emoji: '🧧', rarity: 'festival', special: true },
  tangyuan: { emoji: '🥣', rarity: 'festival', special: true },
  willowSprig: { emoji: '🌿', rarity: 'festival', special: true },
  zongzi: { emoji: '🍙', rarity: 'festival', special: true },
  magpieFeather: { emoji: '🐦', rarity: 'festival', special: true },
  mooncake: { emoji: '🥮', rarity: 'festival', special: true },
  dumplings: { emoji: '🥟', rarity: 'festival', special: true },
  medal: { emoji: '🏅', rarity: 'festival', special: true },
  travelPhoto: { emoji: '📸', rarity: 'festival', special: true },
  chocolate: { emoji: '🍫', rarity: 'festival', special: true },
  easterEgg: { emoji: '🥚', rarity: 'festival', special: true },
  pumpkinCandy: { emoji: '🎃', rarity: 'festival', special: true },
  presentBox: { emoji: '🎁', rarity: 'festival', special: true },
  sparkler: { emoji: '🎇', rarity: 'festival', special: true },
  pie: { emoji: '🥧', rarity: 'festival', special: true },
};

const RARITIES = ['common', 'rare', 'legendary', 'festival'];

module.exports = { PLACES, GIFTS, RARITIES };
