// news-image-20261127 — "The World in One Day"
//
// A self-contained Node 22 program (standard library only, no network) that
// paints a 1024x1024 newspaper front page summing up Friday 27 November
// 2026 and saves it as /output/entry.png. It is fully deterministic: two
// runs produce byte-identical files.
//
// The six stories, each first reported on 27 November 2026:
//  1. Hong Kong marks one year since the Wang Fuk Court tower fire (168 dead)
//     with flowers, prayers and tears; officials warn over the memorial.
//  2. Trump says he pressed Putin in China to pull back "all military
//     aggression" in Europe; he also talks Ukraine with NATO chief Rutte.
//  3. Kim Jong Un vows an uncontrollable nuclear build-up and to expand
//     tactical nuclear weapons.
//  4. Israeli strikes kill 7 in Gaza, including a deputy education minister;
//     Israel's defence minister warns an operation could displace 1,000,000.
//  5. A fuel tanker crash sparks a huge fire on a Giza road in Cairo:
//     31 people killed.
//  6. A major Thanksgiving storm floods both US coasts, grounds flights and
//     knocks out power for hundreds of thousands; the Macy's parade moves.
// Plus a footer ticker: Iraq jails 8 French IS militants for life, the US
// clears a 622M F-16 sale to Ukraine, and the Solomon Islands pick an
// Australian defence pact over China.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 4);

type RGB = [number, number, number];

// Paint one pixel, silently ignoring out-of-bounds coordinates.
function put(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = 255;
}

// Paint a solid rectangle, clipped to the canvas.
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = 255;
    }
  }
}

// Paint just the border of a rectangle, thickness t.
function frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}

// Bresenham segment of thickness t.
function seg(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    rect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// Paint a filled disc.
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) put(cx + x, cy + y, c);
  }
}

