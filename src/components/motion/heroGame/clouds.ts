import Matter from 'matter-js';
import {
  CLOUD_REPAIR_MS,
  SURFACE_FRICTION,
  SURFACE_FRICTION_STATIC,
} from './constants';
import { drawFlatCloudPlatform } from './pickupsAndFx';

const { Bodies } = Matter;

export interface CloudPlatform {
  body: Matter.Body;
  brokenUntil: number;
}

export function createCloudPlatform(
  x: number,
  y: number,
  width: number,
  height: number,
): CloudPlatform {
  return {
    body: Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      friction: SURFACE_FRICTION,
      frictionStatic: SURFACE_FRICTION_STATIC,
      label: 'cloud-platform',
    }),
    brokenUntil: 0,
  };
}

export function drawCloudPlatform(
  ctx: CanvasRenderingContext2D,
  cloud: CloudPlatform,
  cell: number,
  daytime: boolean,
  now: number,
) {
  drawFlatCloudPlatform(ctx, cloud.body, cell, daytime, now, cloud.brokenUntil);
}

export function breakCloudPlatform(cloud: CloudPlatform, now: number) {
  cloud.brokenUntil = now + CLOUD_REPAIR_MS;
  cloud.body.isSensor = true;
}

export function updateCloudPlatform(
  cloud: CloudPlatform,
  playerBody: Matter.Body,
  now: number,
  cell: number,
) {
  if (now < cloud.brokenUntil) {
    cloud.body.isSensor = true;
    return;
  }

  if (cloud.brokenUntil !== 0) {
    cloud.brokenUntil = 0;
  }

  const horizontalOverlap =
    playerBody.bounds.max.x > cloud.body.bounds.min.x + cell * 0.15 &&
    playerBody.bounds.min.x < cloud.body.bounds.max.x - cell * 0.15;
  if (!horizontalOverlap) {
    cloud.body.isSensor = false;
    return;
  }

  const playerSafelyAbove =
    playerBody.position.y < cloud.body.position.y &&
    playerBody.velocity.y >= -0.5;

  cloud.body.isSensor = !playerSafelyAbove;
}

export function findCloudPlatform(clouds: CloudPlatform[], body: Matter.Body) {
  return clouds.find((cloud) => cloud.body === body) ?? null;
}
