import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

const { Engine, Bodies, Body, Composite, Events } = Matter;

const TARGET_FPS = 24;
const FRAME_DURATION = 1000 / TARGET_FPS;
const SPRITE_SIZE = 32;

// --- Hero mini-game tuning (Phase 1: core platformer) -----------------

/** Ground line as a fraction of canvas height — shared by background art and physics. */
const HERO_BASELINE_RATIO = 0.85;
/** Physics steps run at a fixed 60Hz regardless of render FPS. */
const FIXED_PHYSICS_DT = 1000 / 60;
/** Velocity is in px per physics step at 60Hz, so 2 ≈ 120px/s. */
const PLAYER_WALK_SPEED = 2;
/** Tuned so an unassisted jump reaches the brick-wall ledge, but not the hero text tier. */
const PLAYER_JUMP_VELOCITY = 12;
const PLAYER_FRICTION = 0.8;
const LANDING_SQUASH_MS = 80;
const SPAWN_DROP_CELLS = 8;
/** Player spawns near the left edge of the canvas, not dead-center. */
const PLAYER_SPAWN_X_CELLS = 4;
const BRICK_LEDGE_THICKNESS_CELLS = 0.7;
const WALK_BOB_PERIOD_MS = 220;
const IDLE_SWAY_PERIOD_MS = 600;
const PROMPT_BLINK_MS = 600;

// --- Hero mini-game tuning (Phase 2: interactive objects) --------------

/** Bounce for buttons/badges/letters once they fall — "moderate" per PRD. */
const OBJECT_RESTITUTION = 0.3;
/** How long the "damaged" shake/crack animation plays after a hit. */
const DAMAGE_SHAKE_MS = 300;
/** Small spin imparted to objects when they start falling, so stacks tumble unevenly. */
const FALL_ANGULAR_VELOCITY = 0.15;
/** Buttons are heavier than badges, per PRD "Difficulty Tuning" — both relative to player mass. */
const BUTTON_MASS_MULTIPLIER = 4;
const BADGE_MASS_MULTIPLIER = 1;

interface Palette {
  sky: string;
  skylineFar: string;
  skylineNear: string;
  screen: string;
  frame: string;
  glow: string;
  accentAmber: string;
  accentMagenta: string;
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
      accentAmber: '#ffb347',
      accentMagenta: '#ff4fd8',
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
    accentAmber: '#ffb347',
    accentMagenta: '#ff4fd8',
    facePixel: '#39ff14',
    scanline: 'rgb(255 255 255 / 4%)',
    brickA: '#1c1a1a',
    brickB: '#242020',
    pipe: '#14151a',
    grout: '#080706',
    ground: '#1a1820',
    windowLit: '#f0c840',
    windowDark: '#0a0c10',
    sidewalk: '#3a3f4a',
    curb: '#262a32',
    road: '#1c1e26',
  };
}

