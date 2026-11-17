// 动图：鼠标过来，把它拎起来左右晃一晃，再松手让它掉下去
const P = promo.setupPet(0.55);
const FPS = Number(promo.q.get('fps') || 20);
const pet = P.pet;
const S = P.world.scale;
const frames = [];
const cur = { x: P.world.area.right - 24, y: pet.y - 170 * S };
const ease = (u) => u * u * (3 - 2 * u);

/** 往前推 secs 秒，每一帧先让 each 挪一下鼠标，再拍下来 */
function shoot(secs, each) {
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i++) {
    if (each) each((i + 1) / n);
    P.setPointer(cur.x, cur.y);
    P.run(1 / FPS);
    frames.push(promo.frame(cur));
  }
}
/** 鼠标在 secs 秒里平滑地挪 dx、dy */
function move(secs, dx, dy) {
  const sx = cur.x;
  const sy = cur.y;
  shoot(secs, (u) => {
    cur.x = sx + dx * ease(u);
    cur.y = sy + dy * ease(u);
  });
}

// 1. 鼠标从右上方移到它胸口
const chest = { x: pet.x, y: pet.y - 40 * S };
move(0.8, chest.x - cur.x, chest.y - cur.y);
shoot(0.15);
// 2. 拎起来，往上提，往右拖、停一停，再往左拖、停一停（它会荡、会扭）
const local = pet.toLocal(cur.x, cur.y);
pet.grab(local.x, local.y);
P.brain.onGrab();
move(0.5, 0, -110 * S);
move(0.3, 120 * S, 0);
shoot(0.8);
move(0.35, -200 * S, -8 * S);
shoot(1.1);
// 3. 松手：掉下去、落地。鼠标慢慢挪开
pet.release(0, 0);
P.brain.onRelease();
move(1.5, 70 * S, -40 * S);
return promo.sheet(frames, Number(promo.q.get('cols') || 10));
