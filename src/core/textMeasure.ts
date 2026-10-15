import type { TextOverlay } from '../types/overlay';

let sharedCtx: CanvasRenderingContext2D | null = null;

/** Contexto 2D compartido, solo para medición de texto. */
export function getMeasureContext(): CanvasRenderingContext2D {
  if (!sharedCtx) {
    const canvas = document.createElement('canvas');
    sharedCtx = canvas.getContext('2d');
  }
  if (!sharedCtx) throw new Error('Canvas 2D no disponible');
  return sharedCtx;
}

type SpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

export function textFont(el: TextOverlay, scale = 1): string {
  return `${el.fontWeight} ${Math.max(1, el.fontSize * scale)}px ${el.fontFamily}`;
}

export function textLines(el: TextOverlay): string[] {
  return el.text.length > 0 ? el.text.split('\n') : [''];
}

export interface TextBlockMetrics {
  lines: string[];
  width: number;
  height: number;
  lineHeight: number;
}

/** Mide el bloque de texto en px (aplicando el `scale` de ratio de foto). */
export function measureTextBlock(el: TextOverlay, scale = 1): TextBlockMetrics {
  const ctx = getMeasureContext();
  ctx.font = textFont(el, scale);
  const spaced = ctx as SpacedContext;
  try {
    spaced.letterSpacing = `${Math.max(0, el.letterSpacing * scale)}px`;
  } catch {
    /* navegadores sin soporte */
  }
  const lines = textLines(el);
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width);
  }
  const lineHeight = Math.max(1, el.lineHeight * scale);
  return { lines, width, height: lineHeight * lines.length, lineHeight };
}
