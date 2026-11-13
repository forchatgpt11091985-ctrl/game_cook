/**
 * builders.ts — параметрические low-poly строители: персонажи, здания, деревья,
 * рынок, фонтан, поле. Мультяшный стиль Overcooked: яркие цвета, округлые формы.
 * Никаких внешних моделей — всё генерируется кодом.
 */
import * as THREE from "three";

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial {
  const key = `${color}:${rough}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ---------------------------------- Персонажи ---------------------------------- */

export interface CharacterRig {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  hat: THREE.Object3D;
}

/** Милый «пухлый» персонаж в стиле Overcooked */
export function buildCharacter(opts: {
  bodyColor: number;
  skin?: number;
  hat?: "chef" | "straw" | "top" | "none";
  hatColor?: number;
  apron?: boolean;
  scale?: number;
}): CharacterRig {
  const skin = mat(opts.skin ?? 0xffd9b3);
  const bodyM = mat(opts.bodyColor);
  const g = new THREE.Group();

  const bodyGeo = cached("charBody", () => new THREE.CapsuleGeometry(0.42, 0.5, 6, 14));
  const body = mesh(bodyGeo, bodyM, 0, 0.85, 0);
  g.add(body);

  const headGeo = cached("charHead", () => new THREE.SphereGeometry(0.34, 18, 14));
  const head = mesh(headGeo, skin, 0, 1.62, 0);
  g.add(head);

  // глаза
  const eyeGeo = cached("charEye", () => new THREE.SphereGeometry(0.045, 8, 8));
  const eyeM = mat(0x222034);
  g.add(mesh(eyeGeo, eyeM, -0.12, 1.68, 0.3), mesh(eyeGeo, eyeM, 0.12, 1.68, 0.3));

  // руки-капсулы
  const armGeo = cached("charArm", () => new THREE.CapsuleGeometry(0.11, 0.36, 4, 8));
  const leftArm = mesh(armGeo, bodyM, -0.52, 0.95, 0);
  const rightArm = mesh(armGeo, bodyM, 0.52, 0.95, 0);
  leftArm.rotation.z = 0.25;
  rightArm.rotation.z = -0.25;
  g.add(leftArm, rightArm);

  // ноги
  const legGeo = cached("charLeg", () => new THREE.CapsuleGeometry(0.13, 0.28, 4, 8));
  const legM = mat(0x35415e);
  const leftLeg = mesh(legGeo, legM, -0.18, 0.3, 0);
  const rightLeg = mesh(legGeo, legM, 0.18, 0.3, 0);
  g.add(leftLeg, rightLeg);

  // шляпы
  let hat: THREE.Object3D = new THREE.Group();
  if (opts.hat === "chef") {
    const h = new THREE.Group();
    const brim = mesh(cached("chefBrim", () => new THREE.CylinderGeometry(0.3, 0.32, 0.08, 16)), mat(0xffffff), 0, 1.95, 0);
    const top = mesh(cached("chefTop", () => new THREE.SphereGeometry(0.28, 14, 10)), mat(0xffffff), 0, 2.08, 0);
    top.scale.y = 0.85;
    h.add(brim, top);
    hat = h;
  } else if (opts.hat === "straw") {
    const h = new THREE.Group();
    h.add(
      mesh(cached("strawBrim", () => new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16)), mat(opts.hatColor ?? 0xe9c46a), 0, 1.92, 0),
      mesh(cached("strawTop", () => new THREE.ConeGeometry(0.3, 0.28, 16)), mat(opts.hatColor ?? 0xe9c46a), 0, 2.05, 0),
    );
    hat = h;
  } else if (opts.hat === "top") {
    const h = new THREE.Group();
    h.add(
      mesh(cached("topBrim", () => new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16)), mat(0x1d1b2e), 0, 1.92, 0),
      mesh(cached("topBody", () => new THREE.CylinderGeometry(0.26, 0.28, 0.5, 16)), mat(0x1d1b2e), 0, 2.15, 0),
      mesh(cached("topBand", () => new THREE.CylinderGeometry(0.275, 0.275, 0.08, 16)), mat(0xc1121f), 0, 1.98, 0),
    );
    hat = h;
  }
  g.add(hat);

  if (opts.apron) {
    const ap = mesh(cached("apron", () => new THREE.BoxGeometry(0.5, 0.5, 0.08)), mat(0xf8f4e9), 0, 0.85, 0.38);
    ap.rotation.x = -0.08;
    g.add(ap);
  }

  const s = opts.scale ?? 1;
  g.scale.setScalar(s);
  return { group: g, body, head, leftArm, rightArm, leftLeg, rightLeg, hat };
}

/* ---------------------------------- Мир ---------------------------------- */

export function buildTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = mesh(cached("trunk", () => new THREE.CylinderGeometry(0.18, 0.28, 1.6, 8)), mat(0x7f5539), 0, 0.8, 0);
  const crown = mesh(cached("crown", () => new THREE.SphereGeometry(1.25, 12, 10)), mat(0x4f9d44), 0, 2.3, 0);
  crown.scale.y = 1.15;
  g.add(trunk, crown);
  return g;
}

export function buildCypress(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(cached("cypTrunk", () => new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6)), mat(0x6f4e37), 0, 0.3, 0),
    mesh(cached("cypTop", () => new THREE.ConeGeometry(0.55, 2.6, 8)), mat(0x2d6a4f), 0, 1.9, 0),
  );
  return g;
}

export function buildHouse(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const walls = mesh(cached(`house${w}x${h}x${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(color), 0, h / 2, 0);
  const roof = mesh(cached(`roof${w}x${d}`, () => new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.7, 4)), mat(0xc96f4a), 0, h + h * 0.34, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(walls, roof);
  // окна
  const winGeo = cached("win", () => new THREE.BoxGeometry(0.4, 0.5, 0.1));
  const winM = mat(0xfff3c4, 0.4);
  const nw = Math.max(1, Math.floor(w / 1.6));
  for (let i = 0; i < nw; i++) {
    const x = (i - (nw - 1) / 2) * 1.5;
    g.add(mesh(winGeo, winM, x, h * 0.55, d / 2 + 0.03));
  }
  // дверь
  g.add(mesh(cached("door", () => new THREE.BoxGeometry(0.6, 0.9, 0.1)), mat(0x7f5539), 0, 0.45, d / 2 + 0.03));
  return g;
}