function pseudoRandom(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/** Converts a `#rrggbb` palette color to an `rgba()` string with the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Sidewalk/road geometry shared between background art and player physics. */
function getStreetLevels(baseline: number, cell: number) {
  const sidewalkH = Math.round(cell);
  const roadTop = baseline + sidewalkH;
  return { sidewalkH, roadTop, roadDrop: sidewalkH };
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
  gap = 0,
) {
  const count = Math.ceil(width / step) + 2;
  const baseCol = Math.floor(offset / step);
  const buildingWidth = Math.max(cell * 3, step - gap);

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
    ctx.fillRect(bx, bt, Math.ceil(buildingWidth), bottom - bt);

    if (windowLit && windowDark) {
      drawBuildingWindows(
        ctx,
        bx,
        bt,
        bottom,
        Math.ceil(buildingWidth),
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

function getBillboardFrameWidth(cell: number): number {
  return Math.max(3, Math.floor(cell * 0.8));
}

function getBillboardGeometry(width: number, cell: number) {
  const bbWidth = cell * 13;
  const bbHeight = cell * 12;
  const bbX = width - cell * 16;
  const bbY = cell * 3;
  const frameWidth = getBillboardFrameWidth(cell);
  const frameBottom = bbY + bbHeight + frameWidth;
  const pipeGap = cell * 2;
  const brickTop = frameBottom + pipeGap;
  const brickX = bbX - frameWidth;
  const brickWidth = bbWidth + frameWidth * 2;

  return {
    bbX,
    bbY,
    bbWidth,
    bbHeight,
    frameWidth,
    frameBottom,
    pipeGap,
    brickTop,
    brickX,
    brickWidth,
  };
}

function drawBillboard(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  size: { width: number; height: number; cell: number },
  colors: { frame: string; screen: string; glow: string; facePixel: string },
  frame: number,
  nightGlow = false,
  elapsed = 0,
  showMessage = true,
) {
  const { x, y } = origin;
  const { width, height, cell } = size;
  const fw = getBillboardFrameWidth(cell);

  ctx.fillStyle = colors.frame;
  ctx.fillRect(x - fw, y - fw, width + fw * 2, height + fw * 2);

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

  if (showMessage) {
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
  daytime: boolean,
) {
  const { sidewalkH, roadTop } = getStreetLevels(baseline, cell);

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

  // Road starts immediately below the single sidewalk row.
  ctx.fillStyle = palette.road;
  ctx.fillRect(0, roadTop, width, height - roadTop);

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

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  elapsed: number,
  daytime: boolean,
  showBillboardMessage = true,
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, width, height);

  const baseline = height * HERO_BASELINE_RATIO;
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
    undefined,
    undefined,
    cell,
    0.45,
    elapsed,
    Math.max(cell, 6),
  );
  // Near skyline — with windows, wide range: short squat blocks to tall towers
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.03,
    palette.skylineNear,
    cell * 5,
    height * 0.08,
    height * 0.58,
    47,
    height,
    palette.windowLit,
    palette.windowDark,
    cell,
    0.06,
    elapsed,
    Math.max(Math.floor(cell * 0.45), 3),
  );

  const billboard = getBillboardGeometry(width, cell);

  // Support gap — thin strip of pipes separating the billboard frame from the brick below
  drawPipes(
    ctx,
    billboard.bbX,
    billboard.bbWidth,
    billboard.frameBottom,
    billboard.brickTop,
    cell,
    palette.pipe,
  );

  // Brick building — the pedestal the billboard sits on, filling the rest of the gap above the street
  drawBrickBuilding(
    ctx,
    billboard.brickX,
    billboard.brickWidth,
    billboard.brickTop,
    baseline,
    cell,
    palette,
  );

  drawBillboard(
    ctx,
    { x: billboard.bbX, y: billboard.bbY },
    { width: billboard.bbWidth, height: billboard.bbHeight, cell },
    {
      frame: palette.frame,
      screen: palette.screen,
      glow: palette.glow,
      facePixel: palette.facePixel,
    },
    Math.floor(elapsed / 1400) % FACE_FRAMES.length,
    !daytime,
    elapsed,
    showBillboardMessage,
  );

  drawStreet(ctx, width, height, baseline, cell, palette, daytime);
}

interface SpriteDrawState {
  facing: 'left' | 'right';
  animState: 'idle' | 'walk';
  elapsed: number;
  squashed?: boolean;
}

/**
 * Draws the character sprite anchored by its horizontal center and the
 * y-position of its feet.
 */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteInfo,
  centerX: number,
  feetY: number,
  cell: number,
  state: SpriteDrawState,
) {
  const scale = Math.max(2, Math.ceil(cell / 8));
  let spriteW = SPRITE_SIZE * scale;
  let spriteH = SPRITE_SIZE * scale;

  let offsetX = 0;
  let offsetY = 0;

  if (state.animState === 'walk') {
    // Vertical position bob while walking
    offsetY =
      Math.floor(state.elapsed / WALK_BOB_PERIOD_MS) % 2 === 0 ? 0 : -scale;
  } else {
    // Slower horizontal sway while idle
    offsetX =
      Math.floor(state.elapsed / IDLE_SWAY_PERIOD_MS) % 2 === 0 ? 0 : scale;
  }

  if (state.squashed) {
    const squashedW = spriteW * 1.2;
    const squashedH = spriteH * 0.8;
    offsetY += spriteH - squashedH;
    spriteW = squashedW;
    spriteH = squashedH;
  }

  const dx = Math.round(centerX - spriteW / 2 + offsetX);
  const dy = Math.round(feetY - spriteH + offsetY);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (state.facing === 'right') {
    ctx.translate(dx + spriteW, dy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(dx, dy);
  }
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

const PROMPT_TEXT = 'CLICK TO PLAY';

interface ButtonRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the passive play prompt on the billboard screen. The whole canvas is
 * clickable; the returned bounds only support a pointer cursor over the text.
 */
function drawClickToPlayPrompt(
  ctx: CanvasRenderingContext2D,
  width: number,
  cell: number,
  elapsed: number,
  palette: Palette,
): ButtonRect {
  const billboard = getBillboardGeometry(width, cell);
  const x = billboard.bbX + billboard.bbWidth / 2;
  const y = billboard.bbY + billboard.bbHeight - cell * 1.35;

  ctx.save();
  ctx.font = `${Math.max(8, Math.floor(cell * 0.72))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = cell * 0.55;
  const padY = cell * 0.45;
  const fontSize = Math.max(8, Math.floor(cell * 0.72));
  const textWidth = ctx.measureText(PROMPT_TEXT).width;
  const box: ButtonRect = {
    x: x - textWidth / 2 - padX,
    y: y - fontSize / 2 - padY,
    width: textWidth + padX * 2,
    height: fontSize + padY * 2,
  };

  ctx.fillStyle = hexToRgba(palette.frame, 0.68);
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.lineWidth = Math.max(1, Math.floor(cell * 0.1));
  ctx.strokeStyle = palette.glow;
  ctx.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2);

  if (Math.floor(elapsed / PROMPT_BLINK_MS) % 2 === 0) {
    ctx.fillStyle = palette.glow;
    ctx.fillText(PROMPT_TEXT, Math.round(x), Math.round(y));
  }
  ctx.restore();
  return box;
}

// --- Interactive objects: CTA buttons & badges (Phase 2) ---------------

type ObjectVariant =
  | 'primary'
  | 'secondary'
  | 'green'
  | 'amber'
  | 'magenta'
  | 'wordmark'
  | 'wordmarkAccent'
  | 'tagline';

/**
 * `pinned` → `damaged` → `fallen` per PRD "Interactive Objects → 1, 2".
 * `fallen` covers both the falling and settled-"obstacle" states — both are
 * the same dynamic body, just at different points in its physics journey.
 */
type ObjectState = 'pinned' | 'damaged' | 'fallen';

interface InteractiveObject {
  body: Matter.Body;
  kind: 'button' | 'badge' | 'wordmark' | 'tagline';
  variant: ObjectVariant;
  label: string;
  width: number;
  height: number;
  state: ObjectState;
  destructible: boolean;
  /** `performance.now()` of the last state change — drives the damage shake. */
  hitAt: number;
}

interface ObjectLayout {
  text: string;
  variant: ObjectVariant;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HeroLayout {
  tagline: ObjectLayout[];
  wordmark: ObjectLayout[];
  badges: ObjectLayout[];
  buttons: ObjectLayout[];
}

const BADGE_DEFS: ReadonlyArray<{ text: string; variant: ObjectVariant }> = [
  { text: 'FREE', variant: 'green' },
  { text: 'IRL', variant: 'amber' },
  { text: 'TBD 2027', variant: 'magenta' },
];

const BUTTON_DEFS: ReadonlyArray<{ text: string; variant: ObjectVariant }> = [
  { text: 'FOLLOW ON DISCORD', variant: 'primary' },
  { text: 'FOLLOW ON FACEBOOK', variant: 'secondary' },
];

/**
 * Lays out the badge row and CTA button row in a left-aligned column,
 * mirroring `.hero__badges` / `.hero__actions` from the passive layout (see
 * PRD "Game World Layout" — badges at `y ≈ cell*6`, buttons at `y ≈ cell*10`).
 * Sizes are measured from the same pixel font the objects are drawn with, so
 * physics bodies match their visuals exactly.
 */
function computeHeroLayout(
  ctx: CanvasRenderingContext2D,
  cell: number,
): HeroLayout {
  const marginX = Math.max(cell * 2.7, 48);
  const rowGap = Math.max(cell * 0.8, 16);

  const taglineFont = Math.max(12, Math.floor(cell * 0.72));
  const taglinePadX = Math.max(2, cell * 0.12);
  const taglineHeight = taglineFont * 1.35;
  const taglineY = Math.max(cell * 2.15, 42);
  const taglineChunks = ['GAMES', 'ART', 'MUSIC', 'FEST'];
  ctx.font = `700 ${taglineFont}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  let taglineX = marginX;
  const tagline = taglineChunks.map((text, index) => {
    const width = ctx.measureText(text).width + taglinePadX * 2;
    const layout: ObjectLayout = {
      text,
      variant: 'tagline',
      x: taglineX,
      y: taglineY,
      width,
      height: taglineHeight,
    };
    taglineX +=
      width +
      (index === taglineChunks.length - 1 ? 0 : ctx.measureText(' | ').width);
    return layout;
  });

  const wordmarkFont = Math.max(44, Math.floor(cell * 3.4));
  const wordmarkY = taglineY + taglineHeight + Math.max(cell * 0.45, 8);
  const wordmarkChars = Array.from('GAM[fest]');
  ctx.font = `${wordmarkFont}px 'VT323', monospace`;
  let wordmarkX = marginX;
  const wordmark = wordmarkChars.map((text, index) => {
    const isAccent = index >= 3;
    const padX = isAccent ? wordmarkFont * 0.07 : 0;
    const width = ctx.measureText(text).width + padX * 2;
    const layout: ObjectLayout = {
      text,
      variant: isAccent ? 'wordmarkAccent' : 'wordmark',
      x: wordmarkX,
      y: wordmarkY,
      width,
      height: wordmarkFont * 0.98,
    };
    wordmarkX += width;
    return layout;
  });

  const badgeFont = Math.max(8, Math.floor(cell * 0.8));
  const badgePadX = cell * 0.5;
  const badgePadY = cell * 0.35;
  const badgeGap = cell * 0.6;
  const badgeY = wordmarkY + wordmarkFont * 0.98 + rowGap;

  ctx.font = `${badgeFont}px 'Press Start 2P', monospace`;
  let badgeX = marginX;
  const badges = BADGE_DEFS.map(({ text, variant }) => {
    const width = ctx.measureText(text).width + badgePadX * 2;
    const height = badgeFont + badgePadY * 2;
    const layout: ObjectLayout = {
      text,
      variant,
      x: badgeX,
      y: badgeY,
      width,
      height,
    };
    badgeX += width + badgeGap;
    return layout;
  });

  const buttonFont = Math.max(9, Math.floor(cell * 0.9));
  const buttonPadX = cell * 1.2;
  const buttonPadY = cell * 0.7;
  const buttonGap = cell * 0.8;
  const buttonY = badgeY + badgeFont + badgePadY * 2 + rowGap;

  ctx.font = `${buttonFont}px 'Press Start 2P', monospace`;
  let buttonX = marginX;
  const buttons = BUTTON_DEFS.map(({ text, variant }) => {
    const width = ctx.measureText(text).width + buttonPadX * 2;
    const height = buttonFont + buttonPadY * 2;
    const layout: ObjectLayout = {
      text,
      variant,
      x: buttonX,
      y: buttonY,
      width,
      height,
    };
    buttonX += width + buttonGap;
    return layout;
  });

  return { tagline, wordmark, badges, buttons };
}

/**
 * Creates a body that starts dynamic (so `restitution`/`mass` apply
 * normally), then pins it static. `Body.setStatic` caches these as the
 * "original" values and restores them when a hit later flips the body back
 * to dynamic — setting them in this order is what makes that restore work.
 */
function createPinnedBody(layout: ObjectLayout, mass: number): Matter.Body {
  const body = Bodies.rectangle(
    layout.x + layout.width / 2,
    layout.y + layout.height / 2,
    layout.width,
    layout.height,
    { friction: PLAYER_FRICTION, restitution: OBJECT_RESTITUTION },
  );
  Body.setMass(body, mass);
  Body.setStatic(body, true);
  return body;
}

function createInteractiveObject(
  layout: ObjectLayout,
  kind: InteractiveObject['kind'],
  mass: number,
  destructible = kind === 'button' || kind === 'badge',
): InteractiveObject {
  return {
    body: createPinnedBody(layout, mass),
    kind,
    variant: layout.variant,
    label: layout.text,
    width: layout.width,
    height: layout.height,
    state: 'pinned',
    destructible,
    hitAt: 0,
  };
}

function getAccentColor(variant: ObjectVariant, palette: Palette): string {
  switch (variant) {
    case 'amber':
    case 'secondary':
      return palette.accentAmber;
    case 'magenta':
      return palette.accentMagenta;
    default:
      return palette.glow;
  }
}

/** Small jagged crack drawn over a `damaged` button/badge. */
function drawCrack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cell: number,
  daytime: boolean,
) {
  ctx.strokeStyle = daytime
    ? 'rgba(0, 0, 0, 0.45)'
    : 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
  ctx.beginPath();
  ctx.moveTo(-width * 0.1, -height / 2);
  ctx.lineTo(width * 0.05, -height * 0.1);
  ctx.lineTo(-width * 0.08, height * 0.15);
  ctx.lineTo(width * 0.1, height / 2);
  ctx.stroke();
}

/**
 * Draws a CTA button or badge at its physics body's current position/angle.
 * `damaged` objects jitter briefly and show a crack; `fallen` objects render
 * the same way but follow the body's rotation as they tumble and settle.
 */
function drawInteractiveObject(
  ctx: CanvasRenderingContext2D,
  obj: InteractiveObject,
  palette: Palette,
  daytime: boolean,
  cell: number,
  now: number,
) {
  const { body, width, height, variant, label, state, hitAt } = obj;
  const { y } = body.position;
  let { x } = body.position;

  if (state === 'damaged') {
    const t = now - hitAt;
    if (t < DAMAGE_SHAKE_MS) {
      const decay = 1 - t / DAMAGE_SHAKE_MS;
      x += Math.sin(t * 0.09) * cell * 0.15 * decay;
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(body.angle);

  if (obj.kind === 'wordmark') {
    const fontSize = Math.max(44, Math.floor(cell * 3.4));
    ctx.font = `${fontSize}px 'VT323', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (variant === 'wordmarkAccent') {
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.fillStyle = palette.frame;
    } else {
      ctx.fillStyle = daytime ? '#1a2030' : '#f4efe6';
    }
    ctx.fillText(label, 0, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    return;
  }

  if (obj.kind === 'tagline') {
    const fontSize = Math.max(12, Math.floor(cell * 0.72));
    ctx.font = `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = daytime ? '#0d7a32' : '#8fe39a';
    ctx.fillText(label, 0, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    return;
  }

  if (obj.kind === 'button' && variant === 'primary') {
    ctx.fillStyle = palette.glow;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.fillStyle = palette.frame;
  } else {
    const accent = getAccentColor(variant, palette);
    if (daytime) {
      ctx.fillStyle = hexToRgba(palette.frame, 0.8);
      ctx.fillRect(-width / 2, -height / 2, width, height);
    }
    const lineWidth = Math.max(1, Math.round(cell * 0.12));
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = accent;
    ctx.strokeRect(
      -width / 2 + lineWidth / 2,
      -height / 2 + lineWidth / 2,
      width - lineWidth,
      height - lineWidth,
    );
    ctx.fillStyle = accent;
  }

  const fontSize =
    obj.kind === 'button'
      ? Math.max(9, Math.floor(cell * 0.9))
      : Math.max(8, Math.floor(cell * 0.8));
  ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (state === 'damaged') {
    drawCrack(ctx, width, height, cell, daytime);
  }

  ctx.restore();
}

function drawTaglineSeparators(
  ctx: CanvasRenderingContext2D,
  objects: InteractiveObject[],
  daytime: boolean,
  cell: number,
) {
  const chunks = objects.filter((obj) => obj.kind === 'tagline');
  if (chunks.length < 2) return;

  ctx.save();
  const fontSize = Math.max(12, Math.floor(cell * 0.72));
  ctx.font = `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = daytime ? '#0d7a32' : '#8fe39a';

  for (let i = 0; i < chunks.length - 1; i++) {
    const left = chunks[i];
    const right = chunks[i + 1];
    const x =
      left.body.position.x +
      left.width / 2 +
      (right.body.position.x -
        right.width / 2 -
        (left.body.position.x + left.width / 2)) /
        2;
    const y = (left.body.position.y + right.body.position.y) / 2;
    ctx.fillText('|', x, y);
  }

  ctx.restore();
}

type GameState = 'passive' | 'active';

export default function HeroGame() {
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

    const heroEl = canvas.closest<HTMLElement>('.hero');
    const heroContentEl = heroEl?.querySelector<HTMLElement>('.hero__content');

    const daytime = isESTDaytime();
    const palette = getPalette(daytime);
    document.documentElement.dataset.heroTime = daytime ? 'day' : 'night';

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let elapsed = 0;
    let frameId = 0;
    let lastFrameTime = 0;
    let lastPhysicsTime = 0;
    let physicsAccumulator = 0;

    let state: GameState = 'passive';
    let facing: 'left' | 'right' = 'right';
    let inputLeft = false;
    let inputRight = false;
    let canJump = false;
    let squashUntil = 0;
    let playerLevel: 'sidewalk' | 'road' = 'sidewalk';
    let roadDropPx = 0;
    let sidewalkRestY = 0;

    let engine: Matter.Engine | null = null;
    let playerBody: Matter.Body | null = null;
    let sidewalkGround: Matter.Body | null = null;
    let roadGround: Matter.Body | null = null;
    let brickLedge: Matter.Body | null = null;
    let interactiveObjects: InteractiveObject[] = [];
    const supportContacts = new Set<number>();
    const objectsById = new Map<number, InteractiveObject>();

    const cellOf = (h: number) => Math.max(3, Math.floor(h / 28));

    const drawPassiveFrame = () => {
      const cell = cellOf(height);
      drawBackground(ctx, width, height, palette, elapsed, daytime, false);
      drawScanlines(ctx, width, height, palette.scanline);
      if (!prefersReducedMotion) {
        drawClickToPlayPrompt(ctx, width, cell, elapsed, palette);
      }
    };

    const drawActiveFrame = (now: number) => {
      const cell = cellOf(height);
      drawBackground(ctx, width, height, palette, elapsed, daytime);
      for (const obj of interactiveObjects) {
        drawInteractiveObject(ctx, obj, palette, daytime, cell, now);
      }
      drawTaglineSeparators(ctx, interactiveObjects, daytime, cell);
      if (spriteRef.current && playerBody) {
        const playerHeight = cell * 4;
        drawSprite(
          ctx,
          spriteRef.current,
          playerBody.position.x,
          playerBody.position.y + playerHeight / 2,
          cell,
          {
            facing,
            animState: inputLeft || inputRight ? 'walk' : 'idle',
            elapsed,
            squashed: now < squashUntil,
          },
        );
      }
      drawScanlines(ctx, width, height, palette.scanline);
    };

    const stepPhysics = (dt: number) => {
      if (!engine || !playerBody) return;
      const vx =
        inputRight === inputLeft
          ? 0
          : inputRight
            ? PLAYER_WALK_SPEED
            : -PLAYER_WALK_SPEED;
      if (vx !== 0) facing = vx > 0 ? 'right' : 'left';
      Body.setVelocity(playerBody, { x: vx, y: playerBody.velocity.y });

      // Jumping from the road and rising past sidewalk height: swap the
      // active platform so the player lands back on the sidewalk instead of
      // falling through to where the road platform used to be.
      if (
        playerLevel === 'road' &&
        sidewalkGround &&
        roadGround &&
        playerBody.position.y <= sidewalkRestY
      ) {
        Composite.remove(engine.world, roadGround);
        Composite.add(engine.world, sidewalkGround);
        playerLevel = 'sidewalk';
      }

      Engine.update(engine, dt);
    };

    const isSupportBody = (body: Matter.Body) =>
      body === sidewalkGround ||
      body === roadGround ||
      body === brickLedge ||
      objectsById.has(body.id);

    const getPlayerSupportBody = (pair: Matter.Pair) => {
      if (!playerBody) return null;
      const other =
        pair.bodyA === playerBody
          ? pair.bodyB
          : pair.bodyB === playerBody
            ? pair.bodyA
            : null;
      if (!other || !isSupportBody(other)) return null;

      const playerBottom = playerBody.bounds.max.y;
      const supportTop = other.bounds.min.y;
      const topContactSlop = Math.max(8, cellOf(height) * 0.9);
      const playerIsAboveSupportCenter =
        playerBody.position.y < other.position.y ||
        other === sidewalkGround ||
        other === roadGround;

      if (
        playerIsAboveSupportCenter &&
        playerBottom <= supportTop + topContactSlop
      ) {
        return other;
      }

      return null;
    };

    const addSupportContact = (pair: Matter.Pair, now: number) => {
      const support = getPlayerSupportBody(pair);
      if (!support) return;
      if (!canJump && playerBody && playerBody.velocity.y >= -0.5) {
        squashUntil = now + LANDING_SQUASH_MS;
      }
      supportContacts.add(support.id);
      canJump = true;
    };

    const removeSupportContact = (pair: Matter.Pair) => {
      if (!playerBody) return;
      const other =
        pair.bodyA === playerBody
          ? pair.bodyB
          : pair.bodyB === playerBody
            ? pair.bodyA
            : null;
      if (!other || !isSupportBody(other)) return;
      supportContacts.delete(other.id);
      canJump = supportContacts.size > 0;
    };

    /**
     * Advances `target`'s state machine when struck by the player or by
     * another already-falling object (cascade — PRD "Interactive Objects →
     * 1, Cascade"). `pinned` → `damaged` on first hit, `damaged` → `fallen`
     * (dynamic, gravity takes over) on the second.
     */
    const handleObjectImpact = (
      impactor: Matter.Body,
      target: Matter.Body,
      now: number,
    ) => {
      const obj = objectsById.get(target.id);
      if (!obj || !obj.destructible || obj.state === 'fallen') return;

      const isPlayerImpact = impactor === playerBody;
      const isCascadeImpact =
        !impactor.isStatic && objectsById.has(impactor.id);
      if (!isPlayerImpact && !isCascadeImpact) return;

      if (obj.state === 'pinned') {
        obj.state = 'damaged';
        obj.hitAt = now;
      } else if (obj.state === 'damaged') {
        obj.state = 'fallen';
        obj.hitAt = now;
        Body.setStatic(obj.body, false);
        Body.setAngularVelocity(
          obj.body,
          (Math.random() - 0.5) * FALL_ANGULAR_VELOCITY,
        );
      }
    };

    const handleCollisionStart = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      const now = performance.now();
      for (const pair of event.pairs) {
        addSupportContact(pair, now);
        handleObjectImpact(pair.bodyA, pair.bodyB, now);
        handleObjectImpact(pair.bodyB, pair.bodyA, now);
      }
    };

    const handleCollisionActive = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      const now = performance.now();
      for (const pair of event.pairs) addSupportContact(pair, now);
    };

    const handleCollisionEnd = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      for (const pair of event.pairs) {
        removeSupportContact(pair);
      }
    };

    const deactivate = () => {
      if (state !== 'active') return;
      state = 'passive';
      heroEl?.removeAttribute('data-game-active');
      heroContentEl?.removeAttribute('inert');
      heroContentEl?.removeAttribute('aria-hidden');

      if (engine) {
        Events.off(engine, 'collisionStart', handleCollisionStart);
        Events.off(engine, 'collisionActive', handleCollisionActive);
        Events.off(engine, 'collisionEnd', handleCollisionEnd);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      engine = null;
      playerBody = null;
      sidewalkGround = null;
      roadGround = null;
      brickLedge = null;
      interactiveObjects = [];
      supportContacts.clear();
      objectsById.clear();
      playerLevel = 'sidewalk';

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerdown', onDocumentPointerDown);

      inputLeft = false;
      inputRight = false;
      drawPassiveFrame();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          inputRight = true;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          inputLeft = true;
          break;
        case ' ':
          event.preventDefault();
          if (!event.repeat && canJump && playerBody) {
            Body.setVelocity(playerBody, {
              x: playerBody.velocity.x,
              y: -PLAYER_JUMP_VELOCITY,
            });
            supportContacts.clear();
            canJump = false;
          }
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          if (
            !event.repeat &&
            playerLevel === 'sidewalk' &&
            canJump &&
            playerBody &&
            engine &&
            sidewalkGround &&
            roadGround
          ) {
            Composite.remove(engine.world, sidewalkGround);
            Composite.add(engine.world, roadGround);
            Body.setPosition(playerBody, {
              x: playerBody.position.x,
              y: playerBody.position.y + roadDropPx,
            });
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: 0 });
            playerLevel = 'road';
            supportContacts.clear();
            supportContacts.add(roadGround.id);
            canJump = true;
            squashUntil = performance.now() + LANDING_SQUASH_MS;
          }
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault();
          if (
            !event.repeat &&
            playerLevel === 'road' &&
            canJump &&
            playerBody &&
            engine &&
            sidewalkGround &&
            roadGround
          ) {
            Composite.remove(engine.world, roadGround);
            Composite.add(engine.world, sidewalkGround);
            Body.setPosition(playerBody, {
              x: playerBody.position.x,
              y: playerBody.position.y - roadDropPx,
            });
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: 0 });
            playerLevel = 'sidewalk';
            supportContacts.clear();
            supportContacts.add(sidewalkGround.id);
            canJump = true;
            squashUntil = performance.now() + LANDING_SQUASH_MS;
          }
          break;
        case 'Escape':
          if (!event.repeat) deactivate();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          inputRight = false;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          inputLeft = false;
          break;
        default:
          break;
      }
    };

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (event.target !== canvas) deactivate();
    };

    const activate = () => {
      if (state === 'active' || prefersReducedMotion) return;
      state = 'active';
      heroEl?.setAttribute('data-game-active', 'true');
      heroContentEl?.setAttribute('inert', '');
      heroContentEl?.setAttribute('aria-hidden', 'true');

      const cell = cellOf(height);
      const baseline = height * HERO_BASELINE_RATIO;
      const groundThickness = cell * 2;
      const wallThickness = cell;
      const playerWidth = cell * 2;
      const playerHeight = cell * 4;
      const { roadDrop } = getStreetLevels(baseline, cell);
      const billboard = getBillboardGeometry(width, cell);
      const brickLedgeThickness = Math.max(
        4,
        cell * BRICK_LEDGE_THICKNESS_CELLS,
      );

      engine = Engine.create();

      sidewalkGround = Bodies.rectangle(
        width / 2,
        baseline + groundThickness / 2,
        width * 2,
        groundThickness,
        { isStatic: true, friction: PLAYER_FRICTION },
      );
      roadGround = Bodies.rectangle(
        width / 2,
        baseline + roadDrop + groundThickness / 2,
        width * 2,
        groundThickness,
        { isStatic: true, friction: PLAYER_FRICTION },
      );
      const leftWall = Bodies.rectangle(
        -wallThickness / 2,
        height / 2,
        wallThickness,
        height * 2,
        { isStatic: true },
      );
      const rightWall = Bodies.rectangle(
        width + wallThickness / 2,
        height / 2,
        wallThickness,
        height * 2,
        { isStatic: true },
      );
      brickLedge = Bodies.rectangle(
        billboard.brickX + billboard.brickWidth / 2,
        billboard.brickTop + brickLedgeThickness / 2,
        billboard.brickWidth,
        brickLedgeThickness,
        { isStatic: true, friction: PLAYER_FRICTION },
      );

      playerBody = Bodies.rectangle(
        cell * PLAYER_SPAWN_X_CELLS,
        baseline - playerHeight / 2 - cell * SPAWN_DROP_CELLS,
        playerWidth,
        playerHeight,
        { friction: PLAYER_FRICTION },
      );
      Body.setInertia(playerBody, Infinity);

      const playerMass = playerBody.mass;
      const heroLayout = computeHeroLayout(ctx, cell);
      interactiveObjects = [
        ...heroLayout.tagline.map((layout) =>
          createInteractiveObject(layout, 'tagline', playerMass, false),
        ),
        ...heroLayout.wordmark.map((layout) =>
          createInteractiveObject(layout, 'wordmark', playerMass * 2, false),
        ),
        ...heroLayout.badges.map((layout) =>
          createInteractiveObject(
            layout,
            'badge',
            playerMass * BADGE_MASS_MULTIPLIER,
          ),
        ),
        ...heroLayout.buttons.map((layout) =>
          createInteractiveObject(
            layout,
            'button',
            playerMass * BUTTON_MASS_MULTIPLIER,
          ),
        ),
      ];
      objectsById.clear();
      for (const obj of interactiveObjects) objectsById.set(obj.body.id, obj);

      Composite.add(engine.world, [
        sidewalkGround,
        leftWall,
        rightWall,
        brickLedge,
        playerBody,
        ...interactiveObjects.map((obj) => obj.body),
      ]);
      Events.on(engine, 'collisionStart', handleCollisionStart);
      Events.on(engine, 'collisionActive', handleCollisionActive);
      Events.on(engine, 'collisionEnd', handleCollisionEnd);

      facing = 'right';
      inputLeft = false;
      inputRight = false;
      canJump = false;
      supportContacts.clear();
      playerLevel = 'sidewalk';
      roadDropPx = roadDrop;
      sidewalkRestY = baseline - playerHeight / 2;
      physicsAccumulator = 0;
      lastPhysicsTime = 0;
      squashUntil = 0;

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('pointerdown', onDocumentPointerDown);
    };

    const onCanvasClick = (event: MouseEvent) => {
      if (state === 'passive') {
        event.preventDefault();
        activate();
      }
    };

    const onCanvasPointerMove = () => {
      canvas.style.cursor = state === 'passive' ? 'pointer' : '';
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (state === 'active') {
        // World geometry is sized off `width`/`height` — simplest to reset
        // rather than reposition every body on the fly.
        deactivate();
        return;
      }
      drawPassiveFrame();
    };

    resize();
    window.addEventListener('resize', resize);

    if (prefersReducedMotion) {
      return () => window.removeEventListener('resize', resize);
    }

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('pointermove', onCanvasPointerMove);

    const tick = (time: number) => {
      frameId = requestAnimationFrame(tick);

      if (state === 'active' && engine && playerBody) {
        if (lastPhysicsTime === 0) lastPhysicsTime = time;
        const frameDelta = Math.min(time - lastPhysicsTime, 250);
        lastPhysicsTime = time;
        physicsAccumulator += frameDelta;
        while (physicsAccumulator >= FIXED_PHYSICS_DT) {
          stepPhysics(FIXED_PHYSICS_DT);
          physicsAccumulator -= FIXED_PHYSICS_DT;
        }
      } else {
        lastPhysicsTime = 0;
      }

      const drawDelta = time - lastFrameTime;
      if (drawDelta < FRAME_DURATION) return;
      lastFrameTime = time - (drawDelta % FRAME_DURATION);
      elapsed += drawDelta;

      if (state === 'active') {
        drawActiveFrame(time);
      } else {
        drawPassiveFrame();
      }
    };

    const start = () => {
      if (frameId) return;
      lastFrameTime = performance.now();
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
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      deactivate();
    };
  }, [prefersReducedMotion]);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
