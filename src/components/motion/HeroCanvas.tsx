import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

const TARGET_FPS = 24;
const FRAME_DURATION = 1000 / TARGET_FPS;
const SPRITE_SIZE = 32;

interface Palette {
  sky: string;
  skylineFar: string;
  skylineNear: string;
  screen: string;
  frame: string;
  glow: string;
  facePixel: string;
  scanline: string;
  brickA: string;
  brickB: string;
  pipe: string;
  grout: string;
  ground: string;
  windowLit: string;
  windowDark: string;
  sidewalk: string;
  curb: string;
  road: string;
}

interface SpriteInfo {
  img: HTMLImageElement;
  col: number;
  row: number;
}

function isESTDaytime(): boolean {
  const override = new URLSearchParams(window.location.search).get('heroTime');
  if (override === 'day') return true;
  if (override === 'night') return false;
  const h =
    +new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    }) % 24;
  return h >= 6 && h < 20;
}

function getPalette(daytime: boolean): Palette {
  if (daytime) {
    return {
      sky: '#87ceeb',
      skylineFar: '#b8cdd8',
      skylineNear: '#8aa4b0',
      screen: '#f8f8f8',
      frame: '#1a1a1a',
      glow: '#22cc04',
      facePixel: '#1a5028',
      scanline: 'rgb(0 0 0 / 3%)',
      brickA: '#b05030',
      brickB: '#c46040',
      pipe: '#2a2a2a',
      grout: '#6b2010',
      ground: '#5c4530',
      windowLit: '#cce0f4',
      windowDark: '#4a6880',
      sidewalk: '#c8c0b0',
      curb: '#948878',
      road: '#686870',
    };
  }
  return {
    sky: '#0d0e10',
    skylineFar: '#16181c',
    skylineNear: '#2b2e34',
    screen: '#060e06',
    frame: '#1e2026',
    glow: '#39ff14',
    facePixel: '#39ff14',
    scanline: 'rgb(255 255 255 / 4%)',
    brickA: '#1c1a1a',
    brickB: '#242020',
    pipe: '#14151a',
    grout: '#080706',
    ground: '#1a1820',
    windowLit: '#f0c840',
    windowDark: '#0a0c10',
    sidewalk: '#252830',
    curb: '#1c1e24',
    road: '#1c1e26',
  };
}

function pseudoRandom(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

// Fixed star field — stable positions on the right half of the canvas (clear of text overlay)
const STARS = Array.from({ length: 30 }, (_, i) => ({
  xFrac: 0.48 + pseudoRandom(i * 17.391 + 1.1) * 0.52,
  yFrac: pseudoRandom(i * 11.721 + 2.3) * 0.86,
  size: pseudoRandom(i * 7.153) > 0.82 ? 2 : 1,
  alpha: 0.1 + pseudoRandom(i * 5.317) * 0.25,
  phase: pseudoRandom(i * 13.891) * Math.PI * 2,
  speed: 0.25 + pseudoRandom(i * 3.741) * 0.75,
}));

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseline: number,
  elapsed: number,
) {
  STARS.forEach((star) => {
    const twinkle = Math.sin(elapsed * 0.001 * star.speed + star.phase);
    ctx.globalAlpha = star.alpha * (0.55 + twinkle * 0.45);
    ctx.fillStyle = '#d8e4ff';
    ctx.fillRect(
      Math.round(star.xFrac * width),
      Math.round(star.yFrac * baseline),
      star.size,
      star.size,
    );
  });
  ctx.globalAlpha = 1;
}

