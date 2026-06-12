import Matter from 'matter-js';
import {
  DAMAGE_SHAKE_MS,
  OBJECT_RESTITUTION,
  PLAYER_FRICTION,
  SLAM_DAMAGE,
} from './constants';
import { hexToRgba, pseudoRandom, type Palette } from './palette';

const { Bodies, Body } = Matter;

// --- Interactive objects: CTA buttons & badges (Phase 2) ---------------

export type ObjectVariant =
  | 'primary'
  | 'secondary'
  | 'green'
  | 'amber'
  | 'magenta'
  | 'wordmark'
  | 'wordmarkAccent'
  | 'wordmarkPlate'
  | 'tagline';

/**
 * `pinned` → `fallen` per PRD "Interactive Objects → 1, 2".
 * `fallen` covers both the falling and settled-"obstacle" states — both are
 * the same dynamic body, just at different points in its physics journey.
 *
 * Bracket-shield additions (PRD "Resolved Design Decisions → Bracket
 * Shield"): shielded wordmark letters (`f`, `e`, `s`, `t`) pass through
 * `shielded` after enough accumulated damage cracks the shield, before
 * a later hit sends them to `fallen`. Bracket letters (`[`, `]`) skip
 * straight from `pinned` to `wobbling` (briefly oscillating in place) once
 * the player lands on them after the shielded letters have all fallen, then
 * settle into `fallen`.
 */
export type ObjectState =
  | 'pinned'
  | 'damaged'
  | 'shielded'
  | 'wobbling'
  | 'fallen';

export interface InteractiveObject {
  body: Matter.Body;
  kind: 'button' | 'badge' | 'wordmark' | 'wordmarkPlate' | 'tagline';
  variant: ObjectVariant;
  label: string;
  width: number;
  height: number;
  state: ObjectState;
  destructible: boolean;
  /** `f`, `e`, `s`, `t` — require a shield-cracking hit before they crumble. */
  shielded: boolean;
  /** `[` and `]` — immune to slam impacts; only fall when stood on post-shield. */
  bracket: boolean;
  /** Remaining durability; normal objects use 5, shielded letters use 10. */
  health: number;
  /** Starting durability, used for proportional crack severity. */
  maxHealth: number;
  /** `performance.now()` of the last state change — drives the damage shake. */
  hitAt: number;
}

export interface ObjectLayout {
  text: string;
  variant: ObjectVariant;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeroLayout {
  tagline: ObjectLayout[];
  wordmarkPlate: ObjectLayout;
  wordmark: ObjectLayout[];
  badges: ObjectLayout[];
  buttons: ObjectLayout[];
}

export const BADGE_DEFS: ReadonlyArray<{
  text: string;
  variant: ObjectVariant;
}> = [
  { text: 'FREE', variant: 'green' },
  { text: 'IRL', variant: 'amber' },
  { text: 'TBD 2027', variant: 'magenta' },
];

export const BUTTON_DEFS: ReadonlyArray<{
  text: string;
  variant: ObjectVariant;
}> = [
  { text: 'FOLLOW ON DISCORD', variant: 'primary' },
  { text: 'FOLLOW ON FACEBOOK', variant: 'secondary' },
];

/** PRD "Resolved Design Decisions → Bracket Shield": these letters take 2 hits to crumble. */
export const BRACKET_SHIELDED_CHARS = new Set(['f', 'e', 's', 't']);
/** The brackets themselves — immune to slam, fall only when stood on post-shield. */
export const BRACKET_CHARS = new Set(['[', ']']);

function measureTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  if (text.length <= 1) return ctx.measureText(text).width;
  return ctx.measureText(text).width + (text.length - 1) * tracking;
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
) {
  const totalW = measureTrackedText(ctx, text, tracking);
  let cursorX = x - totalW / 2;

  for (const char of text) {
    const charW = ctx.measureText(char).width;
    ctx.fillText(char, cursorX + charW / 2, y);
    cursorX += charW + tracking;
  }
}

function getButtonLines(label: string): string[] {
  return [label];
}

