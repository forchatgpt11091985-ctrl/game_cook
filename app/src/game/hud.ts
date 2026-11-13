/**
 * hud.ts — весь DOM-интерфейс игры: заголовок, HUD, диалоги, ресторан,
 * реальная миссия (рецепт + фото), карта мира, пауза, победа/поражение.
 * Реакт не участвует: всё создаётся и обновляется императивно из игрового кода.
 */

export interface Choice {
  label: string;
  onPick?: () => void;
}

export interface DialogOptions {
  speaker: string;
  emoji?: string;
  text: string;
  choices?: Choice[];
  continueLabel?: string;
  onContinue?: () => void;
}

export interface RestaurantState {
  served: number;
  total: number;
  angry: number;
  maxAngry: number;
  coins: number;
  order: string[]; // id шагов текущего заказа
  stepIndex: number;
  timeLeft: number;
  orderTime: number;
  message: string;
}

export interface RecipeView {
  dish: string;
  country: string;
  servings: string;
  shopping: { item: string; qty: string; price: number }[];
  steps: string[];
  cameraChecklist: string[];
  photo: string | null;
  progress?: { shopping: boolean; cooking: boolean; report: string };
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function iconBtn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", "hud-btn", label);
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

export class Hud {
  private root: HTMLElement;
  private hudBar: HTMLElement;
  private questEl: HTMLElement;
  private coinsEl: HTMLElement;
  private starsEl: HTMLElement;
  private fansEl: HTMLElement;
  private invEl: HTMLElement;
  private dialogEl: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private toastEl: HTMLElement;
  private bannerEl: HTMLElement;
  private promptEl: HTMLElement;
  private promptText = "";

  private titleKeyCleanup: (() => void) | null = null;

  onMute: () => void = () => {};
  onPause: () => void = () => {};
  onMap: () => void = () => {};
  onRecipe: () => void = () => {};

  constructor(overlay: HTMLElement) {
    this.root = h("div", "hud");
    overlay.appendChild(this.root);

    this.hudBar = h("div", "hud-bar hidden");
    this.coinsEl = h("span", "hud-stat", "🪙 0");
    this.starsEl = h("span", "hud-stat", "⭐ 0");
    this.fansEl = h("span", "hud-stat", "❤️ 0");
    this.invEl = h("div", "hud-inv");
    this.questEl = h("div", "hud-quest");

    const btns = h("div", "hud-btns");
    btns.append(
      iconBtn("🗺️", "Карта мира", () => this.onMap()),
      iconBtn("📖", "Рецепт", () => this.onRecipe()),
      iconBtn("🔊", "Звук", () => this.onMute()),
      iconBtn("⏸️", "Пауза", () => this.onPause()),
    );
    this.hudBar.append(this.coinsEl, this.starsEl, this.fansEl, btns);
    this.root.append(this.hudBar);

    const side = h("div", "hud-side hidden");
    side.append(this.invEl, this.questEl);
    this.root.append(side);

    this.toastEl = h("div", "toast hidden");
    this.bannerEl = h("div", "banner hidden");
    this.promptEl = h("button", "prompt hidden");
    this.promptEl.setAttribute("aria-label", "Действовать: говорить или войти");
    this.promptEl.addEventListener("click", () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE" }));
    });
    this.root.append(this.toastEl, this.bannerEl, this.promptEl);
  }

  /* ------------------------------ HUD ------------------------------ */

  showHud(show: boolean) {
    this.hudBar.classList.toggle("hidden", !show);
    this.root.querySelector(".hud-side")?.classList.toggle("hidden", !show);
  }

  setStats(coins: number, stars: number, fans: number) {
    this.coinsEl.textContent = `🪙 ${coins}`;
    this.starsEl.textContent = `⭐ ${stars}`;
    this.fansEl.textContent = `❤️ ${fans}`;
  }

  setInventory(items: string[]) {
    this.invEl.innerHTML = "";
    if (!items.length) {
      this.invEl.append(h("span", "inv-empty", "Сумка пуста — ищи ингредиенты!"));
      return;
    }
    for (const it of items) {
      const chip = h("span", "inv-chip", it);
      this.invEl.append(chip);
    }
  }

  setQuest(text: string) {
    this.questEl.innerHTML = "";
    this.questEl.append(h("div", "quest-label", "🎯 МИССИЯ"), h("div", "quest-text", text));
  }