export function buildStall(canopyColor: number): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x9c6644);
  const counter = mesh(cached("stallCounter", () => new THREE.BoxGeometry(2.2, 0.9, 1)), wood, 0, 0.45, 0);
  const postGeo = cached("stallPost", () => new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6));
  g.add(counter);
  for (const [px, pz] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) {
    g.add(mesh(postGeo, wood, px, 0.9, pz));
  }
  const canopy = mesh(cached("stallCanopy", () => new THREE.BoxGeometry(2.6, 0.1, 1.6)), mat(canopyColor), 0, 1.85, 0);
  canopy.rotation.z = 0.06;
  g.add(canopy);
  // товары: помидоры
  const tGeo = cached("tomato", () => new THREE.SphereGeometry(0.13, 10, 8));
  const tM = mat(0xd62828);
  for (let i = 0; i < 8; i++) {
    g.add(mesh(tGeo, tM, -0.8 + (i % 4) * 0.35, 1.0, -0.2 + Math.floor(i / 4) * 0.35));
  }
  return g;
}

export function buildFountain(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xb8b0a1);
  const basin = mesh(cached("basin", () => new THREE.CylinderGeometry(1.6, 1.8, 0.5, 18)), stone, 0, 0.25, 0);
  const water = mesh(cached("water", () => new THREE.CylinderGeometry(1.45, 1.45, 0.1, 18)), mat(0x64b6e6, 0.3), 0, 0.48, 0);
  const pillar = mesh(cached("fpillar", () => new THREE.CylinderGeometry(0.2, 0.3, 1.1, 10)), stone, 0, 0.9, 0);
  const top = mesh(cached("ftop", () => new THREE.SphereGeometry(0.3, 12, 10)), stone, 0, 1.55, 0);
  g.add(basin, water, pillar, top);
  return g;
}