// Paint a filled triangle (barycentric sign test over its bounding box).
function tri(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  c: RGB,
): void {
  const s = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const lo_x = Math.max(0, Math.min(x0, x1, x2));
  const hi_x = Math.min(W - 1, Math.max(x0, x1, x2));
  const lo_y = Math.max(0, Math.min(y0, y1, y2));
  const hi_y = Math.min(H - 1, Math.max(y0, y1, y2));
  for (let y = lo_y; y <= hi_y; y++) {
    for (let x = lo_x; x <= hi_x; x++) {
      const d0 = s(x, y, x0, y0, x1, y1);
      const d1 = s(x, y, x1, y1, x2, y2);
      const d2 = s(x, y, x2, y2, x0, y0);
      const has_neg = d0 < 0 || d1 < 0 || d2 < 0;
      const has_pos = d0 > 0 || d1 > 0 || d2 > 0;
      if (!(has_neg && has_pos)) put(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is seven rows of five bits, stored as numbers:
// bit 4 is the leftmost cell, bit 0 the rightmost. Uppercase, digits and
// the punctuation the headlines need.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x13, 0x11, 0x11, 0x0e],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x13, 0x15, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x14, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x02, 0x04, 0x04, 0x04],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c, 0x08],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  ";": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  "-": [0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "&": [0x0c, 0x12, 0x12, 0x08, 0x15, 0x12, 0x0d],
  "%": [0x11, 0x12, 0x02, 0x04, 0x08, 0x12, 0x11],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  "=": [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  '"': [0x0a, 0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00],
  "\u2022": [0x00, 0x00, 0x0e, 0x0e, 0x0e, 0x00, 0x00],
};

function measure(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function print(x: number, y: number, text: string, scale: number, c: RGB): void {
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const rows = GLYPHS[upper[i]] ?? GLYPHS["?"];
    const gx = x + i * 6 * scale;
    for (let row = 0; row < 7; row++) {
      const bits = rows[row];
      for (let col = 0; col < 5; col++) {
        if ((bits >> (4 - col)) & 1) {
          rect(gx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
  }
}

function printCentred(cx: number, y: number, text: string, scale: number, c: RGB): void {
  print(cx - Math.floor(measure(text, scale) / 2), y, text, scale, c);
}

// Greedy word wrap to a maximum character count per line.
function splitLines(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// PNG writer (truecolour, no filter): CRC32 table, chunk assembly, zlib.
// Standard library only.
// ---------------------------------------------------------------------------
const CRC: number[] = (() => {
  const tab: number[] = [];
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    tab[n] = v >>> 0;
  }
  return tab;
})();

function crcOf(data: Buffer): number {
  let v = 0xffffffff;
  for (let i = 0; i < data.length; i++) v = CRC[(v ^ data[i]) & 0xff] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(kind: string, data: Buffer): Buffer {
  const tag = Buffer.from(kind, "ascii");
  return Buffer.concat([u32be(data.length), tag, data, u32be(crcOf(Buffer.concat([tag, data])) )]);
}

function pngBytes(): Buffer {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(H, 4);
  head[8] = 8; // 8-bit samples
  head[9] = 6; // RGBA
  head[10] = 0;
  head[11] = 0;
  head[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", head),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [24, 28, 34];
const NAVY: RGB = [14, 42, 71];
const GOLD: RGB = [242, 193, 78];
const WHITE: RGB = [255, 255, 255];
const PANEL: RGB = [255, 255, 255];

// ---------------------------------------------------------------------------
// Story artwork. Each painter fills a 486x120 strip inside its panel.
// ---------------------------------------------------------------------------

// 1. Hong Kong, one year on: dusk skyline of tower blocks, one block glowing
//    with the remembered fire, white flowers laid at its foot, a candle.
function artHongKong(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 70, [44, 52, 74]);
  rect(x, y + 70, w, h - 70, [30, 34, 44]);
  // Pale moon
  disc(x + 440, y + 24, 13, [232, 228, 210]);
  // Seven tower blocks, dark against the dusk
  const tower = (tx: number, tw: number, th: number, c: RGB): void => {
    rect(x + tx, y + 116 - th, tw, th, c);
    for (let wy = 116 - th + 8; wy < 108; wy += 12) {
      for (let wx = tx + 6; wx < tx + tw - 6; wx += 12) {
        rect(x + wx, y + wy, 5, 6, [240, 196, 90]);
      }
    }
  };
  tower(18, 46, 96, [24, 28, 38]);
  tower(72, 46, 108, [24, 28, 38]);
  tower(126, 46, 88, [24, 28, 38]);
  tower(180, 52, 104, [24, 28, 38]);
  tower(240, 46, 92, [24, 28, 38]);
  tower(294, 46, 100, [24, 28, 38]);
  tower(348, 46, 84, [24, 28, 38]);
  // The remembered fire: orange glow and flame tongues on the middle block
  disc(x + 206, y + 40, 26, [240, 130, 40]);
  disc(x + 206, y + 46, 18, [250, 180, 60]);
  tri(x + 196, y + 58, x + 206, y + 18, x + 216, y + 58, [250, 200, 80]);
  tri(x + 188, y + 62, x + 196, y + 34, x + 204, y + 62, [240, 120, 30]);
  // White chrysanthemums laid at the foot, left, and a lit candle, right
  for (let i = 0; i < 6; i++) {
    disc(x + 404 + i * 12, y + 104, 5, WHITE);
    disc(x + 404 + i * 12, y + 104, 2, GOLD);
  }
  rect(x + 420, y + 88, 6, 16, WHITE);
  tri(x + 418, y + 88, x + 423, y + 76, x + 428, y + 88, [250, 200, 80]);
  // "168" memorial plaque (text 106px wide, plaque 122px)
  rect(x + 18, y + 8, 122, 34, [24, 28, 34]);
  frame(x + 18, y + 8, 122, 34, GOLD, 2);
  print(x + 26, y + 15, "168 LIVES", 2, WHITE);
}

// 2. Trump presses Putin in China: two flags over a summit table, a
//    handshake in the middle, "BEIJING" on the table front.
function artSummit(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 64, [196, 40, 40]);
  rect(x, y + 64, w, h - 64, [120, 26, 26]);
  // US flag, left: stripes and blue canton with star dots
  for (let i = 0; i < 7; i++) {
    rect(x + 30, y + 12 + i * 8, 130, 4, i % 2 === 0 ? [178, 34, 52] : WHITE);
  }
  rect(x + 30, y + 12, 56, 28, [30, 50, 110]);
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 4; sx++) disc(x + 38 + sx * 12, y + 18 + sy * 8, 2, WHITE);
  }
  // Russian flag, right: white, blue, red bands
  rect(x + 330, y + 12, 130, 18, WHITE);
  rect(x + 330, y + 30, 130, 18, [20, 60, 160]);
  rect(x + 330, y + 48, 130, 18, [200, 30, 30]);
  // Summit table
  rect(x + 150, y + 78, 186, 8, [90, 60, 30]);
  rect(x + 158, y + 86, 10, 30, [70, 46, 24]);
  rect(x + 318, y + 86, 10, 30, [70, 46, 24]);
  // Handshake: two suited arms reaching across the table, clasped hands
  seg(x + 178, y + 92, x + 230, y + 68, [30, 40, 60], 9);
  seg(x + 308, y + 92, x + 256, y + 68, [30, 40, 60], 9);
  disc(x + 232, y + 66, 12, [232, 190, 150]);
  disc(x + 254, y + 66, 12, [214, 170, 130]);
  rect(x + 232, y + 54, 22, 24, [232, 190, 150]);
  // "BEIJING" plaque on the table front
  rect(x + 196, y + 90, 94, 22, [24, 28, 34]);
  frame(x + 196, y + 90, 94, 22, GOLD, 2);
  print(x + 206, y + 96, "BEIJING", 2, GOLD);
}

// 3. Kim Jong Un's nuclear vow: a missile on its launcher under a dark sky,
//    a red star, and a "TACTICAL NUKES" banner.
function artMissile(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 76, [22, 28, 44]);
  rect(x, y + 76, w, h - 76, [52, 56, 64]);
  // Stars
  for (const [sx, sy] of [[60, 16], [120, 28], [380, 14], [430, 30], [300, 10]] as const) {
    disc(x + sx, y + sy, 2, WHITE);
  }
  // Red star emblem, top left (gold asterisk drawn with strokes)
  disc(x + 40, y + 44, 12, [200, 30, 30]);
  seg(x + 40, y + 36, x + 40, y + 52, GOLD, 2);
  seg(x + 33, y + 44, x + 47, y + 44, GOLD, 2);
  seg(x + 35, y + 39, x + 45, y + 49, GOLD, 2);
  seg(x + 45, y + 39, x + 35, y + 49, GOLD, 2);
  // Missile climbing to the right on its launcher
  seg(x + 120, y + 108, x + 330, y + 26, [180, 186, 192], 10);
  tri(x + 330, y + 26, x + 356, y + 34, x + 336, y + 44, [200, 30, 30]);
  tri(x + 120, y + 108, x + 148, y + 96, x + 138, y + 116, [120, 124, 130]);
  // Flame at the tail
  tri(x + 108, y + 100, x + 96, y + 118, x + 122, y + 116, [250, 180, 60]);
  tri(x + 104, y + 106, x + 98, y + 116, x + 114, y + 114, [240, 120, 30]);
  // Launcher truck
  rect(x + 150, y + 96, 130, 20, [40, 44, 52]);
  disc(x + 176, y + 116, 9, [20, 22, 26]);
  disc(x + 254, y + 116, 9, [20, 22, 26]);
  // Banner, bottom right
  rect(x + 306, y + 88, 176, 24, [178, 34, 34]);
  print(x + 312, y + 95, "TACTICAL NUKES", 2, WHITE);
}

// 4. Gaza: ruined buildings and smoke under a grey sky, a white ambulance,
//    and a "1,000,000 AT RISK" plaque.
function artGaza(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 62, [150, 146, 138]);
  rect(x, y + 62, w, h - 62, [104, 100, 94]);
  // Smoke columns
  disc(x + 90, y + 20, 12, [120, 116, 110]);
  disc(x + 112, y + 12, 14, [136, 132, 126]);
  disc(x + 330, y + 24, 10, [120, 116, 110]);
  disc(x + 352, y + 14, 12, [136, 132, 126]);
  // Ruined buildings: broken silhouettes
  rect(x + 30, y + 46, 60, 70, [70, 66, 62]);
  tri(x + 30, y + 46, x + 60, y + 26, x + 90, y + 46, [70, 66, 62]);
  rect(x + 110, y + 66, 56, 50, [84, 80, 76]);
  rect(x + 190, y + 56, 70, 60, [70, 66, 62]);
  tri(x + 190, y + 56, x + 225, y + 36, x + 260, y + 56, [70, 66, 62]);
  rect(x + 280, y + 70, 60, 46, [84, 80, 76]);
  // Rubble at the base
  for (let i = 0; i < 8; i++) rect(x + 40 + i * 44, y + 110, 26, 6, [60, 56, 52]);
  // White ambulance with red cross, right
  rect(x + 380, y + 82, 88, 30, WHITE);
  frame(x + 380, y + 82, 88, 30, [160, 160, 160], 2);
  rect(x + 416, y + 88, 16, 6, [200, 30, 30]);
  rect(x + 421, y + 83, 6, 16, [200, 30, 30]);
  disc(x + 400, y + 112, 7, [20, 22, 26]);
  disc(x + 448, y + 112, 7, [20, 22, 26]);
  // Plaque (text 190px wide, plaque 212px)
  rect(x + 14, y + 8, 212, 30, [24, 28, 34]);
  frame(x + 14, y + 8, 212, 30, GOLD, 2);
  print(x + 22, y + 15, "1,000,000 AT RISK", 2, WHITE);
}

// 5. Egypt tanker fire: a road at dusk, a tanker truck engulfed in flames,
//    thick black smoke, and a "31 KILLED" plaque.
function artTanker(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 56, [222, 160, 90]);
  rect(x, y + 56, w, h - 56, [70, 66, 62]);
  disc(x + 430, y + 24, 16, [240, 150, 50]);
  // Thick black smoke
  disc(x + 240, y + 12, 16, [40, 40, 44]);
  disc(x + 268, y + 8, 18, [52, 52, 56]);
  disc(x + 296, y + 14, 14, [40, 40, 44]);
  // Road
  rect(x, y + 92, w, 28, [44, 46, 50]);
  for (let i = 0; i < 6; i++) rect(x + 20 + i * 80, y + 104, 40, 4, [220, 200, 80]);
  // Tanker truck: cab and cylindrical tank
  rect(x + 150, y + 66, 60, 26, [200, 30, 30]);
  rect(x + 162, y + 70, 20, 12, [140, 190, 220]);
  rect(x + 210, y + 58, 170, 34, [200, 200, 204]);
  frame(x + 210, y + 58, 170, 34, [120, 124, 130], 2);
  disc(x + 176, y + 94, 8, [20, 22, 26]);
  disc(x + 236, y + 94, 8, [20, 22, 26]);
  disc(x + 352, y + 94, 8, [20, 22, 26]);
  // Flames engulfing the tank
  tri(x + 220, y + 58, x + 240, y + 18, x + 260, y + 58, [250, 200, 80]);
  tri(x + 260, y + 58, x + 284, y + 10, x + 308, y + 58, [240, 120, 30]);
  tri(x + 308, y + 58, x + 328, y + 22, x + 348, y + 58, [250, 200, 80]);
  tri(x + 348, y + 58, x + 366, y + 28, x + 384, y + 58, [240, 120, 30]);
  // Plaque
  rect(x + 18, y + 8, 118, 34, [24, 28, 34]);
  frame(x + 18, y + 8, 118, 34, GOLD, 2);
  print(x + 28, y + 15, "31 KILLED", 2, WHITE);
}

// 6. Thanksgiving storm: black storm clouds, driving rain, lightning over a
//    flooded street, a grounded plane silhouette and a parade balloon.
function artStorm(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 70, [52, 60, 74]);
  rect(x, y + 70, w, h - 70, [90, 110, 130]);
  // Storm clouds
  disc(x + 80, y + 22, 18, [30, 34, 42]);
  disc(x + 106, y + 16, 22, [36, 40, 50]);
  disc(x + 134, y + 22, 18, [30, 34, 42]);
  disc(x + 360, y + 18, 16, [30, 34, 42]);
  disc(x + 384, y + 14, 20, [36, 40, 50]);
  disc(x + 410, y + 20, 16, [30, 34, 42]);
  // Lightning bolt
  tri(x + 240, y + 8, x + 256, y + 8, x + 244, y + 34, GOLD);
  tri(x + 244, y + 34, x + 260, y + 34, x + 240, y + 62, GOLD);
  // Driving rain, slanted streaks
  for (let i = 0; i < 14; i++) {
    seg(x + 20 + i * 34, y + 44, x + 12 + i * 34, y + 66, [180, 200, 220], 2);
  }
  // Flooded street: water line and a half-submerged car
  rect(x, y + 92, w, 28, [40, 70, 100]);
  rect(x + 60, y + 78, 110, 16, [180, 60, 40]);
  rect(x + 78, y + 66, 60, 12, [200, 80, 60]);
  disc(x + 86, y + 94, 7, [20, 22, 26]);
  disc(x + 146, y + 94, 7, [20, 22, 26]);
  // Grounded plane silhouette, right, above the water line
  rect(x + 300, y + 74, 130, 10, [30, 34, 42]);
  tri(x + 430, y + 74, x + 458, y + 79, x + 430, y + 84, [30, 34, 42]);
  tri(x + 330, y + 74, x + 348, y + 58, x + 352, y + 74, [30, 34, 42]);
  // Parade balloon drifting low, top right
  disc(x + 448, y + 44, 12, [240, 150, 50]);
  seg(x + 448, y + 56, x + 448, y + 70, [240, 150, 50], 2);
  // Plaque
  rect(x + 300, y + 8, 168, 30, [24, 28, 34]);
  frame(x + 300, y + 8, 168, 30, GOLD, 2);
  print(x + 308, y + 15, "THANKSGIVING", 2, WHITE);
}

// ---------------------------------------------------------------------------
// Stories: kicker band, headline, deck, and the painter for each.
// ---------------------------------------------------------------------------
interface Story {
  kicker: string;
  band: RGB;
  title: string;
  deck: string;
  art: (x: number, y: number, w: number, h: number) => void;
}

const STORIES: Story[] = [
  {
    kicker: "ASIA - HONG KONG",
    band: [88, 32, 32],
    title: "HONG KONG MOURNS 168 LOST IN TOWER FIRE",
    deck: "A YEAR AFTER THE WANG FUK COURT BLAZE, FLOWERS AND PRAYERS FOR 168 DEAD",
    art: artHongKong,
  },
  {
    kicker: "DIPLOMACY - CHINA",
    band: [0, 90, 160],
    title: "TRUMP SAYS HE PRESSED PUTIN IN CHINA",
    deck: "US PRESIDENT URGES END TO ALL MILITARY AGGRESSION IN EUROPE; NATO TALKS",
    art: artSummit,
  },
  {
    kicker: "ASIA - NORTH KOREA",
    band: [178, 32, 32],
    title: "KIM VOWS UNSTOPPABLE NUCLEAR BUILD-UP",
    deck: "PYONGYANG TO EXPAND TACTICAL NUCLEAR WEAPONS AND REJECTS US OVERTURES",
    art: artMissile,
  },
  {
    kicker: "MIDDLE EAST - GAZA",
    band: [122, 84, 20],
    title: "ISRAELI STRIKES KILL 7 IN GAZA; 1M AT RISK",
    deck: "DRONE STRIKE KILLS 3 IN GAZA CITY; MINISTER WARNS OPERATION MAY DISPLACE 1M",
    art: artGaza,
  },
  {
    kicker: "AFRICA - EGYPT",
    band: [178, 90, 20],
    title: "31 KILLED AS FUEL TANKER FIRE ENGULFS CAIRO",
    deck: "TANKER CRASH SPARKS HUGE BLAZE ON GIZA ROAD; DRIVER HELD",
    art: artTanker,
  },
  {
    kicker: "AMERICAS - USA",
    band: [0, 102, 80],
    title: "THANKSGIVING STORM FLOODS US COASTS",
    deck: "FLOODS AND FLIGHT DELAYS HIT HOLIDAY TRAVEL; MACY'S PARADE MOVED",
    art: artStorm,
  },
];

// ---------------------------------------------------------------------------
// Page furniture: masthead, strapline, 2x3 grid of story panels, ticker.
// ---------------------------------------------------------------------------
function panel(x0: number, y0: number, pw: number, ph: number, s: Story): void {
  rect(x0, y0, pw, ph, PANEL);
  frame(x0, y0, pw, ph, [200, 192, 176], 2);
  // Kicker band
  rect(x0 + 2, y0 + 2, pw - 4, 30, s.band);
  print(x0 + 14, y0 + 11, s.kicker, 2, WHITE);
  // Artwork strip
  s.art(x0 + 2, y0 + 32, pw - 4, 120);
  // Headline, at most two lines
  for (const [i, ln] of splitLines(s.title, 25).slice(0, 2).entries()) {
    print(x0 + 14, y0 + 162 + i * 24, ln, 3, INK);
  }
  // Deck, at most three lines
  for (const [i, ln] of splitLines(s.deck, 38).slice(0, 3).entries()) {
    print(x0 + 14, y0 + 212 + i * 15, ln, 2, [74, 78, 84]);
  }
}

function page(): void {
  rect(0, 0, W, H, PAPER);
  // Masthead
  rect(16, 16, 992, 102, NAVY);
  frame(16, 16, 992, 102, GOLD, 3);
  printCentred(512, 32, "THE WORLD IN ONE DAY", 5, WHITE);
  printCentred(512, 80, "FRIDAY 27 NOVEMBER 2026", 3, GOLD);
  // Strapline
  printCentred(
    512, 130,
    "SIX STORIES THAT DEFINED THE DAY - FROM HONG KONG TO WASHINGTON",
    2, [90, 80, 66],
  );
  // Story grid: two columns, three rows
  const pw = 490;
  const ph = 258;
  for (let i = 0; i < STORIES.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    panel(16 + col * (pw + 12), 156 + row * (ph + 8), pw, ph, STORIES[i]);
  }
  // Footer ticker: three more stories of the day
  rect(16, 956, 992, 52, NAVY);
  frame(16, 956, 992, 52, GOLD, 2);
  printCentred(
    512, 972,
    "ALSO: IRAQ JAILS 8 IS MILITANTS - 622M F-16S FOR KYIV - SOLOMONS PICK AUSTRALIA",
    2, GOLD,
  );
}

// ---------------------------------------------------------------------------
// Entry point: paint the page, encode it, write /output/entry.png.
// ---------------------------------------------------------------------------
function main(): void {
  page();
  const png = pngBytes();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), png);
}

main();
