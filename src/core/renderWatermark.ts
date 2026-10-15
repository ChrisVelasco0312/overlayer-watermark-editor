import type { OverlayElement, OverlayTemplate, TextOverlay } from '../types/overlay';
import { measureTextBlock, textFont } from './textMeasure';

/**
 * Motor de render (Canvas 2D, puro — sin React).
 * Portado y generalizado desde site-survey-gen/src/utils/watermark.ts.
 */

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Carga (y cachea) una imagen a partir de data URL / asset. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error('No se pudo cargar la imagen'));
      };
      img.src = src;
    });
    imageCache.set(src, pending);
  }
  return pending;
}

/** Factor de escala px → px entre una foto y la referencia de la plantilla. */
export function templateRatio(template: OverlayTemplate, width: number, height: number): number {
  if (!template.referenceMin || template.referenceMin <= 0) return 1;
  return Math.min(width, height) / template.referenceMin;
}

/** Tamaño base (sin aplicar el `scale` del elemento) en px de la foto dada. */
export function elementSize(el: OverlayElement, ratio: number): { width: number; height: number } {
  if (el.kind === 'image') {
    const width = Math.max(1, el.width * ratio);
    const height = width * (el.naturalHeight / Math.max(1, el.naturalWidth));
    return { width, height };
  }
  const block = measureTextBlock(el, ratio);
  return {
    width: Math.max(block.width, el.fontSize * ratio * 0.6),
    height: Math.max(block.height, el.lineHeight * ratio),
  };
}

function drawText(ctx: CanvasRenderingContext2D, el: TextOverlay, ratio: number): void {
  const block = measureTextBlock(el, ratio);
  ctx.font = textFont(el, ratio);
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.max(
      0,
      el.letterSpacing * ratio,
    )}px`;
  } catch {
    /* opcional */
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = el.align;

  const strokeWidth = (el.strokeWidth ?? Math.max(2, Math.round(el.fontSize * 0.12))) * ratio;
  if (el.shadow) {
    ctx.shadowColor = el.shadow.color;
    ctx.shadowBlur = el.shadow.blur * ratio;
    ctx.shadowOffsetX = el.shadow.dx * ratio;
    ctx.shadowOffsetY = el.shadow.dy * ratio;
  }

  const anchorX = el.align === 'left' ? -block.width / 2 : el.align === 'right' ? block.width / 2 : 0;
  const top = -block.height / 2;
  block.lines.forEach((line, index) => {
    const y = top + block.lineHeight * index + block.lineHeight / 2;
    if (strokeWidth > 0 && el.strokeColor) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = el.strokeColor;
      ctx.strokeText(line, anchorX, y);
    }
    ctx.fillStyle = el.color;
    ctx.fillText(line, anchorX, y);
  });
}

/** Dibuja un elemento ya trasladado/rotado por el llamador. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: OverlayElement,
  width: number,
  height: number,
  ratio: number,
  images: Map<string, HTMLImageElement>,
): void {
  ctx.save();
  ctx.translate(el.x * width, el.y * height);
  ctx.rotate(el.rotation);
  ctx.scale(el.scale, el.scale);
  ctx.globalAlpha = el.opacity;
  if (el.kind === 'image') {
    const img = images.get(el.src);
    const size = elementSize(el, ratio);
    if (img) ctx.drawImage(img, -size.width / 2, -size.height / 2, size.width, size.height);
  } else {
    drawText(ctx, el, ratio);
  }
  ctx.restore();
}

/** Dibuja la plantilla completa sobre un contexto (foto ya dibujada o no). */
export function drawTemplate(
  ctx: CanvasRenderingContext2D,
  template: OverlayTemplate,
  width: number,
  height: number,
  images?: Map<string, HTMLImageElement>,
): void {
  const map = images ?? new Map<string, HTMLImageElement>();
  const ratio = templateRatio(template, width, height);
  for (const el of template.elements) {
    drawElement(ctx, el, width, height, ratio, map);
  }
}

/** Precarga las imágenes de la plantilla y devuelve el mapa src → imagen. */
export async function preloadTemplateImages(
  template: OverlayTemplate,
): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    template.elements
      .filter((el): el is Extract<OverlayElement, { kind: 'image' }> => el.kind === 'image')
      .map(async (el) => {
        try {
          map.set(el.src, await loadImage(el.src));
        } catch {
          /* imagen rota: se omite */
        }
      }),
  );
  return map;
}

export interface RenderOptions {
  format: 'jpeg' | 'png';
  quality: number; // 0..1
}

/** Compone foto + overlay y devuelve un data URL listo para exportar. */
export async function renderWatermark(
  baseSrc: string,
  template: OverlayTemplate,
  options: RenderOptions,
): Promise<string> {
  const [base, images] = await Promise.all([loadImage(baseSrc), preloadTemplateImages(template)]);
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
  drawTemplate(ctx, template, canvas.width, canvas.height, images);
  return canvas.toDataURL(
    options.format === 'png' ? 'image/png' : 'image/jpeg',
    options.quality,
  );
}

/**
 * Dibuja foto + overlay en un canvas existente, reduciéndolo a `maxWidth`
 * (para miniaturas del dashboard).
 */
export async function renderWatermarkPreview(
  canvas: HTMLCanvasElement,
  baseSrc: string,
  template: OverlayTemplate,
  maxWidth = 400,
): Promise<void> {
  const [base, images] = await Promise.all([loadImage(baseSrc), preloadTemplateImages(template)]);
  const naturalWidth = base.naturalWidth;
  const naturalHeight = base.naturalHeight;
  const s = Math.min(1, maxWidth / Math.max(1, naturalWidth));
  canvas.width = Math.max(1, Math.round(naturalWidth * s));
  canvas.height = Math.max(1, Math.round(naturalHeight * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.save();
  ctx.scale(s, s);
  ctx.drawImage(base, 0, 0, naturalWidth, naturalHeight);
  drawTemplate(ctx, template, naturalWidth, naturalHeight, images);
  ctx.restore();
}
