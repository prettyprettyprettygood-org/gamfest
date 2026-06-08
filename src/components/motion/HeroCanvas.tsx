import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

const TARGET_FPS = 24;
const FRAME_DURATION = 1000 / TARGET_FPS;

interface Palette {
  sky: string;
  skylineFar: string;
  skylineNear: string;
  screen: string;
  glow: string;
  sprite: string;
  scanline: string;
}

/** Reads the palette from design tokens (CLAUDE.md: never hardcode hex in components) */
function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    sky: token('--color-bg', '#0d0e10'),
    skylineFar: token('--color-bg-raised', '#16181c'),
    skylineNear: token('--color-border', '#2b2e34'),
    screen: token('--color-bg', '#0d0e10'),
    glow: token('--color-green', '#39ff14'),
    sprite: token('--color-fg', '#f4efe6'),
    scanline: 'rgb(255 255 255 / 4%)',
  };
}

/** Deterministic pseudo-random in [0, 1) — keeps the skyline stable across redraws/resizes */
function pseudoRandom(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseline: number,
  offset: number,
  color: string,
  step: number,
  minHeight: number,
  maxHeight: number,
  seed: number,
) {
  ctx.fillStyle = color;
  const count = Math.ceil(width / step) + 2;
  for (let i = -1; i < count; i += 1) {
    const x = i * step - (offset % step);
    const height = minHeight + pseudoRandom(seed + i) * (maxHeight - minHeight);
    ctx.fillRect(x, baseline - height, step - 4, height);
  }
}

/** Tiny pixel face on the billboard "screen" — two frames make it blink */
const FACE_FRAMES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [2, 1],
    [5, 1],
    [2, 2],
    [5, 2],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 4],
  ],
  [
    [1, 2],
    [2, 2],
    [5, 2],
    [6, 2],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 4],
  ],
];

function drawBillboard(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  size: { width: number; height: number; cell: number },
  colors: { frame: string; screen: string; glow: string },
  frame: number,
) {
  const { x, y } = origin;
  const { width, height, cell } = size;

  ctx.fillStyle = colors.frame;
  ctx.fillRect(x - cell, y - cell, width + cell * 2, height + cell * 2);

  ctx.fillStyle = colors.screen;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = Math.max(1, cell / 2);
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = colors.glow;
  const pixel = Math.max(2, Math.floor(width / 10));
  const offsetX = x + (width - pixel * 8) / 2;
  const offsetY = y + (height - pixel * 6) / 2;
  FACE_FRAMES[frame].forEach(([col, row]) => {
    ctx.fillRect(
      offsetX + col * pixel,
      offsetY + row * pixel,
      pixel - 1,
      pixel - 1,
    );
  });
}

/** Walking pixel sprite — two frames swap the legs to suggest a stride */
const SPRITE_FRAMES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
    [0, 2],
    [3, 2],
    [0, 3],
    [3, 3],
  ],
  [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
    [0, 2],
    [3, 2],
    [1, 3],
    [2, 3],
  ],
];

function drawSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  cell: number,
  color: string,
  frame: number,
) {
  ctx.fillStyle = color;
  SPRITE_FRAMES[frame].forEach(([col, row]) => {
    ctx.fillRect(x + col * cell, top + row * cell, cell - 1, cell - 1);
  });
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  elapsed: number,
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, width, height);

  const baseline = height * 0.82;
  const cell = Math.max(3, Math.floor(height / 28));

  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.012,
    palette.skylineFar,
    cell * 7,
    height * 0.18,
    height * 0.4,
    11,
  );
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.03,
    palette.skylineNear,
    cell * 5,
    height * 0.1,
    height * 0.28,
    47,
  );

  ctx.fillStyle = palette.skylineNear;
  ctx.fillRect(0, baseline, width, 2);

  const billboardWidth = cell * 14;
  const billboardHeight = cell * 9;
  drawBillboard(
    ctx,
    { x: width * 0.62, y: baseline - billboardHeight - cell * 6 },
    { width: billboardWidth, height: billboardHeight, cell },
    { frame: palette.skylineFar, screen: palette.screen, glow: palette.glow },
    Math.floor(elapsed / 1400) % FACE_FRAMES.length,
  );

  const spriteWidth = cell * 4;
  const travel = width + spriteWidth * 2;
  const x = ((elapsed * 0.045) % travel) - spriteWidth;
  drawSprite(
    ctx,
    x,
    baseline - cell * 4,
    cell,
    palette.sprite,
    Math.floor(elapsed / 220) % SPRITE_FRAMES.length,
  );

  drawScanlines(ctx, width, height, palette.scanline);
}

/**
 * Hero billboard piece (PRD §9): a small Canvas 2D loop — pixel sprite
 * walking past a parallax skyline toward a blinking billboard "screen".
 * Capped frame rate, paused via IntersectionObserver off-screen, and frozen
 * to a single static frame under `prefers-reduced-motion`.
 */
export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const palette = readPalette();
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let elapsed = 0;
    let frameId = 0;
    let lastTime = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height, palette, elapsed);
    };

    resize();
    window.addEventListener('resize', resize);

    if (prefersReducedMotion) {
      return () => window.removeEventListener('resize', resize);
    }

    const tick = (time: number) => {
      frameId = requestAnimationFrame(tick);
      const delta = time - lastTime;
      if (delta < FRAME_DURATION) return;
      lastTime = time - (delta % FRAME_DURATION);
      elapsed += delta;
      draw(ctx, width, height, palette, elapsed);
    };

    const start = () => {
      if (frameId) return;
      lastTime = performance.now();
      frameId = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.1 },
    );
    observer.observe(canvas);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [prefersReducedMotion]);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
