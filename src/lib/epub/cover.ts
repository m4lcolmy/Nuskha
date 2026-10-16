// The EPUB cover, drawn like a cloth binding: the colour of the book's bookcase, softly shaded,
// a thin gold-brown frame, the title and author in Amiri, a small «نسخة» at the foot.
// A real image (JPEG), because Kindle and Apple Books need an image cover. Drawn on the page,
// where the site's Amiri is loaded.

import type { EpubMeta } from './build.ts';

const W = 1600;
/** The EPUB cover's height; a PDF cover takes the page's proportions and the layout scales with it. */
const H_EPUB = 2560;
const GOLD = '#c9a46b';
const CREAM = '#f3ead8';

export async function drawCover(meta: EpubMeta, volNote: string, binding: string, aspect = H_EPUB / W): Promise<Uint8Array | undefined> {
  const H = Math.round(W * aspect);
  /** A height on the EPUB cover, on this one. */
  const Y = (y: number) => (y * H) / H_EPUB;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const text = [meta.mainTitle, meta.edition, volNote, meta.author, 'نسخة ۞'].join(' ');
  try {
    await document.fonts.load('100px Amiri', text);
  } catch {
    // Draw with a fallback font.
  }

  // Cloth (no woven texture: it would triple the size of a small book's EPUB)
  ctx.fillStyle = binding;
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.1, W / 2, H / 2, H * 0.75);
  shade.addColorStop(0, 'rgba(255,255,255,0.06)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Frame: a gold rule and a hairline inside it
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(80, 80, W - 160, H - 160);
  ctx.lineWidth = 2;
  ctx.strokeRect(104, 104, W - 208, H - 208);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px: number) => `${px}px Amiri, "Noto Naskh Arabic", serif`;

  // Ornament
  ctx.fillStyle = GOLD;
  ctx.font = font(110);
  ctx.fillText('۞', W / 2, Y(470));

  // Title: as large as fits in at most four lines
  let size = 170;
  let lines = wrap(ctx, meta.mainTitle, font(size), 1180);
  while ((lines.length > 4 || lines.some((l) => ctx.measureText(l).width > 1180)) && size > 80) {
    size -= 10;
    lines = wrap(ctx, meta.mainTitle, font(size), 1180);
  }
  const lh = size * 1.55;
  let y = Y(1000) - ((lines.length - 1) * lh) / 2;
  ctx.fillStyle = CREAM;
  ctx.font = font(size);
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += lh;
  }
  y += 20;

  if (meta.edition) {
    ctx.font = font(72);
    ctx.fillStyle = CREAM;
    ctx.globalAlpha = 0.85;
    ctx.fillText(meta.edition, W / 2, y);
    ctx.globalAlpha = 1;
    y += 120;
  }
  if (volNote) {
    ctx.font = font(96);
    ctx.fillStyle = GOLD;
    ctx.fillText(volNote, W / 2, y + 20);
    y += 150;
  }

  // Rule, then the author
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 110, Math.max(y + 40, Y(1620)));
  ctx.lineTo(W / 2 + 110, Math.max(y + 40, Y(1620)));
  ctx.stroke();
  if (meta.author) {
    ctx.fillStyle = CREAM;
    const author = wrap(ctx, meta.author, font(76), 1150).slice(0, 3);
    let ay = Math.max(y + 170, Y(1760));
    for (const l of author) {
      ctx.fillText(l, W / 2, ay);
      ay += 120;
    }
  }

  // Foot
  ctx.fillStyle = GOLD;
  ctx.font = font(64);
  ctx.fillText('نسخة', W / 2, H - 250);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
}

/** Splits text into lines no wider than `max`, breaking between words. */
function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, max: number): string[] {
  ctx.font = font;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
