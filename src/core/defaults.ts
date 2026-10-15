import type { ImageOverlay, OverlayTemplate, TextOverlay } from '../types/overlay';
import { measureTextBlock } from './textMeasure';

/** Estilo por defecto heredado de site-survey-gen (§6 de la spec). */
export const DEFAULT_TEXT_COLOR = '#FFD700';
export const DEFAULT_STROKE_COLOR = '#000000';
export const DEFAULT_FONT_FAMILY = 'Roboto, Arial, sans-serif';
export const DEFAULT_SHADOW = { color: 'rgba(0,0,0,0.7)', blur: 2, dx: 2, dy: 2 } as const;

/** Compresión igual que la referencia: 0.5 MB, lado máx. 1920, JPEG. */
export const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.9,
  type: 'image/jpeg',
} as const;

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif'];
/** Extensiones que el motor del navegador sabe decodificar. */
export const DECODABLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];
/** Pendiente: el navegador no puede decodificar HEIC sin codec extra. */
export const PENDING_EXTENSIONS = ['heic', 'heif'];

export const IMAGE_DIALOG_FILTER = {
  name: 'Imágenes',
  extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
};

export function newId(prefix = 'el'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isImageFileName(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

export function fileExtension(fileName: string): string {
  return (fileName.split('.').pop() ?? '').toLowerCase();
}

export function baseName(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

/** fontSize por defecto: clamp(18, 28, round(min(w,h) * 0.028)). */
export function defaultFontSize(minDim: number): number {
  return Math.max(18, Math.min(28, Math.round(minDim * 0.028)));
}

export function derivedStrokeWidth(fontSize: number): number {
  return Math.max(2, Math.round(fontSize * 0.12));
}

export function derivedLetterSpacing(fontSize: number): number {
  return Math.max(1, Math.round(fontSize * 0.08));
}

export function derivedLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.25);
}

export function createTextOverlay(partial: Partial<TextOverlay> = {}): TextOverlay {
  const fontSize = partial.fontSize ?? 24;
  return {
    id: newId('text'),
    kind: 'text',
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    text: 'Overlayer',
    color: DEFAULT_TEXT_COLOR,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize,
    fontWeight: 700,
    letterSpacing: derivedLetterSpacing(fontSize),
    align: 'center',
    lineHeight: derivedLineHeight(fontSize),
    strokeColor: DEFAULT_STROKE_COLOR,
    strokeWidth: derivedStrokeWidth(fontSize),
    shadow: { ...DEFAULT_SHADOW },
    ...partial,
  };
}

export function createImageOverlay(
  partial: Pick<ImageOverlay, 'src' | 'naturalWidth' | 'naturalHeight'> & Partial<ImageOverlay>,
): ImageOverlay {
  return {
    id: newId('img'),
    kind: 'image',
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    width: 200,
    ...partial,
  };
}

function formatDefaultDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Plantilla por defecto: logo en la esquina superior izquierda y caja de
 * texto amarilla en la inferior derecha, con tamaño proporcional al lienzo.
 */
export function createDefaultTemplate(
  width: number,
  height: number,
  logo: { src: string; naturalWidth: number; naturalHeight: number } | null,
): OverlayTemplate {
  const min = Math.min(width, height);
  const fontSize = defaultFontSize(min);
  const margin = Math.max(12, Math.round(width * 0.02));

  // Texto abajo-derecha.
  const text = createTextOverlay({
    fontSize,
    align: 'right',
    text: `Overlayer\n${formatDefaultDate(new Date())}`,
  });
  const block = measureTextBlock(text, 1);
  const textWidth = Math.max(block.width, fontSize * 0.6);
  const textHeight = Math.max(block.height, fontSize * 1.25);
  text.x = Math.min(1, Math.max(0, (width - margin - textWidth / 2) / width));
  text.y = Math.min(1, Math.max(0, (height - margin - textHeight / 2) / height));

  // Logo arriba-izquierda (proporcional al lienzo, "ni muy grande ni muy pequeño").
  const elements: OverlayTemplate['elements'] = [text];
  if (logo) {
    const logoWidth = Math.round(Math.min(Math.max(width * 0.16, 90), 320));
    const logoHeight = Math.round((logo.naturalHeight / Math.max(1, logo.naturalWidth)) * logoWidth);
    const logoEl = createImageOverlay({
      src: logo.src,
      naturalWidth: logo.naturalWidth,
      naturalHeight: logo.naturalHeight,
      width: logoWidth,
      x: Math.min(1, Math.max(0, (margin + logoWidth / 2) / width)),
      y: Math.min(1, Math.max(0, (margin + logoHeight / 2) / height)),
      name: 'Logo',
    });
    elements.unshift(logoEl);
  }

  return {
    elements,
    coordinateSpace: 'normalized',
    referenceMin: min,
  };
}

/** Espera (con tope) a que las fuentes carguen para medir con la tipografía real. */
export async function whenFontsReady(timeoutMs = 2500): Promise<void> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    await Promise.race([
      fonts.ready,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    /* ignorar */
  }
}
