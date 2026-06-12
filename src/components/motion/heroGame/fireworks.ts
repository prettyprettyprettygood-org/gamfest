import { CONFETTI_COLORS } from './constants';

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  color: string;
  size: number;
  gravity: number;
  drag: number;
  shimmer: number;
  trail: number;
  kind: 'spark' | 'shimmer';
}

export interface FireworkBurst {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  launchedAt: number;
  explodeAt: number;
  particles: FireworkParticle[];
  exploded: boolean;
  color: string;
  shape: FireworkShape;
}

export interface FireworkShow {
  bursts: FireworkBurst[];
  nextLaunchAt: number;
}

const FIREWORK_COLORS = [
  ...CONFETTI_COLORS,
  '#fff27a',
  '#7afff2',
  '#ff7ad9',
  '#ffffff',
  '#a77cff',
  '#ff6b3d',
] as const;

const LAUNCH_MS = 560;
const TARGET_FRAME_MS = 16.67;
type FireworkShape = 'ring' | 'double-ring' | 'star' | 'willow' | 'spiral';

export function createFireworkShow(): FireworkShow {
  return {
    bursts: [],
    nextLaunchAt: 0,
  };
}

function pickColor(indexOffset = 0) {
  return FIREWORK_COLORS[
    (Math.floor(Math.random() * FIREWORK_COLORS.length) + indexOffset) %
      FIREWORK_COLORS.length
  ];
}

function pickShape(): FireworkShape {
  const shapes: FireworkShape[] = [
    'ring',
    'double-ring',
    'star',
    'willow',
    'spiral',
  ];
  return shapes[Math.floor(Math.random() * shapes.length)];
}

function spawnFirework(width: number, height: number, now: number) {
  const targetX = width * (0.14 + Math.random() * 0.72);
  const targetY = height * (0.1 + Math.random() * 0.46);
  const startX = targetX + (Math.random() - 0.5) * width * 0.16;
  const startY = height * (0.9 + Math.random() * 0.18);
  const color = pickColor();
  const shape = pickShape();
  const particleCount = 44 + Math.floor(Math.random() * 34);
  const particles: FireworkParticle[] = Array.from(
    { length: particleCount },
    (_, index) => {
      const angle =
        (index / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      const petalPulse = 0.78 + Math.abs(Math.sin(angle * 5)) * 0.62;
      const ringBand = index % 2 === 0 ? 1 : 0.54;
      const spiralTwist = 0.55 + (index / particleCount) * 1.25;
      const shapeSpeed =
        shape === 'star'
          ? petalPulse
          : shape === 'double-ring'
            ? ringBand
            : shape === 'willow'
              ? 0.72 + Math.random() * 0.42
              : shape === 'spiral'
                ? spiralTwist
                : 1;
      const speed = (1.6 + Math.random() * 3.7) * shapeSpeed;
      const driftAngle =
        shape === 'spiral'
          ? angle + index * 0.19
          : angle + (Math.random() - 0.5) * 0.12;
      return {
        x: targetX,
        y: targetY,
        vx: Math.cos(driftAngle) * speed,
        vy:
          Math.sin(driftAngle) * speed +
          (shape === 'willow' ? 0.45 + Math.random() * 0.45 : 0),
        life:
          (shape === 'willow' ? 1180 : 920) +
          Math.random() * (shape === 'willow' ? 680 : 620),
        age: 0,
        color: pickColor(index % 3),
        size: 2.4 + Math.random() * 4.4,
        gravity: shape === 'willow' ? 0.042 : 0.022 + Math.random() * 0.018,
        drag: shape === 'willow' ? 0.986 : 0.992,
        shimmer: 0.6 + Math.random() * 1.4,
        trail: shape === 'willow' ? 5.5 : 3 + Math.random() * 3.4,
        kind: 'spark',
      };
    },
  );
  const shimmerCount = 18 + Math.floor(Math.random() * 18);
  for (let index = 0; index < shimmerCount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.55 + Math.random() * 2.2;
    particles.push({
      x: targetX + (Math.random() - 0.5) * 8,
      y: targetY + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 0.45,
      life: 1050 + Math.random() * 900,
      age: -Math.random() * 180,
      color: pickColor(index + 2),
      size: 1.2 + Math.random() * 2.2,
      gravity: 0.034 + Math.random() * 0.026,
      drag: 0.982,
      shimmer: 1.8 + Math.random() * 2.4,
      trail: 2 + Math.random() * 3,
      kind: 'shimmer',
    });
  }

  return {
    startX,
    startY,
    targetX,
    targetY,
    launchedAt: now,
    explodeAt: now + LAUNCH_MS * (0.82 + Math.random() * 0.28),
    particles,
    exploded: false,
    color,
    shape,
  };
}

function drawLaunchStreak(
  ctx: CanvasRenderingContext2D,
  burst: FireworkBurst,
  now: number,
) {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (now - burst.launchedAt) / (burst.explodeAt - burst.launchedAt),
    ),
  );
  const eased = 1 - (1 - progress) ** 2;
  const x = burst.startX + (burst.targetX - burst.startX) * eased;
  const y = burst.startY + (burst.targetY - burst.startY) * eased;
  const tailX =
    burst.startX + (burst.targetX - burst.startX) * Math.max(0, eased - 0.08);
  const tailY =
    burst.startY + (burst.targetY - burst.startY) * Math.max(0, eased - 0.08);

  ctx.save();
  ctx.globalAlpha = 0.45 + progress * 0.45;
  ctx.shadowColor = burst.color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = burst.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
  ctx.globalAlpha *= 0.46;
  ctx.fillStyle = pickColor(Math.floor(progress * 10));
  ctx.fillRect(x - 5, y - 1, 10, 2);
  ctx.fillRect(x - 1, y - 5, 2, 10);
  ctx.restore();
}