/**
 * Lays out the badge row and CTA button row in a left-aligned column,
 * mirroring `.hero__badges` / `.hero__actions` from the passive layout (see
 * PRD "Game World Layout" — badges at `y ≈ cell*6`, buttons at `y ≈ cell*10`).
 * Sizes are measured from the same pixel font the objects are drawn with, so
 * physics bodies match their visuals exactly.
 */
export function computeHeroLayout(ctx: CanvasRenderingContext2D): HeroLayout {
  const marginX = 64;
  const rowGap = 16;

  const taglineFont = 14;
  const taglinePadX = 2;
  const taglineHeight = taglineFont * 1.6;
  const taglineY = 48;
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

  const wordmarkFont = 72;
  const wordmarkHeight = wordmarkFont * 1.1;
  const wordmarkY = taglineY + taglineHeight + rowGap;
  const wordmarkChars = Array.from('GAM[fest]');
  const wordmarkTracking = wordmarkFont * 0.04;
  const wordmarkAccentGap = wordmarkFont * 0.18;
  ctx.font = `${wordmarkFont}px 'VT323', monospace`;
  let wordmarkX = marginX;
  let accentLeft = 0;
  let accentRight = 0;
  const wordmark = wordmarkChars.map((text, index) => {
    const isAccent = index >= 3;
    const width = ctx.measureText(text).width;
    if (index === 3) accentLeft = wordmarkX;
    const layout: ObjectLayout = {
      text,
      variant: isAccent ? 'wordmarkAccent' : 'wordmark',
      x: wordmarkX,
      y: wordmarkY,
      width,
      height: wordmarkHeight,
    };
    wordmarkX += width + (index === 2 ? wordmarkAccentGap : wordmarkTracking);
    if (isAccent) accentRight = wordmarkX - wordmarkTracking;
    return layout;
  });
  const wordmarkPlateHeight = wordmarkFont;
  const wordmarkPlatePadX = wordmarkFont * 0.15;
  const wordmarkPlate: ObjectLayout = {
    text: '[fest] plate',
    variant: 'wordmarkPlate',
    x: accentLeft - wordmarkPlatePadX,
    y: wordmarkY + (wordmarkHeight - wordmarkPlateHeight) / 2,
    width: accentRight - accentLeft + wordmarkPlatePadX * 2,
    height: wordmarkPlateHeight,
  };

  const badgeFont = 12;
  const badgePadX = 8;
  const badgePadY = 4;
  const badgeGap = 12;
  const badgeHeight = badgeFont * 1.4 + badgePadY * 2 + 4;
  const badgeY = wordmarkY + wordmarkHeight + rowGap;

  ctx.font = `${badgeFont}px 'Press Start 2P', monospace`;
  let badgeX = marginX;
  const badges = BADGE_DEFS.map(({ text, variant }) => {
    const width = ctx.measureText(text).width + badgePadX * 2;
    const layout: ObjectLayout = {
      text,
      variant,
      x: badgeX,
      y: badgeY,
      width,
      height: badgeHeight,
    };
    badgeX += width + badgeGap;
    return layout;
  });

  const buttonFont = 14;
  const buttonPadX = 24;
  const buttonGap = 12;
  const buttonHeight = 48;
  const buttonY = badgeY + badgeHeight + rowGap;

  ctx.font = `700 ${buttonFont}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  let buttonX = marginX;
  const buttons = BUTTON_DEFS.map(({ text, variant }) => {
    const tracking = buttonFont * 0.16;
    const width = measureTrackedText(ctx, text, tracking) + buttonPadX * 2 + 4;
    const layout: ObjectLayout = {
      text,
      variant,
      x: buttonX,
      y: buttonY,
      width,
      height: buttonHeight,
    };
    buttonX += width + buttonGap;
    return layout;
  });

  return { tagline, wordmarkPlate, wordmark, badges, buttons };
}

/**
 * Creates a body that starts dynamic (so `restitution`/`mass` apply
 * normally), then pins it static. `Body.setStatic` caches these as the
 * "original" values and restores them when a hit later flips the body back
 * to dynamic — setting them in this order is what makes that restore work.
 */
export function createPinnedBody(
  layout: ObjectLayout,
  mass: number,
): Matter.Body {
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

export function createInteractiveObject(
  layout: ObjectLayout,
  kind: InteractiveObject['kind'],
  mass: number,
  options: {
    destructible?: boolean;
    shielded?: boolean;
    bracket?: boolean;
  } = {},
): InteractiveObject {
  const maxHealth = options.shielded ? SLAM_DAMAGE * 2 : SLAM_DAMAGE;
  return {
    body: createPinnedBody(layout, mass),
    kind,
    variant: layout.variant,
    label: layout.text,
    width: layout.width,
    height: layout.height,
    state: 'pinned',
    destructible: options.destructible ?? true,
    shielded: options.shielded ?? false,
    bracket: options.bracket ?? false,
    health: maxHealth,
    maxHealth,
    hitAt: 0,
  };
}

export function getAccentColor(
  variant: ObjectVariant,
  palette: Palette,
): string {
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
export function drawCrack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cell: number,
  daytime: boolean,
  severity = 1,
) {
  const crackSeverity = Math.max(0, Math.min(1, severity));
  if (crackSeverity <= 0) return;

  const lineWidth = Math.max(
    1,
    Math.round(cell * (0.06 + crackSeverity * 0.05)),
  );
  const colors = daytime
    ? ['rgba(0, 0, 0, 0.48)', 'rgba(255, 255, 255, 0.62)']
    : ['rgba(255, 255, 255, 0.58)', 'rgba(57, 255, 20, 0.75)'];
  const shards = [
    [
      [-0.34, -0.46],
      [-0.12, -0.14],
      [-0.25, 0.22],
      [-0.02, 0.48],
    ],
    [
      [0.28, -0.42],
      [0.08, -0.08],
      [0.24, 0.12],
      [0.12, 0.42],
    ],
    [
      [-0.02, -0.36],
      [0.16, -0.16],
      [-0.06, 0.08],
      [0.2, 0.32],
    ],
  ];
  const visibleShards = Math.max(1, Math.ceil(shards.length * crackSeverity));

  shards.slice(0, visibleShards).forEach((points, index) => {
    ctx.strokeStyle = colors[index % colors.length];
    ctx.lineWidth = lineWidth + (index === 1 ? 1 : 0);
    ctx.beginPath();
    points.forEach(([x, y], pointIndex) => {
      const px = x * width * (0.65 + crackSeverity * 0.35);
      const py = y * height * (0.65 + crackSeverity * 0.35);
      if (pointIndex === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  if (crackSeverity < 0.35) return;

  ctx.fillStyle = daytime ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 79, 216, 0.6)';
  ctx.fillRect(-width * 0.2, -height * 0.05, lineWidth * 2, lineWidth * 2);
  if (crackSeverity >= 0.7) {
    ctx.fillRect(width * 0.17, height * 0.18, lineWidth * 2, lineWidth * 2);
  }
}

function drawHitFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  daytime: boolean,
  amount: number,
) {
  if (amount <= 0) return;

  ctx.save();
  ctx.globalAlpha = 0.12 + amount * 0.32;
  ctx.fillStyle = daytime ? '#ffffff' : palette.glow;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.globalAlpha = 0.35 + amount * 0.45;
  ctx.strokeStyle = daytime
    ? 'rgba(255, 255, 255, 0.9)'
    : palette.accentMagenta;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.08);
  ctx.strokeRect(
    -width / 2 + ctx.lineWidth / 2,
    -height / 2 + ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth,
  );
  ctx.restore();
}

/**
 * Draws a CTA button or badge at its physics body's current position/angle.
 * `damaged` objects jitter briefly and show a crack; `fallen` objects render
 * the same way but follow the body's rotation as they tumble and settle.
 */
export function drawInteractiveObject(
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
  const damageSeverity =
    obj.maxHealth > 0 ? Math.max(0, 1 - obj.health / obj.maxHealth) : 0;
  const hitAge = now - hitAt;
  const recentlyHit = hitAge >= 0 && hitAge < DAMAGE_SHAKE_MS;
  const hitFlash =
    recentlyHit && state !== 'fallen' ? 1 - hitAge / DAMAGE_SHAKE_MS : 0;

  if (recentlyHit && state !== 'fallen') {
    const decay = 1 - hitAge / DAMAGE_SHAKE_MS;
    x += Math.sin(hitAge * 0.09) * cell * 0.15 * decay;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(body.angle);

  if (obj.kind === 'wordmarkPlate') {
    const age = now - hitAt;
    if (state === 'fallen' && age > 520) {
      ctx.restore();
      return;
    }

    if (state === 'fallen') {
      const alpha = Math.max(0, 1 - age / 520);
      ctx.globalAlpha = alpha;
      ctx.fillStyle =
        Math.floor(age / 80) % 2 === 0 ? palette.glow : palette.accentMagenta;
      const shardCount = 14;
      for (let i = 0; i < shardCount; i++) {
        const seed = body.id * 31 + i * 11.7;
        const sx = (pseudoRandom(seed) - 0.5) * width;
        const sy = (pseudoRandom(seed + 4.2) - 0.5) * height;
        const driftX = (pseudoRandom(seed + 8.4) - 0.5) * cell * 2.1;
        const driftY = (pseudoRandom(seed + 12.6) - 0.2) * cell * 1.8;
        const shardW = Math.max(
          3,
          cell * (0.25 + pseudoRandom(seed + 2) * 0.5),
        );
        const shardH = Math.max(
          3,
          cell * (0.2 + pseudoRandom(seed + 3) * 0.45),
        );
        ctx.fillRect(
          sx + driftX * (age / 520),
          sy + driftY * (age / 520),
          shardW,
          shardH,
        );
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    ctx.fillStyle = palette.glow;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    drawCrack(ctx, width, height, cell, daytime, damageSeverity);
    drawHitFlash(ctx, width, height, palette, daytime, hitFlash);
    ctx.restore();
    return;
  }

  if (obj.kind === 'wordmark') {
    const fontSize = 72;
    ctx.font = `${fontSize}px 'VT323', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Bracket shield, first hit: pulsing glow + crack until the second hit.
    if (state === 'shielded') {
      const pulse = 0.35 + Math.sin(now * 0.012) * 0.25;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }

    if (variant === 'wordmarkAccent') {
      ctx.fillStyle = palette.frame;
    } else {
      ctx.fillStyle = daytime ? '#1a2030' : '#f4efe6';
    }
    ctx.fillText(label, 0, 1);
    drawCrack(ctx, width, height, cell, daytime, damageSeverity);
    drawHitFlash(ctx, width, height, palette, daytime, hitFlash);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    return;
  }

  if (obj.kind === 'tagline') {
    const fontSize = 14;
    ctx.font = `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = daytime ? '#0d7a32' : '#8fe39a';
    ctx.fillText(label, 0, 0);
    drawCrack(ctx, width, height, cell, daytime, damageSeverity);
    drawHitFlash(ctx, width, height, palette, daytime, hitFlash);
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

  const fontSize = obj.kind === 'button' ? 14 : 12;
  ctx.font =
    obj.kind === 'button'
      ? `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`
      : `${fontSize}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (obj.kind === 'button') {
    const lines = getButtonLines(label);
    const tracking = fontSize * 0.16;
    const lineHeight = fontSize * 1.05;
    const startY = -((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      drawTrackedText(ctx, line, 0, startY + index * lineHeight, tracking);
    });
  } else {
    ctx.fillText(label, 0, 0);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (damageSeverity > 0 || (state === 'fallen' && now - hitAt < 520)) {
    drawCrack(
      ctx,
      width,
      height,
      cell,
      daytime,
      state === 'fallen' ? 1 : damageSeverity,
    );
  }
  drawHitFlash(ctx, width, height, palette, daytime, hitFlash);

  ctx.restore();
}

export function drawTaglineSeparators(
  ctx: CanvasRenderingContext2D,
  objects: InteractiveObject[],
  daytime: boolean,
) {
  const chunks = objects.filter((obj) => obj.kind === 'tagline');
  if (chunks.length < 2) return;

  ctx.save();
  const fontSize = 14;
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
