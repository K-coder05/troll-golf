import type { ItemRenderer } from "./index";

/**
 * Ink Splat, victim only: a full-window canvas of ink blots covering about
 * `coverage` of the screen. It fades out linearly over `durationMs` (6 s),
 * and moving the mouse over it scrubs ink away (destination-out). Purely
 * visual: pointer events pass through, so aiming and mashing still work.
 * Everyone else sees only the Inked badge on the ball (HoleScene).
 */
let current: { canvas: HTMLCanvasElement; stop: () => void } | null = null;

export function startInkOverlay(durationMs: number, coverage: number): void {
  current?.stop();
  const canvas = document.createElement("canvas");
  const w = (canvas.width = window.innerWidth);
  const h = (canvas.height = window.innerHeight);
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "50",
  });
  const g = canvas.getContext("2d");
  if (!g) return;
  // Random blots until roughly `coverage` of the area is inked (sampled on a coarse grid).
  g.fillStyle = "#12091f";
  const target = w * h * coverage;
  let inked = 0;
  for (let i = 0; i < 80 && inked < target; i++) {
    const r = 50 + Math.random() * 110;
    const x = Math.random() * w;
    const y = Math.random() * h;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2;
      g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * (0.2 + Math.random() * 0.3), 0, Math.PI * 2);
    }
    g.fill();
    inked += Math.PI * r * r * 0.5;
  }
  document.body.appendChild(canvas);

  const scrub = (e: MouseEvent) => {
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(e.clientX, e.clientY, 45, 0, Math.PI * 2);
    g.fill();
  };
  window.addEventListener("mousemove", scrub);
  const start = performance.now();
  let raf = 0;
  const frame = () => {
    const t = (performance.now() - start) / durationMs;
    if (t >= 1) return stop();
    canvas.style.opacity = String(0.95 * (1 - t));
    raf = requestAnimationFrame(frame);
  };
  function stop() {
    cancelAnimationFrame(raf);
    window.removeEventListener("mousemove", scrub);
    canvas.remove();
    if (current?.canvas === canvas) current = null;
  }
  current = { canvas, stop };
  frame();
}

export const inkSplatRenderer: ItemRenderer = {
  playUse(_scene, fx) {
    startInkOverlay(fx.durationMs ?? 6000, fx.coverage ?? 0.6);
  },
};