  setPrompt(text: string) {
    if (text === this.promptText) return;
    this.promptText = text;
    if (!text) {
      this.promptEl.classList.add("hidden");
      return;
    }
    this.promptEl.textContent = text;
    this.promptEl.classList.remove("hidden");
  }

  toast(msg: string, ms = 2600) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove("hidden");
    window.clearTimeout((this.toastEl as unknown as { _t?: number })._t);
    (this.toastEl as unknown as { _t?: number })._t = window.setTimeout(
      () => this.toastEl.classList.add("hidden"),
      ms,
    );
  }

  banner(msg: string, ms = 2200) {
    this.bannerEl.innerHTML = "";
    this.bannerEl.append(h("div", "banner-text", msg));
    this.bannerEl.classList.remove("hidden");
    window.clearTimeout((this.bannerEl as unknown as { _t?: number })._t);
    (this.bannerEl as unknown as { _t?: number })._t = window.setTimeout(
      () => this.bannerEl.classList.add("hidden"),
      ms,
    );
  }

  /* ------------------------------ Диалоги ------------------------------ */

  showDialog(o: DialogOptions) {
    this.hideDialog();
    const box = h("div", "dialog");
    const head = h("div", "dialog-head");
    head.append(h("span", "dialog-speaker", `${o.emoji ?? "💬"} ${o.speaker}`));
    const body = h("div", "dialog-text", o.text);
    const foot = h("div", "dialog-foot");
    if (o.choices && o.choices.length) {
      for (const c of o.choices) {
        const b = h("button", "dialog-choice", c.label);
        b.addEventListener("click", () => c.onPick?.());
        foot.append(b);
      }
    } else {
      const b = h("button", "dialog-next", o.continueLabel ?? "Дальше ➜");
      b.addEventListener("click", () => {
        if (o.onContinue) o.onContinue();
        else this.hideDialog();
      });
      foot.append(b);
      window.setTimeout(() => b.focus(), 0);
    }
    box.append(head, body, foot);
    this.dialogEl = box;
    this.root.append(box);
  }

  hideDialog() {
    this.dialogEl?.remove();
    this.dialogEl = null;
  }

  get dialogOpen(): boolean {
    return this.dialogEl !== null;
  }

  /* ------------------------------ Заголовок ------------------------------ */

  showTitle(stats: { coins: number; stars: number; fans: number; bestServed: number }, onPlay: () => void) {
    this.showModal((box) => {
      box.classList.add("title-screen");
      box.append(h("div", "title-emoji", "🌍🍕"));
      box.append(h("h1", "title-logo", "КУХНЯ МИРА"));
      box.append(
        h(
          "p",
          "title-tag",
          "Путешествуй • Разгадывай загадки • Готовь по-настоящему • Собери блюда всего мира!",
        ),
      );
      const play = h("button", "big-btn", "▶ НАЧАТЬ ПРИКЛЮЧЕНИЕ");
      play.addEventListener("click", onPlay);
      box.append(play);

      const how = h("div", "title-how");
      how.append(
        h("div", "how-item", "🕹️ WASD — ходить, мышь — смотреть, E — говорить"),
        h("div", "how-item", "🧩 Помогай жителям Италии и собери все ингредиенты"),
        h("div", "how-item", "🍕 Пройди кухню шефа Марко и накорми гостей"),
        h("div", "how-item", "📸 Приготовь блюдо в реальной жизни и загрузи фото — оно попадёт на карту мира!"),
      );
      box.append(how);

      if (stats.bestServed > 0 || stats.coins > 0) {
        const save = h(
          "div",
          "title-save",
          `Твой прогресс: 🪙 ${stats.coins} • ⭐ ${stats.stars} • ❤️ ${stats.fans} • Рекорд ресторана: ${stats.bestServed} гостей`,
        );
        box.append(save);
      }
      const hint = h("p", "title-hint", "Нажми ПРОБЕЛ или Enter, чтобы начать");
      box.append(hint);
      box.tabIndex = -1;
      box.focus();
      const keyStart = (e: KeyboardEvent) => {
        if (e.code === "Space" || e.code === "Enter") {
          window.removeEventListener("keydown", keyStart);
          onPlay();
        }
      };
      window.addEventListener("keydown", keyStart);
      this.titleKeyCleanup = () => window.removeEventListener("keydown", keyStart);
    });
  }

  /* ------------------------------ Модалки ------------------------------ */

  private showModal(build: (box: HTMLElement) => void, cls = "modal-wrap"): HTMLElement {
    this.closeModal();
    const wrap = h("div", cls);
    const box = h("div", "modal");
    build(box);
    wrap.append(box);
    this.modal = wrap;
    this.root.append(wrap);
    return box;
  }

  closeModal() {
    this.titleKeyCleanup?.();
    this.titleKeyCleanup = null;
    this.modal?.remove();
    this.modal = null;
  }

  get modalOpen(): boolean {
    return this.modal !== null;
  }

  /* ------------------------------ Пауза ------------------------------ */

  showPause(onResume: () => void, onRestart: () => void, muted: boolean, onMute: () => void) {
    this.showModal((box) => {
      box.append(h("h2", "modal-title", "⏸️ Пауза"));
      const resume = h("button", "big-btn", "Продолжить");
      resume.addEventListener("click", onResume);
      let isMuted = muted;
      const mute = h("button", "menu-btn", muted ? "🔇 Включить звук" : "🔊 Выключить звук");
      mute.addEventListener("click", () => {
        onMute();
        isMuted = !isMuted;
        mute.textContent = isMuted ? "🔇 Включить звук" : "🔊 Выключить звук";
      });
      const restart = h("button", "menu-btn danger", "🔄 Начать заново");
      restart.addEventListener("click", onRestart);
      box.append(resume, mute, restart);
      box.append(h("p", "modal-hint", "Клавиша P или Esc — продолжить"));
    });
  }

  /* ------------------------------ Ресторан ------------------------------ */

  renderRestaurant(
    state: RestaurantState,
    steps: { id: string; name: string; emoji: string }[],
    onStep: (id: string) => void,
  ) {
    let box = this.root.querySelector(".restaurant") as HTMLElement | null;
    if (!box) {
      box = h("div", "restaurant");
      this.root.append(box);
    }
    box.innerHTML = "";

    const top = h("div", "rest-top");
    top.append(
      h("span", "rest-stat", `🍽️ Гости: ${state.served}/${state.total}`),
      h("span", "rest-stat angry", `😠 Довольно ошибок: ${state.angry}/${state.maxAngry}`),
      h("span", "rest-stat", `🪙 +${state.coins}`),
    );
    box.append(top);

    if (state.order.length) {
      const orderBar = h("div", "rest-order");
      orderBar.append(h("span", "rest-order-label", "Заказ гостя:"));
      const seq = h("div", "rest-seq");
      state.order.forEach((id, i) => {
        const step = steps.find((s) => s.id === id)!;
        const chip = h("span", "rest-chip" + (i < state.stepIndex ? " done" : i === state.stepIndex ? " active" : ""), `${step.emoji} ${step.name}`);
        seq.append(chip);
      });
      orderBar.append(seq);

      // таймер
      const barWrap = h("div", "rest-timer");
      const bar = h("div", "rest-timer-fill");
      bar.style.width = `${Math.max(0, (state.timeLeft / state.orderTime) * 100)}%`;
      if (state.timeLeft < 6) bar.classList.add("urgent");
      barWrap.append(bar);
      orderBar.append(barWrap);
      this.restTimerFill = bar;
      box.append(orderBar);

      const btnRow = h("div", "rest-steps");
      steps.forEach((s) => {
        const b = h("button", "rest-step-btn", `${s.emoji}\n${s.name}`);
        b.addEventListener("click", () => onStep(s.id));
        btnRow.append(b);
      });
      box.append(btnRow);
    }

    if (state.message) box.append(h("div", "rest-message", state.message));
  }

  removeRestaurant() {
    this.root.querySelector(".restaurant")?.remove();
    this.restTimerFill = null;
  }

  private restTimerFill: HTMLElement | null = null;

  /** Обновить только полосу таймера — без перестроения панели (каждый кадр). */
  updateTimer(frac: number, urgent: boolean) {
    if (!this.restTimerFill) return;
    this.restTimerFill.style.width = `${Math.max(0, frac * 100)}%`;
    this.restTimerFill.classList.toggle("urgent", urgent);
  }

  /* ------------------------------ Реальная миссия ------------------------------ */

  showRealMission(
    view: RecipeView,
    onPhoto: (dataUrl: string) => void,
    onDone: () => void,
    onProgress: (value: { shopping: boolean; cooking: boolean; report: string }) => void,
  ) {
    this.showModal((box) => {
      box.classList.add("recipe-card");
      box.append(h("div", "modal-emoji", "📸"));
      box.append(h("h2", "modal-title", "РЕАЛЬНАЯ МИССИЯ!"));
      box.append(
        h("p", "modal-text", `Приготовь ${view.dish} (${view.country}) в настоящей кухне вместе с родителями!`),
      );

      box.append(h("p", "modal-hint", `${view.servings}. Фото хранится только в этом браузере. Фанаты — игровые персонажи; материалы никуда не отправляются.`));

      // Список покупок
      const shop = h("div", "recipe-section");
      shop.append(h("h3", "recipe-h", "🛒 Список покупок — сходи в магазин!"));
      let total = 0;
      const ul = h("ul", "shop-list");
      for (const s of view.shopping) {
        total += s.price;
        ul.append(h("li", "shop-item", `${s.item} — ${s.qty} (~${s.price} ₽)`));
      }
      ul.append(h("li", "shop-total", `Итого примерно: ${total} ₽ — вот она, настоящая коммерция!`));
      shop.append(ul);
      box.append(shop);

      // Шаги
      const stepsBox = h("div", "recipe-section");
      stepsBox.append(h("h3", "recipe-h", "👨‍🍳 Рецепт"));
      const ol = h("ol", "recipe-steps");
      view.steps.forEach((s) => ol.append(h("li", "", s)));
      stepsBox.append(ol);
      box.append(stepsBox);

      // Чек-лист для видео
      const cam = h("div", "recipe-section");
      cam.append(h("h3", "recipe-h", "🎥 Сними видео-отчёт для своих фанатов"));
      const cul = h("ul", "cam-list");
      view.cameraChecklist.forEach((s) => cul.append(h("li", "", s)));
      cam.append(cul);
      box.append(cam);

      const progress = { shopping: false, cooking: false, report: "", ...view.progress };
      const real = h("div", "recipe-section");
      real.append(h("h3", "recipe-h", "Мой дневник настоящего шефа"));
      for (const [key, text] of [["shopping", "Я проверил продукты и бюджет со взрослым"], ["cooking", "Мы приготовили блюдо вместе и распределили задачи"]] as const) {
        const label = h("label", "real-check");
        const check = h("input"); check.type = "checkbox"; check.checked = progress[key];
        check.addEventListener("change", () => { progress[key] = check.checked; onProgress({ ...progress }); });
        label.append(check, h("span", "", text)); real.append(label);
      }
      const note = h("textarea", "real-note");
      note.setAttribute("aria-label", "Рассказ о приготовлении");
      note.placeholder = "Кто помогал? Сколько потратили? Что узнал об Италии? Что получилось и чему научился?";
      note.maxLength = 2000; note.value = progress.report;
      note.addEventListener("input", () => { progress.report = note.value; onProgress({ ...progress }); });
      real.append(note); box.append(real);

      // Фото
      const photoBox = h("div", "recipe-section photo-box");
      if (view.photo) {
        photoBox.append(h("h3", "recipe-h", "✅ Твоё блюдо уже на карте мира!"));
        const img = h("img", "photo-preview") as HTMLImageElement;
        img.src = view.photo;
        img.alt = "Твоё блюдо";
        photoBox.append(img);
      } else {
        photoBox.append(h("h3", "recipe-h", "📷 Загрузи фото своего блюда"));
        const label = h("label", "photo-btn", "Выбрать фото…");
        const input = h("input") as HTMLInputElement;
        input.type = "file";
        input.accept = "image/*";
        input.style.display = "none";
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) return;
          if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
            this.toast("Выбери изображение размером до 15 МБ.");
            return;
          }
          const reader = new FileReader();
          reader.onerror = () => this.toast("Не удалось прочитать фото. Выбери другой файл.");
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              // ужимаем, чтобы фото занимало мало места
              const max = 640;
              const k = Math.min(1, max / Math.max(img.width, img.height));
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(img.width * k);
              canvas.height = Math.round(img.height * k);
              canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
              onPhoto(canvas.toDataURL("image/jpeg", 0.82));
            };
            img.onerror = () => this.toast("Не удалось открыть фото. Попробуй JPEG или PNG.");
            img.src = String(reader.result);
          };
          reader.readAsDataURL(file);
        });
        label.append(input);
        photoBox.append(label, h("p", "modal-hint", "Сфотографируй блюдо и процесс готовки!"));
      }
      box.append(photoBox);

      if (view.photo) {
        const done = h("button", "big-btn", "🌍 На карту мира!");
        done.addEventListener("click", onDone);
        box.append(done);
      }
      const close = h("button", "menu-btn", "Вернуться в игру");
      close.addEventListener("click", () => this.closeModal());
      box.append(close);
    });
  }

  /* ------------------------------ Карта мира ------------------------------ */

  showMap(
    photo: string | null,
    pins: { country: string; dish: string; emoji: string; x: number; y: number; locked?: boolean }[],
    onClose?: () => void,
  ) {
    this.showModal((box) => {
      box.classList.add("map-card");
      box.append(h("h2", "modal-title", "🗺️ Мир блюд"));
      const map = h("div", "world-map");
      map.append(h("div", "map-sea", "🌊"));

      for (const p of pins) {
        const pin = h("div", "map-pin" + (p.locked ? " locked" : ""));
        pin.style.left = `${p.x}%`;
        pin.style.top = `${p.y}%`;
        pin.append(h("span", "pin-emoji", p.locked ? "🔒" : p.emoji));
        if (!p.locked && photo) {
          const thumb = h("img", "pin-thumb") as HTMLImageElement;
          thumb.src = photo;
          thumb.alt = `Твоё фото: ${p.dish}`;
          pin.append(thumb);
        }
        const label = h("div", "pin-label");
        label.append(h("b", "", p.country), h("span", "", p.locked ? `${p.dish} — скоро!` : p.dish));
        if (!p.locked && photo) {
          const img = h("img", "pin-photo") as HTMLImageElement;
          img.src = photo;
          img.alt = `Фото блюда из ${p.country}`;
          label.append(img);
        }
        pin.append(label);
        map.append(pin);
      }
      box.append(map);
      const close = h("button", "menu-btn", "Закрыть карту");
      close.addEventListener("click", () => {
        this.closeModal();
        onClose?.();
      });
      box.append(close);
    });
  }

  /* ------------------------------ Победа / поражение ------------------------------ */

  showVictory(stats: { coins: number; stars: number; fans: number; served: number }, onMap: () => void, onRestart: () => void) {
    this.showModal((box) => {
      box.classList.add("victory");
      box.append(h("div", "modal-emoji big", "🏆"));
      box.append(h("h2", "modal-title", "ТЫ — ШЕФ-ПОВАР МИРА!"));
      box.append(
        h("p", "modal-text", "Италия покорена! Ты приготовил настоящую пиццу маргариту, и она теперь висит на карте мира."),
      );
      const s = h("div", "victory-stats");
      s.append(
        h("span", "hud-stat", `🪙 ${stats.coins}`),
        h("span", "hud-stat", `⭐ ${stats.stars}`),
        h("span", "hud-stat", `❤️ ${stats.fans} фанатов`),
        h("span", "hud-stat", `🍽️ ${stats.served} гостей накормлено`),
      );
      box.append(s);
      const mapBtn = h("button", "big-btn", "🗺️ Открыть карту мира");
      mapBtn.addEventListener("click", onMap);
      const again = h("button", "menu-btn", "🔄 Играть снова");
      again.addEventListener("click", onRestart);
      box.append(mapBtn, again);
    });
  }

  showGameOver(reason: string, onRetry: () => void, onTitle: () => void) {
    this.showModal((box) => {
      box.classList.add("gameover");
      box.append(h("div", "modal-emoji big", "😵"));
      box.append(h("h2", "modal-title", "Ресторан закрылся…"));
      box.append(h("p", "modal-text", reason));
      const retry = h("button", "big-btn", "🍕 Ещё раз!");
      retry.addEventListener("click", onRetry);
      const title = h("button", "menu-btn", "В главное меню");
      title.addEventListener("click", onTitle);
      box.append(retry, title);
    });
  }

  dispose() {
    this.closeModal();
    this.root.remove();
  }
}
