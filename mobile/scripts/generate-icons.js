#!/usr/bin/env node
/**
 * Generates the SplitPro app icon, splash and Android adaptive icon layers as PNGs
 * using only Node built-ins (zlib). Run from mobile/: `node scripts/generate-icons.js`.
 *
 * Mark: a rounded white "S" on navy #0b1626 with a #5aa9ff accent dot.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAVY = [0x0b, 0x16, 0x26];
const WHITE = [0xff, 0xff, 0xff];
const ACCENT = [0x5a, 0xa9, 0xff];

const OUT_DIR = path.join(__dirname, '..', 'assets');

// ---- PNG encoding ---------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
};

/** pixels: Uint8Array of RGBA, size*size*4. withAlpha=false writes RGB (required for iOS icon). */
const encodePng = (size, pixels, withAlpha) => {
  const channels = withAlpha ? 4 : 3;
  const raw = Buffer.alloc((size * channels + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * channels + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = rowStart + 1 + x * channels;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      if (withAlpha) raw[dst + 3] = pixels[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = withAlpha ? 6 : 2; // RGBA or RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---- Geometry (unit square, y up, centred at 0.5,0.5) ----------------------

const R = 0.13; // ring centre-line radius
const W = 0.085; // stroke width
const TOP = { cx: 0.5, cy: 0.5 + R };
const BOTTOM = { cx: 0.5, cy: 0.5 - R };
const DOT = { cx: 0.5 + R + 0.11, cy: 0.5 - 2 * R - W / 2 + 0.035, r: 0.045 };

const deg = (d) => (d * Math.PI) / 180;
const norm = (a) => ((a % 360) + 360) % 360;

/** Distance from p to an arc of a circle, angles in degrees (y-up), inRange(angleDeg). */
const arcDistance = (px, py, c, inRange, endA, endB) => {
  const dx = px - c.cx;
  const dy = py - c.cy;
  const angle = norm((Math.atan2(dy, dx) * 180) / Math.PI);
  if (inRange(angle)) {
    return Math.abs(Math.hypot(dx, dy) - R);
  }
  const ends = [endA, endB].map((a) => [c.cx + R * Math.cos(deg(a)), c.cy + R * Math.sin(deg(a))]);
  return Math.min(...ends.map(([ex, ey]) => Math.hypot(px - ex, py - ey)));
};

// Top bowl: from 25deg (upper right) counter-clockwise round to 270deg (joins the spine).
const topArc = (px, py) => arcDistance(px, py, TOP, (a) => 25 <= a && 270 >= a, 25, 270);
// Bottom bowl: from 90deg (joins the spine) clockwise round to 205deg (lower left).
const bottomArc = (px, py) =>
  arcDistance(px, py, BOTTOM, (a) => 90 >= a || 205 <= a, 90, 205);

/** Returns colour [r,g,b] or null for a point in mark space. */
const markColour = (px, py) => {
  if (Math.hypot(px - DOT.cx, py - DOT.cy) <= DOT.r) return ACCENT;
  if (W / 2 >= Math.min(topArc(px, py), bottomArc(px, py))) return WHITE;
  return null;
};

// ---- Rasteriser -----------------------------------------------------------

/**
 * scale shrinks the mark around the centre (1 = full icon framing).
 * background null = transparent.
 */
const render = ({ size, scale, background, monochrome = false, noMark = false }) => {
  const SS = 3; // supersampling per axis
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = 1 - (y + (sy + 0.5) / SS) / size;
          const mx = 0.5 + (ux - 0.5) / scale;
          const my = 0.5 + (uy - 0.5) / scale;
          let col = noMark ? null : markColour(mx, my);
          if (col && monochrome) col = WHITE;
          const fill = col || background;
          if (fill) {
            r += fill[0];
            g += fill[1];
            b += fill[2];
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (0 === a) continue;
      // un-premultiply so transparent edges keep their colour
      const covered = a / 255;
      pixels[i] = Math.round(r / covered);
      pixels[i + 1] = Math.round(g / covered);
      pixels[i + 2] = Math.round(b / covered);
      pixels[i + 3] = Math.round(a / n);
    }
  }
  return pixels;
};

const write = (name, size, opts, withAlpha) => {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, encodePng(size, render({ size, ...opts }), withAlpha));
  console.log(`wrote ${path.relative(process.cwd(), file)} (${size}x${size})`);
};

fs.mkdirSync(OUT_DIR, { recursive: true });
// iOS app icon: opaque, no alpha channel.
write('icon.png', 1024, { scale: 1.1, background: NAVY }, false);
// Splash mark: transparent, shown on #0b1626 splash background.
write('splash-icon.png', 1024, { scale: 1.4, background: null }, true);
// Android adaptive icon layers (foreground kept inside the 66% safe zone).
write('android-icon-foreground.png', 1024, { scale: 0.95, background: null }, true);
write('android-icon-background.png', 1024, { scale: 1, background: NAVY, noMark: true }, false);
write(
  'android-icon-monochrome.png',
  1024,
  { scale: 0.95, background: null, monochrome: true },
  true,
);
write('favicon.png', 48, { scale: 1.1, background: NAVY }, false);
