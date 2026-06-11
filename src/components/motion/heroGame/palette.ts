export interface Palette {
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

export function isESTDaytime(): boolean {
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

export function getPalette(daytime: boolean): Palette {
  if (daytime) {
    return {
      sky: '#87ceeb',
      skylineFar: '#b8cdd8',
      skylineNear: '#8aa4b0',
      screen: '#f8f8f8',
      frame: '#1a1a1a',
      glow: '#39ff14',
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

export function pseudoRandom(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/** Converts a `#rrggbb` palette color to an `rgba()` string with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
