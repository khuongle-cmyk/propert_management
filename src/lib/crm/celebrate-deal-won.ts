import confetti from "canvas-confetti";

const COLORS = ["#21524F", "#F3DFC6", "#FFD700", "#FFFFFF"];

/** Fullscreen confetti bursts (VillageWorks palette). Call after modal closes. */
export function celebrateDealWon(): void {
  if (typeof window === "undefined") return;

  const opts = {
    particleCount: 80,
    spread: 75,
    origin: { x: 0.5, y: 0.6 },
    colors: COLORS,
    ticks: 420,
    gravity: 0.95,
    scalar: 1,
  };

  void confetti(opts);

  window.setTimeout(() => {
    void confetti({
      ...opts,
      particleCount: 40,
      angle: 60,
      spread: 58,
      origin: { x: 0, y: 0.6 },
    });
  }, 220);

  window.setTimeout(() => {
    void confetti({
      ...opts,
      particleCount: 40,
      angle: 120,
      spread: 58,
      origin: { x: 1, y: 0.6 },
    });
  }, 380);

  window.setTimeout(() => {
    void confetti({
      particleCount: 30,
      spread: 100,
      origin: { y: 0.35 },
      colors: COLORS,
      ticks: 500,
      gravity: 0.65,
      scalar: 1.15,
    });
  }, 120);
}