function drawBuildingWindows(
  ctx: CanvasRenderingContext2D,
  bldX: number,
  bldTop: number,
  bldBottom: number,
  bldWidth: number,
  cell: number,
  bldSeed: number,
  litColor: string,
  darkColor: string,
  litProb: number,
  elapsed = 0,
) {
  const winW = Math.max(3, Math.floor(cell * 0.7));
  const winH = Math.max(2, Math.floor(cell * 0.55));
  const gapX = Math.max(winW + 3, Math.floor(cell * 1.8));
  const gapY = Math.max(winH + 3, Math.floor(cell * 1.6));
  const padX = Math.max(2, Math.floor(cell * 0.6));
  const padTop = Math.max(2, Math.floor(cell * 0.8));

  // Center the window grid: count how many columns fit then distribute symmetrically
  const numCols = Math.max(
    1,
    Math.floor((bldWidth - 2 * padX - winW) / gapX) + 1,
  );
  const totalSpanX = (numCols - 1) * gapX + winW;
  const startX = bldX + Math.floor((bldWidth - totalSpanX) / 2);

  let idx = 0;
  for (let wy = bldTop + padTop; wy + winH <= bldBottom - 2; wy += gapY) {
    for (let col = 0; col < numCols; col++) {
      const wx = startX + col * gapX;
      let isLit = pseudoRandom(bldSeed + idx * 7.3) < litProb;

      // ~4% of windows can toggle on/off over time — a slow, rare flicker
      const flickerSeed = pseudoRandom(bldSeed + idx * 7.3 + 99.7);
      if (flickerSeed < 0.04 && elapsed > 0) {
        const period = 6000 + pseudoRandom(bldSeed + idx * 3.7) * 14000;
        if (Math.floor(elapsed / period) % 2 === 1) isLit = !isLit;
      }

      if (isLit) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = litColor;
        ctx.fillRect(
          Math.round(wx) - 1,
          Math.round(wy) - 1,
          winW + 2,
          winH + 2,
        );
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = isLit ? litColor : darkColor;
      ctx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      idx++;
    }
  }
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
  bottom = baseline,
  windowLit?: string,
  windowDark?: string,
  cell = 3,
  litProb = 0.45,
  elapsed = 0,
) {
  const count = Math.ceil(width / step) + 2;
  const baseCol = Math.floor(offset / step);

  for (let i = -1; i < count; i++) {
    const x = i * step - (offset % step);
    const worldCol = baseCol + i;

    // Slow envelope sets neighborhood character; fast component gives per-building drama
    const t = worldCol * 0.1 + seed * 4.1;
    const tFast = worldCol * 1.5 + seed * 2.71;
    const slow = Math.sin(t) * 0.5 + Math.sin(t * 0.55 + 2.1) * 0.3;
    const fast = Math.sin(tFast) * 0.5 + Math.sin(tFast * 1.7 + 1.2) * 0.3;
    const raw = Math.max(0, Math.min(1, (slow * 0.4 + fast * 0.6 + 1.0) / 2.0));
    // S-curve contrast — biases strongly toward very tall or very short (avoids mid-range)
    const n =
      raw < 0.5
        ? 0.5 * Math.pow(2 * raw, 2.3)
        : 1 - 0.5 * Math.pow(2 * (1 - raw), 2.3);
    const h = minHeight + n * (maxHeight - minHeight);

    const bx = Math.round(x);
    const bt = Math.round(baseline - h);
    ctx.fillStyle = color;
    ctx.fillRect(bx, bt, step + 1, bottom - bt);
    // Shadow strip at right edge — simulates an alley without exposing background
    ctx.fillStyle = 'rgb(0 0 0 / 0.18)';
    ctx.fillRect(bx + step - 2, bt, 3, bottom - bt);

    if (windowLit && windowDark) {
      drawBuildingWindows(
        ctx,
        bx,
        bt,
        bottom,
        step + 1,
        cell,
        worldCol * 73 + seed * 1000,
        windowLit,
        windowDark,
        litProb,
        elapsed,
      );
    }
  }
}

/** Pixel face — two expressions (open smile / blink) */
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

const BILLBOARD_TEXT = 'That happened. It ruled.';

function drawBillboard(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  size: { width: number; height: number; cell: number },
  colors: { frame: string; screen: string; glow: string; facePixel: string },
  frame: number,
  nightGlow = false,
  elapsed = 0,
) {
  const { x, y } = origin;
  const { width, height, cell } = size;
  const fw = cell * 1.5;

  ctx.fillStyle = colors.frame;
  ctx.fillRect(x - fw, y - cell, width + fw * 2, height + cell * 2);

  ctx.fillStyle = colors.screen;
  ctx.fillRect(x, y, width, height);

  // CRT phosphor bloom — subtle radial glow from screen center
  if (nightGlow) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rad = Math.sqrt(width * width + height * height) * 0.62;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(22, 90, 14, 0.60)');
    grad.addColorStop(0.45, 'rgba(8, 38, 6, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
  }

  // Face — shifted into upper ~40% of screen to leave room for text below
  ctx.fillStyle = colors.facePixel;
  const px = Math.max(2, Math.floor(width / 10));
  const ox = x + (width - px * 8) / 2;
  const oy = y + Math.floor((height - px * 6) * 0.32);
  FACE_FRAMES[frame].forEach(([col, row]) => {
    ctx.fillRect(ox + col * px, oy + row * px, px - 1, px - 1);
  });

  // Terminal text with blinking underscore cursor
  const cursor = Math.floor(elapsed / 530) % 2 === 0 ? '_' : ' ';
  const fullText = BILLBOARD_TEXT + cursor;
  const maxW = width - cell * 2;
  let fs = Math.max(8, Math.floor(cell * 1.6));
  ctx.font = `${fs}px 'VT323', monospace`;
  while (ctx.measureText(fullText).width > maxW && fs > 8) {
    fs -= 1;
    ctx.font = `${fs}px 'VT323', monospace`;
  }
  ctx.fillStyle = colors.facePixel;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(fullText, x + width / 2, y + height - Math.floor(cell * 0.5));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawPipes(
  ctx: CanvasRenderingContext2D,
  bbX: number,
  bbWidth: number,
  bbBottom: number,
  canvasHeight: number,
  cell: number,
  color: string,
) {
  const pipeW = Math.max(2, Math.floor(cell * 0.55));
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const px = Math.round(bbX + t * bbWidth - pipeW / 2);
    ctx.fillStyle = color;
    ctx.fillRect(px, bbBottom, pipeW, canvasHeight - bbBottom);
  }
}

