/**
 * boot.ts — точка входа «Кухня Мира». Связывает canvas и DOM-оверлей с игрой.
 * Контракт с React-оболочкой (src/pages/Home.tsx):
 *   startGame(canvas, overlay) — запуск игры на существующем canvas
 *   stopGame()                 — полная остановка
 */
import { KitchenWorldGame } from "./game";

declare global {
  interface Window {
    /** Пробник координат игрока — verify-game.mjs проверяет через него направления движения. */
    __gameProbe?: () => { x: number; y: number; z: number };
    /** Сигнал готовности — self-check ждёт его перед скриншотами и проверками. */
    __GAME_READY__?: boolean;
    /** Тестовые хуки: телепорт, чтение состояния, ручная камера. */
    __gameTest?: {
      teleport: (x: number, z: number) => void;
      state: () => Record<string, unknown>;
      camera: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void;
    };
  }
}

let game: KitchenWorldGame | null = null;

export function startGame(canvas: HTMLCanvasElement, overlay: HTMLElement): void {
  stopGame();
  game = new KitchenWorldGame(canvas, overlay);
  window.__gameProbe = () => game!.getProbe();
  window.__gameTest = {
    teleport: (x: number, z: number) => game!.debugTeleport(x, z),
    state: () => game!.debugState(),
    camera: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) =>
      game!.debugCamera(px, py, pz, tx, ty, tz),
  };
  // считаем игру готовой, когда первый кадр точно отрисован
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__GAME_READY__ = true;
    });
  });
}

export function stopGame(): void {
  if (game) {
    game.dispose();
    game = null;
  }
  window.__gameProbe = undefined;
  window.__GAME_READY__ = false;
}