export function buildTomatoPlant(): THREE.Group {
  const g = new THREE.Group();
  const bush = mesh(cached("bush", () => new THREE.SphereGeometry(0.4, 10, 8)), mat(0x40916c), 0, 0.3, 0);
  bush.scale.y = 0.8;
  g.add(bush);
  const tGeo = cached("cherryTomato", () => new THREE.SphereGeometry(0.08, 8, 6));
  const tM = mat(0xe63946);
  for (const [x, y, z] of [[0.25, 0.35, 0.15], [-0.2, 0.25, 0.2], [0.05, 0.5, -0.2]] as const) {
    g.add(mesh(tGeo, tM, x, y, z));
  }
  return g;
}

export function buildPizzaOven(): THREE.Group {
  const g = new THREE.Group();
  const brick = mat(0xb08968);
  const dome = mesh(cached("ovenDome", () => new THREE.SphereGeometry(1.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)), brick, 0, 0.4, 0);
  const hole = mesh(cached("ovenHole", () => new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12)), mat(0x2b2118), 0, 0.6, 0.95);
  hole.rotation.x = Math.PI / 2;
  const fire = mesh(cached("ovenFire", () => new THREE.ConeGeometry(0.25, 0.5, 8)), mat(0xff7b00, 0.5), 0, 0.55, 0.9);
  g.add(dome, hole, fire);
  return g;
}

/** Пицца на противне — появляется по мере готовки */
export function buildPizza(progress: number): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(cached("pizzaBase", () => new THREE.CylinderGeometry(0.5, 0.5, 0.06, 20)), mat(0xf1dca7), 0, 0.03, 0);
  g.add(base);
  if (progress >= 2) g.add(mesh(cached("pizzaSauce", () => new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20)), mat(0xc1121f), 0, 0.07, 0));
  if (progress >= 3) {
    const cGeo = cached("pizzaCheese", () => new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20));
    g.add(mesh(cGeo, mat(0xffe08a), 0, 0.1, 0));
  }
  if (progress >= 4) {
    const bGeo = cached("pizzaBasil", () => new THREE.SphereGeometry(0.06, 6, 6));
    for (const [x, z] of [[0.15, 0.1], [-0.12, 0.15], [0.05, -0.15]] as const) {
      g.add(mesh(bGeo, mat(0x2d6a4f), x, 0.14, z));
    }
  }
  return g;
}

/** Листик базилика — собираемый предмет */
export function buildBasilLeaf(): THREE.Group {
  const g = new THREE.Group();
  const leaf = mesh(cached("basilLeaf", () => new THREE.OctahedronGeometry(0.25)), mat(0x74c69d, 0.5), 0, 0.5, 0);
  leaf.scale.set(1, 1.6, 0.4);
  g.add(leaf);
  return g;
}

/** Облако */
export function buildCloud(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xffffff, 1);
  const geo = cached("cloudPuff", () => new THREE.SphereGeometry(1, 10, 8));
  for (const [x, y, z, s] of [[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.7], [-1.1, -0.1, -0.1, 0.75]] as const) {
    const p = mesh(geo, m, x, y, z);
    p.scale.setScalar(s);
    p.castShadow = false;
    g.add(p);
  }
  return g;
}

/** Текстовая метка над персонажем (canvas-спрайт) */
export function buildNameTag(text: string, emoji: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = `${emoji} ${text}`;
  const w = Math.min(ctx.measureText(label).width + 60, 500);
  ctx.fillStyle = "rgba(20,24,40,0.72)";
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 14, w, 100, 26);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(label, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}