function drawBrickBuilding(
  ctx: CanvasRenderingContext2D,
  bldX: number,
  bldWidth: number,
  top: number,
  bottom: number,
  cell: number,
  palette: Pick<Palette, 'brickA' | 'brickB' | 'grout'>,
) {
  const brickH = Math.max(4, Math.floor(cell * 0.72));
  const brickW = Math.max(10, cell * 2);
  const mortar = 1;
  const rows = Math.ceil((bottom - top) / brickH) + 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bldX, top, bldWidth, bottom - top);
  ctx.clip();

  // Solid grout fill — bricks drawn on top so gaps are opaque, not transparent
  ctx.fillStyle = palette.grout;
  ctx.fillRect(bldX, top, bldWidth, bottom - top);

  for (let row = 0; row < rows; row++) {
    const ry = top + row * brickH;
    const offset = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
    const cols = Math.ceil(bldWidth / brickW) + 2;

    for (let col = -1; col < cols; col++) {
      const bx = bldX + col * brickW - offset;
      ctx.fillStyle = (col + row) % 3 === 0 ? palette.brickA : palette.brickB;
      ctx.fillRect(
        bx + mortar,
        ry + mortar,
        brickW - mortar * 2,
        brickH - mortar * 2,
      );
    }
  }

  ctx.restore();
}

function drawStreet(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseline: number,
  cell: number,
  palette: Palette,
  elapsed: number,
  daytime: boolean,
) {
  const sidewalkH = Math.round(cell);
  const curbH = Math.max(2, Math.round(cell * 0.35));
  const roadTop = baseline + sidewalkH + curbH;

  // Sidewalk slab
  ctx.fillStyle = palette.sidewalk;
  ctx.fillRect(0, baseline, width, sidewalkH);

  // Tile expansion joints — single row of pavers, vertical joints only
  const jointColor = daytime ? 'rgb(0 0 0 / 0.10)' : 'rgb(0 0 0 / 0.30)';
  ctx.fillStyle = jointColor;
  const tileW = cell * 4;
  for (let tx = 0; tx < width; tx += tileW) {
    ctx.fillRect(Math.round(tx), baseline, 1, sidewalkH);
  }

  // Curb face
  ctx.fillStyle = palette.curb;
  ctx.fillRect(0, baseline + sidewalkH, width, curbH);

  // Road
  ctx.fillStyle = palette.road;
  ctx.fillRect(0, roadTop, width, height - roadTop);

  // Scrolling center dashes
  const dashW = cell * 3;
  const dashGap = cell * 2;
  const cycle = dashW + dashGap;
  const dashY = roadTop + Math.floor((height - roadTop) * 0.42);
  const dashH = Math.max(1, Math.round(cell * 0.18));
  const dashOffset = (elapsed * 0.018) % cycle;
  ctx.fillStyle = daytime ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,160,0.45)';
  for (let dx = -cycle + dashOffset; dx < width + cycle; dx += cycle) {
    ctx.fillRect(Math.round(dx), dashY, dashW, dashH);
  }

  // Night: neon-green reflection pooling on the sidewalk near the billboard
  if (!daytime) {
    const refW = width * 0.48;
    const grad = ctx.createLinearGradient(width - refW, 0, width, 0);
    grad.addColorStop(0, 'rgba(57,255,20,0)');
    grad.addColorStop(1, 'rgba(57,255,20,0.09)');
    ctx.fillStyle = grad;
    ctx.fillRect(width - refW, baseline, refW, sidewalkH);
  }
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

const SPRITE_SHEETS = [
  { src: '/sprites/rogues.png', cellCols: 7, cellRows: 7 },
  { src: '/sprites/animals.png', cellCols: 9, cellRows: 16 },
  { src: '/sprites/monsters.png', cellCols: 12, cellRows: 13 },
];