function drawBurstParticles(
  ctx: CanvasRenderingContext2D,
  burst: FireworkBurst,
  deltaMs: number,
) {
  const dt = Math.max(0.35, Math.min(2.5, deltaMs / TARGET_FRAME_MS));
  for (const particle of burst.particles) {
    particle.age += deltaMs;
    if (particle.age < 0) continue;

    const previousX = particle.x;
    const previousY = particle.y;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= particle.drag ** dt;
    particle.vy = particle.vy * particle.drag ** dt + particle.gravity * dt;
    const alpha = Math.max(0, 1 - particle.age / particle.life);
    if (alpha <= 0) continue;
    const shimmer =
      particle.kind === 'shimmer'
        ? 0.45 + Math.abs(Math.sin(particle.age * 0.028 * particle.shimmer))
        : 0.82 +
          Math.abs(Math.sin(particle.age * 0.014 * particle.shimmer)) * 0.28;
    const size = particle.size * shimmer * (0.65 + alpha * 0.55);

    ctx.save();
    ctx.globalAlpha = alpha * (particle.kind === 'shimmer' ? 0.72 : 0.95);
    ctx.fillStyle = particle.color;
    ctx.strokeStyle = particle.color;
    ctx.lineWidth = Math.max(1, size * 0.42);
    ctx.beginPath();
    ctx.moveTo(previousX, previousY);
    ctx.lineTo(
      particle.x - particle.vx * particle.trail,
      particle.y - particle.vy * particle.trail,
    );
    ctx.stroke();
    ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
    ctx.globalAlpha *= 0.42;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      particle.x - size * 0.18,
      particle.y - size * 0.18,
      size * 0.36,
      size * 0.36,
    );
    ctx.restore();
  }
}

export function updateAndDrawFireworks(
  ctx: CanvasRenderingContext2D,
  show: FireworkShow,
  width: number,
  height: number,
  now: number,
  deltaMs: number,
) {
  if (show.nextLaunchAt === 0 || now >= show.nextLaunchAt) {
    show.bursts.push(spawnFirework(width, height, now));
    if (Math.random() > 0.58) {
      show.bursts.push(spawnFirework(width, height, now + 80));
    }
    show.nextLaunchAt = now + 360 + Math.random() * 540;
  }

  for (const burst of show.bursts) {
    if (now < burst.explodeAt) {
      drawLaunchStreak(ctx, burst, now);
      continue;
    }
    burst.exploded = true;
    drawBurstParticles(ctx, burst, deltaMs);
  }

  show.bursts = show.bursts.filter(
    (burst) =>
      !burst.exploded ||
      burst.particles.some((particle) => particle.age < particle.life),
  );
}
