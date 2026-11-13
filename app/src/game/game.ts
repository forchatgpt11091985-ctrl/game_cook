/**
 * game.ts — ядро «Кухня Мира»: 3D-мир итальянской деревни, игрок, NPC с квестами,
 * злодей Критик Крюк, ресторанная миссия, реальная миссия с фото, экономика и сохранения.
 */
import * as THREE from "three";
import { createRenderer } from "./renderer";
import { surface, setDressing, enrichVillage, batchStaticWorld } from "./art";
import { GameLoop } from "./engine";
import { Input } from "./input";
import { AudioSystem, type SfxId } from "./audio";
import { storage } from "./storage";
import { Hud, type RestaurantState } from "./hud";
import {
  NPCS, INGREDIENTS, VILLAIN, REAL_RECIPE, COOK_STEPS, RESTAURANT, WORLD_MAP, SAVE_KEY, SAVE_DATA_VERSION,
  type SaveData,
} from "./data";
import {
  buildCharacter, buildTree, buildCypress, buildHouse, buildStall, buildFountain,
  buildTomatoPlant, buildPizzaOven, buildPizza, buildBasilLeaf, buildCloud, buildNameTag, mat,
} from "./builders";

type Mode = "title" | "world" | "restaurant" | "victory" | "gameover";

const WORLD_R = 26; // радиус доступной площади

interface Obstacle { x: number; z: number; r: number }
interface NpcInstance {
  def: (typeof NPCS)[number];
  rig: ReturnType<typeof buildCharacter>;
  tag: THREE.Sprite;
  done: boolean;
  bobPhase: number;
}
interface BasilPickup { group: THREE.Group; x: number; z: number; taken: boolean; phase: number }

function makeCoinTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b8860b";
  ctx.font = "bold 34px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₽", 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class KitchenWorldGame {
  private renderer: ReturnType<typeof createRenderer>;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private loop: GameLoop;
  private input: Input;
  private audio = new AudioSystem();
  private hud: Hud;
  private clock = new THREE.Clock();
  private renderDirty = true;
  private renderedStatic = false;
  private lastRender = -Infinity;
  private mode: Mode = "title";
  private paused = false;

  /* Сохранение */
  private save: SaveData = {
    coins: 0, stars: 0, fans: 0, ingredients: [], flags: {}, photo: null, served: 0, bestServed: 0,
  };

  /* Игрок */
  private player = buildCharacter({ bodyColor: 0x407d7d, hat: "chef", apron: true, scale: .96 });
  private playerPos = new THREE.Vector3(0, 0, 9);
  private playerYaw = Math.PI;
  private walkPhase = 0;
  private camYaw = 0;
  private camPitch = 0.25;

  /* Мир */
  private colliders: Obstacle[] = [];
  private npcs: NpcInstance[] = [];
  private basils: BasilPickup[] = [];
  private basilQuestActive = false;
  private basilCollected = 0;
  private clouds: THREE.Group[] = [];

  /* Злодей */
  private villain = buildCharacter({ bodyColor: 0x3d348b, hat: "top", skin: 0xf1c27d });
  private villainActive = false;
  private villainCaught = false;
  private villainPos = new THREE.Vector3();
  private villainSpeed = 0;
  private villainTimer = 0;
  private villainPhase = 0;
  private stolenIngredient: string | null = null;

  /* Диалоги */
  private marcoStep = 0;
  private interactTarget: { kind: "npc"; npc: NpcInstance } | { kind: "door" } | { kind: "villain" } | null = null;

  /* Ресторан */
  private restaurant = {
    group: new THREE.Group(),
    guests: [] as { rig: ReturnType<typeof buildCharacter>; state: "enter" | "wait" | "leave"; pos: THREE.Vector3; t: number; happy: boolean }[],
    order: [] as string[],
    stepIndex: 0,
    served: 0,
    angry: 0,
    coins: 0,
    timeLeft: 0,
    message: "",
    messageT: 0,
    spawnT: 1.5,
    pizza: null as THREE.Group | null,
    counterPos: new THREE.Vector3(0, 1.05, 2.1),
  };

  /* Частицы монет */
  private coinTex = makeCoinTexture();
  private particles: { sprite: THREE.Sprite; vel: THREE.Vector3; life: number }[] = [];

  private saveTimer = 0;

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.loadSave();

    this.renderer = createRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0xc1dce5);
    this.scene.fog = new THREE.Fog(0xc1dce5, 40, 140);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 7, 22);
    this.camera.lookAt(0, 1, -4);

    this.buildLights();
    this.buildWorld();
    batchStaticWorld(this.scene, new Set<THREE.Object3D>([
      this.villain.group, this.doorMarker, ...this.npcs.map(n=>n.rig.group),
      ...this.basils.map(b=>b.group), ...this.clouds,
    ]));
    this.buildRestaurant();
    this.buildPlayer();

    this.hud = new Hud(overlay);
    this.hud.onMute = () => { this.audio.toggleMute(); this.audio.sfx("ui"); };
    this.hud.onPause = () => this.togglePause();
    this.hud.onMap = () => this.openMap();
    this.hud.onRecipe = () => this.openRealMission();

    this.input = new Input(canvas);

    this.loop = new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() });

    window.addEventListener("resize", this.onResize);
    window.addEventListener("pagehide", this.onPageHide);
    this.showTitle();
    this.loop.start();
  }

  /* ============================== Сохранение ============================== */

  private loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as SaveData & { v?: number };
        if (p.v === SAVE_DATA_VERSION) Object.assign(this.save, p);
      }
    } catch { /* повреждённое сохранение — начинаем заново */ }
  }

  private onPageHide = () => this.persist();

  private persist() {
    storage.set("kitchenWorld.keepalive", Date.now());
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.save, v: SAVE_DATA_VERSION }));
    } catch { /* фото может не влезть — не страшно */ }
  }

  private saveSoon() {
    this.saveTimer = 1.2;
  }

  /* ============================== Мир ============================== */

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdce9f5, 0xb4a384, 1.1));
    const sun = new THREE.DirectionalLight(0xffd7a4, 3.4);
    sun.position.set(-18, 28, 15);
    sun.shadow.bias = -.0003;
    sun.shadow.normalBias = .03;
    sun.shadow.radius = 3;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.camera.far = 80;
    this.scene.add(sun);
  }

  private addObstacle(x: number, z: number, r: number) {
    this.colliders.push({ x, z, r });
  }

  private buildWorld() {
    // земля
    const ground = new THREE.Mesh(new THREE.CircleGeometry(110, 64), surface(0x8fa875));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // площадь-камень
    const piazza = new THREE.Mesh(new THREE.CircleGeometry(16, 64), surface(0xffffff,"paving"));
    piazza.rotation.x = -Math.PI / 2;
    piazza.position.y = 0.02;
    piazza.receiveShadow = true;
    this.scene.add(piazza);

    // дорожки
    const path = new THREE.Mesh(new THREE.PlaneGeometry(5, 30), surface(0xffffff,"paving"));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, 14);
    path.receiveShadow = true;
    this.scene.add(path);

    // фонтан в центре
    const fountain = buildFountain();
    fountain.position.set(0, 0, 0);
    this.scene.add(fountain);
    this.addObstacle(0, 0, 2.2);

    // здания
    const houses: [number, number, number, number, number, number][] = [
      // [x, z, w, h, d, color]
      [-16, -14, 5, 3.4, 4.5, 0xf4e1c1],
      [-9, -18, 4.5, 4, 4, 0xe8b4b8],
      [14, -16, 5, 3.6, 4.5, 0xa8dadc],
      [20, -8, 4.5, 4.2, 4, 0xf1dca7],
      [-20, 2, 4.5, 3.4, 4, 0xbde0fe],
      [21, 4, 5, 3.8, 4.5, 0xffd6a5],
    ];
    for (const [x, z, w, hh, d, color] of houses) {
      const house = buildHouse(w, hh, d, color);
      house.position.set(x, 0, z);
      house.rotation.y = Math.atan2(-x, -z);
      this.scene.add(house);
      this.addObstacle(x, z, Math.max(w, d) * 0.72);
    }

    // колокольня
    const tower = new THREE.Group();
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 2.2), mat(0xe9dcc0));
    towerBody.position.y = 4.5;
    towerBody.castShadow = true;
    const towerTop = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2, 4), mat(0xc96f4a));
    towerTop.position.y = 10;
    towerTop.rotation.y = Math.PI / 4;
    towerTop.castShadow = true;
    tower.add(towerBody, towerTop);
    tower.position.set(-18, 0, -8);
    this.scene.add(tower);
    this.addObstacle(-18, -8, 1.9);

    // пиццерия шефа Марко
    const pizzeria = buildHouse(7, 4, 6, 0xf8ad9d);
    pizzeria.position.set(8, 0, -5);
    pizzeria.rotation.y = 0;
    this.scene.add(pizzeria);
    this.addObstacle(8, -5, 4.4);
    // точка входа (дверь)
    this.doorPos = new THREE.Vector3(8, 0, -1.4);


    // рынок
    const stallColors = [0x7c9168, 0xcda873, 0x84997b];
    stallColors.forEach((c, i) => {
      const stall = buildStall(c);
      stall.position.set(-12 + i * 4.2, 0, -4);
      stall.rotation.y = 0.5;
      this.scene.add(stall);
      this.addObstacle(-12 + i * 4.2, -4, 1.6);
    });

    // поле с томатами (у Луки)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const plant = buildTomatoPlant();
        plant.position.set(10 + col * 1.6, 0, -14 + row * 1.8);
        this.scene.add(plant);
      }
    }
    // The field is walkable: a circular collider here trapped Luca and the basil.
    // грядка базилика (собираемые листики)
    const basilSpots: [number, number][] = [[8.4, -9.2], [16.5, -10.5], [12.5, -16.5], [18.5, -14.5]];
    for (const [x, z] of basilSpots) {
      const leaf = buildBasilLeaf();
      leaf.position.set(x, 0, z);
      this.scene.add(leaf);
      this.basils.push({ group: leaf, x, z, taken: false, phase: Math.random() * 6 });
    }

    // деревья
    const treeSpots: [number, number, boolean][] = [
      [-24, 12, false], [-15, 14, true], [24, 14, false], [16, 18, true], [-6, -22, true],
      [4, -22, false], [-24, -16, true], [25, -18, false], [0, 24, false], [-10, 22, true],
    ];
    for (const [x, z, cypress] of treeSpots) {
      const t = cypress ? buildCypress() : buildTree();
      t.position.set(x, 0, z);
      this.scene.add(t);
      this.addObstacle(x, z, 0.8);
    }

    // облака
    for (let i = 0; i < 5; i++) {
      const cl = buildCloud();
      cl.position.set(-30 + i * 15, 16 + (i % 3) * 3, -25 + (i % 2) * 30);
      cl.scale.setScalar(1.5 + (i % 2));
      this.scene.add(cl);
      this.clouds.push(cl);
    }

    // солнце (декоративное)
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffedcc }));
    sunBall.position.set(35, 30, -40);
    this.scene.add(sunBall);

    setDressing(this.scene);
    enrichVillage(this.scene);
    for(const [x,z,r] of [[-6,6,1.6],[11.5,3,1.6],[-6.5,8.5,.5],[-3.3,1.6,.8],[3.3,1.6,.8]]) this.addObstacle(x,z,r);

    // NPC
    for (const def of NPCS) {
      const rig = buildCharacter({ bodyColor: def.color, hat: def.id === "marco" ? "chef" : def.id === "luca" ? "straw" : "none", scale: 1 });
      rig.group.position.set(...def.pos);
      rig.group.rotation.y = def.id === "nonna" ? .4 : -.35;
      this.scene.add(rig.group);
      const tag = buildNameTag(def.name, def.emoji);
      tag.position.set(def.pos[0], 2.6, def.pos[2]);
      this.scene.add(tag);
      this.npcs.push({ def, rig, tag, done: false, bobPhase: Math.random() * 6 });
      this.addObstacle(def.pos[0], def.pos[2], 0.8);
    }

    // злодей (скрыт до события)
    this.villain.group.visible = false;
    this.scene.add(this.villain.group);

    // маркер двери пиццерии
    const doorMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    doorMarker.rotation.x = -Math.PI / 2;
    doorMarker.position.set(8, 0.05, -1.4);
    this.scene.add(doorMarker);
    this.doorMarker = doorMarker;
  }

  private doorPos = new THREE.Vector3();
  private doorMarker!: THREE.Mesh;

  /* ============================== Ресторан (интерьер) ============================== */

  private buildRestaurant() {
    const g = this.restaurant.group;
    g.position.set(60, 0, 0); // далеко за пределами деревни

    const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 14), mat(0xd4a373));
    floor.position.y = -0.05; // верх пола на +0.05 — ВЫШЕ зелёного грунта (y=0), иначе грунт перекрывает пол
    floor.receiveShadow = true;
    g.add(floor);

    // стены
    const wallM = mat(0xf2cc8f);
    const mkWall = (w: number, x: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 0.4), wallM);
      m.position.set(x, 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      g.add(m);
    };
    mkWall(16, 0, -7);
    mkWall(16, 0, 7);
    mkWall(15.5, -8, 0, Math.PI / 2);
    mkWall(15.5, 8, 0, Math.PI / 2);

    // подвесные лампы над стойкой
    for (const lx of [-2, 0, 2]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      lamp.position.set(lx, 3.1, 2.1);
      g.add(lamp);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9), mat(0x333333));
      cord.position.set(lx, 3.65, 2.1);
      g.add(cord);
    }
    const warm = new THREE.PointLight(0xffc978, 30, 18);
    warm.position.set(0, 3, 1);
    g.add(warm);

    // стойка
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.05, 1.4), mat(0x9c6644));
    counter.position.set(0, 0.52, 2.1);
    counter.castShadow = true;
    g.add(counter);

    // печь
    const oven = buildPizzaOven();
    oven.position.set(-5.5, 0, -4.5);
    oven.scale.setScalar(1.4);
    g.add(oven);

    // картины Италии на стенах
    const art = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.1), mat(0x90e0ef, 0.5));
    art.position.set(3, 2.4, -6.75);
    g.add(art);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.1), mat(0x6a994e));
    flag.position.set(-3, 2.4, -6.75);
    g.add(flag);

    this.scene.add(g);
    this.restaurant.counterPos = new THREE.Vector3(60, 1.05, 2.1);
  }

  private buildPlayer() {
    this.player.group.position.copy(this.playerPos);
    this.scene.add(this.player.group);
  }

  /* ============================== Экраны ============================== */

  private showTitle() {
    this.mode = "title";
    this.hud.showHud(false);
    this.hud.showTitle(
      { coins: this.save.coins, stars: this.save.stars, fans: this.save.fans, bestServed: this.save.bestServed },
      () => this.startWorld(),
    );
  }

  private startWorld() {
    this.hud.closeModal();
    this.mode = "world";
    this.hud.showHud(true);
    this.hud.banner("🌍 Добро пожаловать в Тоскану, Италия!");
    this.audio.sfx("chime");
    this.applySaveToWorld();
    this.refreshHud();
    this.updateQuest();
  }

  /** Восстановить состояние мира из сохранения (после перезахода) */
  private applySaveToWorld() {
    const f = this.save.flags;
    for (const n of this.npcs) {
      n.done = !!f[`npc_${n.def.id}`];
    }
    this.basilQuestActive = !!f.basilQuest;
    this.basilCollected = 0;
    this.basils.forEach((b, index) => {
      b.taken = this.save.ingredients.includes("basil") || !!f[`basil_${index}`];
      if (b.taken) this.basilCollected++;
      b.group.visible = !b.taken;
    });
    if (f.villainCaught) { this.villainCaught = true; }
    if (f.restaurantDone) this.restaurantDone = true;
    if (f.photoDone) this.photoDone = true;
    // Resume an interrupted chase; an awarded ingredient must never disappear forever.
    if (f.npc_marco && !this.save.ingredients.includes("flour") && !this.restaurantDone) {
      this.triggerVillain();
    }
  }

  private restaurantDone = false;
  private photoDone = false;

  private refreshHud() {
    this.hud.setStats(this.save.coins, this.save.stars, this.save.fans);
    this.hud.setInventory(this.save.ingredients.map((id) => INGREDIENTS[id]?.emoji ?? "❓"));
  }

  private updateQuest() {
    const inv = this.save.ingredients;
    const f = this.save.flags;
    let q: string;
    if (this.stolenIngredient && this.villainActive) q = `${VILLAIN.name} украл муку! Догони его и нажми E! 🎩`;
    else if (!inv.includes("tomato")) q = "Поговори с Нонной Розой на рынке — разгадай её загадку 🍅";
    else if (!inv.includes("basil")) q = "Фермер Лука ждёт: собери 3 листика базилика на поле 🌿";
    else if (!inv.includes("mozzarella")) q = "Вернись к фермеру Луке за моцареллой 🧀";
    else if (!inv.includes("flour")) q = "Пройди экзамен у шефа Марко у пиццерии 🌾";
    else if (this.stolenIngredient && this.villainActive) q = `${VILLAIN.name} украл ${INGREDIENTS[this.stolenIngredient].name}! Догони его и нажми E! 🎩`;
    else if (!this.restaurantDone) q = "Всё собрано! Зайди в пиццерию Марко (жёлтый круг у двери) 🍕";
    else if (!this.photoDone) q = "Открой 📖 Рецепт — приготовь пиццу дома и загрузи фото!";
    else q = "Ты Шеф-повар мира! Загляни на карту мира 🗺️";
    this.hud.setQuest(q);
    void f;
  }

  /* ============================== Экономика ============================== */

  private addCoins(n: number, at?: THREE.Vector3) {
    this.save.coins += n;
    this.hud.setStats(this.save.coins, this.save.stars, this.save.fans);
    if (at) this.spawnCoinBurst(at);
    this.audio.sfx("coin");
    this.saveSoon();
  }

  private addStars(n: number) {
    this.save.stars += n;
    this.hud.setStats(this.save.coins, this.save.stars, this.save.fans);
    this.saveSoon();
  }

  private addFans(n: number) {
    this.save.fans += n;
    this.hud.setStats(this.save.coins, this.save.stars, this.save.fans);
    this.saveSoon();
  }

  private giveIngredient(id: string) {
    if (!this.save.ingredients.includes(id)) {
      this.save.ingredients.push(id);
      this.hud.toast(`Получен ингредиент: ${INGREDIENTS[id].emoji} ${INGREDIENTS[id].name}!`);
      this.refreshHud();
      this.audio.sfx("pickup");
      this.saveSoon();
    }
  }

  private spawnCoinBurst(at: THREE.Vector3) {
    for (let i = 0; i < 8; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.coinTex, transparent: true }));
      sprite.position.copy(at).add(new THREE.Vector3(0, 1.2, 0));
      sprite.scale.setScalar(0.4);
      this.scene.add(sprite);
      this.particles.push({
        sprite,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 3),
        life: 1,
      });
    }
  }

  /* ============================== Диалоги ============================== */

  private openNpcDialog(npc: NpcInstance) {
    this.audio.sfx("ui");
    const def = npc.def;

    if (def.id === "nonna") {
      if (npc.done) { this.hud.showDialog({ speaker: def.name, emoji: def.emoji, text: def.doneText }); return; }
      this.hud.showDialog({
        speaker: def.name, emoji: def.emoji, text: def.greeting,
        onContinue: () => this.askNonna(npc),
      });
      return;
    }

    if (def.id === "luca") {
      if (npc.done) { this.hud.showDialog({ speaker: def.name, emoji: def.emoji, text: def.doneText }); return; }
      if (!this.save.ingredients.includes("tomato")) {
        this.hud.showDialog({ speaker: def.name, emoji: def.emoji, text: "Сначала добудь помидоры у Нонны Розы на рынке, потом поговорим!" });
        return;
      }
      if (!this.save.ingredients.includes("basil")) {
        if (!this.basilQuestActive) {
          this.basilQuestActive = true;
          this.save.flags.basilQuest = true;
          this.saveSoon();
        }
        const left = 3 - this.basilCollected;
        this.hud.showDialog({
          speaker: def.name, emoji: def.emoji, text: def.greeting,
          onContinue: () => {
            if (left > 0) {
              this.hud.showDialog({
                speaker: def.name, emoji: def.emoji,
                text: `Осталось собрать листиков: ${left}. Они зелёные и светятся — подойди и нажми E!`,
                onContinue: () => this.hud.hideDialog(),
              });
            } else {
              this.finishLuca(npc);
            }
          },
        });
        return;
      }
      this.finishLuca(npc);
      return;
    }

    // Марко
    if (npc.done) { this.hud.showDialog({ speaker: def.name, emoji: def.emoji, text: def.doneText }); return; }
    if (this.save.ingredients.length < 3) {
      this.hud.showDialog({ speaker: def.name, emoji: def.emoji, text: "Эй, у тебя ещё не все ингредиенты! Вернись, когда соберёшь помидоры, базилик и моцареллу." });
      return;
    }
    this.hud.showDialog({
      speaker: def.name, emoji: def.emoji, text: def.greeting,
      onContinue: () => this.askMarco(npc),
    });
  }

  private askNonna(npc: NpcInstance) {
    const step = npc.def.quest[0];
    this.hud.showDialog({
      speaker: step.speaker, emoji: npc.def.emoji, text: step.text,
      choices: step.choices!.map((c) => ({
        label: c.text,
        onPick: () => {
          if (c.correct) {
            npc.done = true;
            this.save.flags[`npc_nonna`] = true;
            this.giveIngredient(step.gives!);
            this.addCoins(c.coins ?? 0, npc.rig.group.position);
            this.addStars(step.stars ?? 0);
            this.hud.showDialog({ speaker: npc.def.name, emoji: npc.def.emoji, text: c.reply });
            this.audio.sfx("win");
            this.updateQuest();
          } else {
            this.audio.sfx("wrong");
            this.hud.showDialog({ speaker: npc.def.name, emoji: npc.def.emoji, text: c.reply, onContinue: () => this.askNonna(npc) });
          }
        },
      })),
    });
  }

  private finishLuca(npc: NpcInstance) {
    if (npc.done) { this.hud.showDialog({ speaker: npc.def.name, emoji: npc.def.emoji, text: npc.def.doneText }); return; }
    npc.done = true;
    this.save.flags[`npc_luca`] = true;
    this.giveIngredient("mozzarella");
    this.addCoins(20, npc.rig.group.position);
    this.addStars(1);
    this.audio.sfx("win");
    this.hud.showDialog({
      speaker: npc.def.name, emoji: npc.def.emoji,
      text: "Вот твоя моцарелла! Базилик ты уже собрал. Итальянцы говорят: «Моцарелла, помидор, базилик — это флаг Италии на тарелке!» 🇮🇹",
    });
    this.updateQuest();
  }

  private askMarco(npc: NpcInstance) {
    const step = npc.def.quest[this.marcoStep];
    if (!step) {
      // экзамен пройден
      npc.done = true;
      this.save.flags[`npc_marco`] = true;
      this.giveIngredient("flour");
      this.addStars(step === undefined ? 1 : 1);
      this.audio.sfx("win");
      this.hud.showDialog({
        speaker: npc.def.name, emoji: npc.def.emoji,
        text: "Все три вопроса — верно! Вот мука 00. А теперь — на кухню! Покажи класс, маленький шеф!",
        onContinue: () => {
          this.hud.hideDialog();
          this.triggerVillain();
        },
      });
      this.updateQuest();
      return;
    }
    this.hud.showDialog({
      speaker: step.speaker, emoji: npc.def.emoji, text: step.text,
      choices: step.choices!.map((c) => ({
        label: c.text,
        onPick: () => {
          if (c.correct) {
            this.addCoins(c.coins ?? 0, npc.rig.group.position);
            this.audio.sfx("correct");
            this.hud.showDialog({
              speaker: npc.def.name, emoji: npc.def.emoji, text: c.reply,
              onContinue: () => { this.marcoStep++; this.askMarco(npc); },
            });
          } else {
            this.audio.sfx("wrong");
            this.hud.showDialog({ speaker: npc.def.name, emoji: npc.def.emoji, text: c.reply, onContinue: () => this.askMarco(npc) });
          }
        },
      })),
    });
  }

  /* ============================== Злодей ============================== */

  private triggerVillain() {
    // Крюк крадёт последний полученный ингредиент
    this.stolenIngredient = "flour";
    const idx = this.save.ingredients.indexOf("flour");
    if (idx >= 0) this.save.ingredients.splice(idx, 1);
    this.refreshHud();
    this.villainActive = true;
    this.villainCaught = false;
    this.villainSpeed = 3.4;
    this.villainTimer = 45;
    this.villainPos.set(0, 0, -8);
    this.villain.group.position.copy(this.villainPos);
    this.saveSoon();
    this.villain.group.visible = true;
    this.hud.banner(`🎩 ${VILLAIN.stealLine}`, 4200);
    this.audio.sfx("explosion");
    this.updateQuest();
  }

  private catchVillain() {
    this.villainActive = false;
    this.villain.group.visible = false;
    this.villainCaught = true;
    this.save.flags.villainCaught = true;
    if (this.stolenIngredient) {
      this.giveIngredient(this.stolenIngredient);
      this.stolenIngredient = null;
    }
    this.addCoins(25, this.villainPos);
    this.addStars(1);
    this.audio.sfx("win");
    this.hud.banner(`🎉 Поймал! ${VILLAIN.caughtLine}`, 4200);
    this.updateQuest();
    this.saveSoon();
  }

  /* ============================== Ресторан ============================== */

  private enterRestaurant() {
    this.mode = "restaurant";
    this.hud.hideDialog();
    this.hud.setPrompt("");
    const r = this.restaurant;
    r.served = 0;
    r.angry = 0;
    r.coins = 0;
    r.order = [];
    r.stepIndex = 0;
    r.message = "Гости идут! Жди заказ и жми на шаги по порядку!";
    r.messageT = 4;
    r.spawnT = 1;
    r.guests.forEach((g2) => this.scene.remove(g2.rig.group));
    r.guests = [];
    this.updatePizza(0);
    this.renderRestaurantHud();
    this.hud.banner("🍕 Ресторан Марко открыт! Накорми 5 гостей!");
    this.audio.sfx("chime");
  }

  private updatePizza(progress: number) {
    const r = this.restaurant;
    if (r.pizza) this.scene.remove(r.pizza);
    r.pizza = buildPizza(progress);
    r.pizza.position.set(60 + 1.6, 1.05, 2.1);
    this.scene.add(r.pizza);
  }

  private newOrder(): string[] {
    return COOK_STEPS.map((s) => s.id);
  }

  private renderRestaurantHud() {
    const r = this.restaurant;
    const state: RestaurantState = {
      served: r.served, total: RESTAURANT.guestsToServe,
      angry: r.angry, maxAngry: RESTAURANT.angryToLose,
      coins: r.coins,
      order: r.order, stepIndex: r.stepIndex,
      timeLeft: r.timeLeft, orderTime: RESTAURANT.orderTime,
      message: r.message,
    };
    this.hud.renderRestaurant(state, COOK_STEPS, (id) => this.restaurantStep(id));
  }

  private restaurantStep(id: string) {
    const r = this.restaurant;
    if (!r.order.length) return;
    const expected = r.order[r.stepIndex];
    if (id === expected) {
      r.stepIndex++;
      this.updatePizza(r.stepIndex);
      this.audio.sfx("correct");
      if (r.stepIndex >= r.order.length) {
        // готово! гость уходит довольный
        const pay = RESTAURANT.payPerGuest + (r.timeLeft > RESTAURANT.orderTime / 2 ? RESTAURANT.speedBonus : 0);
        r.coins += pay;
        this.save.coins += pay;
        r.served++;
        this.audio.sfx("coin");
        this.hud.toast(`🍕 Гость накормлен! +${pay} монет!`);
        const guest = r.guests.find((g2) => g2.state !== "leave");
        if (guest) { guest.state = "leave"; guest.happy = true; }
        r.order = [];
        r.stepIndex = 0;
        this.updatePizza(0);
        this.refreshHud();
        this.saveSoon();
        if (r.served >= RESTAURANT.guestsToServe) {
          this.finishRestaurant();
          return;
        }
        r.spawnT = 1.2;
        r.message = "Отлично! Следующий гость…";
        r.messageT = 2;
      }
    } else {
      r.angry++;
      this.audio.sfx("wrong");
      r.message = "Ой! Не тот шаг — гость разозлился 😠. Смотри на заказ сверху!";
      r.messageT = 3;
      if (r.angry >= RESTAURANT.angryToLose) {
        this.failRestaurant();
        return;
      }
    }
    this.renderRestaurantHud();
  }

  private finishRestaurant() {
    this.restaurantDone = true;
    this.save.flags.restaurantDone = true;
    this.save.served = this.restaurant.served;
    this.save.bestServed = Math.max(this.save.bestServed, this.restaurant.served);
    this.addStars(2);
    this.addFans(10);
    this.audio.sfx("win");
    this.hud.removeRestaurant();
    this.mode = "world";
    this.returnFromRestaurant();
    this.hud.banner("🏆 Кухня Марко покорена! +2⭐ и 10 фанатов!", 3500);
    this.hud.toast("📖 Открой РЕЦЕПТ — приготовь пиццу по-настоящему!");
    this.updateQuest();
    this.saveSoon();
  }

  private failRestaurant() {
    this.audio.sfx("lose");
    this.mode = "gameover";
    this.hud.removeRestaurant();
    this.hud.showGameOver(
      "Трое гостей ушли недовольными. Не расстраивайся — даже шеф Марко когда-то жёг пиццу! Попробуй ещё раз.",
      () => { this.hud.closeModal(); this.enterRestaurant(); },
      () => { this.hud.closeModal(); this.returnFromRestaurant(); this.showTitle(); },
    );
  }

  private returnFromRestaurant() {
    // вернуть игрока к двери пиццерии
    this.playerPos.set(8, 0, 1);
    this.camYaw = 0;
    this.playerYaw = 0;
  }

  /* ============================== Реальная миссия / карта ============================== */

  private openRealMission() {
    if (!this.restaurantDone) {
      this.hud.toast("📖 Рецепт откроется после ресторана шефа Марко!");
      this.audio.sfx("ui");
      return;
    }
    this.audio.sfx("ui");
    this.hud.showRealMission(
      { ...REAL_RECIPE, photo: this.save.photo, progress: this.save.realMission },
      (dataUrl) => {
        this.save.photo = dataUrl;
        this.photoDone = true;
        this.save.flags.photoDone = true;
        this.addCoins(50);
        this.addStars(1);
        this.addFans(25);
        this.audio.sfx("win");
        this.persist();
        this.openRealMission(); // перерисовать с фото
        this.updateQuest();
        window.setTimeout(() => this.winGame(), 400);
      },
      () => this.openMap(),
      (progress) => { this.save.realMission = progress; this.saveSoon(); },
    );
  }

  private openMap() {
    this.audio.sfx("ui");
    const fromVictory = this.mode === "victory";
    const pins = [
      ...WORLD_MAP.unlocked.map((u) => ({ ...u, photo: true })),
      ...WORLD_MAP.locked.map((l) => ({ ...l, locked: true })),
    ];
    this.hud.showMap(this.save.photo, pins, fromVictory ? () => this.winGame() : undefined);
  }

  private winGame() {
    this.mode = "victory";
    this.hud.showVictory(
      { coins: this.save.coins, stars: this.save.stars, fans: this.save.fans, served: this.save.served || RESTAURANT.guestsToServe },
      () => this.openMap(),
      () => { this.resetProgress(); this.startWorld(); },
    );
    this.persist();
  }

  private resetProgress() {
    this.hud.hideDialog();
    this.hud.removeRestaurant();
    this.save = { coins: 0, stars: 0, fans: 0, ingredients: [], flags: {}, photo: null, served: 0, bestServed: this.save.bestServed };
    for (const n of this.npcs) n.done = false;
    this.marcoStep = 0;
    this.basilQuestActive = false;
    this.basilCollected = 0;
    for (const b of this.basils) { b.taken = false; b.group.visible = true; }
    this.restaurantDone = false;
    this.photoDone = false;
    this.villainActive = false;
    this.villainCaught = false;
    this.villain.group.visible = false;
    this.stolenIngredient = null;
    this.returnFromRestaurant();
    this.persist();
  }

  /* ============================== Пауза ============================== */

  private togglePause() {
    if (this.mode !== "world" && this.mode !== "restaurant") return;
    this.paused = !this.paused;
    this.audio.sfx("ui");
    if (this.paused) {
      this.hud.showPause(
        () => this.togglePause(),
        () => { this.paused = false; this.hud.closeModal(); this.resetProgress(); this.startWorld(); },
        this.audio.muted,
        () => this.audio.toggleMute(),
      );
    } else {
      this.hud.closeModal();
    }
  }

  /* ============================== Обновление ============================== */

  private update(dt: number) {
    if (this.mode === "title" || this.mode === "victory" || this.mode === "gameover") return;
    if (this.input.consumeAction("Escape") || this.input.consumeAction("KeyP")) this.togglePause();
    if (this.paused) return;

    // автосохранение
    if (this.saveTimer > 0) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) this.persist();
    }


    if (this.mode === "world") this.updateWorld(dt);
    else if (this.mode === "restaurant" && !this.hud.modalOpen) this.updateRestaurant(dt);

    // облака плывут
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.6;
      if (cl.position.x > 45) cl.position.x = -45;
    }

    // частицы
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 6 * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        this.particles.splice(i, 1);
      }
    }

    this.input.consumeLook();
  }

  private updateWorld(dt: number) {
    const dialogOpen = this.hud.dialogOpen || this.hud.modalOpen;

    // камера: мышь
    const look = this.input.consumeLook();
    this.camYaw += look.yaw;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.pitch, 0.15, 1.1);

    // движение
    let mx = this.input.moveX;
    let mz = this.input.moveZ;
    if (dialogOpen) { mx = 0; mz = 0; }
    const moving = Math.abs(mx) > 0.01 || Math.abs(mz) > 0.01;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const vx = (mx * cos - mz * sin) * 6;
      const vz = (-mx * sin - mz * cos) * 6;
      const nx = this.playerPos.x + vx * dt;
      const nz = this.playerPos.z + vz * dt;
      if (this.canStand(nx, this.playerPos.z)) this.playerPos.x = nx;
      if (this.canStand(this.playerPos.x, nz)) this.playerPos.z = nz;
      this.playerYaw = Math.atan2(vx, vz);
      this.walkPhase += dt * 10;
      if (Math.floor(this.walkPhase) % 6 === 0) this.audio.sfx("move");
    }

    // анимация персонажа
    const p = this.player;
    p.group.position.copy(this.playerPos);
    p.group.rotation.y = THREE.MathUtils.lerp(p.group.rotation.y, this.playerYaw, Math.min(1, dt * 12));
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    p.leftLeg.rotation.x = swing;
    p.rightLeg.rotation.x = -swing;
    p.leftArm.rotation.x = -swing * 0.7;
    p.rightArm.rotation.x = swing * 0.7;
    p.body.position.y = 0.95 + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : Math.sin(this.clock.elapsedTime * 2) * 0.02);

    // камера следует
    const dist = 6.8;
    const cx = this.playerPos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.playerPos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = this.playerPos.y + 2 + Math.sin(this.camPitch) * dist;
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
    this.camera.lookAt(this.playerPos.x, this.playerPos.y + 1.4, this.playerPos.z);

    // NPC idle-анимация
    for (const n of this.npcs) {
      n.tag.visible = this.playerPos.distanceTo(n.rig.group.position) < 5.5;
      n.bobPhase += dt;
      n.rig.body.position.y = 0.95 + Math.sin(n.bobPhase * 2) * 0.03;
      n.rig.head.rotation.y = Math.sin(n.bobPhase * 0.7) * 0.4;
    }

    // листики базилика крутятся
    for (const b of this.basils) {
      if (b.taken) continue;
      b.phase += dt * 2;
      b.group.rotation.y = b.phase;
      b.group.position.y = Math.sin(b.phase * 1.4) * 0.12;
    }

    // маркер двери пульсирует
    const pulse = 0.55 + Math.sin(this.clock.elapsedTime * 4) * 0.25;
    (this.doorMarker.material as THREE.MeshBasicMaterial).opacity = pulse;

    // базилик: подбор
    if (this.basilQuestActive && !this.save.ingredients.includes("basil")) {
      for (const b of this.basils) {
        if (b.taken) continue;
        const dx = this.playerPos.x - b.x;
        const dz = this.playerPos.z - b.z;
        if (dx * dx + dz * dz < 1.2) {
          b.taken = true;
          b.group.visible = false;
          this.basilCollected++;
          this.save.flags[`basil_${this.basils.indexOf(b)}`] = true;
          this.saveSoon();
          this.audio.sfx("pickup");
          this.spawnCoinBurst(new THREE.Vector3(b.x, 0, b.z));
          if (this.basilCollected >= 3) {
            this.giveIngredient("basil");
            this.hud.banner("🌿 Отлично! Базилик собран — неси Луке!");
          } else {
            this.hud.toast(`🌿 Листик базилика! Ещё ${3 - this.basilCollected}`);
          }
          this.updateQuest();
        }
      }
    }

    // взаимодействия: поиск цели
    this.interactTarget = null;
    if (!dialogOpen) {
      let best = 2.4;
      for (const n of this.npcs) {
        const d = Math.hypot(this.playerPos.x - n.def.pos[0], this.playerPos.z - n.def.pos[2]);
        if (d < best) { best = d; this.interactTarget = { kind: "npc", npc: n }; }
      }
      if (this.villainActive) {
        const d = Math.hypot(this.playerPos.x - this.villainPos.x, this.playerPos.z - this.villainPos.z);
        if (d < best) { best = d; this.interactTarget = { kind: "villain" }; }
      }
      const dd = Math.hypot(this.playerPos.x - this.doorPos.x, this.playerPos.z - this.doorPos.z);
      if (dd < best) { this.interactTarget = { kind: "door" }; }
    }

    // промпт
    if (this.interactTarget?.kind === "npc") this.hud.setPrompt(`E — говорить с ${this.interactTarget.npc.def.name}`);
    else if (this.interactTarget?.kind === "villain") this.hud.setPrompt("E — поймать Критика Крюка!");
    else if (this.interactTarget?.kind === "door") {
      const locked = !this.restaurantDone && !this.save.ingredients.includes("flour");
      this.hud.setPrompt(locked ? "🔒 Собери все ингредиенты, чтобы войти" : this.restaurantDone ? "E — на кухню Марко (повторить!)" : "E — войти в пиццерию");
    }
    else this.hud.setPrompt("");

    // E — действие
    if (this.input.consumeAction("KeyE") && this.interactTarget) {
      const t = this.interactTarget;
      if (t.kind === "npc") this.openNpcDialog(t.npc);
      else if (t.kind === "villain") {
        if (Math.hypot(this.playerPos.x - this.villainPos.x, this.playerPos.z - this.villainPos.z) < 2.4) this.catchVillain();
      } else if (t.kind === "door") {
        if (!this.restaurantDone && !this.save.ingredients.includes("flour")) {
          this.hud.toast("🔒 Сначала собери все ингредиенты для пиццы!");
          this.audio.sfx("wrong");
        } else {
          this.enterRestaurant();
        }
      }
    }

    // злодей AI
    if (this.villainActive) {
      const toPlayer = Math.hypot(this.playerPos.x - this.villainPos.x, this.playerPos.z - this.villainPos.z);
      let dirX = 0;
      let dirZ = 0;
      if (toPlayer < 7) {
        // бежит от игрока
        dirX = (this.villainPos.x - this.playerPos.x) / Math.max(toPlayer, 0.001);
        dirZ = (this.villainPos.z - this.playerPos.z) / Math.max(toPlayer, 0.001);
        this.villainSpeed = 4.2;
      } else {
        // болтается кругами
        this.villainPhase += dt * 0.9;
        dirX = Math.cos(this.villainPhase);
        dirZ = Math.sin(this.villainPhase * 1.3);
        this.villainSpeed = 1.6;
      }
      let nx = this.villainPos.x + dirX * this.villainSpeed * dt;
      let nz = this.villainPos.z + dirZ * this.villainSpeed * dt;
      const rr = Math.hypot(nx, nz);
      if (rr > WORLD_R) { nx *= WORLD_R / rr; nz *= WORLD_R / rr; }
      if (this.canStand(nx, this.villainPos.z)) this.villainPos.x = nx;
      if (this.canStand(this.villainPos.x, nz)) this.villainPos.z = nz;
      this.villain.group.position.copy(this.villainPos);
      this.villain.group.rotation.y = Math.atan2(dirX, dirZ);
      this.villain.leftLeg.rotation.x = Math.sin(this.clock.elapsedTime * 12) * 0.7;
      this.villain.rightLeg.rotation.x = -Math.sin(this.clock.elapsedTime * 12) * 0.7;
      this.villain.group.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 12)) * 0.08;

      this.villainTimer -= dt;
      if (this.villainTimer <= 0) {
        this.villainActive = false;
        this.villain.group.visible = false;
        if (this.stolenIngredient) {
          this.giveIngredient(this.stolenIngredient);
          this.stolenIngredient = null;
        }
        this.hud.banner(`🎩 ${VILLAIN.escapeLine}`, 4000);
        this.updateQuest();
      }
    }
  }

  private canStand(x: number, z: number): boolean {
    if (Math.hypot(x, z) > WORLD_R) return false;
    for (const c of this.colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + 0.4) * (c.r + 0.4)) return false;
    }
    return true;
  }

  private updateRestaurant(dt: number) {
    const r = this.restaurant;

    // камера в зале: вид на стойку, пиццу и очередь гостей
    this.camera.position.lerp(new THREE.Vector3(60, 3.8, 6.6), Math.min(1, dt * 4));
    this.camera.lookAt(60.4, 0.9, 0.8);

    // спавн гостей
    r.spawnT -= dt;
    if (r.spawnT <= 0 && r.guests.filter((g2) => g2.state !== "leave").length < 1 && r.served < RESTAURANT.guestsToServe) {
      const colors = [0x2a9d8f, 0xe9c46a, 0xf4a261, 0x9b5de5, 0x00b4d8, 0xef476f];
      const rig = buildCharacter({ bodyColor: colors[Math.floor(Math.random() * colors.length)], hat: "none" });
      rig.group.position.set(60, 0, 6);
      this.scene.add(rig.group);
      r.guests.push({ rig, state: "enter", pos: new THREE.Vector3(60, 0, 6), t: 0, happy: false });
      r.order = this.newOrder();
      r.stepIndex = 0;
      r.timeLeft = RESTAURANT.orderTime;
      this.updatePizza(0);
      this.audio.sfx("ui");
      this.renderRestaurantHud();
      r.spawnT = 999;
    }

    // гости идут к стойке и уходят
    for (const g2 of r.guests) {
      const gp = g2.rig.group.position;
      if (g2.state === "enter") {
        const target = new THREE.Vector3(60 + 1.6, 0, 3.4);
        const dir = target.clone().sub(gp);
        if (dir.length() > 0.1) {
          dir.normalize();
          gp.addScaledVector(dir, dt * 2.2);
          g2.rig.group.rotation.y = Math.atan2(dir.x, dir.z);
          g2.rig.leftLeg.rotation.x = Math.sin(this.clock.elapsedTime * 10) * 0.6;
          g2.rig.rightLeg.rotation.x = -Math.sin(this.clock.elapsedTime * 10) * 0.6;
        } else {
          g2.state = "wait";
          g2.rig.group.rotation.y = Math.PI; // лицом к стойке
        }
      } else if (g2.state === "wait") {
        g2.rig.body.position.y = 0.95 + Math.sin(this.clock.elapsedTime * 2 + gp.x) * 0.03;
      } else if (g2.state === "leave") {
        const target = new THREE.Vector3(60, 0, 8.5);
        const dir = target.clone().sub(gp);
        if (dir.length() > 0.1) {
          dir.normalize();
          gp.addScaledVector(dir, dt * (g2.happy ? 3 : 2));
          g2.rig.group.rotation.y = Math.atan2(dir.x, dir.z);
          const j = g2.happy ? Math.abs(Math.sin(this.clock.elapsedTime * 8)) * 0.25 : 0;
          g2.rig.group.position.y = j;
        } else {
          this.scene.remove(g2.rig.group);
          r.guests.splice(r.guests.indexOf(g2), 1);
          r.spawnT = g2.happy ? 1 : 1.6;
        }
      }
    }

    // таймер заказа
    if (r.order.length) {
      r.timeLeft -= dt;
      this.hud.updateTimer(r.timeLeft / RESTAURANT.orderTime, r.timeLeft < 6);
      if (r.timeLeft <= 0) {
        r.angry++;
        this.audio.sfx("wrong");
        r.message = "Гость ушёл голодным! 😠 Поторопись в следующий раз!";
        r.messageT = 3;
        const guest = r.guests.find((g2) => g2.state !== "leave");
        if (guest) guest.state = "leave";
        r.order = [];
        r.stepIndex = 0;
        this.updatePizza(0);
        if (r.angry >= RESTAURANT.angryToLose) { this.failRestaurant(); return; }
        r.spawnT = 1.4;
        this.renderRestaurantHud();
      }
    }

    if (r.messageT > 0) {
      r.messageT -= dt;
      if (r.messageT <= 0) { r.message = ""; this.renderRestaurantHud(); }
    }
  }

  /* ============================== Рендер ============================== */

  private render() {
    const frozen = this.paused || this.mode === "title" || this.mode === "gameover" || this.mode === "victory";
    if (frozen && this.renderedStatic && !this.renderDirty) return;
    // Dialogues are DOM overlays. Avoid redrawing an almost static 3D background at 60 Hz.
    if (!frozen && (this.hud.dialogOpen || this.hud.modalOpen) && performance.now() - this.lastRender < 100) return;
    this.renderedStatic = frozen;
    this.renderDirty = false;
    this.lastRender = performance.now();
    this.restaurant.group.visible = this.mode === "restaurant" || this.mode === "gameover";
    this.renderer.render(this.scene, this.camera);
  }

  private onResize = () => {
    this.renderDirty = true;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.hud.dispose();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pagehide", this.onPageHide);
    this.renderer.dispose();
  }

  /* ============================== Пробник для верификации ============================== */

  getProbe() {
    return { x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z };
  }

  /** Тестовый хук: телепорт игрока и чтение состояния для автопроверки. */
  debugTeleport(x: number, z: number) {
    this.playerPos.set(x, 0, z);
    this.player.group.position.copy(this.playerPos);
    const dist = 6.8;
    this.camera.position.set(
      x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist,
      2 + Math.sin(this.camPitch) * dist,
      z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist,
    );
  }

  /** Отладочный хук: задать камеру вручную (только для диагностики). */
  debugCamera(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
    this.renderDirty = true;
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(tx, ty, tz);
  }

  debugState() {
    return {
      mode: this.mode,
      rendererMode: this.renderer.mode,
      renderInfo: {calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles},
      doorPos: {x:this.doorPos.x,z:this.doorPos.z},
      paused: this.paused,
      coins: this.save.coins,
      stars: this.save.stars,
      fans: this.save.fans,
      ingredients: [...this.save.ingredients],
      villainActive: this.villainActive,
      restaurantDone: this.restaurantDone,
      photoDone: this.photoDone,
      served: this.restaurant.served,
      basilCollected: this.basilCollected,
      marcoStep: this.marcoStep,
      villainPos: { x: this.villainPos.x, z: this.villainPos.z },
      orderActive: this.restaurant.order.length > 0,
    };
  }
}