function findOccupiedCells(
  img: HTMLImageElement,
  cellCols: number,
  cellRows: number,
): [number, number][] {
  const tmp = document.createElement('canvas');
  tmp.width = img.naturalWidth;
  tmp.height = img.naturalHeight;
  const tmpCtx = tmp.getContext('2d');
  if (!tmpCtx) return [];
  tmpCtx.drawImage(img, 0, 0);
  const { data } = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
  const cells: [number, number][] = [];

  for (let row = 0; row < cellRows; row++) {
    for (let col = 0; col < cellCols; col++) {
      let found = false;
      outer: for (let sy = 0; sy < SPRITE_SIZE; sy++) {
        for (let sx = 0; sx < SPRITE_SIZE; sx++) {
          const idx =
            ((row * SPRITE_SIZE + sy) * tmp.width + (col * SPRITE_SIZE + sx)) *
            4;
          if (data[idx + 3] > 0) {
            found = true;
            break outer;
          }
        }
      }
      if (found) cells.push([col, row]);
    }
  }
  return cells;
}

async function pickRandomSprite(): Promise<SpriteInfo> {
  const sheet = SPRITE_SHEETS[Math.floor(Math.random() * SPRITE_SHEETS.length)];
  const img = new Image();
  img.src = sheet.src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load ${sheet.src}`));
  });
  const cells = findOccupiedCells(img, sheet.cellCols, sheet.cellRows);
  const [col, row] = cells[Math.floor(Math.random() * cells.length)];
  return { img, col, row };
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  elapsed: number,
  sprite: SpriteInfo | null,
  daytime: boolean,
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, width, height);

  const baseline = height * 0.8;
  const cell = Math.max(3, Math.floor(height / 28));

  // Stars in the sky — night only, drawn before buildings
  if (!daytime) {
    drawStars(ctx, width, baseline, elapsed);
  }

  // Ground fill behind everything — fills the base zone so nothing is empty
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, baseline, width, height - baseline);

  // Far skyline — no windows, wide height range for dramatic silhouette
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.012,
    palette.skylineFar,
    cell * 7,
    height * 0.04,
    height * 0.68,
    11,
    height,
  );
  // Near skyline — with windows, wide range: short squat blocks to tall towers
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.03,
    palette.skylineNear,
    cell * 5,
    height * 0.03,
    height * 0.5,
    47,
    height,
    palette.windowLit,
    palette.windowDark,
    cell,
    0.06,
    elapsed,
  );

  const bbWidth = cell * 13;
  const bbHeight = cell * 12;
  const bbX = width - cell * 16;
  const bbY = cell * 3;
  const bbFrameBottom = bbY + bbHeight + cell;

  // Support gap — thin strip of pipes separating the billboard frame from the brick below
  const pipeGap = cell * 2;
  const brickTop = bbFrameBottom + pipeGap;
  drawPipes(ctx, bbX, bbWidth, bbFrameBottom, brickTop, cell, palette.pipe);

  // Brick building — the pedestal the billboard sits on, filling the rest of the gap above the street
  const bbFw = cell * 1.5;
  drawBrickBuilding(
    ctx,
    bbX - bbFw,
    bbWidth + bbFw * 2,
    brickTop,
    baseline,
    cell,
    palette,
  );

  drawBillboard(
    ctx,
    { x: bbX, y: bbY },
    { width: bbWidth, height: bbHeight, cell },
    {
      frame: palette.frame,
      screen: palette.screen,
      glow: palette.glow,
      facePixel: palette.facePixel,
    },
    Math.floor(elapsed / 1400) % FACE_FRAMES.length,
    !daytime,
    elapsed,
  );

  drawStreet(ctx, width, height, baseline, cell, palette, elapsed, daytime);

  if (sprite) {
    const scale = Math.max(2, Math.ceil(cell / 8));
    const spriteW = SPRITE_SIZE * scale;
    const spriteH = SPRITE_SIZE * scale;
    const travel = width + spriteW * 2;
    const sx = ((elapsed * 0.045) % travel) - spriteW;
    const bob = Math.floor(elapsed / 220) % 2 === 0 ? 0 : -scale;
    const sy = Math.round(baseline) - spriteH + bob;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(sx) + spriteW, Math.round(sy));
    ctx.scale(-1, 1);
    ctx.drawImage(
      sprite.img,
      sprite.col * SPRITE_SIZE,
      sprite.row * SPRITE_SIZE,
      SPRITE_SIZE,
      SPRITE_SIZE,
      0,
      0,
      spriteW,
      spriteH,
    );
    ctx.restore();
  }

  drawScanlines(ctx, width, height, palette.scanline);
}

export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<SpriteInfo | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    pickRandomSprite()
      .then((s) => {
        spriteRef.current = s;
      })
      .catch(() => {
        // sprite stays null — canvas renders without character
      });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const daytime = isESTDaytime();
    const palette = getPalette(daytime);
    document.documentElement.dataset.heroTime = daytime ? 'day' : 'night';

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
      draw(ctx, width, height, palette, elapsed, spriteRef.current, daytime);
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
      draw(ctx, width, height, palette, elapsed, spriteRef.current, daytime);
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
