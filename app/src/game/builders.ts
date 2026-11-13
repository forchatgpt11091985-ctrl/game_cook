/**
 * builders.ts — параметрические low-poly строители: персонажи, здания, деревья,
 * рынок, фонтан, поле. Мультяшный стиль Overcooked: яркие цвета, округлые формы.
 * Никаких внешних моделей — всё генерируется кодом.
 */
import * as THREE from "three";
import { detailedHouse, detailedStall, detailedFountain, detailedOven, dressCharacter, oliveTree } from "./art";

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

  const bodyGeo = cached("charBody", () => new THREE.LatheGeometry([new THREE.Vector2(.25,-.42),new THREE.Vector2(.29,-.38),new THREE.Vector2(.3,-.05),new THREE.Vector2(.34,.2),new THREE.Vector2(.27,.35),new THREE.Vector2(.16,.43)],24));
  const body = mesh(bodyGeo, bodyM, 0, .95, 0);
  g.add(body);

  const headGeo = cached("charHead", () => new THREE.SphereGeometry(0.34, 18, 14));
  const head = mesh(headGeo, skin, 0, 1.62, 0);
  g.add(head);

  // глаза



  // руки-капсулы
  const armGeo = cached("charArm", () => new THREE.CapsuleGeometry(0.11, 0.36, 4, 8));
  const leftArm = mesh(armGeo, bodyM, -0.43, 1.03, 0);
  const rightArm = mesh(armGeo, bodyM, 0.43, 1.03, 0);
  leftArm.rotation.z = 0.25;
  rightArm.rotation.z = -0.25;
  g.add(leftArm, rightArm);

  // ноги
  const legGeo = cached("charLeg", () => new THREE.CapsuleGeometry(0.11, 0.38, 4, 10));
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

  if (opts.apron || opts.hat === "chef") {
    const apron=new THREE.Shape();apron.moveTo(-.19,.3);apron.lineTo(.19,.3);apron.lineTo(.19,0);apron.lineTo(.3,-.4);apron.quadraticCurveTo(0,-.45,-.3,-.4);apron.lineTo(-.19,0);apron.closePath();
    const ap=mesh(new THREE.ExtrudeGeometry(apron,{depth:.015,bevelEnabled:true,bevelThickness:.01,bevelSize:.01,bevelSegments:2}),mat(0xe9dfc8),0,.95,.315);
    g.add(ap);
  }

  dressCharacter({group:g,body,head,leftArm,rightArm,leftLeg,rightLeg},!!opts.apron,opts.bodyColor===0xb56576,opts.hat==="chef");
  const s = opts.scale ?? 1;
  g.scale.setScalar(s);
  return { group: g, body, head, leftArm, rightArm, leftLeg, rightLeg, hat };
}

/* ---------------------------------- Мир ---------------------------------- */

export function buildTree(): THREE.Group { return oliveTree(); }

export function buildCypress(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(cached("cypTrunk", () => new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6)), mat(0x6f4e37), 0, 0.3, 0),
    mesh(cached("cypTop", () => new THREE.ConeGeometry(0.55, 2.6, 8)), mat(0x2d6a4f), 0, 1.9, 0),
  );
  return g;
}

export function buildHouse(w: number,h: number,d: number,color: number): THREE.Group { return detailedHouse(w,h,d,color); }

export function buildStall(color: number): THREE.Group { return detailedStall(color); }

export function buildFountain(): THREE.Group { return detailedFountain(); }

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

export function buildPizzaOven(): THREE.Group { return detailedOven(); }

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
